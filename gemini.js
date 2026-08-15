// Client-side Gemini image generation for outfit cards.
//
// GitHub Pages is static hosting with no backend, so there is nowhere to
// keep a shared secret. Instead, each visitor supplies their own Gemini API
// key via the Settings panel; it is saved only in that browser's
// localStorage and sent directly to Google's API — it never touches the
// repo or any server this app controls.
const WardrobeGemini = (function () {
  "use strict";

  const KEY_STORAGE = "wardrobe-capsule-gemini-key-v1";
  const SETTINGS_STORAGE = "wardrobe-capsule-gemini-settings-v1";
  const DB_NAME = "wardrobe-capsule-db";
  const DB_STORE = "outfit-images";

  const DEFAULT_SETTINGS = {
    model: "gemini-2.5-flash-image",
    style: "flat-lay",
  };

  const MODEL_OPTIONS = [
    { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (fast, default)" },
    { value: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image (newer, fast)" },
    { value: "gemini-3-pro-image", label: "Gemini 3 Pro Image (highest quality, slower/pricier)" },
  ];

  const STYLE_OPTIONS = [
    { value: "flat-lay", label: "Flat lay (garments only, no model)" },
    { value: "on-model", label: "Worn, on a model matching your build" },
  ];

  function getApiKey() {
    try {
      return localStorage.getItem(KEY_STORAGE) || "";
    } catch (e) {
      return "";
    }
  }

  function setApiKey(key) {
    try {
      if (key) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch (e) {
      /* ignore */
    }
  }

  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function setSettings(partial) {
    const merged = { ...getSettings(), ...partial };
    try {
      localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(merged));
    } catch (e) {
      /* ignore */
    }
    return merged;
  }

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(DB_STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function outfitKey(capsuleName, outfitName) {
    return capsuleName + "::" + outfitName;
  }

  async function getCachedImage(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  async function setCachedImage(key, dataUrl, meta) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({ key, dataUrl, ...meta, savedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      /* image just won't be cached */
    }
  }

  function buildPrompt(capsuleName, outfit, profile, style) {
    if (style === "on-model") {
      return (
        "Editorial fashion photograph of a man with this build: " +
        profile.build +
        ". He is wearing: " +
        outfit.pieces +
        ". Full-body shot, standing directly facing the camera, arms relaxed by his sides so every " +
        "garment is fully visible and unobscured — nothing cropped out, nothing tucked behind the body " +
        "or hidden by folded arms. Natural studio lighting, neutral warm-grey background, realistic " +
        "photography, well-fitted slim-to-straight cut clothing, no visible face, no text or logos, no watermark."
      );
    }
    return (
      "Minimalist flat-lay fashion photograph, shot from directly above, on a warm off-white " +
      "textured studio background with soft natural light: " +
      outfit.pieces +
      ". Garments neatly arranged and slightly overlapping, clean editorial catalogue style, " +
      "no people, no text, no logos, no watermark."
    );
  }

  class GeminiError extends Error {
    constructor(message, kind) {
      super(message);
      this.kind = kind;
    }
  }

  async function generateOutfitImage(capsuleName, outfit, profile) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new GeminiError("Add a Gemini API key in Settings first.", "no-key");
    }
    const { model, style } = getSettings();
    const prompt = buildPrompt(capsuleName, outfit, profile, style);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let res;
    try {
      res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: { aspectRatio: "4:5" },
            },
          }),
          signal: controller.signal,
        }
      );
    } catch (e) {
      if (e.name === "AbortError") {
        throw new GeminiError("Timed out waiting for Gemini.", "network");
      }
      throw new GeminiError("Network error reaching Gemini — check your connection.", "network");
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      let message = "Gemini request failed (" + res.status + ").";
      try {
        const body = await res.json();
        if (body && body.error && body.error.message) message = body.error.message;
      } catch (e) {
        /* ignore parse failure, use default message */
      }
      const kind = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "quota" : "http";
      throw new GeminiError(message, kind);
    }

    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData && p.inlineData.data);
    if (!imagePart) {
      throw new GeminiError("Gemini didn't return an image for this prompt.", "no-image");
    }
    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const dataUrl = "data:" + mimeType + ";base64," + imagePart.inlineData.data;

    await setCachedImage(outfitKey(capsuleName, outfit.name), dataUrl, { model, style });
    return dataUrl;
  }

  return {
    MODEL_OPTIONS,
    STYLE_OPTIONS,
    DEFAULT_SETTINGS,
    getApiKey,
    setApiKey,
    getSettings,
    setSettings,
    outfitKey,
    getCachedImage,
    generateOutfitImage,
    GeminiError,
  };
})();

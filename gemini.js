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
    textModel: "gemini-2.5-flash",
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

  // Shared call to a generateContent endpoint. Requires an API key to already
  // be present (callers check that first so they can show a targeted message).
  async function callGenerateContent(model, apiKey, body) {
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
          body: JSON.stringify(body),
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
        const errBody = await res.json();
        if (errBody && errBody.error && errBody.error.message) message = errBody.error.message;
      } catch (e) {
        /* ignore parse failure, use default message */
      }
      const kind = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "quota" : "http";
      throw new GeminiError(message, kind);
    }

    return res.json();
  }

  async function generateOutfitImage(capsuleName, outfit, profile) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new GeminiError("Add a Gemini API key in Settings first.", "no-key");
    }
    const { model, style } = getSettings();
    const prompt = buildPrompt(capsuleName, outfit, profile, style);

    const json = await callGenerateContent(model, apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "4:5" },
      },
    });

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

  // newItemCandidates, when given, is a non-empty array of {name, price} for
  // items the wearer doesn't yet own. The schema's enum is the enforcement
  // mechanism for "at most one new item per outfit, if any" — the model can
  // literally only choose one of the provided names, or "", never invent one
  // or list several.
  function buildOutfitSchema(newItemCandidates) {
    const properties = {
      name: { type: "STRING" },
      pieces: { type: "STRING" },
    };
    const required = ["name", "pieces"];
    const propertyOrdering = ["name", "pieces"];

    if (newItemCandidates && newItemCandidates.length) {
      properties.newItem = {
        type: "STRING",
        enum: newItemCandidates.map((it) => it.name).concat([""]),
      };
      required.push("newItem");
      propertyOrdering.push("newItem");
    }

    return {
      type: "ARRAY",
      items: { type: "OBJECT", properties, required, propertyOrdering },
    };
  }

  function buildOutfitIdeasPrompt(wardrobeItems, exampleOutfits, profile, count, newItemCandidates) {
    const examples = exampleOutfits
      .map((o) => 'name: "' + o.name + '" — pieces: "' + o.pieces + '"')
      .join("\n");
    const garments = wardrobeItems.map((it) => "- " + it.name + (it.notes ? " (" + it.notes + ")" : "")).join("\n");
    const hasNewItems = !!(newItemCandidates && newItemCandidates.length);

    const lines = [
      "You are a menswear stylist. Propose exactly " +
        count +
        " outfit combinations, in the exact same style as these existing examples:",
      examples,
      "",
      "Client: " + profile.build + ". Sizes: " + profile.sizes + ".",
      "",
      "Owned garments (freely combine these):",
      garments,
    ];

    if (hasNewItems) {
      const newGarments = newItemCandidates.map((it) => "- " + it.name + " (£" + it.price + ")").join("\n");
      lines.push(
        "",
        "Also available to buy, not yet owned (optional — use at most ONE of these per outfit, only when it " +
          "clearly completes the look; many outfits should use none of them):",
        newGarments
      );
    }

    lines.push(
      "",
      "Rules:",
      '1. Use only garments from the lists above, referenced by a short recognisable version of their name (drop the brand if you like, keep the distinguishing detail, e.g. colour).',
      "2. Never invent a garment that isn't listed.",
      "3. Each outfit uses 2 to 5 garments and must be genuinely wearable together — matching formality, sensible for the same season, no obvious clashes.",
      "4. Spread garments across the outfits rather than reusing the same one or two items every time; use as much of the owned wardrobe as sensibly possible.",
      '5. Each outfit "name" is short (2-5 words) and specific to a moment or context, exactly like the examples above — never generic like "Outfit 1" or "Casual look".',
      '6. Each outfit "pieces" string lists the garments joined with " + ", in the order worn outside-in, with an optional short styling note in parentheses (e.g. "(open)", "(tucked)", "(collar out)") — match the tone of the examples exactly.'
    );

    if (hasNewItems) {
      lines.push(
        '7. If an outfit uses one of the "not yet owned" garments, its exact name (copied verbatim from that list) goes in the "newItem" field, and that garment must also appear in "pieces" like any other item. If an outfit uses none of them, set "newItem" to "". Never use more than one not-yet-owned garment in a single outfit.',
        "8. Return exactly " + count + " outfits — no more, no fewer.",
        "9. Respond with JSON only, matching the given schema. No commentary, no markdown fences."
      );
    } else {
      lines.push(
        "7. Return exactly " + count + " outfits — no more, no fewer.",
        "8. Respond with JSON only, matching the given schema. No commentary, no markdown fences."
      );
    }

    return lines.join("\n");
  }

  async function generateOutfitIdeas({ wardrobeItems, exampleOutfits, profile, count, newItemCandidates }) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new GeminiError("Add a Gemini API key in Settings first.", "no-key");
    }
    const { textModel } = getSettings();
    const prompt = buildOutfitIdeasPrompt(wardrobeItems, exampleOutfits, profile, count, newItemCandidates);
    const schema = buildOutfitSchema(newItemCandidates);

    const json = await callGenerateContent(textModel, apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.9,
      },
    });

    const parts = json?.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find((p) => typeof p.text === "string");
    if (!textPart) {
      throw new GeminiError("Gemini didn't return any outfit ideas.", "no-image");
    }

    let parsed;
    try {
      parsed = JSON.parse(textPart.text);
    } catch (e) {
      throw new GeminiError("Gemini's response wasn't valid JSON.", "bad-response");
    }
    if (!Array.isArray(parsed)) {
      throw new GeminiError("Gemini's response wasn't in the expected format.", "bad-response");
    }

    return parsed
      .filter((o) => o && typeof o.name === "string" && typeof o.pieces === "string")
      .map((o, i) => ({
        id: "gen-" + Date.now() + "-" + i,
        name: o.name.trim(),
        pieces: o.pieces.trim(),
        newItem: typeof o.newItem === "string" ? o.newItem.trim() : "",
      }));
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
    generateOutfitIdeas,
    GeminiError,
  };
})();

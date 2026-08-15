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

  const DEFAULT_SETTINGS = {
    model: "gemini-2.5-flash-image",
    style: "flat-lay",
    textModel: "gemini-2.5-flash",
    styleNotes: "",
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

  function outfitKey(capsuleName, outfitName) {
    return capsuleName + "::" + outfitName;
  }

  // Image caching lives in WardrobeStore, which owns the IndexedDB schema —
  // two modules opening the same database at different versions would deadlock
  // each other on upgrade.
  function getCachedImage(key) {
    return WardrobeStore.dbGet(WardrobeStore.STORE_IMAGES, key);
  }

  function setCachedImage(key, dataUrl, meta) {
    return WardrobeStore.dbPut(WardrobeStore.STORE_IMAGES, key, dataUrl, meta);
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

  // Strips an accidental "models/" prefix — easy to paste in from Google's
  // own docs, which usually show the fully-qualified "models/gemini-x" form,
  // but our URL already supplies that prefix. Left in, it doubles up into
  // ".../models/models/gemini-x" and Gemini rejects it as a malformed model
  // name rather than a 404, which reads confusingly.
  function normalizeModelId(id) {
    return (id || "").trim().replace(/^models\//i, "");
  }

  // Shared call to a generateContent endpoint. Requires an API key to already
  // be present (callers check that first so they can show a targeted message).
  async function callGenerateContent(model, apiKey, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const cleanModel = normalizeModelId(model);

    let res;
    try {
      res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + cleanModel + ":generateContent",
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

  // Gemini's structured-output enum rejects empty-string values, so "no new
  // item" needs a real sentinel word rather than "" — chosen to never
  // collide with an actual garment name.
  const NO_NEW_ITEM = "None";

  // newItemCandidates, when given, is a non-empty array of {name, price} for
  // items the wearer doesn't yet own. The schema's enum is the enforcement
  // mechanism for "at most one new item per outfit, if any" — the model can
  // literally only choose one of the provided names, or NO_NEW_ITEM, never
  // invent one or list several.
  function buildOutfitSchema(newItemCandidates, wardrobeItems) {
    const properties = {
      name: { type: "STRING" },
      pieces: { type: "STRING" },
    };
    const required = ["name", "pieces"];
    const propertyOrdering = ["name", "pieces"];

    // Each entry is enum-locked to a garment actually in the wardrobe, so the
    // returned list can be matched back by exact name instead of parsing the
    // prose in `pieces`.
    if (wardrobeItems && wardrobeItems.length) {
      properties.usesOwned = {
        type: "ARRAY",
        items: { type: "STRING", enum: wardrobeItems.map((it) => it.name) },
      };
      required.push("usesOwned");
      propertyOrdering.push("usesOwned");
    }

    if (newItemCandidates && newItemCandidates.length) {
      properties.newItem = {
        type: "STRING",
        enum: newItemCandidates.map((it) => it.name).concat([NO_NEW_ITEM]),
      };
      required.push("newItem");
      propertyOrdering.push("newItem");
    }

    return {
      type: "ARRAY",
      items: { type: "OBJECT", properties, required, propertyOrdering },
    };
  }

  // Northern-hemisphere meteorological seasons — the wardrobe data (GBP
  // prices, UK sizing) is UK-based, so this is a reasonable default. This
  // runs client-side against the real current date, not the model's
  // knowledge cutoff, so it stays correct regardless of when it's asked.
  function getSeasonHint(date) {
    const month = date.getMonth();
    const season = month <= 1 || month === 11 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn";
    const monthName = date.toLocaleDateString("en-GB", { month: "long" });
    return (
      "Today is " +
      monthName +
      " (Northern-hemisphere " +
      season +
      "). Favour season-appropriate fabrics and layers — e.g. avoid heavy knitwear, corduroy, or wool " +
      "overshirts in summer, and avoid linen or lightweight cotton alone in winter — unless the style notes " +
      "below say otherwise."
    );
  }

  function buildOutfitIdeasPrompt(opts) {
    const {
      wardrobeItems,
      exampleOutfits,
      profile,
      count,
      newItemCandidates,
      styleNotes,
      weather,
      feedback,
      avoidRepeats,
    } = opts;

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
      getSeasonHint(new Date()),
    ];

    // Live weather is more specific than the season and should win where they
    // disagree (a cold snap in June, a mild December).
    const weatherLine = weather && typeof WardrobeWeather !== "undefined" ? WardrobeWeather.promptLine(weather) : "";
    if (weatherLine) lines.push(weatherLine);

    // Entries may be plain strings (older callers) or { name, reason }.
    const describeFeedback = (entry) => {
      if (typeof entry === "string") return entry;
      if (!entry || !entry.name) return "";
      return entry.reason ? entry.name + " (" + entry.reason.toLowerCase() + ")" : entry.name;
    };

    if (feedback && (feedback.liked || []).length) {
      lines.push(
        "",
        "The client liked these previous outfits — lean towards this kind of combination: " +
          feedback.liked.map(describeFeedback).filter(Boolean).join("; ")
      );
    }
    if (feedback && (feedback.disliked || []).length) {
      lines.push(
        "The client rejected these previous outfits, with their reason where given — do not propose " +
          "anything close to them, and treat each reason as a standing preference to apply to every " +
          "outfit you suggest: " +
          feedback.disliked.map(describeFeedback).filter(Boolean).join("; ")
      );
    }

    if (avoidRepeats && avoidRepeats.length) {
      lines.push(
        "",
        "Recently worn, so avoid repeating these looks: " + avoidRepeats.join("; ")
      );
    }

    if (styleNotes && styleNotes.trim()) {
      lines.push(
        "",
        "Client's style notes (read carefully — these take priority over any other assumption, including the " +
          "season and weather hints above if they conflict): " +
          styleNotes.trim()
      );
    }

    lines.push("", "Owned garments (freely combine these):", garments);

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

    let n = 7;
    if (wardrobeItems.length) {
      lines.push(
        n++ +
          '. "usesOwned" lists the exact names (copied verbatim from the "Owned garments" list) of every owned garment the outfit uses. It must agree with "pieces" — same garments, no more, no fewer.'
      );
    }
    if (hasNewItems) {
      lines.push(
        n++ +
          '. If an outfit uses one of the "not yet owned" garments, its exact name (copied verbatim from that list) goes in the "newItem" field, and that garment must also appear in "pieces" like any other item. If an outfit uses none of them, set "newItem" to "' +
          NO_NEW_ITEM +
          '". Never use more than one not-yet-owned garment in a single outfit.'
      );
    }
    lines.push(
      n++ + ". Return exactly " + count + " outfits — no more, no fewer.",
      n + ". Respond with JSON only, matching the given schema. No commentary, no markdown fences."
    );

    return lines.join("\n");
  }

  async function generateOutfitIdeas(opts) {
    const { wardrobeItems, newItemCandidates } = opts;
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new GeminiError("Add a Gemini API key in Settings first.", "no-key");
    }
    const { textModel, styleNotes } = getSettings();
    const prompt = buildOutfitIdeasPrompt({ ...opts, styleNotes });
    const schema = buildOutfitSchema(newItemCandidates, wardrobeItems);

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

    const outfits = parsed
      .filter((o) => o && typeof o.name === "string" && typeof o.pieces === "string")
      .map((o, i) => {
        const rawNewItem = typeof o.newItem === "string" ? o.newItem.trim() : "";
        const newItem = rawNewItem === NO_NEW_ITEM ? "" : rawNewItem;
        const usesOwned = Array.isArray(o.usesOwned) ? o.usesOwned.filter((u) => typeof u === "string" && u) : [];
        // `uses` is the full piece list — owned garments plus the optional new
        // one — and is what ownership badges are computed from.
        const uses = usesOwned.concat(newItem ? [newItem] : []);
        return {
          id: "gen-" + Date.now() + "-" + i,
          name: o.name.trim(),
          pieces: o.pieces.trim(),
          newItem,
          uses,
        };
      });

    // Surface an empty result as an error rather than returning it: callers
    // overwrite the visible list with whatever comes back, and silently
    // replacing a good set of outfits with nothing is worse than a retry.
    if (!outfits.length) {
      throw new GeminiError("Gemini didn't return any usable outfit ideas — try again.", "bad-response");
    }

    return outfits;
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

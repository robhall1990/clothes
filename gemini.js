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
      // Colouring matters here too: a look chosen for a cool complexion
      // rendered on a warm-toned model doesn't show whether it suits.
      const palette = typeof WardrobeStore !== "undefined" ? WardrobeStore.getPalette() : null;
      const colouring = palette
        ? " The man has a " +
          palette.undertone.value +
          " skin undertone" +
          (palette.depth ? " and " + palette.depth.value + " overall colouring" : "") +
          "."
        : "";

      return (
        "Editorial fashion photograph of a man with this build: " +
        profile.build +
        "." +
        colouring +
        " He is wearing: " +
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

  // newItemCandidates are pieces already shortlisted for purchase — offered to
  // the model as preferred choices, but no longer the only ones it may reach
  // for, since editorial looks need to name garments no fixed list contains.
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

    // Anchored looks lean on the wardrobe; editorial ones are free to imagine
    // pieces that aren't owned. Labelling them lets both appear side by side
    // without one being mistaken for the other.
    properties.kind = { type: "STRING", enum: ["anchored", "editorial"] };
    required.push("kind");
    propertyOrdering.push("kind");

    // Garments the wearer doesn't own, described freely rather than picked
    // from a fixed catalogue — a closed product list can't express "straight-leg
    // mid-wash jeans", and that openness is the point of editorial looks.
    properties.needed = {
      type: "ARRAY",
      items: { type: "STRING" },
    };
    required.push("needed");
    propertyOrdering.push("needed");

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

    // Colour brief, when the wearer has recorded their colouring.
    const colours = typeof WardrobeStore !== "undefined" ? WardrobeStore.paletteBrief() : "";
    if (colours) lines.push("", colours);

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
        "Shortlisted pieces the client is already considering buying. Prefer these when an anchored look " +
          "needs something they don't own, since they're known to suit them:",
        newGarments
      );
    }

    const anchored = Math.ceil(count / 2);
    const editorial = count - anchored;

    lines.push(
      "",
      "Produce TWO kinds of outfit, and label each in the \"kind\" field:",
      '- "anchored" (' +
        anchored +
        " of them): built mainly from the Owned garments. At most ONE piece the client doesn't own, and only " +
        "when it genuinely completes the look — several should need nothing at all. These are for wearing this week.",
      '- "editorial" (' +
        editorial +
        "): fresh ideas that are NOT limited to the wardrobe. Style the occasion first and reach for whatever " +
        "the look actually needs, using owned garments only where they genuinely fit. These exist to show the " +
        "client something new, so be more adventurous — but keep them true to the tone of the examples and to " +
        "the client's style notes.",
      "",
      "Rules:",
      '1. Each outfit "name" is short (2-5 words) and specific to a moment or context, exactly like the examples above — never generic like "Outfit 1" or "Casual look".',
      '2. Each outfit "pieces" string lists every garment joined with " + ", in the order worn outside-in, with an optional short styling note in parentheses (e.g. "(open)", "(tucked)", "(collar out)") — match the tone of the examples exactly.',
      "3. Each outfit uses 2 to 5 garments and must be genuinely wearable together — matching formality, sensible for the season and weather, no obvious clashes.",
      "4. Spread garments across the outfits rather than reusing the same one or two every time.",
      '5. "usesOwned" lists the exact names, copied verbatim from the "Owned garments" list, of every owned garment the outfit uses. Copy them exactly or the app cannot match them.',
      '6. "needed" lists every garment in the outfit the client does NOT own, described as you would search for it in a shop — generic and specific enough to find, e.g. "straight-leg mid-wash jeans", "unstructured navy linen blazer", "brown suede loafers". No brand names, no prices.',
      '7. "usesOwned" and "needed" together must account for exactly the garments in "pieces" — nothing extra, nothing left out.',
      "8. Return exactly " + count + " outfits — no more, no fewer.",
      "9. Respond with JSON only, matching the given schema. No commentary, no markdown fences."
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
        const clean = (arr) =>
          Array.isArray(arr) ? arr.filter((u) => typeof u === "string" && u.trim()).map((u) => u.trim()) : [];
        const usesOwned = clean(o.usesOwned);
        const needed = clean(o.needed);
        return {
          id: "gen-" + Date.now() + "-" + i,
          name: o.name.trim(),
          pieces: o.pieces.trim(),
          kind: o.kind === "editorial" ? "editorial" : "anchored",
          needed,
          // The full piece list, owned and not, which ownership badges resolve
          // against.
          uses: usesOwned.concat(needed),
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

  /* ---------- Colour analysis from photos ---------- */

  function dataUrlToInlinePart(dataUrl) {
    const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
    if (!match) return null;
    return { inlineData: { mimeType: match[1], data: match[2] } };
  }

  // Assesses the wearer's colouring from their own photos. The enums are taken
  // straight from the palette definitions, so a result can only ever be one of
  // the values the palette system already understands — no mapping, no drift.
  async function analyseColouring({ images }) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new GeminiError("Add a Gemini API key in Settings first.", "no-key");
    }
    const analysis = (typeof WARDROBE_DATA !== "undefined" && WARDROBE_DATA.colourAnalysis) || null;
    if (!analysis) throw new GeminiError("Colour analysis data unavailable.", "bad-response");

    const parts = (images || []).map(dataUrlToInlinePart).filter(Boolean);
    if (!parts.length) throw new GeminiError("No usable photo to analyse.", "no-image");

    const prompt = [
      "These are photos of the same person, who wants help choosing clothing colours that suit them.",
      "Assess their natural colouring:",
      "",
      "1. Skin undertone — the underlying warmth or coolness of the skin, not how tanned it is. Look at " +
        "the skin in even light, and at how it reads against any white or neutral fabric in shot.",
      "2. Overall depth — how light or deep their colouring is overall, taking hair, skin and eyes together.",
      "3. Contrast — how far apart their hair and skin are in depth. Dark hair with fair skin is high " +
        "contrast; mid-brown hair with mid-toned skin is low.",
      "",
      "Account for the lighting: warm indoor bulbs push skin to look more golden and cool daylight or " +
        "shade pushes it pinker, so judge the underlying tone rather than the cast of the photo. If the " +
        "photos are poorly lit, filtered, or don't show the face clearly, say so and set confidence to low.",
      "",
      'Give brief reasoning in one or two sentences, in plain English, describing what you actually see — ' +
        "hair colour, eye colour, and how the skin reads. No flattery, no styling advice.",
    ].join("\n");

    const json = await callGenerateContent(getSettings().textModel, apiKey, {
      contents: [{ parts: parts.concat([{ text: prompt }]) }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            undertone: { type: "STRING", enum: analysis.undertones.map((u) => u.value) },
            depth: { type: "STRING", enum: analysis.depths.map((d) => d.value) },
            contrast: { type: "STRING", enum: analysis.contrasts.map((c) => c.value) },
            confidence: { type: "STRING", enum: ["low", "medium", "high"] },
            reasoning: { type: "STRING" },
          },
          required: ["undertone", "depth", "contrast", "confidence", "reasoning"],
          propertyOrdering: ["undertone", "depth", "contrast", "confidence", "reasoning"],
        },
        temperature: 0.2,
      },
    });

    const textPart = (json?.candidates?.[0]?.content?.parts || []).find((p) => typeof p.text === "string");
    if (!textPart) throw new GeminiError("Gemini didn't return an assessment.", "bad-response");

    let parsed;
    try {
      parsed = JSON.parse(textPart.text);
    } catch (e) {
      throw new GeminiError("Gemini's assessment wasn't valid JSON.", "bad-response");
    }
    if (!parsed || !parsed.undertone) {
      throw new GeminiError("Gemini couldn't assess colouring from those photos.", "bad-response");
    }
    return {
      undertone: parsed.undertone,
      depth: parsed.depth,
      contrast: parsed.contrast,
      confidence: parsed.confidence || "",
      reasoning: (parsed.reasoning || "").trim(),
    };
  }

  /* ---------- Grounded product lookup ---------- */

  // Hosts the wearer actually shops, derived from their brand search
  // templates, used to discard any link that isn't one of their retailers.
  function brandHosts(brands) {
    const hosts = [];
    (brands || []).forEach((b) => {
      try {
        hosts.push(new URL(b.search.replace("{q}", "x")).hostname.replace(/^www\d*\./, ""));
      } catch (e) {
        /* skip an unparseable template */
      }
    });
    return hosts;
  }

  function hostMatches(url, hosts) {
    try {
      const h = new URL(url).hostname.replace(/^www\d*\./, "");
      return hosts.some((known) => h === known || h.endsWith("." + known));
    } catch (e) {
      return false;
    }
  }

  // One product per line: Retailer | Name | £price | URL. Lenient on spacing
  // and on a missing price, strict on the URL being a real link at one of the
  // wearer's retailers — a hallucinated link is worse than no link.
  function parseProductLines(text, hosts) {
    const out = [];
    (text || "").split("\n").forEach((raw) => {
      const line = raw.replace(/^[-*\d.\s]+/, "").trim();
      if (!line || line.indexOf("|") === -1) return;
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) return;
      const url = parts[parts.length - 1];
      if (!/^https?:\/\//i.test(url) || !hostMatches(url, hosts)) return;
      const priceMatch = parts.slice(1, -1).join(" ").match(/£\s?(\d+(?:\.\d{2})?)/);
      out.push({
        retailer: parts[0],
        name: parts[1],
        price: priceMatch ? "£" + priceMatch[1] : "",
        url,
      });
    });
    return out;
  }

  // Finds garments that actually exist right now. Grounding is what makes the
  // links real rather than recalled — but it can't be combined with a response
  // schema, so this is a separate, deliberately on-demand call.
  async function findProducts({ description, brands, profile }) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new GeminiError("Add a Gemini API key in Settings first.", "no-key");
    }
    const { textModel } = getSettings();
    const hosts = brandHosts(brands);
    const retailers = (brands || []).map((b) => b.name).join(", ");

    const prompt = [
      "Search the web for men's " + description + " currently on sale at these UK retailers: " + retailers + ".",
      profile && profile.sizes ? "The buyer wears: " + profile.sizes + "." : "",
      "",
      "List up to 5 real, currently available products, one per line, in exactly this format:",
      "Retailer | Product name | £price | https://direct-product-url",
      "",
      "Only include products you actually found on those retailers' sites, with the real product page URL.",
      "No commentary, no markdown, no bullet characters — just the lines.",
    ]
      .filter(Boolean)
      .join("\n");

    const json = await callGenerateContent(textModel, apiKey, {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    });

    const candidate = json?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("\n");

    const products = parseProductLines(text, hosts);

    // Google's grounding terms require showing the search suggestions that
    // came back with the answer.
    const searchEntryPoint = candidate?.groundingMetadata?.searchEntryPoint?.renderedContent || "";

    return { products, searchEntryPoint };
  }

  return {
    MODEL_OPTIONS,
    STYLE_OPTIONS,
    DEFAULT_SETTINGS,
    findProducts,
    parseProductLines,
    analyseColouring,
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

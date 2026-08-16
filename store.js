// All persisted state for the app: what you own, what you've bought, how you
// rated outfits, what you've worn, and item photos.
//
// Everything lives in this browser — localStorage for small structured state,
// IndexedDB for binary-ish blobs (generated outfit images, item photos). There
// is no server, so nothing here syncs or leaves the device.
const WardrobeStore = (function () {
  "use strict";

  const KEYS = {
    bought: "wardrobe-capsule-bought-v1",
    owned: "wardrobe-capsule-owned-items-v1",
    generated: "wardrobe-capsule-generated-outfits-v1",
    feedback: "wardrobe-capsule-outfit-feedback-v1",
    wears: "wardrobe-capsule-wear-log-v1",
    today: "wardrobe-capsule-today-v1",
    profile: "wardrobe-capsule-profile-v1",
    brands: "wardrobe-capsule-brands-v1",
  };

  // Reasons offered when an outfit is rejected. "Why" is a far stronger
  // steer for the next generation than a bare thumbs-down.
  const FEEDBACK_REASONS = [
    "Too warm",
    "Too cold",
    "Too formal",
    "Too casual",
    "Wrong colours",
    "Not my style",
  ];

  const DB_NAME = "wardrobe-capsule-db";
  const DB_VERSION = 2;
  const STORE_IMAGES = "outfit-images";
  const STORE_PHOTOS = "item-photos";

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable or full — state just won't persist */
    }
  }

  /* ---------- IndexedDB (outfit images + item photos) ---------- */

  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // v1 databases already have STORE_IMAGES; only create what's missing
        // so existing cached outfit images survive the upgrade.
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
          db.createObjectStore(STORE_PHOTOS, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function dbGet(storeName, key) {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null;
    }
  }

  async function dbPut(storeName, key, dataUrl, meta) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put({ key, dataUrl, ...(meta || {}), savedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function dbDelete(storeName, key) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Ownership matching ---------- */

  const STOPWORDS = new Set(["the", "a", "an", "and", "of", "in", "with", "plus", "my", "on", "over"]);

  // Garment words too generic to carry a match on their own — "shirt" alone
  // shouldn't claim "White Oxford shirt".
  const GENERIC = new Set([
    "shirt", "top", "trouser", "jacket", "shoe", "boot", "knit", "jean", "chino",
    "polo", "coat", "sweater", "jumper", "tee", "suit", "loafer", "derby",
    "sneaker", "trainer", "overshirt", "blazer", "turtleneck", "crew",
  ]);

  function tokenize(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((t) => t.replace(/s$/, "")) // crude de-plural: "boots" -> "boot"
      .filter((t) => t && !STOPWORDS.has(t));
  }

  // Two garment names refer to the same thing if every meaningful word of the
  // shorter name appears in the longer one. Deliberately asymmetric-tolerant so
  // "desert boots" matches "Clarks Desert Boot, sand suede", while still
  // keeping "Navy suit trousers" and "Navy suit jacket" apart.
  function namesMatch(a, b) {
    const ta = tokenize(a);
    const tb = tokenize(b);
    if (!ta.length || !tb.length) return false;
    const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (short.length === 1 && GENERIC.has(short[0])) return false;
    return short.every((t) => long.indexOf(t) !== -1);
  }

  // Everything the wearer has: items logged in My Wardrobe, plus any catalogue
  // item ticked off as bought on the Shopping tab.
  function getOwnedPool(data) {
    const map = new Map();
    getOwnedItems().forEach((it) => map.set(it.name, { name: it.name, notes: it.notes || "" }));
    const bought = getBought();
    data.capsules.forEach((capsule) => {
      capsule.items.forEach((it) => {
        if (bought[it.name] && !map.has(it.name)) map.set(it.name, { name: it.name, notes: "" });
      });
    });
    return Array.from(map.values());
  }

  function catalogueByName(data) {
    const map = new Map();
    data.capsules.forEach((capsule) => {
      capsule.items.forEach((item) => {
        if (!map.has(item.name)) map.set(item.name, { ...item, capsule: capsule.name });
      });
    });
    return map;
  }

  // For an outfit with a `uses` list, work out which pieces are already owned
  // and which are missing. Missing pieces that exist in the catalogue carry
  // their price and buy link so the gap is immediately actionable.
  function resolveOwnership(outfit, data) {
    const uses = Array.isArray(outfit.uses) ? outfit.uses.filter(Boolean) : [];
    if (!uses.length) return null;

    const pool = getOwnedPool(data);
    const catalogue = catalogueByName(data);
    const owned = [];
    const missing = [];

    uses.forEach((label) => {
      const hit = pool.find((p) => namesMatch(label, p.name));
      if (hit) {
        owned.push(label);
        return;
      }
      let item = catalogue.get(label);
      if (!item) {
        for (const [name, candidate] of catalogue) {
          if (namesMatch(label, name)) {
            item = candidate;
            break;
          }
        }
      }
      missing.push({ label, item: item || null });
    });

    return { total: uses.length, owned, missing, complete: missing.length === 0 };
  }

  /* ---------- Simple state accessors ---------- */

  function getBought() {
    return loadJson(KEYS.bought, {});
  }
  function setBought(state) {
    saveJson(KEYS.bought, state);
  }

  function getOwnedItems() {
    return loadJson(KEYS.owned, []);
  }
  function setOwnedItems(items) {
    saveJson(KEYS.owned, items);
  }

  function getGeneratedOutfits() {
    return loadJson(KEYS.generated, []);
  }
  function setGeneratedOutfits(outfits) {
    saveJson(KEYS.generated, outfits);
  }

  function newId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.round(Math.random() * 1e6);
  }

  /* ---------- Profile ---------- */

  // data.js ships a default profile; anything saved here overrides it, so the
  // most personal input to every prompt is editable without a code change.
  function getProfile() {
    const base = (typeof WARDROBE_DATA !== "undefined" && WARDROBE_DATA.profile) || { build: "", sizes: "" };
    const saved = loadJson(KEYS.profile, null);
    return saved ? { ...base, ...saved } : { ...base };
  }

  function setProfile(profile) {
    saveJson(KEYS.profile, { build: profile.build || "", sizes: profile.sizes || "" });
    return getProfile();
  }

  function resetProfile() {
    try {
      localStorage.removeItem(KEYS.profile);
    } catch (e) {
      /* ignore */
    }
    return getProfile();
  }

  function isProfileCustomised() {
    return !!loadJson(KEYS.profile, null);
  }

  /* ---------- Brands ---------- */

  function defaultBrands() {
    const base = (typeof WARDROBE_DATA !== "undefined" && WARDROBE_DATA.defaultBrands) || [];
    return base.map((b) => ({ ...b }));
  }

  function getBrands() {
    const saved = loadJson(KEYS.brands, null);
    if (!Array.isArray(saved) || !saved.length) return defaultBrands();
    return saved.filter((b) => b && b.name && b.search);
  }

  function setBrands(brands) {
    saveJson(KEYS.brands, brands);
    return getBrands();
  }

  function resetBrands() {
    try {
      localStorage.removeItem(KEYS.brands);
    } catch (e) {
      /* ignore */
    }
    return getBrands();
  }

  function areBrandsCustomised() {
    return !!loadJson(KEYS.brands, null);
  }

  // Brands are stored one-per-line as "Name | https://…{q}" so they can be
  // edited as plain text rather than through a bespoke list editor.
  function brandsToText(brands) {
    return (brands || getBrands()).map((b) => b.name + " | " + b.search).join("\n");
  }

  function brandsFromText(text) {
    return (text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf("|");
        if (i === -1) return null;
        const name = line.slice(0, i).trim();
        const search = line.slice(i + 1).trim();
        return name && search ? { name, search } : null;
      })
      .filter(Boolean);
  }

  function brandSearchUrl(brand, query) {
    const q = encodeURIComponent((query || "").trim());
    return brand.search.indexOf("{q}") !== -1 ? brand.search.replace("{q}", q) : brand.search + q;
  }

  /* ---------- Outfit feedback (thumbs up / down) ---------- */

  // Keyed by outfit name so a rating survives rotation and re-generation of
  // the surrounding list. Entries are { verdict, reason, at }; older builds
  // stored a bare "up"/"down" string, which is migrated on read.
  function getFeedback() {
    const raw = loadJson(KEYS.feedback, {});
    const out = {};
    Object.keys(raw).forEach((name) => {
      const v = raw[name];
      if (typeof v === "string") out[name] = { verdict: v, reason: "", at: 0 };
      else if (v && typeof v === "object" && v.verdict) {
        out[name] = { verdict: v.verdict, reason: v.reason || "", at: v.at || 0 };
      }
    });
    return out;
  }

  function setOutfitFeedback(outfitName, verdict, reason) {
    const all = getFeedback();
    if (verdict) {
      const existing = all[outfitName];
      all[outfitName] = {
        verdict,
        // Keep an existing reason when re-affirming the same verdict, drop it
        // when the verdict flips (a "too warm" note makes no sense on a like).
        reason: verdict === "down" ? (reason !== undefined ? reason : (existing && existing.verdict === "down" && existing.reason) || "") : "",
        at: Date.now(),
      };
    } else {
      delete all[outfitName];
    }
    saveJson(KEYS.feedback, all);
    return all;
  }

  function getFeedbackVerdict(outfitName) {
    const entry = getFeedback()[outfitName];
    return entry ? entry.verdict : null;
  }

  function getFeedbackReason(outfitName) {
    const entry = getFeedback()[outfitName];
    return entry && entry.verdict === "down" ? entry.reason || "" : "";
  }

  // Most recent ratings only — prompts shouldn't grow without bound as the
  // rating history builds up, and recent taste is the relevant taste.
  const FEEDBACK_PROMPT_CAP = 8;

  function getFeedbackLists() {
    const all = getFeedback();
    const entries = Object.keys(all).map((name) => ({ name, ...all[name] }));
    entries.sort((a, b) => b.at - a.at);
    const liked = [];
    const disliked = [];
    entries.forEach((e) => {
      if (e.verdict === "up" && liked.length < FEEDBACK_PROMPT_CAP) liked.push({ name: e.name });
      else if (e.verdict === "down" && disliked.length < FEEDBACK_PROMPT_CAP) {
        disliked.push({ name: e.name, reason: e.reason || "" });
      }
    });
    return { liked, disliked };
  }

  /* ---------- Wear log ---------- */

  // [{ outfit, date }] newest first, capped so localStorage can't grow forever.
  const WEAR_LOG_CAP = 120;

  function getWears() {
    return loadJson(KEYS.wears, []);
  }

  function logWear(outfitName, dateStr) {
    const wears = getWears();
    const date = dateStr || new Date().toISOString().slice(0, 10);
    wears.unshift({ outfit: outfitName, date });
    saveJson(KEYS.wears, wears.slice(0, WEAR_LOG_CAP));
    return getWears();
  }

  function removeWear(outfitName, dateStr) {
    const wears = getWears().filter((w) => !(w.outfit === outfitName && w.date === dateStr));
    saveJson(KEYS.wears, wears);
    return wears;
  }

  function wearCount(outfitName) {
    return getWears().filter((w) => w.outfit === outfitName).length;
  }

  function wornOn(outfitName, dateStr) {
    return getWears().some((w) => w.outfit === outfitName && w.date === dateStr);
  }

  // Names worn within the last N days — used to avoid suggesting repeats.
  function recentlyWorn(days) {
    const cutoff = Date.now() - days * 86400000;
    return getWears()
      .filter((w) => {
        const t = Date.parse(w.date + "T00:00:00");
        return !isNaN(t) && t >= cutoff;
      })
      .map((w) => w.outfit);
  }

  /* ---------- Today's pick ---------- */

  function getToday() {
    return loadJson(KEYS.today, null);
  }
  function setToday(value) {
    saveJson(KEYS.today, value);
  }

  return {
    KEYS,
    FEEDBACK_REASONS,
    loadJson,
    saveJson,
    newId,
    // profile
    getProfile,
    setProfile,
    resetProfile,
    isProfileCustomised,
    // brands
    getBrands,
    setBrands,
    resetBrands,
    areBrandsCustomised,
    brandsToText,
    brandsFromText,
    brandSearchUrl,
    // ownership
    tokenize,
    namesMatch,
    getOwnedPool,
    catalogueByName,
    resolveOwnership,
    // state
    getBought,
    setBought,
    getOwnedItems,
    setOwnedItems,
    getGeneratedOutfits,
    setGeneratedOutfits,
    // feedback
    getFeedback,
    setOutfitFeedback,
    getFeedbackVerdict,
    getFeedbackReason,
    getFeedbackLists,
    // wears
    getWears,
    logWear,
    removeWear,
    wearCount,
    wornOn,
    recentlyWorn,
    // today
    getToday,
    setToday,
    // blobs
    STORE_IMAGES,
    STORE_PHOTOS,
    dbGet,
    dbPut,
    dbDelete,
  };
})();

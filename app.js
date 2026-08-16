(function () {
  "use strict";

  const S = WardrobeStore;
  const D = WARDROBE_DATA;

  const CATEGORY_OPTIONS = [
    "Outerwear",
    "Knitwear",
    "Tops & shirts",
    "Trousers & denim",
    "Footwear",
    "Accessories",
    "Other",
  ];

  function guessCategory(name) {
    const n = name.toLowerCase();
    if (/\b(boot|derby|loafer|shoe|trainer|sneaker)/.test(n)) return "Footwear";
    if (/\b(jean|trouser|chino|denim)/.test(n)) return "Trousers & denim";
    if (/\b(jumper|knit|polo|turtleneck|sweater|cardigan)/.test(n)) return "Knitwear";
    if (/\b(overshirt|blazer|jacket|coat|suit)/.test(n)) return "Outerwear";
    if (/\b(shirt|tee|t-shirt|top)/.test(n)) return "Tops & shirts";
    return "Other";
  }

  const money = (n) => "£" + Number(n).toFixed(0);
  const todayISO = () => new Date().toISOString().slice(0, 10);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function buyLink(item, extraClass) {
    const a = el("a", "buy-btn" + (extraClass ? " " + extraClass : ""), "Buy");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  let currentWeather = null;

  /* ---------------- outfit images ---------------- */

  function renderOutfitImageState(wrap, state, payload) {
    wrap.innerHTML = "";
    wrap.dataset.state = state;

    if (state === "idle") {
      const btn = el("button", "generate-btn", "Generate image");
      btn.type = "button";
      btn.addEventListener("click", payload.onGenerate);
      wrap.appendChild(btn);
    } else if (state === "loading") {
      wrap.appendChild(el("div", "spinner"));
      wrap.appendChild(el("p", "generate-status", "Generating with Gemini…"));
    } else if (state === "image") {
      const img = el("img", "outfit-image");
      img.src = payload.dataUrl;
      img.alt = payload.alt;
      img.loading = "lazy";
      wrap.appendChild(img);
      const retry = el("button", "regenerate-btn", "Regenerate");
      retry.type = "button";
      retry.addEventListener("click", payload.onGenerate);
      wrap.appendChild(retry);
    } else if (state === "error") {
      wrap.appendChild(el("p", "generate-error", payload.message));
      const retry = el("button", "generate-btn", "Try again");
      retry.type = "button";
      retry.addEventListener("click", payload.onGenerate);
      wrap.appendChild(retry);
    }
  }

  function mountOutfitImage(wrap, capsuleName, outfit) {
    if (typeof WardrobeGemini === "undefined") return;
    const key = WardrobeGemini.outfitKey(capsuleName, outfit.name);

    const onGenerate = async () => {
      renderOutfitImageState(wrap, "loading");
      try {
        const dataUrl = await WardrobeGemini.generateOutfitImage(capsuleName, outfit, S.getProfile());
        renderOutfitImageState(wrap, "image", { dataUrl, alt: outfit.name + " outfit", onGenerate });
      } catch (e) {
        renderOutfitImageState(wrap, "error", {
          message: e && e.message ? e.message : "Something went wrong generating this image.",
          onGenerate,
        });
      }
    };

    renderOutfitImageState(wrap, "idle", { onGenerate });
    WardrobeGemini.getCachedImage(key).then((dataUrl) => {
      if (dataUrl && wrap.dataset.state === "idle") {
        renderOutfitImageState(wrap, "image", { dataUrl, alt: outfit.name + " outfit", onGenerate });
      }
    });
  }

  /* ---------------- outfit card ---------------- */

  // The ownership badge is the heart of the app: it answers "can I wear this
  // today, and if not, what exactly is missing?" before anything about buying.
  function buildOwnershipBadge(coverage) {
    if (!coverage) return null;

    const badge = el("div", "coverage");
    if (coverage.complete) {
      badge.classList.add("coverage-complete");
      badge.appendChild(el("span", "coverage-dot"));
      badge.appendChild(el("span", "coverage-text", "You own everything for this — wearable today"));
      return badge;
    }

    const owned = coverage.owned.length;
    badge.classList.add(coverage.missing.length === 1 ? "coverage-close" : "coverage-partial");
    badge.appendChild(el("span", "coverage-dot"));
    badge.appendChild(el("span", "coverage-text", "You own " + owned + " of " + coverage.total));

    const missingWrap = el("div", "coverage-missing");
    coverage.missing.forEach((m) => {
      // A gap that matches a shortlisted product shows the real thing, price
      // and all. Anything else is a described garment, so the only honest
      // offer is "here's where to look for it".
      if (m.item) {
        const row = el("div", "coverage-missing-row");
        row.appendChild(el("span", "coverage-missing-label", "Missing: " + m.item.name + " · " + money(m.item.price)));
        row.appendChild(buyLink(m.item, "buy-btn-secondary buy-btn-small"));
        missingWrap.appendChild(row);
      } else {
        missingWrap.appendChild(buildShopForGap(m.label));
      }
    });
    badge.appendChild(missingWrap);
    return badge;
  }

  // Collapsed by default: a look needing three pieces would otherwise bury the
  // outfit itself under twenty retailer links.
  //
  // Opening it looks for real, currently-available products via a
  // search-grounded lookup. That can fail — no key, no quota, a model without
  // grounding — so the plain brand searches are always rendered underneath and
  // never depend on it.
  function buildShopForGap(description) {
    const details = el("details", "gap-shop");
    const summary = el("summary", "gap-summary");
    summary.appendChild(el("span", "coverage-missing-label", "Missing: " + description));
    summary.appendChild(el("span", "gap-find", "Find it"));
    details.appendChild(summary);

    const found = el("div", "gap-found");
    details.appendChild(found);

    const brands = el("div", "brand-chips");
    const brandsLabel = el("p", "gap-brands-label", "Or search:");
    details.appendChild(brandsLabel);
    S.getBrands().forEach((brand) => {
      const a = el("a", "brand-chip", brand.name);
      a.href = S.brandSearchUrl(brand, description);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      brands.appendChild(a);
    });
    details.appendChild(brands);

    function renderProducts(cached) {
      found.innerHTML = "";
      if (!cached || !cached.products.length) return;
      cached.products.forEach((p) => {
        const row = el("a", "found-product");
        row.href = p.url;
        row.target = "_blank";
        row.rel = "noopener noreferrer";
        const info = el("span", "found-info");
        info.appendChild(el("span", "found-name", p.name));
        info.appendChild(el("span", "found-retailer", p.retailer + (p.price ? " · " + p.price : "")));
        row.appendChild(info);
        row.appendChild(el("span", "found-go", "↗"));
        found.appendChild(row);
      });
      if (cached.searchEntryPoint) {
        const attrib = el("div", "search-entry");
        attrib.innerHTML = cached.searchEntryPoint;
        found.appendChild(attrib);
      }
    }

    let started = false;
    details.addEventListener("toggle", async () => {
      if (!details.open || started) return;
      started = true;

      const cached = S.getFind(description);
      if (cached) {
        renderProducts(cached);
        return;
      }
      if (typeof WardrobeGemini === "undefined" || !WardrobeGemini.getApiKey()) return;

      found.innerHTML = "";
      const status = el("p", "gap-status", "Looking for these in stock…");
      found.appendChild(status);
      try {
        const res = await WardrobeGemini.findProducts({
          description,
          brands: S.getBrands(),
          profile: S.getProfile(),
        });
        if (res.products.length) {
          renderProducts(S.setFind(description, res.products, res.searchEntryPoint));
        } else {
          // Grounding worked but nothing usable came back — say so rather than
          // leaving a spinner that never resolves.
          found.innerHTML = "";
          found.appendChild(el("p", "gap-status", "Nothing found in stock — try a search below."));
        }
      } catch (e) {
        found.innerHTML = "";
        found.appendChild(el("p", "gap-status", "Couldn't search for stock right now."));
        // Retry on next open rather than caching the failure.
        started = false;
      }
    });

    return details;
  }

  function buildKindBadge(kind) {
    if (kind !== "anchored" && kind !== "editorial") return null;
    const isEditorial = kind === "editorial";
    return el(
      "span",
      "kind-badge " + (isEditorial ? "kind-editorial" : "kind-anchored"),
      isEditorial ? "Fresh idea" : "From your wardrobe"
    );
  }

  function buildFeedbackRow(outfit, onChange) {
    const wrap = el("div", "feedback-wrap");
    const row = el("div", "feedback-row");
    row.appendChild(el("span", "feedback-label", "Rate this:"));

    // Shown only after a thumbs-down. "Why" turns a bare rejection into a
    // standing preference the next generation can actually act on.
    const reasons = el("div", "reason-chips");
    reasons.hidden = true;

    function syncReasons() {
      const verdict = S.getFeedbackVerdict(outfit.name);
      reasons.hidden = verdict !== "down";
      const chosen = S.getFeedbackReason(outfit.name);
      reasons.querySelectorAll(".reason-chip").forEach((chip) => {
        const active = chip.dataset.reason === chosen;
        chip.classList.toggle("active", active);
        chip.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    S.FEEDBACK_REASONS.forEach((reason) => {
      const chip = el("button", "reason-chip", reason);
      chip.type = "button";
      chip.dataset.reason = reason;
      chip.addEventListener("click", () => {
        const current = S.getFeedbackReason(outfit.name);
        S.setOutfitFeedback(outfit.name, "down", current === reason ? "" : reason);
        syncReasons();
        if (onChange) onChange();
      });
      reasons.appendChild(chip);
    });

    const mk = (verdict, glyph, aria) => {
      const btn = el("button", "feedback-btn", glyph);
      btn.type = "button";
      btn.setAttribute("aria-label", aria + " " + outfit.name);
      const sync = () => {
        const current = S.getFeedbackVerdict(outfit.name);
        btn.classList.toggle("active", current === verdict);
        btn.setAttribute("aria-pressed", current === verdict ? "true" : "false");
      };
      btn.addEventListener("click", () => {
        const current = S.getFeedbackVerdict(outfit.name);
        S.setOutfitFeedback(outfit.name, current === verdict ? null : verdict);
        row.querySelectorAll(".feedback-btn").forEach((b) => b._sync && b._sync());
        syncReasons();
        if (onChange) onChange();
      });
      btn._sync = sync;
      sync();
      return btn;
    };

    row.appendChild(mk("up", "👍", "Like"));
    row.appendChild(mk("down", "👎", "Dislike"));

    const wears = S.wearCount(outfit.name);
    if (wears > 0) {
      row.appendChild(el("span", "wear-count", "worn " + wears + (wears === 1 ? " time" : " times")));
    }

    wrap.appendChild(row);
    wrap.appendChild(reasons);
    syncReasons();
    return wrap;
  }

  // opts: { showImage, showFeedback, onChange }
  function buildOutfitCard(outfit, cacheNamespace, opts) {
    const o = opts || {};
    const card = el("div", "outfit-card");
    if (outfit.kind === "editorial") card.classList.add("outfit-editorial");

    const head = el("div", "outfit-head");
    head.appendChild(el("p", "outfit-name", outfit.name));
    const kindBadge = buildKindBadge(outfit.kind);
    if (kindBadge) head.appendChild(kindBadge);
    card.appendChild(head);

    card.appendChild(el("p", "outfit-pieces", outfit.pieces));

    const badge = buildOwnershipBadge(S.resolveOwnership(outfit, D));
    if (badge) card.appendChild(badge);

    if (o.showFeedback !== false) card.appendChild(buildFeedbackRow(outfit, o.onChange));

    if (o.showImage !== false) {
      const imageWrap = el("div", "outfit-image-wrap");
      card.appendChild(imageWrap);
      mountOutfitImage(imageWrap, cacheNamespace, outfit);
    }

    return card;
  }

  /* ---------------- outfit pool ---------------- */

  function capsuleStorageKey(capsuleName) {
    return "wardrobe-capsule-rotated-" + capsuleName.toLowerCase() + "-v1";
  }

  // Every outfit the app currently knows about: each capsule's list (rotated
  // if it has been, seed otherwise) plus anything generated on the Wardrobe tab.
  function allKnownOutfits() {
    const out = [];
    D.capsules.forEach((capsule) => {
      const list = S.loadJson(capsuleStorageKey(capsule.name), capsule.outfits);
      list.forEach((outfit) => out.push({ outfit, capsule: capsule.name }));
    });
    S.getGeneratedOutfits().forEach((outfit) => out.push({ outfit, capsule: "Wardrobe" }));
    return out;
  }

  /* ---------------- Today ---------------- */

  function scoreOutfit(entry, recent) {
    const coverage = S.resolveOwnership(entry.outfit, D);
    const verdict = S.getFeedbackVerdict(entry.outfit.name);
    let score = 0;

    // Wearability dominates: something you can actually put on this morning
    // beats a better-looking outfit you're two purchases away from.
    if (coverage) {
      if (coverage.complete) score += 100;
      else score += Math.max(0, 40 - coverage.missing.length * 15);
    } else {
      score += 20; // unknown coverage — usable but unproven
    }

    if (verdict === "up") score += 25;
    if (verdict === "down") score -= 1000;
    if (recent.indexOf(entry.outfit.name) !== -1) score -= 60;

    return score;
  }

  function renderTodayPanel() {
    const panel = el("div", "panel");
    panel.id = "panel-today";
    panel.setAttribute("role", "tabpanel");

    const head = el("section", "block");
    const dateLine = el("p", "today-date");
    dateLine.textContent = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    head.appendChild(dateLine);

    const weatherLine = el("p", "today-weather");
    head.appendChild(weatherLine);

    const body = el("div");
    head.appendChild(body);
    panel.appendChild(head);

    function syncWeatherLine() {
      if (currentWeather) {
        weatherLine.textContent = WardrobeWeather.summarise(currentWeather);
        weatherLine.hidden = false;
      } else {
        weatherLine.hidden = true;
      }
    }

    function render() {
      body.innerHTML = "";
      syncWeatherLine();

      const pool = allKnownOutfits();
      if (!pool.length) {
        body.appendChild(el("p", "empty-note", "No outfits yet."));
        return;
      }

      const recent = S.recentlyWorn(7);
      const ranked = pool
        .map((entry) => ({ entry, score: scoreOutfit(entry, recent) }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.entry);

      const wearable = ranked.filter((e) => {
        const c = S.resolveOwnership(e.outfit, D);
        return c && c.complete;
      });

      // Today's choice is pinned once made. Without this, marking it worn
      // would drop its score via repeat-avoidance and instantly swap the card
      // for a different outfit — you'd never see it acknowledged as worn.
      const state = S.getToday() || {};
      let pick = null;
      if (state.date === todayISO() && state.name) {
        pick = ranked.find((e) => e.outfit.name === state.name && e.capsule === state.capsule) || null;
      }
      if (!pick) {
        pick = ranked[0];
        S.setToday({ date: todayISO(), name: pick.outfit.name, capsule: pick.capsule });
      }

      const heading = el("h2", null, "Today's outfit");
      body.appendChild(heading);

      if (!wearable.length) {
        const note = el(
          "p",
          "empty-note",
          "Nothing in your wardrobe covers a full outfit yet — here's the closest, with the gap listed."
        );
        body.appendChild(note);
      }

      const card = buildOutfitCard(pick.outfit, pick.capsule, { onChange: render });
      card.classList.add("today-card");
      body.appendChild(card);

      const source = el("p", "today-source", "From " + pick.capsule);
      body.appendChild(source);

      const actions = el("div", "today-actions");

      const worn = S.wornOn(pick.outfit.name, todayISO());
      const wornBtn = el("button", "buy-btn full-width" + (worn ? " worn-active" : ""), worn ? "✓ Worn today" : "I wore this");
      wornBtn.type = "button";
      wornBtn.addEventListener("click", () => {
        if (S.wornOn(pick.outfit.name, todayISO())) S.removeWear(pick.outfit.name, todayISO());
        else S.logWear(pick.outfit.name, todayISO());
        render();
      });

      const shuffleBtn = el("button", "ghost-btn full-width", "Shuffle");
      shuffleBtn.type = "button";
      shuffleBtn.addEventListener("click", () => {
        const idx = ranked.findIndex((e) => e.outfit.name === pick.outfit.name && e.capsule === pick.capsule);
        const next = ranked[(idx + 1) % ranked.length];
        S.setToday({ date: todayISO(), name: next.outfit.name, capsule: next.capsule });
        render();
      });

      actions.appendChild(wornBtn);
      actions.appendChild(shuffleBtn);
      body.appendChild(actions);

      const stats = el(
        "p",
        "today-stats",
        wearable.length + " of " + pool.length + " outfits are fully wearable from your wardrobe right now"
      );
      body.appendChild(stats);
    }

    render();
    panel._refresh = render;
    panel._syncWeather = syncWeatherLine;
    return panel;
  }

  /* ---------------- capsule tabs ---------------- */

  function renderCapsulePanel(capsule) {
    const panel = el("div", "panel");
    panel.id = "panel-" + capsule.name.toLowerCase();
    panel.setAttribute("role", "tabpanel");

    const outfitsSection = el("section", "block");
    outfitsSection.appendChild(el("h2", null, "Outfit combinations"));
    outfitsSection.appendChild(
      el(
        "p",
        "empty-note",
        "Half built from what's in My Wardrobe to wear now, half fresh ideas that reach beyond it — " +
          "with links to find anything you're missing."
      )
    );

    const rotateBtn = el("button", "generate-btn full-width", "Rotate outfit ideas");
    rotateBtn.type = "button";
    outfitsSection.appendChild(rotateBtn);

    const rotateStatus = el("p", "generate-status");
    rotateStatus.hidden = true;
    outfitsSection.appendChild(rotateStatus);

    const outfitsList = el("div");
    outfitsSection.appendChild(outfitsList);

    const itemsSection = el("section", "block");
    panel.appendChild(outfitsSection);
    panel.appendChild(itemsSection);

    const storageKey = capsuleStorageKey(capsule.name);
    let currentOutfits = S.loadJson(storageKey, capsule.outfits);

    function renderOutfitsList() {
      outfitsList.innerHTML = "";
      currentOutfits.forEach((outfit) => {
        outfitsList.appendChild(buildOutfitCard(outfit, capsule.name, { onChange: renderAll }));
      });
    }

    // Ranks the capsule's unowned items by how many outfits each one would
    // complete — so "buy this and three looks unlock" leads, not the price.
    function renderItemsSection() {
      itemsSection.innerHTML = "";
      const ownedNames = new Set(S.getOwnedPool(D).map((i) => i.name));
      const missing = capsule.items.filter((item) => !ownedNames.has(item.name));

      itemsSection.appendChild(el("h2", null, "Complete the " + capsule.name + " wardrobe"));

      if (!missing.length) {
        itemsSection.appendChild(el("p", "empty-note", "You already own everything in this capsule."));
        return;
      }

      const unlocks = new Map();
      missing.forEach((item) => unlocks.set(item.name, { completes: 0, appearsIn: 0 }));
      currentOutfits.forEach((outfit) => {
        const c = S.resolveOwnership(outfit, D);
        if (!c || c.complete) return;
        c.missing.forEach((m) => {
          if (!m.item || !unlocks.has(m.item.name)) return;
          const rec = unlocks.get(m.item.name);
          rec.appearsIn += 1;
          if (c.missing.length === 1) rec.completes += 1;
        });
      });

      const sorted = missing.slice().sort((a, b) => {
        const ua = unlocks.get(a.name);
        const ub = unlocks.get(b.name);
        return ub.completes - ua.completes || ub.appearsIn - ua.appearsIn || a.price - b.price;
      });

      itemsSection.appendChild(
        el("p", "empty-note", "Not yet in your wardrobe — ordered by how much each one opens up.")
      );

      sorted.forEach((item) => {
        const rec = unlocks.get(item.name);
        const card = el("div", "item-card");
        const info = el("div", "item-info");
        info.appendChild(el("p", "item-name", item.name));

        let meta = money(item.price);
        if (rec.completes > 0) {
          meta += " · completes " + rec.completes + (rec.completes === 1 ? " outfit" : " outfits");
        } else if (rec.appearsIn > 0) {
          meta += " · used in " + rec.appearsIn + (rec.appearsIn === 1 ? " outfit" : " outfits");
        }
        const metaEl = el("p", "item-price", meta);
        if (rec.completes > 0) metaEl.classList.add("item-price-unlock");
        info.appendChild(metaEl);

        card.appendChild(info);
        card.appendChild(buyLink(item, "buy-btn-secondary"));
        itemsSection.appendChild(card);
      });
    }

    function renderAll() {
      renderOutfitsList();
      renderItemsSection();
      refreshToday();
    }

    rotateBtn.addEventListener("click", async () => {
      rotateBtn.disabled = true;
      rotateStatus.hidden = false;
      rotateStatus.classList.remove("generate-error");
      rotateStatus.textContent = "Asking Gemini to rotate these outfits…";

      try {
        const pool = S.getOwnedPool(D);
        const ownedNames = new Set(pool.map((it) => it.name));
        const newItemCandidates = capsule.items.filter((it) => !ownedNames.has(it.name));

        const outfits = await WardrobeGemini.generateOutfitIdeas({
          wardrobeItems: pool,
          exampleOutfits: capsule.outfits,
          profile: S.getProfile(),
          count: capsule.outfits.length,
          newItemCandidates,
          weather: currentWeather,
          feedback: S.getFeedbackLists(),
          avoidRepeats: S.recentlyWorn(7),
        });
        currentOutfits = outfits;
        S.saveJson(storageKey, currentOutfits);
        rotateStatus.hidden = true;
        renderAll();
      } catch (err) {
        rotateStatus.hidden = false;
        rotateStatus.classList.add("generate-error");
        rotateStatus.textContent = err && err.message ? err.message : "Something went wrong rotating these outfits.";
      } finally {
        rotateBtn.disabled = false;
      }
    });

    renderAll();
    panel._refresh = renderAll;
    return panel;
  }

  /* ---------------- photos ---------------- */

  // Downscale before storing: phone camera output is multi-megabyte and
  // IndexedDB quota is shared with the generated outfit images.
  function fileToThumbnail(file, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file isn't a readable image."));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- Wardrobe ---------------- */

  function renderWardrobePanel() {
    const panel = el("div", "panel");
    panel.id = "panel-wardrobe";
    panel.setAttribute("role", "tabpanel");

    const listSection = el("section", "block");
    const listHeader = el("div", "section-header");
    const listH2 = el("h2");
    const addToggle = el("button", "add-toggle", "+ Add");
    addToggle.type = "button";
    addToggle.setAttribute("aria-expanded", "false");
    listHeader.appendChild(listH2);
    listHeader.appendChild(addToggle);
    listSection.appendChild(listHeader);

    const addPanel = el("div", "add-panel");
    addPanel.hidden = true;
    const form = el("form", "add-item-form");
    const nameInput = el("input");
    nameInput.type = "text";
    nameInput.required = true;
    nameInput.placeholder = "e.g. Navy suit jacket";
    nameInput.setAttribute("aria-label", "Item name");

    const categorySelect = el("select");
    categorySelect.setAttribute("aria-label", "Category");
    CATEGORY_OPTIONS.forEach((c) => {
      const opt = el("option", null, c);
      opt.value = c;
      categorySelect.appendChild(opt);
    });

    const notesInput = el("input");
    notesInput.type = "text";
    notesInput.placeholder = "Notes, optional (colour, fit…)";
    notesInput.setAttribute("aria-label", "Notes");

    const addBtn = el("button", "buy-btn full-width", "Add to wardrobe");
    addBtn.type = "submit";

    form.appendChild(nameInput);
    form.appendChild(categorySelect);
    form.appendChild(notesInput);
    form.appendChild(addBtn);
    addPanel.appendChild(form);

    const importBtn = el("button", "ghost-btn full-width import-btn", "Import bought items from shopping list");
    importBtn.type = "button";
    addPanel.appendChild(importBtn);
    listSection.appendChild(addPanel);

    const seedRow = el("div", "seed-row");
    listSection.appendChild(seedRow);

    const listEl = el("div");
    listSection.appendChild(listEl);

    const ideasSection = el("section", "block");
    ideasSection.appendChild(el("h2", null, "Outfit ideas from your wardrobe"));
    const ideasIntro = el("p", "empty-note");
    ideasSection.appendChild(ideasIntro);
    const generateBtn = el("button", "generate-btn full-width");
    generateBtn.type = "button";
    ideasSection.appendChild(generateBtn);
    const ideasStatus = el("p", "generate-status");
    ideasStatus.hidden = true;
    ideasSection.appendChild(ideasStatus);
    const ideasList = el("div");
    ideasSection.appendChild(ideasList);

    panel.appendChild(listSection);
    panel.appendChild(ideasSection);

    addToggle.addEventListener("click", () => {
      const open = addPanel.hidden;
      addPanel.hidden = !open;
      addToggle.setAttribute("aria-expanded", open ? "true" : "false");
      addToggle.textContent = open ? "Close" : "+ Add";
      if (open) nameInput.focus();
    });

    function attachPhotoControls(row, item) {
      const photoWrap = el("div", "item-photo-wrap");
      const input = el("input", "visually-hidden");
      input.type = "file";
      input.accept = "image/*";
      input.setAttribute("capture", "environment");
      input.id = "photo-" + item.id;

      const label = el("label", "item-photo-label");
      label.setAttribute("for", input.id);
      label.title = "Add a photo";
      const placeholder = el("span", "item-photo-placeholder", "📷");
      label.appendChild(placeholder);

      photoWrap.appendChild(input);
      photoWrap.appendChild(label);

      S.dbGet(S.STORE_PHOTOS, item.id).then((dataUrl) => {
        if (!dataUrl) return;
        label.innerHTML = "";
        const img = el("img", "item-photo");
        img.src = dataUrl;
        img.alt = item.name;
        img.loading = "lazy";
        label.appendChild(img);
      });

      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        label.innerHTML = "";
        label.appendChild(el("span", "item-photo-placeholder", "…"));
        try {
          const dataUrl = await fileToThumbnail(file, 400);
          await S.dbPut(S.STORE_PHOTOS, item.id, dataUrl, { name: item.name });
          label.innerHTML = "";
          const img = el("img", "item-photo");
          img.src = dataUrl;
          img.alt = item.name;
          label.appendChild(img);
        } catch (e) {
          label.innerHTML = "";
          label.appendChild(el("span", "item-photo-placeholder", "📷"));
        }
        input.value = "";
      });

      row.appendChild(photoWrap);
    }

    function renderSeedRow() {
      seedRow.innerHTML = "";
      const owned = S.getOwnedItems();
      const notYet = D.assumedBasics.filter((b) => !owned.some((o) => o.name === b.name));
      if (!notYet.length) return;
      const btn = el("button", "ghost-btn full-width", "Add the " + notYet.length + " basics this plan assumes you own");
      btn.type = "button";
      btn.addEventListener("click", () => {
        const items = S.getOwnedItems();
        notYet.forEach((b) => items.push({ id: S.newId("item"), name: b.name, category: b.category, notes: "" }));
        S.setOwnedItems(items);
        renderAll();
      });
      seedRow.appendChild(btn);
    }

    function renderItemList() {
      const owned = S.getOwnedItems();
      listH2.textContent = "My wardrobe (" + owned.length + ")";
      listEl.innerHTML = "";

      if (!owned.length) {
        listEl.appendChild(
          el("p", "empty-note", "Nothing logged yet — add items above, or start with the basics below.")
        );
        return;
      }

      const byCategory = new Map();
      owned.forEach((it) => {
        const cat = it.category || "Other";
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(it);
      });

      CATEGORY_OPTIONS.forEach((cat) => {
        const items = byCategory.get(cat);
        if (!items || !items.length) return;
        listEl.appendChild(el("p", "category-heading", cat));
        items.forEach((it) => {
          const row = el("div", "wardrobe-item-row");
          attachPhotoControls(row, it);

          const info = el("div", "item-info");
          info.appendChild(el("p", "item-name", it.name));
          if (it.notes) info.appendChild(el("p", "item-meta", it.notes));
          row.appendChild(info);

          const removeBtn = el("button", "remove-btn", "✕");
          removeBtn.type = "button";
          removeBtn.setAttribute("aria-label", "Remove " + it.name);
          removeBtn.addEventListener("click", () => {
            S.setOwnedItems(S.getOwnedItems().filter((x) => x.id !== it.id));
            S.dbDelete(S.STORE_PHOTOS, it.id);
            renderAll();
          });
          row.appendChild(removeBtn);
          listEl.appendChild(row);
        });
      });
    }

    function renderIdeasIntro() {
      const pool = S.getOwnedPool(D);
      if (pool.length < 3) {
        ideasIntro.textContent = "Log at least 3 items (or import bought ones) to generate outfit ideas.";
        generateBtn.hidden = true;
      } else {
        ideasIntro.textContent =
          "Gemini will combine what's above into new outfit ideas, styled like the other tabs — with the " +
          "option of one not-yet-bought piece per outfit.";
        generateBtn.hidden = false;
      }
    }

    function renderGeneratedOutfits() {
      const generated = S.getGeneratedOutfits();
      ideasList.innerHTML = "";
      generateBtn.textContent = generated.length ? "Regenerate outfit ideas" : "Generate outfit ideas";
      generated.forEach((outfit) => {
        ideasList.appendChild(buildOutfitCard(outfit, "Wardrobe", { onChange: renderAll }));
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      const items = S.getOwnedItems();
      items.push({
        id: S.newId("item"),
        name,
        category: categorySelect.value,
        notes: notesInput.value.trim(),
      });
      S.setOwnedItems(items);
      nameInput.value = "";
      notesInput.value = "";
      renderAll();
    });

    importBtn.addEventListener("click", () => {
      const catalogue = S.catalogueByName(D);
      const bought = S.getBought();
      const items = S.getOwnedItems();
      let added = 0;
      catalogue.forEach((item, name) => {
        if (!bought[name] || items.some((it) => it.name === name)) return;
        added++;
        items.push({ id: S.newId("item"), name, category: guessCategory(name), notes: "" });
      });
      if (added) {
        S.setOwnedItems(items);
        renderAll();
      }
    });

    generateBtn.addEventListener("click", async () => {
      generateBtn.disabled = true;
      ideasStatus.hidden = false;
      ideasStatus.classList.remove("generate-error");
      ideasStatus.textContent = "Asking Gemini for outfit ideas…";

      const exampleOutfits = D.capsules.flatMap((c) => c.outfits).slice(0, 3);
      const pool = S.getOwnedPool(D);
      const ownedNames = new Set(pool.map((it) => it.name));
      const newItemCandidates = Array.from(S.catalogueByName(D).values()).filter((it) => !ownedNames.has(it.name));
      const count = Math.max(3, Math.min(6, Math.round(pool.length / 2)));

      try {
        const outfits = await WardrobeGemini.generateOutfitIdeas({
          wardrobeItems: pool,
          exampleOutfits,
          profile: S.getProfile(),
          count,
          newItemCandidates,
          weather: currentWeather,
          feedback: S.getFeedbackLists(),
          avoidRepeats: S.recentlyWorn(7),
        });
        S.setGeneratedOutfits(outfits);
        ideasStatus.hidden = true;
        renderAll();
      } catch (err) {
        ideasStatus.hidden = false;
        ideasStatus.classList.add("generate-error");
        ideasStatus.textContent = err && err.message ? err.message : "Something went wrong generating outfit ideas.";
      } finally {
        generateBtn.disabled = false;
      }
    });

    function renderAll() {
      renderItemList();
      renderSeedRow();
      renderIdeasIntro();
      renderGeneratedOutfits();
      refreshCapsules();
      refreshToday();
    }

    renderAll();
    panel._refresh = renderAll;
    return panel;
  }

  /* ---------------- Shopping ---------------- */

  function renderShoppingPanel() {
    const panel = el("div", "panel");
    panel.id = "panel-shopping";
    panel.setAttribute("role", "tabpanel");

    const section = el("section", "block");
    section.appendChild(el("h2", null, "Shopping list, priority order"));
    const summary = el("p", "shopping-summary");
    section.appendChild(summary);
    const list = el("div");
    section.appendChild(list);
    panel.appendChild(section);

    function render() {
      const catalogue = S.catalogueByName(D);
      const bought = S.getBought();
      const ordered = D.shoppingListPriorityOrder.filter((n) => catalogue.has(n));
      catalogue.forEach((_, name) => {
        if (ordered.indexOf(name) === -1) ordered.push(name);
      });

      let total = 0;
      let remaining = 0;
      catalogue.forEach((item, name) => {
        total += item.price;
        if (!bought[name]) remaining += item.price;
      });
      const boughtCount = ordered.filter((n) => bought[n]).length;

      summary.textContent =
        boughtCount +
        " of " +
        ordered.length +
        " owned · " +
        money(remaining) +
        " left of " +
        money(total);

      list.innerHTML = "";
      ordered.forEach((name) => {
        const item = catalogue.get(name);
        const row = el("div", "shop-item");
        row.dataset.name = name;

        const checkWrap = el("label", "checkbox-wrap");
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = !!bought[name];
        checkbox.setAttribute("aria-label", "Mark " + name + " as bought");
        checkbox.addEventListener("change", () => {
          const state = S.getBought();
          state[name] = checkbox.checked;
          S.setBought(state);
          render();
          refreshCapsules();
          refreshWardrobe();
          refreshToday();
        });
        checkWrap.appendChild(checkbox);

        const info = el("div", "item-info");
        info.appendChild(el("p", "item-name", item.name));
        info.appendChild(el("p", "item-meta", money(item.price) + " · " + item.capsule));

        if (bought[name]) row.classList.add("bought");
        row.appendChild(checkWrap);
        row.appendChild(info);
        if (!bought[name]) row.appendChild(buyLink(item, "buy-btn-secondary"));
        list.appendChild(row);
      });
    }

    render();
    panel._refresh = render;
    return panel;
  }

  /* ---------------- cross-panel refresh ---------------- */

  function refreshPanel(id) {
    const p = document.getElementById(id);
    if (p && p._refresh) p._refresh();
  }
  function refreshToday() {
    refreshPanel("panel-today");
  }
  function refreshWardrobe() {
    refreshPanel("panel-wardrobe");
  }
  function refreshCapsules() {
    D.capsules.forEach((c) => refreshPanel("panel-" + c.name.toLowerCase()));
  }

  /* ---------------- profile ---------------- */

  // Build and sizes are the most personal input to every prompt, so they're
  // editable here rather than baked into data.js.
  function initProfileStrip() {
    const body = document.getElementById("profile-body");
    const editWrap = document.getElementById("profile-edit");
    const buildInput = document.getElementById("profile-build");
    const sizesInput = document.getElementById("profile-sizes");
    const editBtn = document.getElementById("profile-edit-btn");
    const saveBtn = document.getElementById("profile-save");
    const cancelBtn = document.getElementById("profile-cancel");
    const resetBtn = document.getElementById("profile-reset");

    function renderSummary() {
      const p = S.getProfile();
      body.textContent = p.build + ". " + p.sizes + ".";
      resetBtn.hidden = !S.isProfileCustomised();
    }

    function openEditor() {
      const p = S.getProfile();
      buildInput.value = p.build;
      sizesInput.value = p.sizes;
      editWrap.hidden = false;
      body.hidden = true;
      editBtn.hidden = true;
      buildInput.focus();
    }

    function closeEditor() {
      editWrap.hidden = true;
      body.hidden = false;
      editBtn.hidden = false;
      renderSummary();
    }

    editBtn.addEventListener("click", openEditor);
    cancelBtn.addEventListener("click", closeEditor);

    saveBtn.addEventListener("click", () => {
      S.setProfile({ build: buildInput.value.trim(), sizes: sizesInput.value.trim() });
      closeEditor();
    });

    resetBtn.addEventListener("click", () => {
      S.resetProfile();
      renderSummary();
      if (!editWrap.hidden) openEditor();
    });

    renderSummary();
  }

  /* ---------------- settings ---------------- */

  function initSettingsModal() {
    if (typeof WardrobeGemini === "undefined") return;

    const backdrop = document.getElementById("settings-backdrop");
    const openBtn = document.getElementById("settings-btn");
    const closeBtn = document.getElementById("settings-close");
    const form = document.getElementById("settings-form");
    const keyInput = document.getElementById("gemini-key");
    const visToggle = document.getElementById("key-visibility-toggle");
    const modelSelect = document.getElementById("gemini-model");
    const styleSelect = document.getElementById("gemini-style");
    const textModelInput = document.getElementById("gemini-text-model");
    const styleNotesInput = document.getElementById("gemini-style-notes");
    const brandsInput = document.getElementById("gemini-brands");
    const brandsReset = document.getElementById("brands-reset");
    const clearBtn = document.getElementById("settings-clear");

    WardrobeGemini.MODEL_OPTIONS.forEach((opt) => {
      const o = el("option", null, opt.label);
      o.value = opt.value;
      modelSelect.appendChild(o);
    });
    WardrobeGemini.STYLE_OPTIONS.forEach((opt) => {
      const o = el("option", null, opt.label);
      o.value = opt.value;
      styleSelect.appendChild(o);
    });

    function syncFormFromStorage() {
      keyInput.value = WardrobeGemini.getApiKey();
      const settings = WardrobeGemini.getSettings();
      modelSelect.value = settings.model;
      styleSelect.value = settings.style;
      textModelInput.value = settings.textModel;
      styleNotesInput.value = settings.styleNotes;
      brandsInput.value = S.brandsToText();
      brandsReset.hidden = !S.areBrandsCustomised();
    }

    brandsReset.addEventListener("click", () => {
      S.resetBrands();
      brandsInput.value = S.brandsToText();
      brandsReset.hidden = true;
    });

    openBtn.addEventListener("click", () => {
      syncFormFromStorage();
      backdrop.hidden = false;
    });
    closeBtn.addEventListener("click", () => {
      backdrop.hidden = true;
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.hidden = true;
    });

    visToggle.addEventListener("click", () => {
      const showing = keyInput.type === "text";
      keyInput.type = showing ? "password" : "text";
      visToggle.textContent = showing ? "Show" : "Hide";
    });

    clearBtn.addEventListener("click", () => {
      WardrobeGemini.setApiKey("");
      keyInput.value = "";
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      WardrobeGemini.setApiKey(keyInput.value.trim());
      WardrobeGemini.setSettings({
        model: modelSelect.value,
        style: styleSelect.value,
        textModel: textModelInput.value.trim() || WardrobeGemini.DEFAULT_SETTINGS.textModel,
        styleNotes: styleNotesInput.value.trim(),
      });
      // An empty or unparseable list would leave gaps with nowhere to shop, so
      // fall back to the defaults rather than saving nothing.
      const brands = S.brandsFromText(brandsInput.value);
      if (brands.length) S.setBrands(brands);
      else S.resetBrands();
      backdrop.hidden = true;
      refreshCapsules();
      refreshWardrobe();
      refreshToday();
    });
  }

  /* ---------------- tabs ---------------- */

  function initTabs(tabs) {
    const tabBar = document.getElementById("tab-bar");
    tabs.forEach((tab) => {
      const btn = el("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.target = tab.id;
      btn.appendChild(el("span", "dot"));
      btn.appendChild(el("span", null, tab.label));
      btn.addEventListener("click", () => activateTab(tab.id));
      tabBar.appendChild(btn);
    });
  }

  function activateTab(targetId) {
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === targetId));
    document.querySelectorAll("nav.tab-bar button").forEach((b) => {
      const isActive = b.dataset.target === targetId;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    const panel = document.getElementById(targetId);
    if (panel && panel._refresh) panel._refresh();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ---------------- init ---------------- */

  function init() {
    const main = document.getElementById("main-content");

    main.appendChild(renderTodayPanel());
    D.capsules.forEach((capsule) => main.appendChild(renderCapsulePanel(capsule)));
    main.appendChild(renderWardrobePanel());
    main.appendChild(renderShoppingPanel());

    const tabs = [{ id: "panel-today", label: "Today" }]
      .concat(D.capsules.map((c) => ({ id: "panel-" + c.name.toLowerCase(), label: c.name })))
      .concat([
        { id: "panel-wardrobe", label: "Wardrobe" },
        { id: "panel-shopping", label: "Shopping" },
      ]);

    initTabs(tabs);
    activateTab("panel-today");

    initProfileStrip();
    initSettingsModal();

    // Weather is best-effort and asks for location, so it runs after first
    // paint and simply refreshes Today if it arrives.
    if (typeof WardrobeWeather !== "undefined") {
      currentWeather = WardrobeWeather.getCached();
      if (currentWeather) refreshToday();
      WardrobeWeather.get().then((w) => {
        if (w) {
          currentWeather = w;
          refreshToday();
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

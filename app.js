(function () {
  "use strict";

  const STORAGE_KEY = "wardrobe-capsule-bought-v1";

  function loadBought() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveBought(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* localStorage unavailable — state just won't persist */
    }
  }

  let boughtState = loadBought();

  const OWNED_ITEMS_KEY = "wardrobe-capsule-owned-items-v1";
  const GENERATED_OUTFITS_KEY = "wardrobe-capsule-generated-outfits-v1";

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
      /* localStorage unavailable — state just won't persist */
    }
  }

  let ownedItems = loadJson(OWNED_ITEMS_KEY, []);
  let generatedOutfits = loadJson(GENERATED_OUTFITS_KEY, []);

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

  const money = (n) => "£" + n.toFixed(0);

  function buyLink(item, extraClass) {
    const a = document.createElement("a");
    a.className = "buy-btn" + (extraClass ? " " + extraClass : "");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Buy";
    return a;
  }

  // buyableItemMap, when given, is a Map of name -> item (as from
  // allItemsByName) used to render a "New" buy chip when outfit.newItem is
  // set — the one not-yet-owned piece Gemini suggested for this look.
  function buildOutfitCard(outfit, cacheNamespace, buyableItemMap) {
    const card = document.createElement("div");
    card.className = "outfit-card";
    const name = document.createElement("p");
    name.className = "outfit-name";
    name.textContent = outfit.name;
    const pieces = document.createElement("p");
    pieces.className = "outfit-pieces";
    pieces.textContent = outfit.pieces;
    card.appendChild(name);
    card.appendChild(pieces);

    if (outfit.newItem && buyableItemMap && buyableItemMap.has(outfit.newItem)) {
      const newItemData = buyableItemMap.get(outfit.newItem);
      const chip = document.createElement("div");
      chip.className = "new-item-chip";
      const label = document.createElement("span");
      label.className = "new-item-label";
      label.textContent = "New: " + outfit.newItem + " · " + money(newItemData.price);
      chip.appendChild(label);
      chip.appendChild(buyLink(newItemData, "new-item-buy"));
      card.appendChild(chip);
    }

    const imageWrap = document.createElement("div");
    imageWrap.className = "outfit-image-wrap";
    card.appendChild(imageWrap);
    mountOutfitImage(imageWrap, cacheNamespace, outfit);

    return card;
  }

  function renderCapsulePanel(capsule) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "panel-" + capsule.name.toLowerCase();
    panel.setAttribute("role", "tabpanel");

    // "Complete the wardrobe" only lists what isn't owned yet — reflects
    // ownership as of this render (page load / reload), same freshness the
    // rotated outfit lists already have rather than live-updating.
    const ownedNamesAtRender = new Set(getFullOwnedPool(WARDROBE_DATA).map((it) => it.name));
    const missingItems = capsule.items.filter((item) => !ownedNamesAtRender.has(item.name));

    const itemsSection = document.createElement("section");
    itemsSection.className = "block";
    const itemsH2 = document.createElement("h2");
    itemsH2.textContent = "Complete the " + capsule.name + " wardrobe";
    itemsSection.appendChild(itemsH2);

    if (missingItems.length === 0) {
      const doneNote = document.createElement("p");
      doneNote.className = "empty-note";
      doneNote.textContent = "You already own everything in this capsule.";
      itemsSection.appendChild(doneNote);
    } else {
      const intro = document.createElement("p");
      intro.className = "empty-note";
      intro.textContent = "Not yet in your wardrobe — pieces that would open up more outfits above.";
      itemsSection.appendChild(intro);

      missingItems.forEach((item) => {
        const card = document.createElement("div");
        card.className = "item-card";

        const info = document.createElement("div");
        info.className = "item-info";
        const name = document.createElement("p");
        name.className = "item-name";
        name.textContent = item.name;
        const price = document.createElement("p");
        price.className = "item-price";
        price.textContent = money(item.price);
        info.appendChild(name);
        info.appendChild(price);

        card.appendChild(info);
        card.appendChild(buyLink(item, "buy-btn-secondary"));
        itemsSection.appendChild(card);
      });
    }

    const outfitsSection = document.createElement("section");
    outfitsSection.className = "block";
    const outfitsH2 = document.createElement("h2");
    outfitsH2.textContent = "Outfit combinations";
    outfitsSection.appendChild(outfitsH2);

    const rotateNote = document.createElement("p");
    rotateNote.className = "empty-note";
    rotateNote.textContent =
      "Built from what's in My Wardrobe first, plus at most one new piece per outfit from " + capsule.name + " items.";
    outfitsSection.appendChild(rotateNote);

    const rotateBtn = document.createElement("button");
    rotateBtn.type = "button";
    rotateBtn.className = "generate-btn full-width";
    rotateBtn.textContent = "Rotate outfit ideas";
    outfitsSection.appendChild(rotateBtn);

    const rotateStatus = document.createElement("p");
    rotateStatus.className = "generate-status";
    rotateStatus.hidden = true;
    outfitsSection.appendChild(rotateStatus);

    const outfitsList = document.createElement("div");
    outfitsSection.appendChild(outfitsList);

    const storageKey = "wardrobe-capsule-rotated-" + capsule.name.toLowerCase() + "-v1";
    let currentOutfits = loadJson(storageKey, capsule.outfits);

    function renderOutfitsList() {
      outfitsList.innerHTML = "";
      const buyableItemMap = allItemsByName(WARDROBE_DATA);
      currentOutfits.forEach((outfit) => {
        outfitsList.appendChild(buildOutfitCard(outfit, capsule.name, buyableItemMap));
      });
    }

    rotateBtn.addEventListener("click", async () => {
      rotateBtn.disabled = true;
      rotateStatus.hidden = false;
      rotateStatus.classList.remove("generate-error");
      rotateStatus.textContent = "Asking Gemini to rotate these outfits…";

      try {
        const fullOwnedPool = getFullOwnedPool(WARDROBE_DATA);
        const ownedNames = new Set(fullOwnedPool.map((it) => it.name));
        const newItemCandidates = capsule.items.filter((it) => !ownedNames.has(it.name));

        const outfits = await WardrobeGemini.generateOutfitIdeas({
          wardrobeItems: fullOwnedPool,
          exampleOutfits: capsule.outfits,
          profile: WARDROBE_DATA.profile,
          count: capsule.outfits.length,
          newItemCandidates,
        });
        currentOutfits = outfits;
        saveJson(storageKey, currentOutfits);
        rotateStatus.hidden = true;
        renderOutfitsList();
      } catch (err) {
        rotateStatus.hidden = false;
        rotateStatus.classList.add("generate-error");
        rotateStatus.textContent = err && err.message ? err.message : "Something went wrong rotating these outfits.";
      } finally {
        rotateBtn.disabled = false;
      }
    });

    renderOutfitsList();

    panel.appendChild(outfitsSection);
    panel.appendChild(itemsSection);
    return panel;
  }

  function renderOutfitImageState(wrap, state, payload) {
    wrap.innerHTML = "";
    wrap.dataset.state = state;

    if (state === "idle") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "generate-btn";
      btn.textContent = "Generate image";
      btn.addEventListener("click", payload.onGenerate);
      wrap.appendChild(btn);
    } else if (state === "loading") {
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      const label = document.createElement("p");
      label.className = "generate-status";
      label.textContent = "Generating with Gemini…";
      wrap.appendChild(spinner);
      wrap.appendChild(label);
    } else if (state === "image") {
      const img = document.createElement("img");
      img.className = "outfit-image";
      img.src = payload.dataUrl;
      img.alt = payload.alt;
      wrap.appendChild(img);
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "regenerate-btn";
      retry.textContent = "Regenerate";
      retry.addEventListener("click", payload.onGenerate);
      wrap.appendChild(retry);
    } else if (state === "error") {
      const msg = document.createElement("p");
      msg.className = "generate-error";
      msg.textContent = payload.message;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "generate-btn";
      retry.textContent = "Try again";
      retry.addEventListener("click", payload.onGenerate);
      wrap.appendChild(msg);
      wrap.appendChild(retry);
    }
  }

  function mountOutfitImage(wrap, capsuleName, outfit) {
    if (typeof WardrobeGemini === "undefined") return;

    const key = WardrobeGemini.outfitKey(capsuleName, outfit.name);

    const onGenerate = async () => {
      renderOutfitImageState(wrap, "loading");
      try {
        const dataUrl = await WardrobeGemini.generateOutfitImage(
          capsuleName,
          outfit,
          WARDROBE_DATA.profile
        );
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

  function renderWardrobePanel(data) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "panel-wardrobe";
    panel.setAttribute("role", "tabpanel");

    const addSection = document.createElement("section");
    addSection.className = "block";
    const addH2 = document.createElement("h2");
    addH2.textContent = "Add an item";
    addSection.appendChild(addH2);

    const form = document.createElement("form");
    form.className = "add-item-form";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.required = true;
    nameInput.placeholder = "e.g. Navy suit jacket";
    nameInput.setAttribute("aria-label", "Item name");

    const categorySelect = document.createElement("select");
    categorySelect.setAttribute("aria-label", "Category");
    CATEGORY_OPTIONS.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      categorySelect.appendChild(opt);
    });

    const notesInput = document.createElement("input");
    notesInput.type = "text";
    notesInput.placeholder = "Notes, optional (colour, fit…)";
    notesInput.setAttribute("aria-label", "Notes");

    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "buy-btn full-width";
    addBtn.textContent = "Add to wardrobe";

    form.appendChild(nameInput);
    form.appendChild(categorySelect);
    form.appendChild(notesInput);
    form.appendChild(addBtn);
    addSection.appendChild(form);

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "ghost-btn full-width import-btn";
    importBtn.textContent = "Import bought items from shopping list";
    addSection.appendChild(importBtn);

    const listSection = document.createElement("section");
    listSection.className = "block";
    const listH2 = document.createElement("h2");
    listSection.appendChild(listH2);
    const listEl = document.createElement("div");
    listSection.appendChild(listEl);

    const ideasSection = document.createElement("section");
    ideasSection.className = "block";
    const ideasH2 = document.createElement("h2");
    ideasH2.textContent = "Outfit ideas from your wardrobe";
    ideasSection.appendChild(ideasH2);
    const ideasIntro = document.createElement("p");
    ideasIntro.className = "empty-note";
    ideasSection.appendChild(ideasIntro);
    const generateBtn = document.createElement("button");
    generateBtn.type = "button";
    generateBtn.className = "generate-btn full-width";
    ideasSection.appendChild(generateBtn);
    const ideasStatus = document.createElement("p");
    ideasStatus.className = "generate-status";
    ideasStatus.hidden = true;
    ideasSection.appendChild(ideasStatus);
    const ideasList = document.createElement("div");
    ideasSection.appendChild(ideasList);

    panel.appendChild(addSection);
    panel.appendChild(listSection);
    panel.appendChild(ideasSection);

    function renderItemList() {
      listH2.textContent = "My wardrobe (" + ownedItems.length + (ownedItems.length === 1 ? " item" : " items") + ")";
      listEl.innerHTML = "";
      if (ownedItems.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "Nothing logged yet — add items above, or import what you've already bought.";
        listEl.appendChild(empty);
        return;
      }
      const byCategory = new Map();
      ownedItems.forEach((it) => {
        const cat = it.category || "Other";
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(it);
      });
      CATEGORY_OPTIONS.forEach((cat) => {
        const items = byCategory.get(cat);
        if (!items || items.length === 0) return;
        const groupHeading = document.createElement("p");
        groupHeading.className = "category-heading";
        groupHeading.textContent = cat;
        listEl.appendChild(groupHeading);
        items.forEach((it) => {
          const row = document.createElement("div");
          row.className = "wardrobe-item-row";
          const info = document.createElement("div");
          info.className = "item-info";
          const nameEl = document.createElement("p");
          nameEl.className = "item-name";
          nameEl.textContent = it.name;
          info.appendChild(nameEl);
          if (it.notes) {
            const notesEl = document.createElement("p");
            notesEl.className = "item-meta";
            notesEl.textContent = it.notes;
            info.appendChild(notesEl);
          }
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "remove-btn";
          removeBtn.setAttribute("aria-label", "Remove " + it.name);
          removeBtn.textContent = "✕";
          removeBtn.addEventListener("click", () => {
            ownedItems = ownedItems.filter((x) => x.id !== it.id);
            saveJson(OWNED_ITEMS_KEY, ownedItems);
            renderItemList();
            renderIdeasIntro();
          });
          row.appendChild(info);
          row.appendChild(removeBtn);
          listEl.appendChild(row);
        });
      });
    }

    function renderIdeasIntro() {
      if (getFullOwnedPool(data).length < 3) {
        ideasIntro.textContent = "Log at least 3 items (or import bought ones) to generate outfit ideas.";
        generateBtn.hidden = true;
      } else {
        ideasIntro.textContent =
          "Gemini will combine what's above into new outfit ideas, styled like the suggestions in the other " +
          "tabs — with the option of one not-yet-bought piece per outfit.";
        generateBtn.hidden = false;
      }
    }

    function renderGeneratedOutfits() {
      ideasList.innerHTML = "";
      generateBtn.textContent = generatedOutfits.length ? "Regenerate outfit ideas" : "Generate outfit ideas";
      const buyableItemMap = allItemsByName(data);
      generatedOutfits.forEach((outfit) => {
        ideasList.appendChild(buildOutfitCard(outfit, "Wardrobe", buyableItemMap));
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      ownedItems.push({
        id: "item-" + Date.now() + "-" + Math.round(Math.random() * 1e6),
        name,
        category: categorySelect.value,
        notes: notesInput.value.trim(),
      });
      saveJson(OWNED_ITEMS_KEY, ownedItems);
      nameInput.value = "";
      notesInput.value = "";
      renderItemList();
      renderIdeasIntro();
    });

    importBtn.addEventListener("click", () => {
      const itemMap = allItemsByName(data);
      let added = 0;
      itemMap.forEach((item, name) => {
        if (!boughtState[name]) return;
        if (ownedItems.some((it) => it.name === name)) return;
        added++;
        ownedItems.push({
          id: "item-" + Date.now() + "-" + Math.round(Math.random() * 1e6) + "-" + added,
          name,
          category: guessCategory(name),
          notes: "",
        });
      });
      if (added > 0) {
        saveJson(OWNED_ITEMS_KEY, ownedItems);
        renderItemList();
        renderIdeasIntro();
      }
    });

    generateBtn.addEventListener("click", async () => {
      generateBtn.disabled = true;
      ideasStatus.hidden = false;
      ideasStatus.classList.remove("generate-error");
      ideasStatus.textContent = "Asking Gemini for outfit ideas…";

      const allOutfits = data.capsules.flatMap((c) => c.outfits);
      const exampleOutfits = allOutfits.slice(0, 3);
      const fullOwnedPool = getFullOwnedPool(data);
      const ownedNames = new Set(fullOwnedPool.map((it) => it.name));
      const newItemCandidates = Array.from(allItemsByName(data).values()).filter((it) => !ownedNames.has(it.name));
      const count = Math.max(3, Math.min(6, Math.round(fullOwnedPool.length / 2)));

      try {
        const outfits = await WardrobeGemini.generateOutfitIdeas({
          wardrobeItems: fullOwnedPool,
          exampleOutfits,
          profile: data.profile,
          count,
          newItemCandidates,
        });
        generatedOutfits = outfits;
        saveJson(GENERATED_OUTFITS_KEY, generatedOutfits);
        ideasStatus.hidden = true;
        renderGeneratedOutfits();
      } catch (err) {
        ideasStatus.hidden = false;
        ideasStatus.classList.add("generate-error");
        ideasStatus.textContent = err && err.message ? err.message : "Something went wrong generating outfit ideas.";
      } finally {
        generateBtn.disabled = false;
      }
    });

    renderItemList();
    renderIdeasIntro();
    renderGeneratedOutfits();

    return panel;
  }

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
    const clearBtn = document.getElementById("settings-clear");

    WardrobeGemini.MODEL_OPTIONS.forEach((opt) => {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      modelSelect.appendChild(el);
    });
    WardrobeGemini.STYLE_OPTIONS.forEach((opt) => {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      styleSelect.appendChild(el);
    });

    function syncFormFromStorage() {
      keyInput.value = WardrobeGemini.getApiKey();
      const settings = WardrobeGemini.getSettings();
      modelSelect.value = settings.model;
      styleSelect.value = settings.style;
      textModelInput.value = settings.textModel;
      styleNotesInput.value = settings.styleNotes;
    }

    function openModal() {
      syncFormFromStorage();
      backdrop.hidden = false;
    }
    function closeModal() {
      backdrop.hidden = true;
    }

    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
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
      closeModal();
    });
  }

  function allItemsByName(data) {
    const map = new Map();
    data.capsules.forEach((capsule) => {
      capsule.items.forEach((item) => {
        if (!map.has(item.name)) {
          map.set(item.name, { ...item, capsule: capsule.name });
        }
      });
    });
    return map;
  }

  // Everything the wearer already owns: items logged in My Wardrobe, plus any
  // capsule catalogue item already checked off as bought — even if it was
  // never explicitly imported into My Wardrobe.
  function getFullOwnedPool(data) {
    const map = new Map();
    ownedItems.forEach((it) => map.set(it.name, { name: it.name, notes: it.notes }));
    data.capsules.forEach((capsule) => {
      capsule.items.forEach((it) => {
        if (boughtState[it.name] && !map.has(it.name)) map.set(it.name, { name: it.name });
      });
    });
    return Array.from(map.values());
  }

  function renderShoppingPanel(data) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "panel-shopping";
    panel.setAttribute("role", "tabpanel");

    const itemMap = allItemsByName(data);
    const orderedNames = data.shoppingListPriorityOrder.filter((n) => itemMap.has(n));
    // include anything not explicitly ordered, just in case, at the end
    itemMap.forEach((_, name) => {
      if (!orderedNames.includes(name)) orderedNames.push(name);
    });

    const totalsCard = document.createElement("div");
    totalsCard.className = "totals-card";

    const totalRow = document.createElement("div");
    totalRow.className = "totals-row";
    totalRow.innerHTML =
      '<span class="label">Total wardrobe cost</span><span class="value" id="total-all"></span>';

    const remainingRow = document.createElement("div");
    remainingRow.className = "totals-row remaining";
    remainingRow.innerHTML =
      '<span class="label">Still to buy</span><span class="value" id="total-remaining"></span>';

    const progressTrack = document.createElement("div");
    progressTrack.className = "progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "progress-fill";
    progressFill.id = "progress-fill";
    progressTrack.appendChild(progressFill);

    totalsCard.appendChild(totalRow);
    totalsCard.appendChild(remainingRow);
    totalsCard.appendChild(progressTrack);

    const section = document.createElement("section");
    section.className = "block";
    const h2 = document.createElement("h2");
    h2.textContent = "Shopping list, priority order";
    section.appendChild(h2);

    orderedNames.forEach((name) => {
      const item = itemMap.get(name);
      const row = document.createElement("div");
      row.className = "shop-item";
      row.dataset.name = name;

      const checkWrap = document.createElement("label");
      checkWrap.className = "checkbox-wrap";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!boughtState[name];
      checkbox.setAttribute("aria-label", "Mark " + name + " as bought");
      checkbox.addEventListener("change", () => {
        boughtState[name] = checkbox.checked;
        saveBought(boughtState);
        row.classList.toggle("bought", checkbox.checked);
        updateTotals(data);
      });
      checkWrap.appendChild(checkbox);

      const info = document.createElement("div");
      info.className = "item-info";
      const nameEl = document.createElement("p");
      nameEl.className = "item-name";
      nameEl.textContent = item.name;
      const meta = document.createElement("p");
      meta.className = "item-meta";
      meta.textContent = money(item.price) + " · " + item.capsule;
      info.appendChild(nameEl);
      info.appendChild(meta);

      if (boughtState[name]) row.classList.add("bought");

      row.appendChild(checkWrap);
      row.appendChild(info);
      row.appendChild(buyLink(item));
      section.appendChild(row);
    });

    panel.appendChild(totalsCard);
    panel.appendChild(section);
    return { panel, itemMap };
  }

  let cachedItemMap = null;

  function updateTotals(data) {
    if (!cachedItemMap) cachedItemMap = allItemsByName(data);
    let total = 0;
    let remaining = 0;
    cachedItemMap.forEach((item, name) => {
      total += item.price;
      if (!boughtState[name]) remaining += item.price;
    });
    const totalEl = document.getElementById("total-all");
    const remainingEl = document.getElementById("total-remaining");
    const fillEl = document.getElementById("progress-fill");
    if (totalEl) totalEl.textContent = money(total);
    if (remainingEl) {
      remainingEl.textContent = remaining === 0 ? "All bought" : money(remaining);
      remainingEl.parentElement.classList.toggle("all-done", remaining === 0);
    }
    if (fillEl) {
      const pct = total === 0 ? 0 : Math.round(((total - remaining) / total) * 100);
      fillEl.style.width = pct + "%";
    }
  }

  function initTabs(tabNames) {
    const tabBar = document.getElementById("tab-bar");
    const buttons = [];
    tabNames.forEach((tabName, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.dataset.target = tabName.id;
      btn.innerHTML = '<span class="dot"></span><span>' + tabName.label + "</span>";
      if (i === 0) btn.classList.add("active");
      btn.addEventListener("click", () => activateTab(tabName.id));
      tabBar.appendChild(btn);
      buttons.push(btn);
    });
    return buttons;
  }

  function activateTab(targetId) {
    document.querySelectorAll(".panel").forEach((p) => {
      p.classList.toggle("active", p.id === targetId);
    });
    document.querySelectorAll("nav.tab-bar button").forEach((b) => {
      const isActive = b.dataset.target === targetId;
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function init() {
    const data = WARDROBE_DATA;
    const main = document.getElementById("main-content");

    data.capsules.forEach((capsule) => {
      main.appendChild(renderCapsulePanel(capsule));
    });

    main.appendChild(renderWardrobePanel(data));

    const { panel: shoppingPanel } = renderShoppingPanel(data);
    main.appendChild(shoppingPanel);

    const tabNames = data.capsules
      .map((c) => ({ id: "panel-" + c.name.toLowerCase(), label: c.name }))
      .concat([
        { id: "panel-wardrobe", label: "Wardrobe" },
        { id: "panel-shopping", label: "Shopping" },
      ]);

    initTabs(tabNames);
    activateTab(tabNames[0].id);
    updateTotals(data);

    const profileBody = document.getElementById("profile-body");
    profileBody.textContent = data.profile.build + ". " + data.profile.sizes + ".";

    initSettingsModal();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

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

  function renderCapsulePanel(capsule) {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "panel-" + capsule.name.toLowerCase();
    panel.setAttribute("role", "tabpanel");

    const itemsSection = document.createElement("section");
    itemsSection.className = "block";
    const itemsH2 = document.createElement("h2");
    itemsH2.textContent = capsule.name + " items";
    itemsSection.appendChild(itemsH2);

    capsule.items.forEach((item) => {
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
      card.appendChild(buyLink(item));
      itemsSection.appendChild(card);
    });

    const outfitsSection = document.createElement("section");
    outfitsSection.className = "block";
    const outfitsH2 = document.createElement("h2");
    outfitsH2.textContent = "Outfit combinations";
    outfitsSection.appendChild(outfitsH2);

    capsule.outfits.forEach((outfit) => {
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
      outfitsSection.appendChild(card);
    });

    panel.appendChild(itemsSection);
    panel.appendChild(outfitsSection);
    return panel;
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

    const { panel: shoppingPanel } = renderShoppingPanel(data);
    main.appendChild(shoppingPanel);

    const tabNames = data.capsules
      .map((c) => ({ id: "panel-" + c.name.toLowerCase(), label: c.name }))
      .concat([{ id: "panel-shopping", label: "Shopping list" }]);

    initTabs(tabNames);
    activateTab(tabNames[0].id);
    updateTotals(data);

    const profileBody = document.getElementById("profile-body");
    profileBody.textContent = data.profile.build + ". " + data.profile.sizes + ".";
  }

  document.addEventListener("DOMContentLoaded", init);
})();

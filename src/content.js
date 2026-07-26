// Hilite — content script: selection toolbar, marks, action menu, sidebar.

(() => {
  const COLORS = ["yellow", "green", "blue", "pink"];
  let pageRecord = null;
  let toolbar = null;
  let menu = null;
  let sidebar = null;

  const pageKey = normalizeUrl(location.href);

  function normalizeUrl(href) {
    try {
      const u = new URL(href);
      u.hash = "";
      // Strip common tracking params so the same article maps to one record.
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]
        .forEach((p) => u.searchParams.delete(p));
      return u.toString();
    } catch (e) {
      return href;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- storage ----------

  async function loadPage() {
    const key = "page:" + pageKey;
    const data = await chrome.storage.local.get(key);
    pageRecord = data[key] || null;
    return pageRecord;
  }

  async function savePage() {
    if (!pageRecord) return;
    pageRecord.updatedAt = Date.now();
    await chrome.storage.local.set({ ["page:" + pageKey]: pageRecord });
    chrome.runtime.sendMessage({ type: "badge", count: pageRecord.highlights.length }).catch(() => {});
    renderSidebarList();
  }

  function ensureRecord() {
    if (!pageRecord) {
      pageRecord = {
        url: pageKey,
        title: document.title || pageKey,
        domain: location.hostname,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        highlights: []
      };
    }
    return pageRecord;
  }

  // ---------- marks ----------

  function makeMark(h) {
    const m = document.createElement("mark");
    m.className = "hilite-mark";
    m.dataset.color = h.color;
    m.dataset.hiliteId = h.id;
    return m;
  }

  function applyHighlight(h) {
    const marks = HiliteAnchor.apply(h, () => makeMark(h));
    return marks.length > 0;
  }

  function removeMarks(id) {
    document.querySelectorAll(`mark.hilite-mark[data-hilite-id="${CSS.escape(id)}"]`).forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      m.remove();
      parent.normalize();
    });
  }

  function recolorMarks(id, color) {
    document.querySelectorAll(`mark.hilite-mark[data-hilite-id="${CSS.escape(id)}"]`).forEach((m) => {
      m.dataset.color = color;
    });
  }

  // ---------- selection toolbar ----------

  function buildToolbar() {
    toolbar = document.createElement("div");
    toolbar.id = "hilite-toolbar";
    toolbar.className = "hilite-ui";
    for (const c of COLORS) {
      const b = document.createElement("button");
      b.className = "hilite-swatch-" + c;
      b.title = "Highlight " + c;
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        createHighlightFromSelection(c);
      });
      toolbar.appendChild(b);
    }
    toolbar.style.display = "none";
    document.documentElement.appendChild(toolbar);
  }

  function showToolbarForSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideToolbar();
      return;
    }
    // Ignore selections inside our own UI.
    const anchorEl = sel.anchorNode && sel.anchorNode.parentElement;
    if (anchorEl && anchorEl.closest(".hilite-ui")) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    toolbar.style.display = "flex";
    const top = window.scrollY + rect.top - 44;
    const left = window.scrollX + rect.left + rect.width / 2 - 60;
    toolbar.style.top = Math.max(window.scrollY + 4, top) + "px";
    toolbar.style.left = Math.max(4, left) + "px";
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
  }

  async function createHighlightFromSelection(color) {
    const sel = window.getSelection();
    const quote = HiliteAnchor.quoteFromSelection(sel);
    hideToolbar();
    if (!quote) return;

    const h = {
      id: uid(),
      exact: quote.exact,
      prefix: quote.prefix,
      suffix: quote.suffix,
      color,
      note: "",
      tags: [],
      createdAt: Date.now()
    };
    ensureRecord();
    pageRecord.title = document.title || pageRecord.title;
    pageRecord.highlights.push(h);
    sel.removeAllRanges();
    applyHighlight(h);
    await savePage();
  }

  // ---------- action menu (click a mark) ----------

  function buildMenu(h, anchorRect) {
    closeMenu();
    menu = document.createElement("div");
    menu.id = "hilite-menu";
    menu.className = "hilite-ui";

    const colorRow = document.createElement("div");
    colorRow.className = "hilite-menu-row";
    for (const c of COLORS) {
      const b = document.createElement("button");
      b.className = "hilite-btn hilite-swatch-" + c;
      b.style.width = "18px";
      b.style.height = "18px";
      b.style.borderRadius = "50%";
      b.style.padding = "0";
      b.title = c;
      b.addEventListener("click", async () => {
        h.color = c;
        recolorMarks(h.id, c);
        await savePage();
      });
      colorRow.appendChild(b);
    }
    menu.appendChild(colorRow);

    const note = document.createElement("textarea");
    note.placeholder = "Add a note…";
    note.value = h.note || "";
    menu.appendChild(note);

    const tags = document.createElement("input");
    tags.placeholder = "tags, comma, separated";
    tags.value = (h.tags || []).join(", ");
    menu.appendChild(tags);

    const row = document.createElement("div");
    row.className = "hilite-menu-row";

    const save = document.createElement("button");
    save.className = "hilite-btn";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      h.note = note.value.trim();
      h.tags = tags.value.split(",").map((t) => t.trim()).filter(Boolean);
      await savePage();
      closeMenu();
    });

    const copy = document.createElement("button");
    copy.className = "hilite-btn";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      navigator.clipboard.writeText(h.exact).catch(() => {});
      closeMenu();
    });

    const del = document.createElement("button");
    del.className = "hilite-btn hilite-btn-danger";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      pageRecord.highlights = pageRecord.highlights.filter((x) => x.id !== h.id);
      removeMarks(h.id);
      await savePage();
      closeMenu();
    });

    row.append(save, copy, del);
    menu.appendChild(row);

    document.documentElement.appendChild(menu);
    const top = window.scrollY + anchorRect.bottom + 6;
    const left = Math.max(4, window.scrollX + anchorRect.left);
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function closeMenu() {
    if (menu) {
      menu.remove();
      menu = null;
    }
  }

  // ---------- sidebar ----------

  function buildSidebar() {
    sidebar = document.createElement("aside");
    sidebar.id = "hilite-sidebar";
    sidebar.className = "hilite-ui";

    const header = document.createElement("header");
    const title = document.createElement("span");
    title.textContent = "Hilite";
    const close = document.createElement("button");
    close.className = "hilite-btn";
    close.textContent = "Close";
    close.addEventListener("click", toggleSidebar);
    header.append(title, close);

    const list = document.createElement("div");
    list.className = "hilite-list";

    const footer = document.createElement("footer");
    const copyMd = document.createElement("button");
    copyMd.className = "hilite-btn";
    copyMd.textContent = "Copy page as Markdown";
    copyMd.addEventListener("click", () => {
      if (!pageRecord) return;
      navigator.clipboard.writeText(HiliteExport.pageToMarkdown(pageRecord)).catch(() => {});
      copyMd.textContent = "Copied ✓";
      setTimeout(() => (copyMd.textContent = "Copy page as Markdown"), 1200);
    });
    const openLib = document.createElement("button");
    openLib.className = "hilite-btn";
    openLib.textContent = "Library";
    openLib.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-library" }).catch(() => {});
    });
    footer.append(copyMd, openLib);

    sidebar.append(header, list, footer);
    sidebar.style.display = "none";
    document.documentElement.appendChild(sidebar);
  }

  function renderSidebarList() {
    if (!sidebar) return;
    const list = sidebar.querySelector(".hilite-list");
    list.textContent = "";
    const hs = (pageRecord && pageRecord.highlights) || [];
    if (hs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hilite-empty";
      empty.textContent = "No highlights on this page yet. Select any text to get started.";
      list.appendChild(empty);
      return;
    }
    const colorHex = { yellow: "#ffe046", green: "#6ee795", blue: "#7dbeff", pink: "#ff91be" };
    for (const h of hs) {
      const card = document.createElement("div");
      card.className = "hilite-card";
      card.style.borderLeftColor = colorHex[h.color] || "#ffe046";
      const text = document.createElement("div");
      text.textContent = h.exact.length > 300 ? h.exact.slice(0, 300) + "…" : h.exact;
      card.appendChild(text);
      if (h.note) {
        const note = document.createElement("div");
        note.className = "hilite-note";
        note.textContent = h.note;
        card.appendChild(note);
      }
      if (h.tags && h.tags.length) {
        const tagRow = document.createElement("div");
        tagRow.className = "hilite-tags";
        for (const t of h.tags) {
          const tag = document.createElement("span");
          tag.className = "hilite-tag";
          tag.textContent = "#" + t;
          tagRow.appendChild(tag);
        }
        card.appendChild(tagRow);
      }
      card.addEventListener("click", () => {
        const mark = document.querySelector(`mark.hilite-mark[data-hilite-id="${CSS.escape(h.id)}"]`);
        if (mark) {
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
          mark.classList.add("hilite-flash");
          setTimeout(() => mark.classList.remove("hilite-flash"), 1500);
        }
      });
      list.appendChild(card);
    }
  }

  function toggleSidebar() {
    if (!sidebar) buildSidebar();
    const showing = sidebar.style.display !== "none";
    sidebar.style.display = showing ? "none" : "flex";
    if (!showing) renderSidebarList();
  }

  // ---------- events ----------

  document.addEventListener("mouseup", (e) => {
    if (e.target.closest && e.target.closest(".hilite-ui")) return;
    // Let the selection settle before measuring it.
    setTimeout(showToolbarForSelection, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target.closest && e.target.closest(".hilite-ui")) return;
    hideToolbar();
    if (menu && !menu.contains(e.target)) closeMenu();
  });

  document.addEventListener("click", (e) => {
    const mark = e.target.closest && e.target.closest("mark.hilite-mark");
    if (!mark || !pageRecord) return;
    const h = pageRecord.highlights.find((x) => x.id === mark.dataset.hiliteId);
    if (h) buildMenu(h, mark.getBoundingClientRect());
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "toggle-sidebar") {
      toggleSidebar();
      sendResponse({ ok: true });
    } else if (msg.type === "highlight-selection") {
      createHighlightFromSelection(msg.color || "yellow");
      sendResponse({ ok: true });
    } else if (msg.type === "get-page") {
      sendResponse({ page: pageRecord });
    }
    return false;
  });

  // ---------- init ----------

  buildToolbar();

  loadPage().then((rec) => {
    if (!rec || rec.highlights.length === 0) return;
    let applied = 0;
    for (const h of rec.highlights) {
      if (applyHighlight(h)) applied++;
    }
    chrome.runtime.sendMessage({ type: "badge", count: rec.highlights.length }).catch(() => {});
    // Some pages hydrate late; retry once for anything that missed.
    if (applied < rec.highlights.length) {
      setTimeout(() => {
        for (const h of rec.highlights) {
          if (!document.querySelector(`mark.hilite-mark[data-hilite-id="${CSS.escape(h.id)}"]`)) {
            applyHighlight(h);
          }
        }
      }, 2000);
    }
  });
})();

// Hilite — library page: browse, search, filter, export, Kindle import.

const COLOR_HEX = { yellow: "#ffe046", green: "#6ee795", blue: "#7dbeff", pink: "#ff91be" };
let allPages = [];

async function loadAll() {
  const data = await chrome.storage.local.get(null);
  allPages = Object.entries(data)
    .filter(([k]) => k.startsWith("page:"))
    .map(([, v]) => v)
    .filter((p) => p && p.highlights && p.highlights.length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function allTags() {
  const tags = new Set();
  for (const p of allPages) {
    for (const h of p.highlights) {
      for (const t of h.tags || []) tags.add(t);
    }
  }
  return Array.from(tags).sort();
}

function filteredPages() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const color = document.getElementById("colorFilter").value;
  const tag = document.getElementById("tagFilter").value;

  return allPages
    .map((p) => {
      const highlights = p.highlights.filter((h) => {
        if (color && h.color !== color) return false;
        if (tag && !(h.tags || []).includes(tag)) return false;
        if (q) {
          const hay = (h.exact + " " + (h.note || "") + " " + (h.tags || []).join(" ") + " " + p.title)
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      return { ...p, highlights };
    })
    .filter((p) => p.highlights.length > 0);
}

function render() {
  const pages = filteredPages();
  const main = document.getElementById("pages");
  main.textContent = "";

  const totalH = allPages.reduce((n, p) => n + p.highlights.length, 0);
  document.getElementById("stats").textContent =
    `${allPages.length} pages · ${totalH} highlights`;

  if (pages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = allPages.length === 0
      ? `<div class="big">🖍️</div>Nothing here yet.<br>Select text on any web page to make your first highlight.`
      : `No highlights match your filters.`;
    main.appendChild(empty);
    return;
  }

  const tpl = document.getElementById("pageTpl");
  for (const p of pages) {
    const node = tpl.content.cloneNode(true);
    const link = node.querySelector(".pageTitle");
    link.textContent = p.title;
    if (p.url.startsWith("kindle://")) {
      link.removeAttribute("href");
    } else {
      link.href = p.url;
    }
    node.querySelector(".pageMeta").textContent =
      `${p.domain || ""} · ${p.highlights.length} highlight${p.highlights.length === 1 ? "" : "s"} · ${HiliteExport.fmtDate(p.updatedAt || p.createdAt)}`;

    const hls = node.querySelector(".hls");
    for (const h of p.highlights) {
      const div = document.createElement("div");
      div.className = "hl";
      div.style.borderLeftColor = COLOR_HEX[h.color] || COLOR_HEX.yellow;
      const text = document.createElement("div");
      text.textContent = h.exact;
      div.appendChild(text);
      if (h.note) {
        const note = document.createElement("div");
        note.className = "note";
        note.textContent = h.note;
        div.appendChild(note);
      }
      if (h.tags && h.tags.length) {
        const tags = document.createElement("div");
        tags.className = "tags";
        for (const t of h.tags) {
          const s = document.createElement("span");
          s.className = "tag";
          s.textContent = "#" + t;
          tags.appendChild(s);
        }
        div.appendChild(tags);
      }
      hls.appendChild(div);
    }

    node.querySelector(".copyMd").addEventListener("click", (e) => {
      navigator.clipboard.writeText(HiliteExport.pageToMarkdown(p));
      e.target.textContent = "Copied ✓";
      setTimeout(() => (e.target.textContent = "Copy .md"), 1200);
    });
    node.querySelector(".downloadMd").addEventListener("click", () => {
      download(slug(p.title) + ".md", HiliteExport.pageToMarkdown(p), "text/markdown");
    });
    node.querySelector(".deletePage").addEventListener("click", async () => {
      if (!confirm(`Delete "${p.title}" and its ${p.highlights.length} highlight(s)?`)) return;
      await chrome.storage.local.remove("page:" + p.url);
      await loadAll();
      refreshTagFilter();
      render();
    });

    main.appendChild(node);
  }
}

function refreshTagFilter() {
  const sel = document.getElementById("tagFilter");
  const current = sel.value;
  sel.innerHTML = '<option value="">All tags</option>';
  for (const t of allTags()) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = "#" + t;
    sel.appendChild(o);
  }
  sel.value = current;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "hilite";
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportAll(format) {
  const pages = filteredPages();
  if (pages.length === 0) return;
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "md") download(`hilite-export-${stamp}.md`, HiliteExport.pagesToMarkdown(pages), "text/markdown");
  if (format === "txt") download(`hilite-export-${stamp}.txt`, pages.map(HiliteExport.pageToText).join("\n----\n\n"), "text/plain");
  if (format === "csv") download(`hilite-export-${stamp}.csv`, HiliteExport.pagesToCsv(pages), "text/csv");
  if (format === "html") download(`hilite-export-${stamp}.html`, HiliteExport.pagesToHtml(pages), "text/html");
  if (format === "json") download(`hilite-export-${stamp}.json`, JSON.stringify(pages, null, 2), "application/json");
}

async function importKindle(file) {
  const raw = await file.text();
  const books = HiliteKindle.parseClippings(raw);
  if (books.length === 0) {
    alert("No highlights found in that file. Expected Kindle's My Clippings.txt format.");
    return;
  }
  const pages = HiliteKindle.booksToPages(books, Date.now());
  const updates = {};
  for (const p of pages) {
    updates["page:" + p.url] = p;
  }
  await chrome.storage.local.set(updates);
  await loadAll();
  refreshTagFilter();
  render();
  alert(`Imported ${pages.length} book(s), ${pages.reduce((n, p) => n + p.highlights.length, 0)} highlight(s).`);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadAll();
  refreshTagFilter();
  render();

  document.getElementById("search").addEventListener("input", render);
  document.getElementById("colorFilter").addEventListener("change", render);
  document.getElementById("tagFilter").addEventListener("change", render);

  document.querySelectorAll("[data-export]").forEach((b) =>
    b.addEventListener("click", () => exportAll(b.dataset.export))
  );

  document.getElementById("importKindle").addEventListener("click", () =>
    document.getElementById("kindleFile").click()
  );
  document.getElementById("kindleFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importKindle(e.target.files[0]);
    e.target.value = "";
  });
});

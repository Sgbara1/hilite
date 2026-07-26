// Hilite — export formatters. Loaded by the content script, popup, and library.

const HiliteExport = (() => {
  const COLOR_EMOJI = { yellow: "🟡", green: "🟢", blue: "🔵", pink: "🩷" };

  function fmtDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toISOString().slice(0, 10);
  }

  function pageToMarkdown(page) {
    const lines = [];
    lines.push(`# ${page.title}`);
    lines.push("");
    lines.push(`Source: [${page.domain || page.url}](${page.url})`);
    lines.push(`Saved: ${fmtDate(page.createdAt)}`);
    lines.push("");
    lines.push("## Highlights");
    lines.push("");
    for (const h of page.highlights) {
      const emoji = COLOR_EMOJI[h.color] || "🟡";
      lines.push(`- ${emoji} ${h.exact.replace(/\s+/g, " ").trim()}`);
      if (h.note) lines.push(`  - **Note:** ${h.note}`);
      if (h.tags && h.tags.length) lines.push(`  - Tags: ${h.tags.map((t) => "#" + t).join(" ")}`);
    }
    lines.push("");
    return lines.join("\n");
  }

  function pageToText(page) {
    const lines = [page.title, page.url, ""];
    for (const h of page.highlights) {
      lines.push(`"${h.exact.replace(/\s+/g, " ").trim()}"`);
      if (h.note) lines.push(`  Note: ${h.note}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function pagesToCsv(pages) {
    const rows = [["title", "url", "highlight", "color", "note", "tags", "created"]];
    for (const p of pages) {
      for (const h of p.highlights) {
        rows.push([
          p.title,
          p.url,
          h.exact.replace(/\s+/g, " ").trim(),
          h.color,
          h.note || "",
          (h.tags || []).join("|"),
          fmtDate(h.createdAt)
        ]);
      }
    }
    return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pagesToHtml(pages) {
    const parts = [
      "<!doctype html><meta charset='utf-8'><title>Hilite export</title>",
      "<style>body{font-family:sans-serif;max-width:760px;margin:40px auto;line-height:1.5}blockquote{border-left:3px solid #f5c518;margin:0 0 10px;padding:4px 14px;background:#fafafa}em{color:#666}</style>",
      "<h1>Hilite export</h1>"
    ];
    for (const p of pages) {
      parts.push(`<h2>${escapeHtml(p.title)}</h2>`);
      parts.push(`<p><a href="${escapeHtml(p.url)}">${escapeHtml(p.url)}</a></p>`);
      for (const h of p.highlights) {
        parts.push(`<blockquote>${escapeHtml(h.exact)}${h.note ? `<br><em>Note: ${escapeHtml(h.note)}</em>` : ""}</blockquote>`);
      }
    }
    return parts.join("\n");
  }

  function pagesToMarkdown(pages) {
    return pages.map(pageToMarkdown).join("\n---\n\n");
  }

  return { pageToMarkdown, pageToText, pagesToCsv, pagesToHtml, pagesToMarkdown, fmtDate };
})();

// Allow use from Node for tests.
if (typeof module !== "undefined" && module.exports) {
  module.exports = HiliteExport;
}

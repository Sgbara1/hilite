// Hilite — Kindle "My Clippings.txt" parser.
// Format: blocks separated by "==========".
//   Line 1: Title (Author)
//   Line 2: - Your Highlight on Location 123-456 | Added on <date>
//   Line 3: (blank)
//   Line 4+: highlight text

const HiliteKindle = (() => {
  function parseClippings(raw) {
    const blocks = raw.replace(/^﻿/, "").split(/^={5,}\s*$/m);
    const books = new Map();

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l, i) => !(i === 0 && l === ""));
      const nonEmpty = lines.filter(Boolean);
      if (nonEmpty.length < 3) continue;

      const titleLine = nonEmpty[0];
      const metaLine = nonEmpty[1];
      if (!/^-/.test(metaLine)) continue;
      // Skip bookmarks; keep highlights and notes.
      const isNote = /Your Note/i.test(metaLine);
      const isHighlight = /Your Highlight/i.test(metaLine);
      if (!isNote && !isHighlight) continue;

      const text = nonEmpty.slice(2).join("\n").trim();
      if (!text) continue;

      const m = titleLine.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const title = m ? m[1].trim() : titleLine;
      const author = m ? m[2].trim() : "";

      const locMatch = metaLine.match(/(?:Location|page)\s+([\d-]+)/i);
      const location = locMatch ? locMatch[1] : "";

      if (!books.has(title)) {
        books.set(title, { title, author, entries: [] });
      }
      books.get(title).entries.push({ text, location, isNote });
    }

    return Array.from(books.values());
  }

  // Convert parsed books into Hilite page records.
  function booksToPages(books, now) {
    const ts = now || 0;
    return books.map((b) => ({
      url: "kindle://" + encodeURIComponent(b.title),
      title: b.title + (b.author ? " — " + b.author : ""),
      domain: "kindle",
      createdAt: ts,
      updatedAt: ts,
      highlights: b.entries
        .filter((e) => !e.isNote)
        .map((e, i) => ({
          id: "k" + ts.toString(36) + "_" + i,
          exact: e.text,
          prefix: "",
          suffix: "",
          color: "yellow",
          note: e.location ? "Location " + e.location : "",
          tags: ["kindle"],
          createdAt: ts
        }))
    })).filter((p) => p.highlights.length > 0);
  }

  return { parseClippings, booksToPages };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = HiliteKindle;
}

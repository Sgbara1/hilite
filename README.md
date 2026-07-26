# Hilite 🖍️

A self-hosted, privacy-first alternative to [Glasp](https://glasp.co). Highlight anything on the web in four colors, attach notes and tags, browse everything in a local library, and export to Markdown, CSV, HTML, or plain text. No account, no server, no telemetry. Every byte stays in your browser's local storage.

## Features

- **4-color highlighting** — select text on any page and a floating toolbar appears. Yellow, green, blue, pink.
- **Notes and tags** — click any highlight to annotate it, tag it, recolor it, copy it, or delete it.
- **Persistent anchoring** — highlights are stored as text quotes (exact + prefix + suffix context), not fragile DOM paths, so they re-attach when you revisit a page even after the site ships a redesign.
- **Sidebar** — `Alt+G` opens a panel listing every highlight on the current page; click one to scroll to it.
- **Library** — a full-page view of every page you've highlighted, with live search, color and tag filters.
- **Export** — per-page or bulk, to `.md`, `.txt`, `.csv`, `.html`, and `.json`. One-click "Copy as Markdown" pastes cleanly into Obsidian, Notion, or Roam.
- **Kindle import** — drop in your `My Clippings.txt` and your book highlights join the library, grouped by book.
- **Context menu + keyboard** — right-click → "Highlight with Hilite", `Alt+G` for the sidebar.
- **Badge count** — the toolbar icon shows how many highlights live on the current page.

## Install

1. Clone this repo (or download the ZIP).
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the repo folder.
5. Visit any article, select some text, pick a color.

Works on Chrome, Brave, Edge, Arc, and other Chromium browsers (Manifest V3).

## How highlights survive page changes

Most highlighters store an XPath or CSS path to the highlighted node, which breaks the moment the site changes its markup. Hilite instead stores the highlighted text itself plus 48 characters of surrounding context. On revisit it rebuilds a flat text index of the page, finds the quote, scores candidate positions by how well their context matches, and wraps the winning range. Same approach the W3C annotation model and Hypothesis use.

## What it deliberately doesn't do

Glasp is a social product; Hilite is a personal tool. There's no feed, no profiles, no community highlights, and no AI summarization, because those require accounts and someone else's server. There's also no PDF highlighting yet: Chrome's built-in PDF viewer doesn't allow content scripts, so that needs a bundled viewer (see roadmap).

## Roadmap

- [ ] PDF highlighting via a bundled PDF.js viewer
- [ ] YouTube transcript capture
- [ ] Direct Obsidian vault export (folder picker via File System Access API)
- [ ] Firefox port (needs `browser.*` shims)

## Development

No build step. Vanilla JS, MV3.

```
src/
  anchor.js      text-quote anchoring engine (find + wrap ranges)
  content.js     selection toolbar, marks, action menu, sidebar
  export.js      md / txt / csv / html formatters
  kindle.js      My Clippings.txt parser
  background.js  service worker: context menu, badge, commands
  popup.*        toolbar popup
  library.*      the library page
test/
  run-tests.js   node tests for the DOM-free logic
```

Run tests:

```bash
node test/run-tests.js
```

## License

MIT © Solomon Gbara Jr

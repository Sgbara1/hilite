# Glasp research notes

Feature research done 2026-07-26, before building Hilite.

## What Glasp is

Glasp ("Greatest Legacy Accumulated as Shared Proof") is a free browser extension plus web app for social highlighting. You highlight articles, PDFs, and Kindle books; your highlights collect on a public profile; other users can follow you and browse a feed of community highlights.

## Core feature inventory

| Glasp feature | In Hilite? | Notes |
|---|---|---|
| 4-color web highlighting via selection popup | ✅ | Same interaction: select → color swatch popup |
| Notes on highlights | ✅ | Click a mark to open the annotation menu |
| Tags | ✅ | Per-highlight, comma-separated |
| Sidebar showing page highlights while reading | ✅ | `Alt+G`, click-to-scroll |
| Personal library / profile page of all highlights | ✅ | Local library page with search + filters |
| Export .md / .txt / .csv / .html | ✅ | Plus raw .json |
| Copy-paste into Obsidian / Notion / Roam | ✅ | Via "Copy as Markdown" (no API integrations) |
| Kindle highlights import | ✅ | Parses `My Clippings.txt` |
| PDF highlighting | ❌ | Chrome's PDF viewer blocks content scripts; needs bundled PDF.js (roadmap) |
| YouTube transcript panel + copy + summarize | ✅ | Panel beside the player: clickable timestamps, copy (plain/timestamped), Summarize with Claude/ChatGPT via URL prefill or clipboard hand-off, save lines to library |
| AI summarization / "chat with highlights" | ⚠️ | Hand-off only (opens Claude/ChatGPT with the prompt); no LLM API calls from the extension |
| Social feed, profiles, follows, community highlights | ❌ | Deliberately excluded; Hilite is local-only |
| Readwise / Notion API sync | ❌ | File export instead |

## Interaction details observed

- Highlighting happens in place on the article, no separate reader view. Selected text gets an immediate color popup.
- All highlights for the page accumulate in a right-hand sidebar, easy to copy into note apps.
- Exports available per-article and in bulk from the profile page.
- Kindle flow: upload `My Clippings.txt`, highlights grouped by book, exportable as Markdown.

## Technical decisions this drove

1. **Text-quote anchoring** (exact + prefix + suffix) instead of XPath, matching the W3C Web Annotation selector model, so highlights survive site redesigns.
2. **No backend.** Glasp's account/social layer is the part that costs money and leaks reading history. Everything in Hilite lives in `chrome.storage.local`.
3. **MV3, vanilla JS, no build step**, so `Load unpacked` on a fresh clone just works.

## Sources

- [Glasp home](https://glasp.co/)
- [Glasp web highlighter page](https://glasp.co/web-highlighter)
- [Glasp extension release notes](https://glasp.co/extension-update)
- [How to export Kindle highlights as Markdown using Glasp](https://glasp.co/posts/how-to-export-kindle-highlights-as-markdown-using-glasp)
- [How to highlight a PDF on Chrome](https://glasp.co/posts/how-to-highlight-a-pdf-on-chrome)
- [Maximizing your productivity with Glasp (Medium)](https://medium.com/dare-to-be-better/maximizing-your-productivity-with-glasp-social-web-highlighter-f9ef3ec6ad06)

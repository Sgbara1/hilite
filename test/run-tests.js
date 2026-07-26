#!/usr/bin/env node
// Hilite — Node tests for the DOM-free logic: anchor locating, export
// formatting, and the Kindle clippings parser. Run: node test/run-tests.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok  " + name);
  } catch (e) {
    console.error("FAIL  " + name);
    console.error(e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
}

// --- load anchor.js in a bare sandbox (its module body touches no DOM) ---
const anchorSrc = fs.readFileSync(path.join(__dirname, "../src/anchor.js"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(anchorSrc + "\nthis.HiliteAnchor = HiliteAnchor;", sandbox);
const Anchor = sandbox.HiliteAnchor;

const HiliteExport = require("../src/export.js");
const HiliteKindle = require("../src/kindle.js");

// ---------- anchor.locate ----------

test("locate finds a unique quote", () => {
  const index = { text: "The quick brown fox jumps over the lazy dog." };
  const pos = Anchor.locate(index, { exact: "brown fox", prefix: "", suffix: "" });
  assert.strictEqual(pos, 10);
});

test("locate returns null for a missing quote", () => {
  const index = { text: "Nothing to see here." };
  assert.strictEqual(Anchor.locate(index, { exact: "unicorn", prefix: "", suffix: "" }), null);
});

test("locate disambiguates repeats using prefix and suffix", () => {
  // "cat" appears three times; context should pick the middle one.
  const text = "A black cat sat. A tabby cat purred. A white cat slept.";
  const index = { text };
  const pos = Anchor.locate(index, { exact: "cat", prefix: "A tabby ", suffix: " purred" });
  assert.strictEqual(text.slice(pos - 8, pos + 10), "A tabby cat purred");
});

test("locate prefers the best-matching context, not the first hit", () => {
  const text = "alpha X beta X gamma X";
  const index = { text };
  const pos = Anchor.locate(index, { exact: "X", prefix: "gamma ", suffix: "" });
  assert.strictEqual(pos, text.lastIndexOf("X"));
});

// ---------- export ----------

const samplePage = {
  url: "https://example.com/post",
  title: "Sample Post",
  domain: "example.com",
  createdAt: 1753500000000,
  updatedAt: 1753500000000,
  highlights: [
    { id: "a1", exact: "First insight", color: "yellow", note: "remember this", tags: ["ideas"], createdAt: 1753500000000 },
    { id: "a2", exact: 'Quote with "quotes", commas', color: "green", note: "", tags: [], createdAt: 1753500000000 }
  ]
};

test("pageToMarkdown includes title, source, highlights, and notes", () => {
  const md = HiliteExport.pageToMarkdown(samplePage);
  assert.ok(md.includes("# Sample Post"));
  assert.ok(md.includes("(https://example.com/post)"));
  assert.ok(md.includes("First insight"));
  assert.ok(md.includes("**Note:** remember this"));
  assert.ok(md.includes("#ideas"));
});

test("pagesToCsv escapes quotes and commas", () => {
  const csv = HiliteExport.pagesToCsv([samplePage]);
  const lines = csv.split("\n");
  assert.strictEqual(lines[0], "title,url,highlight,color,note,tags,created");
  assert.ok(csv.includes('"Quote with ""quotes"", commas"'));
});

test("pagesToHtml escapes markup in highlights", () => {
  const page = { ...samplePage, highlights: [{ id: "x", exact: "<script>alert(1)</script>", color: "blue", note: "", tags: [] }] };
  const html = HiliteExport.pagesToHtml([page]);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
});

// ---------- kindle parser ----------

const clippings = `The Pragmatic Programmer (David Thomas; Andrew Hunt)
- Your Highlight on Location 210-212 | Added on Monday, June 1, 2026 8:15:03 PM

Care about your craft. Why spend your life developing software unless you care about doing it well?
==========
The Pragmatic Programmer (David Thomas; Andrew Hunt)
- Your Bookmark on Location 300 | Added on Monday, June 1, 2026 8:20:00 PM

==========
Deep Work (Cal Newport)
- Your Highlight on page 44 | Added on Tuesday, June 2, 2026 9:00:00 AM

Clarity about what matters provides clarity about what does not.
==========
Deep Work (Cal Newport)
- Your Note on page 44 | Added on Tuesday, June 2, 2026 9:01:00 AM

This is the core thesis.
==========`;

test("parseClippings groups by book and skips bookmarks", () => {
  const books = HiliteKindle.parseClippings(clippings);
  assert.strictEqual(books.length, 2);
  const prag = books.find((b) => b.title.startsWith("The Pragmatic"));
  assert.strictEqual(prag.author, "David Thomas; Andrew Hunt");
  assert.strictEqual(prag.entries.length, 1);
  const deep = books.find((b) => b.title === "Deep Work");
  assert.strictEqual(deep.entries.length, 2); // highlight + note
});

test("booksToPages converts highlights and tags them kindle", () => {
  const books = HiliteKindle.parseClippings(clippings);
  const pages = HiliteKindle.booksToPages(books, 1753500000000);
  assert.strictEqual(pages.length, 2);
  for (const p of pages) {
    assert.ok(p.url.startsWith("kindle://"));
    for (const h of p.highlights) {
      assert.deepStrictEqual(h.tags, ["kindle"]);
    }
  }
  const deep = pages.find((p) => p.title.startsWith("Deep Work"));
  assert.strictEqual(deep.highlights.length, 1); // notes are not standalone highlights
  assert.ok(deep.highlights[0].note.includes("page 44") || deep.highlights[0].note.includes("44"));
});

console.log(`\n${passed} tests passed${process.exitCode ? " (with failures)" : ""}`);

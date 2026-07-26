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

// ---------- youtube transcript engine ----------

const T = require("../src/transcript.js");

test("extractBalancedJson pulls a nested object out of page source", () => {
  const html = 'junk; var ytInitialPlayerResponse = {"a":{"b":"has } brace in string"},"c":[1,2]};var next=1;';
  const raw = T.extractBalancedJson(html, "ytInitialPlayerResponse");
  const obj = JSON.parse(raw);
  assert.strictEqual(obj.a.b, "has } brace in string");
  assert.deepStrictEqual(obj.c, [1, 2]);
});

test("extractBalancedJson handles escaped quotes and missing markers", () => {
  const html = 'x = {"s":"quote \\" then } brace"} tail';
  const obj = JSON.parse(T.extractBalancedJson(html, "x ="));
  assert.strictEqual(obj.s, 'quote " then } brace');
  assert.strictEqual(T.extractBalancedJson("nothing here", "marker"), null);
});

test("parseJson3 merges segs and skips empty events", () => {
  const lines = T.parseJson3({
    events: [
      { tStartMs: 0, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
      { tStartMs: 500 }, // no segs (window event)
      { tStartMs: 1200, segs: [{ utf8: "\n" }] }, // whitespace only
      { tStartMs: 2000, segs: [{ utf8: "second line" }] }
    ]
  });
  assert.deepStrictEqual(lines, [
    { t: 0, text: "Hello world" },
    { t: 2000, text: "second line" }
  ]);
});

test("parseTimedtextXml handles the srv3 format (<p t= d=>)", () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">
<body>
<p t="1360" d="4000">[♪♪♪]</p>
<p t="114960" d="3200">Never gonna <s>tell</s> a lie</p>
<p t="120000" d="1000"></p>
</body></timedtext>`;
  const lines = T.parseTimedtextXml(xml);
  assert.strictEqual(lines.length, 2);
  assert.deepStrictEqual(lines[0], { t: 1360, text: "[♪♪♪]" });
  assert.deepStrictEqual(lines[1], { t: 114960, text: "Never gonna tell a lie" });
});

test("parseTimedtextXml decodes entities and strips tags", () => {
  const xml = `<transcript>
    <text start="1.5" dur="2">It&amp;#39;s &lt;i&gt;great&lt;/i&gt;</text>
    <text start="4.25" dur="3">Second &quot;line&quot;</text>
  </transcript>`;
  const lines = T.parseTimedtextXml(xml);
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].t, 1500);
  assert.strictEqual(lines[0].text, "It's great");
  assert.strictEqual(lines[1].text, 'Second "line"');
});

test("formatTime renders m:ss and h:mm:ss", () => {
  assert.strictEqual(T.formatTime(0), "0:00");
  assert.strictEqual(T.formatTime(65000), "1:05");
  assert.strictEqual(T.formatTime(3723000), "1:02:03");
});

test("toTimestampedText and buildSummaryPrompt include timestamps and URL", () => {
  const lines = [{ t: 0, text: "intro" }, { t: 61000, text: "main point" }];
  const stamped = T.toTimestampedText(lines);
  assert.ok(stamped.includes("[0:00] intro"));
  assert.ok(stamped.includes("[1:01] main point"));
  const prompt = T.buildSummaryPrompt("My Video", "https://youtube.com/watch?v=x", lines);
  assert.ok(prompt.includes("My Video"));
  assert.ok(prompt.includes("https://youtube.com/watch?v=x"));
  assert.ok(prompt.includes("[1:01] main point"));
});

test("pickTrack prefers manual English over ASR", () => {
  const tracks = [
    { languageCode: "en", kind: "asr" },
    { languageCode: "es" },
    { languageCode: "en" }
  ];
  assert.strictEqual(T.pickTrack(tracks), tracks[2]);
  assert.strictEqual(T.pickTrack([tracks[0]]), tracks[0]);
  assert.strictEqual(T.pickTrack([]), null);
});

console.log(`\n${passed} tests passed${process.exitCode ? " (with failures)" : ""}`);

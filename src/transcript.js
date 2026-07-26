// Hilite — YouTube transcript engine (DOM-free, testable in Node).
// Parses YouTube's caption payloads and formats transcripts for copy/export/AI.

const HiliteTranscript = (() => {
  // Extract a balanced JSON object that follows `marker` in raw page source.
  // Used to pull `ytInitialPlayerResponse = {...}` out of watch-page HTML.
  function extractBalancedJson(source, marker) {
    const at = source.indexOf(marker);
    if (at === -1) return null;
    const start = source.indexOf("{", at);
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (inString) {
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return null;
  }

  // Parse the json3 caption format: { events: [{ tStartMs, segs: [{utf8}] }] }
  function parseJson3(data) {
    if (!data || !Array.isArray(data.events)) return [];
    const lines = [];
    for (const ev of data.events) {
      if (!ev.segs) continue;
      const text = ev.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim();
      if (!text) continue;
      lines.push({ t: ev.tStartMs || 0, text });
    }
    return lines;
  }

  function decodeEntities(s) {
    return s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  }

  // Parse the legacy timedtext XML: <text start="1.2" dur="3.4">Hello</text>
  function parseTimedtextXml(xml) {
    const lines = [];
    const re = /<text[^>]*start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = re.exec(xml))) {
      const text = decodeEntities(decodeEntities(m[2]))
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      lines.push({ t: Math.round(parseFloat(m[1]) * 1000), text });
    }
    return lines;
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function toPlainText(lines) {
    return lines.map((l) => l.text).join(" ");
  }

  function toTimestampedText(lines) {
    return lines.map((l) => `[${formatTime(l.t)}] ${l.text}`).join("\n");
  }

  function transcriptDocument(title, url, lines, timestamped) {
    const body = timestamped ? toTimestampedText(lines) : toPlainText(lines);
    return `${title}\n${url}\n\n${body}\n`;
  }

  function buildSummaryPrompt(title, url, lines) {
    return [
      "Summarize this YouTube video transcript.",
      "Give me: 1) a one-paragraph overview, 2) the key points as bullets with timestamps, 3) any actionable takeaways.",
      "",
      `Title: ${title}`,
      `URL: ${url}`,
      "",
      "Transcript:",
      toTimestampedText(lines)
    ].join("\n");
  }

  // Pick the best caption track: prefer manual (non-ASR) English, then any
  // manual track, then ASR English, then whatever exists.
  function pickTrack(tracks) {
    if (!tracks || tracks.length === 0) return null;
    const score = (t) => {
      let s = 0;
      if (t.kind !== "asr") s += 2;
      if ((t.languageCode || "").startsWith("en")) s += 1;
      return s;
    };
    return tracks.slice().sort((a, b) => score(b) - score(a))[0];
  }

  return {
    extractBalancedJson,
    parseJson3,
    parseTimedtextXml,
    formatTime,
    toPlainText,
    toTimestampedText,
    transcriptDocument,
    buildSummaryPrompt,
    pickTrack
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = HiliteTranscript;
}

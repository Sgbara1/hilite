// Hilite — YouTube transcript panel (Glasp-style).
// Injects a panel beside the player with: full transcript with clickable
// timestamps, copy buttons, "Summarize with Claude / ChatGPT", and
// save-line-to-library.

(() => {
  const AI_PROVIDERS = {
    claude: { label: "Summarize with Claude", url: "https://claude.ai/new?q=" },
    chatgpt: { label: "Summarize with ChatGPT", url: "https://chatgpt.com/?q=" }
  };
  // Above this, ?q= prefill URLs get unreliable; fall back to clipboard.
  const MAX_PREFILL_CHARS = 6000;

  let panel = null;
  let currentVideoId = null;
  let lines = [];
  let tracks = [];

  function videoIdFromLocation() {
    if (location.pathname !== "/watch") return null;
    return new URLSearchParams(location.search).get("v");
  }

  function watchUrl(videoId) {
    return "https://www.youtube.com/watch?v=" + videoId;
  }

  function videoTitle() {
    const el =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1.title");
    return (el && el.textContent.trim()) || document.title.replace(/ - YouTube$/, "");
  }

  // ---------- data ----------

  async function fetchPlayerResponse(videoId) {
    // The watch page server-renders ytInitialPlayerResponse; fetching it
    // fresh avoids stale data after SPA navigations.
    const res = await fetch(watchUrl(videoId), { credentials: "same-origin" });
    const html = await res.text();
    const raw = HiliteTranscript.extractBalancedJson(html, "ytInitialPlayerResponse");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function captionTracks(playerResponse) {
    try {
      return playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks || [];
    } catch (e) {
      return [];
    }
  }

  async function fetchTranscript(track) {
    // Try json3 first, fall back to the XML timedtext format.
    try {
      const res = await fetch(track.baseUrl + "&fmt=json3", { credentials: "same-origin" });
      const body = await res.text();
      if (body.trim().startsWith("{")) {
        const parsed = HiliteTranscript.parseJson3(JSON.parse(body));
        if (parsed.length) return parsed;
      }
    } catch (e) { /* fall through */ }
    try {
      const res = await fetch(track.baseUrl, { credentials: "same-origin" });
      const xml = await res.text();
      return HiliteTranscript.parseTimedtextXml(xml);
    } catch (e) {
      return [];
    }
  }

  // ---------- library save ----------

  async function saveLineToLibrary(line, videoId) {
    const url = watchUrl(videoId);
    const key = "page:" + url;
    const data = await chrome.storage.local.get(key);
    const rec = data[key] || {
      url,
      title: videoTitle(),
      domain: "youtube.com",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      highlights: []
    };
    rec.title = videoTitle() || rec.title;
    rec.updatedAt = Date.now();
    rec.highlights.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      exact: line.text,
      prefix: "",
      suffix: "",
      color: "yellow",
      note: `at ${HiliteTranscript.formatTime(line.t)} — ${url}&t=${Math.floor(line.t / 1000)}s`,
      tags: ["youtube"],
      createdAt: Date.now()
    });
    await chrome.storage.local.set({ [key]: rec });
  }

  // ---------- AI handoff ----------

  async function summarizeWith(providerKey, videoId) {
    const provider = AI_PROVIDERS[providerKey];
    const prompt = HiliteTranscript.buildSummaryPrompt(videoTitle(), watchUrl(videoId), lines);
    const encoded = encodeURIComponent(prompt);
    if (encoded.length <= MAX_PREFILL_CHARS) {
      window.open(provider.url + encoded, "_blank");
      return;
    }
    // Long transcript: put the full prompt on the clipboard and open the AI.
    await navigator.clipboard.writeText(prompt);
    window.open(provider.url.replace(/\?q=$/, "").replace(/\/new$/, "/new"), "_blank");
    toast("Prompt + transcript copied — paste it into the chat (⌘V)");
  }

  // ---------- UI ----------

  function toast(msg) {
    if (!panel) return;
    const t = document.createElement("div");
    t.className = "hilite-yt-toast";
    t.textContent = msg;
    panel.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function button(label, cls, onClick) {
    const b = document.createElement("button");
    b.className = "hilite-yt-btn " + (cls || "");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function buildPanel(videoId) {
    removePanel();
    panel = document.createElement("div");
    panel.id = "hilite-yt-panel";
    panel.className = "hilite-ui";

    const header = document.createElement("div");
    header.className = "hilite-yt-header";
    const brand = document.createElement("span");
    brand.className = "hilite-yt-brand";
    brand.textContent = "🖍️ Hilite · Transcript";
    header.appendChild(brand);

    if (tracks.length > 1) {
      const sel = document.createElement("select");
      sel.className = "hilite-yt-lang";
      tracks.forEach((t, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent =
          (t.name && t.name.simpleText) || t.languageCode || "track " + (i + 1);
        sel.appendChild(o);
      });
      const best = HiliteTranscript.pickTrack(tracks);
      sel.value = String(tracks.indexOf(best));
      sel.addEventListener("change", async () => {
        lines = await fetchTranscript(tracks[Number(sel.value)]);
        renderLines(videoId);
      });
      header.appendChild(sel);
    }
    panel.appendChild(header);

    const actions = document.createElement("div");
    actions.className = "hilite-yt-actions";
    actions.append(
      button("Copy transcript", "", async () => {
        await navigator.clipboard.writeText(
          HiliteTranscript.transcriptDocument(videoTitle(), watchUrl(videoId), lines, false)
        );
        toast("Transcript copied");
      }),
      button("Copy with timestamps", "", async () => {
        await navigator.clipboard.writeText(
          HiliteTranscript.transcriptDocument(videoTitle(), watchUrl(videoId), lines, true)
        );
        toast("Timestamped transcript copied");
      }),
      button(AI_PROVIDERS.claude.label, "hilite-yt-ai", () => summarizeWith("claude", videoId)),
      button(AI_PROVIDERS.chatgpt.label, "hilite-yt-ai", () => summarizeWith("chatgpt", videoId))
    );
    panel.appendChild(actions);

    const list = document.createElement("div");
    list.className = "hilite-yt-lines";
    panel.appendChild(list);

    renderLines(videoId);
    return panel;
  }

  function renderLines(videoId) {
    const list = panel.querySelector(".hilite-yt-lines");
    list.textContent = "";
    if (lines.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hilite-yt-empty";
      empty.textContent = "No transcript lines found for this track.";
      list.appendChild(empty);
      return;
    }
    for (const line of lines) {
      const row = document.createElement("div");
      row.className = "hilite-yt-line";

      const ts = document.createElement("button");
      ts.className = "hilite-yt-ts";
      ts.textContent = HiliteTranscript.formatTime(line.t);
      ts.title = "Jump to this moment";
      ts.addEventListener("click", () => {
        const video = document.querySelector("video");
        if (video) {
          video.currentTime = line.t / 1000;
          video.play().catch(() => {});
        }
      });

      const text = document.createElement("span");
      text.className = "hilite-yt-text";
      text.textContent = line.text;

      const save = document.createElement("button");
      save.className = "hilite-yt-save";
      save.textContent = "＋";
      save.title = "Save this line to your Hilite library";
      save.addEventListener("click", async () => {
        await saveLineToLibrary(line, videoId);
        save.textContent = "✓";
        setTimeout(() => (save.textContent = "＋"), 1500);
      });

      row.append(ts, text, save);
      list.appendChild(row);
    }
  }

  function removePanel() {
    const old = document.getElementById("hilite-yt-panel");
    if (old) old.remove();
    panel = null;
  }

  function mountPanel(videoId) {
    // Preferred home: top of the related-videos column. Retry while the
    // watch layout hydrates.
    let attempts = 0;
    const tryMount = () => {
      const secondary = document.querySelector("#secondary #secondary-inner") ||
        document.querySelector("#secondary");
      if (secondary) {
        secondary.prepend(buildPanel(videoId));
        return;
      }
      if (++attempts < 20) setTimeout(tryMount, 500);
    };
    tryMount();
  }

  // ---------- lifecycle ----------

  async function init() {
    const videoId = videoIdFromLocation();
    if (!videoId) {
      removePanel();
      currentVideoId = null;
      return;
    }
    if (videoId === currentVideoId && panel) return;
    currentVideoId = videoId;
    removePanel();

    const pr = await fetchPlayerResponse(videoId);
    tracks = pr ? captionTracks(pr) : [];
    if (tracks.length === 0) {
      lines = [];
      return; // no captions — stay out of the way
    }
    lines = await fetchTranscript(HiliteTranscript.pickTrack(tracks));
    mountPanel(videoId);
  }

  window.addEventListener("yt-navigate-finish", () => init());
  init();
})();

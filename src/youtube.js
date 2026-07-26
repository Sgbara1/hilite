// Hilite — YouTube transcript panel (Glasp-style).
// Injects a panel beside the player with: full transcript with clickable
// timestamps, copy buttons, "Summarize with Claude / ChatGPT", and
// save-line-to-library.

(() => {
  // mode "url": the site accepts a ?q= prefill.
  // mode "inject": no prefill support — we stash the prompt in storage and
  // src/handoff.js fills the input box when the site opens.
  const AI_PROVIDERS = {
    claude: { label: "Claude", mode: "url", url: "https://claude.ai/new?q=" },
    chatgpt: { label: "ChatGPT", mode: "url", url: "https://chatgpt.com/?q=" },
    gemini: {
      label: "Gemini",
      mode: "inject",
      url: "https://gemini.google.com/app",
      hosts: ["gemini.google.com"]
    },
    aistudio: {
      label: "AI Studio",
      mode: "inject",
      url: "https://aistudio.google.com/prompts/new_chat",
      hosts: ["aistudio.google.com"]
    }
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

  function captionTracks(playerResponse) {
    try {
      return playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks || [];
    } catch (e) {
      return [];
    }
  }

  // Primary source: the InnerTube player API with an ANDROID client identity.
  // Caption URLs from the WEB watch page require a proof-of-origin token
  // since ~2025 and come back empty when fetched by an extension; the
  // Android variants don't. Falls back to parsing the watch-page HTML.
  async function fetchCaptionTracks(videoId) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "20.10.38",
              androidSdkVersion: 30,
              hl: "en",
              gl: "US"
            }
          },
          videoId
        })
      });
      const tracks = captionTracks(await res.json());
      if (tracks.length) return tracks;
    } catch (e) { /* fall through */ }

    try {
      const res = await fetch(watchUrl(videoId), { credentials: "same-origin" });
      const html = await res.text();
      const raw = HiliteTranscript.extractBalancedJson(html, "ytInitialPlayerResponse");
      if (raw) return captionTracks(JSON.parse(raw));
    } catch (e) { /* fall through */ }
    return [];
  }

  async function fetchTranscript(track) {
    // Ask for json3 but sniff what actually comes back — YouTube may ignore
    // the fmt override and serve srv3 or legacy XML instead.
    const attempts = [track.baseUrl + "&fmt=json3", track.baseUrl];
    for (const url of attempts) {
      try {
        const res = await fetch(url, { credentials: "omit" });
        const body = (await res.text()).trim();
        if (!body) continue;
        const lines = body.startsWith("{")
          ? HiliteTranscript.parseJson3(JSON.parse(body))
          : HiliteTranscript.parseTimedtextXml(body);
        if (lines.length) return lines;
      } catch (e) { /* try next */ }
    }
    return [];
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

    if (provider.mode === "inject") {
      // Stash the prompt for handoff.js, keep a clipboard copy as backup.
      await chrome.storage.local.set({
        "hilite:pendingPrompt": {
          text: prompt,
          hosts: provider.hosts,
          createdAt: Date.now()
        }
      });
      await navigator.clipboard.writeText(prompt);
      window.open(provider.url, "_blank");
      toast(`Opening ${provider.label} — prompt will auto-fill (also copied)`);
      return;
    }

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
      })
    );
    panel.appendChild(actions);

    const aiRow = document.createElement("div");
    aiRow.className = "hilite-yt-actions hilite-yt-airow";
    const aiLabel = document.createElement("span");
    aiLabel.className = "hilite-yt-ailabel";
    aiLabel.textContent = "✨ Summarize with:";
    aiRow.appendChild(aiLabel);
    for (const key of Object.keys(AI_PROVIDERS)) {
      aiRow.appendChild(
        button(AI_PROVIDERS[key].label, "hilite-yt-ai", () => summarizeWith(key, videoId))
      );
    }
    panel.appendChild(aiRow);

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

    tracks = await fetchCaptionTracks(videoId);
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

// Hilite — AI hand-off: runs on gemini.google.com and aistudio.google.com.
// Neither site supports URL prompt prefill (unlike claude.ai and chatgpt.com),
// so the YouTube panel stashes the prompt in chrome.storage and this script
// fills the input box when the page opens. Never auto-submits.

(async () => {
  const KEY = "hilite:pendingPrompt";
  const FRESH_MS = 2 * 60 * 1000;

  const data = await chrome.storage.local.get(KEY);
  const pending = data[KEY];
  if (!pending || !pending.text) return;
  if (Date.now() - (pending.createdAt || 0) > FRESH_MS) {
    chrome.storage.local.remove(KEY);
    return;
  }
  if (!(pending.hosts || []).includes(location.hostname)) return;

  function fill(el, text) {
    el.focus();
    // insertText plays nicest with rich editors (Gemini's Quill box) and
    // Angular-bound textareas (AI Studio); fall back to direct assignment.
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (e) { /* fall through */ }
    if (!ok) {
      if ("value" in el) el.value = text;
      else el.textContent = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function findEditor() {
    return (
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector("textarea")
    );
  }

  const deadline = Date.now() + 20000;
  const timer = setInterval(() => {
    const el = findEditor();
    if (el) {
      clearInterval(timer);
      fill(el, pending.text);
      chrome.storage.local.remove(KEY);
    } else if (Date.now() > deadline) {
      clearInterval(timer);
      // Editor never appeared; the prompt is still on the clipboard.
    }
  }, 400);
})();

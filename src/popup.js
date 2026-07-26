// Hilite — popup logic.

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getPage(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "get-page" });
    return res && res.page;
  } catch (e) {
    return null; // content script not available (chrome:// pages etc.)
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const tab = await activeTab();
  const page = tab ? await getPage(tab.id) : null;
  const n = page ? page.highlights.length : 0;
  document.getElementById("count").textContent =
    n === 1 ? "1 highlight" : `${n} highlights`;

  document.getElementById("toggle").addEventListener("click", async () => {
    if (tab) await chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" }).catch(() => {});
    window.close();
  });

  document.getElementById("copy").addEventListener("click", async () => {
    if (!page || page.highlights.length === 0) return;
    await navigator.clipboard.writeText(HiliteExport.pageToMarkdown(page));
    const btn = document.getElementById("copy");
    btn.textContent = "Copied ✓";
    setTimeout(() => window.close(), 600);
  });

  document.getElementById("library").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/library.html") });
    window.close();
  });
});

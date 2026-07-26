// Hilite — service worker: context menu, badge, keyboard command, library opener.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "hilite-highlight",
    title: "Highlight with Hilite",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "hilite-highlight" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "highlight-selection", color: "yellow" }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-sidebar" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "badge" && sender.tab && sender.tab.id) {
    const text = msg.count > 0 ? String(msg.count) : "";
    chrome.action.setBadgeText({ tabId: sender.tab.id, text });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#f5c518" });
    sendResponse({ ok: true });
  } else if (msg.type === "open-library") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/library.html") });
    sendResponse({ ok: true });
  }
  return false;
});

// Background service worker

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ping") {
    sendResponse({ status: "ok" });
    return true;
  }
  if (msg.type === "navigate") {
    chrome.tabs.update(msg.tabId, { url: msg.url }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "go_back") {
    chrome.scripting.executeScript(
      { target: { tabId: msg.tabId }, func: () => history.back() },
      () => sendResponse({ ok: true })
    );
    return true;
  }
  return true;
});

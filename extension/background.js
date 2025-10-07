

const BACKEND = "http://localhost:3000/api/paraphrase";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "rewrite-root",
    title: "Quick Rewrite",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "tone_formal",
    parentId: "rewrite-root",
    title: "Formal",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "tone_humorous",
    parentId: "rewrite-root",
    title: "Humorous",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "tone_concise",
    parentId: "rewrite-root",
    title: "Concise",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (!info.selectionText) return;
    const tone = info.menuItemId.split("_")[1] || "formal";
    const text = info.selectionText;

    console.log("Context menu clicked:", { tone, text });

    // First try to send message to existing content script
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "showRewritePopup",
        text: text,
        tone: tone,
      });
      console.log("Message sent successfully");
    } catch (err) {
      console.log("Content script not ready, injecting...", err);

      // If message fails, inject content script and try again
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["contentScript.js"],
      });

      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["contentStyle.css"],
      });

      // Wait a bit for content script to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try sending message again
      await chrome.tabs.sendMessage(tab.id, {
        action: "showRewritePopup",
        text: text,
        tone: tone,
      });
    }
  } catch (err) {
    console.error("Error in context menu:", err);
  }
});

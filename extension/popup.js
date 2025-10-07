

const BACKEND = "http://localhost:3000/api/paraphrase";

async function getSelectionFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return "";
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });
  return results?.[0]?.result ?? "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const selTA = document.getElementById("selected");
  const resTA = document.getElementById("result");
  const loader = document.getElementById("loader");
  const rewriteBtn = document.getElementById("rewriteBtn");
  const replaceBtn = document.getElementById("replaceBtn");

  // Prefill textarea with current selection
  selTA.value = await getSelectionFromActiveTab();

  rewriteBtn.addEventListener("click", async () => {
    const text = selTA.value.trim();
    if (!text) {
      alert("Select text on a page first or paste text here.");
      return;
    }

    const tone = document.getElementById("tone").value;

    // Show loader + disable button
    loader.style.display = "block";
    rewriteBtn.disabled = true;
    resTA.value = "";

    try {
      const resp = await fetch(BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone }),
      });

      const data = await resp.json();
      resTA.value = data.text || "No response received.";
    } catch (err) {
      resTA.value = "Error: " + err.message;
    } finally {
      // Hide loader + enable button
      loader.style.display = "none";
      rewriteBtn.disabled = false;
    }
  });

  replaceBtn.addEventListener("click", async () => {
    const newText = resTA.value.trim();
    if (!newText) {
      alert("No rewritten text to replace with.");
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (t) => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
          navigator.clipboard
            .writeText(t)
            .then(() =>
              alert("No selection to replace — copied to clipboard.")
            );
          return;
        }
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(t));
      },
      args: [newText],
    });
  });
});

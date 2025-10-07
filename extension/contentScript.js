const BACKEND = "http://localhost:3000/api/paraphrase";

let currentPopup = null;

// Initialize message listener
function initializeMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);
    if (request.action === "showRewritePopup") {
      showFloatingPopup(request.text, request.tone);
      sendResponse({ status: "success" });
    }
    return true; // Keep message channel open for async response
  });
}

function showFloatingPopup(originalText, tone) {
  console.log("Showing popup for:", { originalText, tone });

  // Remove any existing popup
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }

  // Get selection position and context
  const selection = window.getSelection();
  if (!selection.rangeCount) {
    console.log("No selection found");
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Store detailed selection info
  const activeElement = document.activeElement;
  const selectionInfo = {
    range: range.cloneRange(), // Clone the range to preserve it
    activeElement: activeElement,
    isInputField: isElementInputField(activeElement),
    isGmailCompose: isGmailComposeBox(activeElement),
    originalText: originalText,
    selectionStart: getSelectionStart(activeElement),
    selectionEnd: getSelectionEnd(activeElement),
  };

  // Create popup element
  const popup = document.createElement("div");
  popup.className = "quick-rewrite-popup";
  popup.innerHTML = `
    <div class="qr-header">
      <span>Quick Rewrite</span>
      <button class="qr-close">&times;</button>
    </div>
    <div class="qr-content">
      <div class="qr-section">
        <label>Original Text</label>
        <div class="qr-original-text">${escapeHtml(originalText)}</div>
      </div>
      <div class="qr-section">
        <label>Tone</label>
        <select class="qr-tone-select">
          <option value="formal" ${
            tone === "formal" ? "selected" : ""
          }>Formal</option>
          <option value="humorous" ${
            tone === "humorous" ? "selected" : ""
          }>Humorous</option>
          <option value="concise" ${
            tone === "concise" ? "selected" : ""
          }>Concise</option>
        </select>
      </div>
      <div class="qr-section">
        <label>Rewritten Text</label>
        <textarea class="qr-rewritten-text" placeholder="Click Rewrite to generate text..." readonly></textarea>
      </div>
      <div class="qr-buttons">
        <button class="qr-rewrite-btn">Rewrite</button>
        <button class="qr-replace-btn" disabled>Replace in Page</button>
        <button class="qr-copy-btn" disabled>Copy</button>
      </div>
    </div>
    <div class="qr-loader">
      <div class="qr-spinner"></div>
      <span>Rewriting...</span>
    </div>
  `;

  // Position the popup near the selection with viewport boundary checks
  positionPopup(popup, rect);

  document.body.appendChild(popup);
  currentPopup = popup;

  console.log("Popup created and positioned");
  console.log("Selection context:", selectionInfo);

  // Add event listeners
  setupPopupEvents(popup, originalText, selectionInfo);
}

function isElementInputField(element) {
  if (!element) return false;

  const inputTypes = ["INPUT", "TEXTAREA"];
  const contentEditable =
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true";

  return inputTypes.includes(element.tagName) || contentEditable;
}

function isGmailComposeBox(element) {
  if (!element) return false;

  // Check for Gmail-specific compose box identifiers
  const gmailSelectors = [
    'div[g_editable="true"]',
    'div[aria-label="Message Body"]',
    'div[role="textbox"]',
    ".Am.Al.editable",
  ];

  return gmailSelectors.some((selector) => {
    return element.matches?.(selector) || element.closest?.(selector);
  });
}

function getSelectionStart(element) {
  if (!element) return 0;

  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    return element.selectionStart;
  } else if (element.isContentEditable) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      return range.startOffset;
    }
  }
  return 0;
}

function getSelectionEnd(element) {
  if (!element) return 0;

  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    return element.selectionEnd;
  } else if (element.isContentEditable) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      return range.endOffset;
    }
  }
  return 0;
}

function positionPopup(popup, selectionRect) {
  const popupWidth = 400;
  const popupHeight = 500;
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  // Calculate initial position (below and aligned with selection)
  let top = selectionRect.bottom + viewport.scrollY + 10;
  let left = selectionRect.left + viewport.scrollX;

  // Check right boundary
  if (left + popupWidth > viewport.width + viewport.scrollX) {
    left = viewport.width + viewport.scrollX - popupWidth - 10;
  }

  // Check left boundary
  if (left < viewport.scrollX) {
    left = viewport.scrollX + 10;
  }

  // Check bottom boundary - if popup would go below viewport, show above selection
  if (top + popupHeight > viewport.height + viewport.scrollY) {
    top = selectionRect.top + viewport.scrollY - popupHeight - 10;

    // If it still doesn't fit above, adjust height or position
    if (top < viewport.scrollY) {
      top = viewport.scrollY + 10;
      // If we're at the top and it's still too tall, make it scrollable internally
      popup.style.maxHeight = viewport.height - 20 + "px";
      popup.style.overflowY = "auto";
    }
  }

  // Ensure popup doesn't go above viewport
  if (top < viewport.scrollY) {
    top = viewport.scrollY + 10;
  }

  // Final boundary checks to be absolutely sure
  top = Math.max(
    viewport.scrollY + 10,
    Math.min(top, viewport.scrollY + viewport.height - popupHeight - 10)
  );
  left = Math.max(
    viewport.scrollX + 10,
    Math.min(left, viewport.scrollX + viewport.width - popupWidth - 10)
  );

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  console.log("Popup positioned at:", { top, left, viewport });
}

function setupPopupEvents(popup, originalText, selectionInfo) {
  const closeBtn = popup.querySelector(".qr-close");
  const rewriteBtn = popup.querySelector(".qr-rewrite-btn");
  const replaceBtn = popup.querySelector(".qr-replace-btn");
  const copyBtn = popup.querySelector(".qr-copy-btn");
  const toneSelect = popup.querySelector(".qr-tone-select");
  const rewrittenText = popup.querySelector(".qr-rewritten-text");
  const loader = popup.querySelector(".qr-loader");

  // Close popup
  closeBtn.addEventListener("click", () => {
    popup.remove();
    currentPopup = null;
  });

  // Rewrite button
  rewriteBtn.addEventListener("click", async () => {
    const tone = toneSelect.value;

    // Show loader
    loader.style.display = "flex";
    rewriteBtn.disabled = true;

    try {
      console.log("Sending request to backend:", { text: originalText, tone });

      const response = await fetch(BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: originalText, tone }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const rewritten = data.text || "No response received.";

      rewrittenText.value = rewritten;
      replaceBtn.disabled = false;
      copyBtn.disabled = false;
    } catch (err) {
      console.error("Rewrite error:", err);
      rewrittenText.value = "Error: " + err.message;
    } finally {
      // Hide loader
      loader.style.display = "none";
      rewriteBtn.disabled = false;
    }
  });

  // Replace in page button - ENHANCED FOR GMAIL SUPPORT
  replaceBtn.addEventListener("click", () => {
    const newText = rewrittenText.value.trim();
    if (!newText) return;

    try {
      if (selectionInfo.isGmailCompose) {
        replaceTextInGmailCompose(selectionInfo, newText);
      } else if (selectionInfo.isInputField) {
        replaceTextInInputField(selectionInfo, newText);
      } else {
        replaceTextInContent(selectionInfo.range, newText);
      }

      // Close popup after replacement
      popup.remove();
      currentPopup = null;
    } catch (error) {
      console.error("Replace error:", error);
      // Fallback: copy to clipboard and show message
      navigator.clipboard.writeText(newText).then(() => {
        alert(
          "Could not replace text directly. The rewritten text has been copied to your clipboard. Please paste it manually."
        );
      });
    }
  });

  // Copy button
  copyBtn.addEventListener("click", () => {
    const text = rewrittenText.value.trim();
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      // Show copied feedback
      const originalText = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    });
  });

  // Close popup when clicking outside
  document.addEventListener("click", function outsideClickHandler(e) {
    if (!popup.contains(e.target)) {
      popup.remove();
      currentPopup = null;
      document.removeEventListener("click", outsideClickHandler);
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", function escapeHandler(e) {
    if (e.key === "Escape") {
      popup.remove();
      currentPopup = null;
      document.removeEventListener("keydown", escapeHandler);
    }
  });
}

function replaceTextInGmailCompose(selectionInfo, newText) {
  console.log("Replacing text in Gmail compose box");

  const element = selectionInfo.activeElement;

  // Method 1: Try using the stored range first
  try {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(selectionInfo.range);

    selectionInfo.range.deleteContents();
    selectionInfo.range.insertNode(document.createTextNode(newText));

    // Update cursor position
    const newRange = document.createRange();
    newRange.setStart(
      selectionInfo.range.endContainer,
      selectionInfo.range.endOffset + newText.length
    );
    newRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(newRange);

    console.log("Gmail replacement successful with range method");
    return;
  } catch (error) {
    console.log("Range method failed, trying alternative methods:", error);
  }

  // Method 2: Try using execCommand for contenteditable
  try {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(selectionInfo.range);

    document.execCommand("insertText", false, newText);
    console.log("Gmail replacement successful with execCommand");
    return;
  } catch (error) {
    console.log("execCommand method failed:", error);
  }

  // Method 3: Fallback - simulate typing
  try {
    element.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(selectionInfo.range);

    // Simulate paste event
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true,
    });
    pasteEvent.clipboardData.setData("text/plain", newText);
    element.dispatchEvent(pasteEvent);

    console.log("Gmail replacement attempted with paste simulation");
  } catch (error) {
    console.log("All Gmail replacement methods failed:", error);
    throw new Error("Failed to replace text in Gmail compose box");
  }
}

function replaceTextInInputField(selectionInfo, newText) {
  console.log("Replacing text in input field:", {
    element: selectionInfo.activeElement.tagName,
    isContentEditable: selectionInfo.activeElement.isContentEditable,
  });

  const element = selectionInfo.activeElement;

  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    // For regular input fields and textareas
    const currentValue = element.value;
    const selectionStart = selectionInfo.selectionStart;
    const selectionEnd = selectionInfo.selectionEnd;

    // Replace the selected text
    const beforeSelection = currentValue.substring(0, selectionStart);
    const afterSelection = currentValue.substring(selectionEnd);
    element.value = beforeSelection + newText + afterSelection;

    // Set cursor position after the new text
    const newCursorPos = selectionStart + newText.length;
    element.setSelectionRange(newCursorPos, newCursorPos);
  } else if (
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true"
  ) {
    // For generic contenteditable elements (non-Gmail)
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));

      // Move cursor to end of inserted text
      const newRange = document.createRange();
      newRange.setStart(range.endContainer, range.endOffset);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  }

  // Focus back on the element
  element.focus();
}

function replaceTextInContent(range, newText) {
  console.log("Replacing text in regular content");
  range.deleteContents();
  range.insertNode(document.createTextNode(newText));
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Initialize when content script loads
console.log("QuickRewrite content script loaded");
initializeMessageListener();

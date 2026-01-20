// --- Gemini AutoGen Content Script (Single Task Mode) ---
// This script processes ONE task and then signals completion

(async function () {
  // 0. Load Settings
  const settings = await chrome.storage.local.get([
      'settings_generationTimeout', 
      'settings_pageLoadTimeout',
      'settings_stepDelay',
      'settings_inputPollInterval',
      'settings_sendPollInterval',
      'settings_generationPollInterval'
  ]);
  const CONFIG_GEN_TIMEOUT = (settings.settings_generationTimeout || 300) * 1000;
  const CONFIG_STABILITY_TIMEOUT = (settings.settings_pageLoadTimeout || 30) * 1000;
  const rawStepDelaySeconds = settings.settings_stepDelay;
  const normalizedStepDelaySeconds =
    rawStepDelaySeconds && rawStepDelaySeconds > 60
      ? rawStepDelaySeconds / 1000
      : rawStepDelaySeconds;
  const CONFIG_STEP_DELAY = (normalizedStepDelaySeconds || 1) * 1000;
  const CONFIG_INPUT_POLL = (settings.settings_inputPollInterval || 2) * 1000;
  const CONFIG_SEND_POLL = (settings.settings_sendPollInterval || 0.5) * 1000;
  const CONFIG_GEN_POLL = (settings.settings_generationPollInterval || 1) * 1000;

  await chrome.runtime.sendMessage({ action: "FOCUS_TAB" }).catch(() => {});

  // --- Helpers ---
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitFor = async (
    conditionFn,
    timeout = 60000,
    checkInterval = 2000,
    errorMessage = "Timeout"
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await conditionFn()) return true;
      await wait(checkInterval);
    }
    throw new Error(errorMessage);
  };

  function updateStatus(text, isError = false) {
    chrome.runtime
      .sendMessage({
        action: "UPDATE_STATUS",
        status: text,
        isError,
      })
      .catch(() => {});
  }

  function isVisible(element) {
    return !!(element && element.offsetParent !== null);
  }

  function isButtonEnabled(button) {
    if (!button) return false;
    if (button.hasAttribute("disabled")) return false;
    if (button.getAttribute("aria-disabled") === "true") return false;
    if (button.classList.contains("disabled")) return false;
    return true;
  }

  function findInputField() {
    const selectors = [
      '.ql-editor.textarea[contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      'rich-textarea .ql-editor[contenteditable="true"]',
      '[aria-label="Enter a prompt here"]',
      '[data-placeholder="Describe your image"]',
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (isVisible(element)) return element;
    }
    return null;
  }

  function getStopButton() {
    const selectors = [
      'button[aria-label="Stop responding"]',
      'button[mattooltip="Stop responding"]',
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (isVisible(element)) return element;
    }
    return null;
  }

  function getSendButton() {
    const selectors = [
      'button[aria-label="Send message"]',
      "button.send-button",
      "button.submit",
      'button[mattooltip="Send message"]',
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (isVisible(element) && isButtonEnabled(element)) return element;
    }
    return null;
  }

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  async function writePrompt(inputField, prompt) {
    const normalizedPrompt = normalizeText(prompt);
    for (let attempt = 0; attempt < 2; attempt++) {
      const activeField = findInputField() || inputField;
      if (!activeField) return false;

      activeField.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(activeField);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("insertText", false, prompt);
      } catch (e) {
        activeField.innerText = prompt;
      }

      ["keydown", "keypress", "textInput", "input", "keyup", "change"].forEach(
        (evt) => {
          activeField.dispatchEvent(new Event(evt, { bubbles: true }));
        }
      );

      await wait(Math.max(200, CONFIG_STEP_DELAY / 5));
      const currentText = normalizeText(activeField.innerText);
      if (currentText && currentText.includes(normalizedPrompt)) return true;

      activeField.innerText = prompt;
      const inputEvent =
        typeof InputEvent === "function"
          ? new InputEvent("input", { bubbles: true, data: prompt })
          : new Event("input", { bubbles: true });
      activeField.dispatchEvent(inputEvent);
      await wait(Math.max(200, CONFIG_STEP_DELAY / 5));

      const fallbackText = normalizeText(activeField.innerText);
      if (fallbackText && fallbackText.includes(normalizedPrompt)) return true;
    }

    return false;
  }

  function getDownloadBtns() {
    const selectors = [
      'button[aria-label="Download full size image"]',
      'button[aria-label="Download image"]',
      'button[aria-label*="Download"]',
      'button[mattooltip="Download full size"]',
      'button[mattooltip*="Download"]',
      'button[data-test-id*="download"]',
      'download-generated-image-button button',
    ];
    const buttons = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((btn) => buttons.add(btn));
    }
    return Array.from(buttons).filter(
      (btn) => isVisible(btn) && isButtonEnabled(btn)
    );
  }

  function getGeneratedImages() {
    return Array.from(
      document.querySelectorAll(
        'img[src*="blob:"], img[src*="googleusercontent"], img[alt*="Generated"]'
      )
    ).filter((img) => isVisible(img) && img.width > 100);
  }

  function getChatRoot() {
    const selectors = [
      "#chat-history",
      ".chat-history-scroll-container",
      "main",
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (isVisible(el)) return el;
    }
    return document.body;
  }

  function findPromptAnchor(promptText) {
    const target = normalizeText(promptText).toLowerCase();
    if (!target) return null;
    const root = getChatRoot();
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (!isVisible(node)) return NodeFilter.FILTER_SKIP;
          if (node.children.length > 0) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    let found = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = normalizeText(node.textContent).toLowerCase();
      if (text.includes(target)) {
        found = node;
      }
    }
    return found;
  }

  function getElementsAfterAnchor(elements, anchor) {
    if (!anchor) return elements;
    return elements.filter(
      (el) =>
        anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  }

  function getDownloadButtonsAfterAnchor(anchor) {
    return getElementsAfterAnchor(getDownloadBtns(), anchor);
  }

  function getGeneratedImagesAfterAnchor(anchor) {
    return getElementsAfterAnchor(getGeneratedImages(), anchor);
  }

  async function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    const containers = [
      "#chat-history",
      ".chat-history-scroll-container",
      "main",
    ];
    for (const selector of containers) {
      const el = document.querySelector(selector);
      if (el) {
        el.scrollTop = el.scrollHeight;
        if (el.lastElementChild) {
          el.lastElementChild.scrollIntoView({
            behavior: "smooth",
            block: "end",
          });
        }
      }
    }
    await wait(CONFIG_STEP_DELAY);
  }

  // --- Main Logic ---
  try {
    // 1. Get current task from storage
    const data = await chrome.storage.local.get(["currentTask"]);
    const task = data.currentTask;

    if (!task) {
      console.log("[Content] No task found.");
      chrome.runtime.sendMessage({
        action: "TASK_ERROR",
        error: "No task found",
      });
      return;
    }

    console.log(`[Content] Processing: ${task.name}`);
    updateStatus(`Processing: ${task.name}`);

    // 2. Prepare filename for skip check
    let filename = task.name.replace(/[^a-z0-9_\-.]/gi, "_");
    if (
      !filename.toLowerCase().endsWith(".png") &&
      !filename.toLowerCase().endsWith(".jpg")
    ) {
      filename += ".png";
    }

    const composedPrompt = `name: ${filename}\nprompt: ${task.prompt}`;
    const promptAnchorText = `name: ${filename}`;

    // 3. Check if file exists (skip logic)
    const checkResult = await chrome.runtime.sendMessage({
      action: "CHECK_FILE_EXISTS",
      filename: filename,
    });

    if (checkResult && checkResult.exists) {
      console.log(`[Content] File exists, skipping: ${filename}`);
      updateStatus(`Skipped: ${task.name}`);
      chrome.runtime.sendMessage({ action: "TASK_COMPLETE", skipped: true });
      return;
    }

    // 4. Wait for input field
    console.log("[Content] Waiting for input field...");
    let inputField = null;
    await waitFor(
      () => {
        inputField = findInputField();
        return inputField;
      },
      15000,
      CONFIG_INPUT_POLL,
      "Timeout waiting for Input Field"
    );

    // 4.5 Wait for page to stabilize (previous images fully loaded)
    console.log("[Content] Waiting for previous images to load...");

    // Find generated images (usually inside model response containers)
    const getGeneratedImages = () =>
      Array.from(
        document.querySelectorAll(
          'img[src*="blob:"], img[src*="googleusercontent"], img[alt*="Generated"]'
        )
      ).filter((img) => isVisible(img) && img.width > 100); // Exclude tiny icons

    const stabilityTimeout = CONFIG_STABILITY_TIMEOUT; // User setting
    const stabilityStart = Date.now();

    // Wait for at least 1 image to exist AND all images to be loaded
    while (true) {
      if (Date.now() - stabilityStart > stabilityTimeout) {
        throw new Error("Page stability timeout (30s) - images not loaded");
      }

      await wait(CONFIG_STEP_DELAY);

      const images = getGeneratedImages();
      const btns = getDownloadBtns();

      // Check if all images are fully loaded
      const allLoaded =
        images.length > 0 &&
        images.every((img) => img.complete && img.naturalWidth > 0);

      // Alternative: if no images found but we have download buttons, count those as stable
      const hasButtons = btns.length > 0;

      if (allLoaded || (hasButtons && Date.now() - stabilityStart > 10000)) {
        console.log(
          `[Content] Page stable: ${images.length} images loaded, ${btns.length} download buttons`
        );
        break;
      }

      // Also allow proceeding if we waited 10+ seconds with 0 images (new conversation)
      if (
        images.length === 0 &&
        btns.length === 0 &&
        Date.now() - stabilityStart > 10000
      ) {
        console.log(
          "[Content] No existing images - proceeding with new conversation"
        );
        break;
      }
    }

    // Extra safety wait before starting task
    console.log("[Content] Waiting safety delay...");
    await wait(CONFIG_STEP_DELAY * 3);

    // 5. Scroll to bottom and prepare
    console.log("[Content] Scrolling to bottom...");
    await scrollToBottom();
    await wait(CONFIG_STEP_DELAY); // Wait after scroll

    // 6. Activate and type
    console.log("[Content] Typing prompt...");
    inputField.click();
    await wait(Math.max(200, CONFIG_STEP_DELAY / 5));
    inputField.focus();
    await wait(Math.max(200, CONFIG_STEP_DELAY / 5));

    // Clear if needed
    if (inputField.innerText.trim().length > 0) {
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      await wait(Math.max(200, CONFIG_STEP_DELAY / 5));
    }

    // Type prompt
    inputField = findInputField();
    const promptWritten = await writePrompt(inputField, composedPrompt);
    if (!promptWritten) {
      throw new Error("Failed to write prompt into input field");
    }

    // Wait 1 second before clicking send
    await wait(CONFIG_STEP_DELAY);

    // 6. Click Send
    console.log("[Content] Waiting for Send button...");
    let sendBtn = null;
    await waitFor(
      () => {
        if (getStopButton()) return false;
        const btn = getSendButton();
        if (btn) {
          sendBtn = btn;
          return true;
        }
        if (inputField) {
          inputField.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return false;
      },
      60000,
      CONFIG_SEND_POLL,
      "Timeout waiting for Send Button"
    );

    const initialDownloadBtnCount = getDownloadBtns().length;
    const initialImageCount = getGeneratedImages().length;

    await wait(CONFIG_STEP_DELAY / 2);
    sendBtn.click();
    console.log("[Content] Prompt sent.");

    await waitFor(
      () => {
        const field = findInputField();
        if (!field) return false;
        return normalizeText(field.innerText) === "";
      },
      10000,
      CONFIG_SEND_POLL,
      "Send click did not clear input"
    );

    const promptAnchor = findPromptAnchor(promptAnchorText) || findPromptAnchor(composedPrompt);

    // 7. Wait for generation
    updateStatus("Generating...");

    // CRITICAL: Record counts BEFORE sending prompt
    // This prevents detecting old buttons/images from previous responses
    console.log(
      `[Content] Initial counts before prompt: btns=${initialDownloadBtnCount}, images=${initialImageCount}`
    );

    await waitFor(
      () => {
        const btns = getDownloadButtonsAfterAnchor(promptAnchor);
        const images = getGeneratedImagesAfterAnchor(promptAnchor);
        return (
          btns.length > initialDownloadBtnCount ||
          images.length > initialImageCount
        );
      },
      CONFIG_GEN_TIMEOUT,
      CONFIG_GEN_POLL,
      "Timeout waiting for Image Generation"
    );

    console.log("[Content] Generation complete.");
    await wait(CONFIG_STEP_DELAY * 2); // Stability wait

    // 8. Download
    updateStatus("Downloading...");
    const downloadBtns = getDownloadButtonsAfterAnchor(promptAnchor);
    if (!downloadBtns.length) {
      throw new Error("No download buttons found after generation");
    }
    const lastBtn = downloadBtns[downloadBtns.length - 1];

    console.log(`[Content] Clicking download for: ${filename}`);
    lastBtn.click();

    // 9. Wait for download and rename (handled by background.js)
    updateStatus("Waiting for file...");
    const renameResult = await chrome.runtime.sendMessage({
      action: "WAIT_AND_RENAME",
      targetFilename: filename,
    });

    if (!renameResult || !renameResult.success) {
      throw new Error(renameResult?.error || "File rename failed");
    }

    console.log(`[Content] Task complete: ${task.name}`);
    updateStatus(`Complete: ${task.name}`);
    chrome.runtime.sendMessage({ action: "TASK_COMPLETE", skipped: false });
  } catch (err) {
    console.error("[Content] Error:", err);
    updateStatus(`Error: ${err.message}`, true);
    chrome.runtime.sendMessage({ action: "TASK_ERROR", error: err.message });
  }
})();

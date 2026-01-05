// --- Gemini AutoGen Content Script (Single Task Mode) ---
// This script processes ONE task and then signals completion

(async function () {
  // 0. Load Settings
  const settings = await chrome.storage.local.get([
      'settings_generationTimeout', 
      'settings_pageLoadTimeout',
      'settings_stepDelay'
  ]);
  const CONFIG_GEN_TIMEOUT = (settings.settings_generationTimeout || 300) * 1000;
  const CONFIG_STABILITY_TIMEOUT = (settings.settings_pageLoadTimeout || 30) * 1000;
  const CONFIG_STEP_DELAY = settings.settings_stepDelay || 1000;

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
        inputField = document.querySelector(".ql-editor");
        return inputField;
      },
      15000,
      2000,
      "Timeout waiting for Input Field"
    );

    // 4.5 Wait for page to stabilize (previous images fully loaded)
    console.log("[Content] Waiting for previous images to load...");

    const getDownloadBtns = () =>
      Array.from(
        document.querySelectorAll(
          'button[aria-label="Download full size image"], button[mattooltip="Download full size"], download-generated-image-button button'
        )
      ).filter((btn) => btn.offsetParent !== null);

    // Find generated images (usually inside model response containers)
    const getGeneratedImages = () =>
      Array.from(
        document.querySelectorAll(
          'img[src*="blob:"], img[src*="googleusercontent"], img[alt*="Generated"]'
        )
      ).filter((img) => img.offsetParent !== null && img.width > 100); // Exclude tiny icons

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
    inputField = document.querySelector(".ql-editor");
    inputField.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(inputField);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, task.prompt);
    } catch (e) {
      inputField.innerText = task.prompt;
    }

    // Trigger events
    ["keydown", "keypress", "textInput", "input", "keyup", "change"].forEach(
      (evt) => {
        inputField.dispatchEvent(new Event(evt, { bubbles: true }));
      }
    );

    // Wait 1 second before clicking send
    await wait(CONFIG_STEP_DELAY);

    // 6. Click Send
    console.log("[Content] Waiting for Send button...");
    let sendBtn = null;
    await waitFor(
      () => {
        const stopBtn = document.querySelector(
          'button[aria-label="Stop responding"], button[mattooltip="Stop responding"]'
        );
        if (stopBtn) return false;

        const btn = document.querySelector(
          'button[aria-label="Send message"], button[mattooltip="Send message"]'
        );
        if (btn && !btn.hasAttribute("disabled")) {
          sendBtn = btn;
          return true;
        }
        inputField.dispatchEvent(new Event("input", { bubbles: true }));
        return false;
      },
      60000,
      2000,
      "Timeout waiting for Send Button"
    );

    await wait(CONFIG_STEP_DELAY / 2);
    sendBtn.click();
    console.log("[Content] Prompt sent.");

    // 7. Wait for generation
    updateStatus("Generating...");

    // CRITICAL: Record button count AFTER sending prompt, not before
    // This prevents detecting old buttons that are still loading
    const initialBtnCount = getDownloadBtns().length;
    console.log(
      `[Content] Initial button count after prompt: ${initialBtnCount}`
    );

    await waitFor(
      () => {
        return getDownloadBtns().length > initialBtnCount;
      },
      CONFIG_GEN_TIMEOUT,
      2000,
      "Timeout waiting for Image Generation"
    );

    console.log("[Content] Generation complete.");
    await wait(CONFIG_STEP_DELAY * 2); // Stability wait

    // 8. Download
    updateStatus("Downloading...");
    const downloadBtns = getDownloadBtns();
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

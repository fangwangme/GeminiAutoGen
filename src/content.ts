import type { TaskItem } from "./types.js";

type ContentSettings = {
  settings_generationTimeout?: number;
  settings_pageLoadTimeout?: number;
  settings_stepDelay?: number;
  settings_pollInterval?: number;
  settings_inputPollInterval?: number;
  settings_sendPollInterval?: number;
  settings_generationPollInterval?: number;
};

type CheckFileExistsResponse = {
  exists: boolean;
  error?: string;
};

type WaitAndRenameResponse = {
  success: boolean;
  filename?: string;
  error?: string;
};

type ContentMessage =
  | { action: "FOCUS_TAB" }
  | { action: "CHECK_FILE_EXISTS"; filename: string }
  | { action: "WAIT_AND_RENAME"; targetFilename: string }
  | { action: "TASK_COMPLETE"; skipped: boolean }
  | { action: "TASK_ERROR"; error: string }
  | { action: "UPDATE_STATUS"; status: string; isError?: boolean }
  | {
      action: "LOG";
      level: "log" | "warn" | "error";
      message: string;
      data?: unknown;
      source?: string;
    };

const storageGet = <T,>(keys: string[]): Promise<T> =>
  chrome.storage.local.get(keys) as unknown as Promise<T>;

const runtimeSendMessage = <T,>(message: ContentMessage): Promise<T> =>
  chrome.runtime.sendMessage(message) as unknown as Promise<T>;

const toErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const logToBackground = (
  level: "log" | "warn" | "error",
  message: string,
  data?: unknown
) => {
  runtimeSendMessage<void>({
    action: "LOG",
    level,
    message,
    data,
    source: "content"
  }).catch(() => {});
};

const logInfo = (message: string, data?: unknown) =>
  logToBackground("log", message, data);
const logWarn = (message: string, data?: unknown) =>
  logToBackground("warn", message, data);
const logError = (message: string, data?: unknown) =>
  logToBackground("error", message, data);

// --- Gemini AutoGen Content Script (Single Task Mode) ---
// This script processes ONE task and then signals completion

(async function () {
  // 0. Load Settings
  const settings = await storageGet<ContentSettings>([
    "settings_generationTimeout",
    "settings_pageLoadTimeout",
    "settings_stepDelay",
    "settings_pollInterval",
    "settings_inputPollInterval",
    "settings_sendPollInterval",
    "settings_generationPollInterval"
  ]);
  const CONFIG_GEN_TIMEOUT = (settings.settings_generationTimeout || 300) * 1000;
  const CONFIG_STABILITY_TIMEOUT =
    (settings.settings_pageLoadTimeout || 30) * 1000;
  const rawStepDelaySeconds = settings.settings_stepDelay;
  const normalizedStepDelaySeconds =
    rawStepDelaySeconds && rawStepDelaySeconds > 60
      ? rawStepDelaySeconds / 1000
      : rawStepDelaySeconds;
  const CONFIG_STEP_DELAY = (normalizedStepDelaySeconds || 1) * 1000;
  const pollIntervalSeconds =
    settings.settings_pollInterval ??
    settings.settings_inputPollInterval ??
    settings.settings_generationPollInterval ??
    settings.settings_sendPollInterval ??
    1;
  const normalizedPollIntervalSeconds =
    pollIntervalSeconds > 0 ? pollIntervalSeconds : 1;
  const CONFIG_POLL = normalizedPollIntervalSeconds * 1000;

  await runtimeSendMessage<void>({ action: "FOCUS_TAB" }).catch(() => {});

  // --- Helpers ---
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitFor = async (
    conditionFn: () => boolean | Promise<boolean>,
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

  function updateStatus(text: string, isError = false) {
    runtimeSendMessage<void>({
      action: "UPDATE_STATUS",
      status: text,
      isError
    }).catch(() => {});
  }

  function isVisible(element: Element | null): element is HTMLElement {
    if (!element || !(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none") return false;
    return true;
  }

  function isButtonEnabled(button: HTMLButtonElement | null) {
    if (!button) return false;
    if (button.hasAttribute("disabled")) return false;
    if (button.getAttribute("aria-disabled") === "true") return false;
    if (button.classList.contains("disabled")) return false;
    return true;
  }

  function describeButton(button: HTMLButtonElement) {
    const style = window.getComputedStyle(button);
    return {
      label:
        button.getAttribute("aria-label") ||
        button.getAttribute("mattooltip") ||
        button.textContent?.trim() ||
        "(no-label)",
      disabled: button.disabled,
      ariaDisabled: button.getAttribute("aria-disabled"),
      className: button.className,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents
    };
  }

  function describeImage(img: HTMLImageElement) {
    const style = window.getComputedStyle(img);
    const rawSrc = img.currentSrc || img.src || "";
    return {
      src: rawSrc.length > 160 ? `${rawSrc.slice(0, 157)}...` : rawSrc,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      width: img.width,
      height: img.height,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity
    };
  }

  function fireMouseEvent(target: Element, type: string) {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );
  }

  function revealDownloadButton(button: HTMLButtonElement) {
    button.scrollIntoView({ block: "center", inline: "center" });
    const container = button.closest(
      ".overlay-container, .generated-image, .image-container, .attachment-container"
    );
    if (container) {
      ["mouseenter", "mouseover", "mousemove"].forEach((event) =>
        fireMouseEvent(container, event)
      );
    }
    const imageButton = button
      .closest(".overlay-container")
      ?.querySelector<HTMLButtonElement>("button.image-button");
    if (imageButton) {
      ["mouseenter", "mouseover", "mousemove"].forEach((event) =>
        fireMouseEvent(imageButton, event)
      );
    }
    ["mouseenter", "mouseover", "mousemove"].forEach((event) =>
      fireMouseEvent(button, event)
    );
  }

  function clickDownloadButton(button: HTMLButtonElement) {
    ["pointerdown", "mousedown"].forEach((event) =>
      fireMouseEvent(button, event)
    );
    button.click();
    ["mouseup", "pointerup"].forEach((event) => fireMouseEvent(button, event));
  }

  function isClickable(button: HTMLButtonElement) {
    const style = window.getComputedStyle(button);
    if (style.pointerEvents === "none") return false;
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    const rect = button.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function findInputField() {
    const selectors = [
      '.ql-editor.textarea[contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      'rich-textarea .ql-editor[contenteditable="true"]',
      '[aria-label="Enter a prompt here"]',
      '[data-placeholder="Describe your image"]'
    ];
    for (const selector of selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      if (isVisible(element)) return element;
    }
    return null;
  }

  function getStopButton() {
    const selectors = [
      'button[aria-label="Stop responding"]',
      'button[mattooltip="Stop responding"]'
    ];
    for (const selector of selectors) {
      const element = document.querySelector<HTMLButtonElement>(selector);
      if (isVisible(element)) return element;
    }
    return null;
  }

  function getSendButton() {
    const selectors = [
      'button[aria-label="Send message"]',
      "button.send-button",
      "button.submit",
      'button[mattooltip="Send message"]'
    ];
    for (const selector of selectors) {
      const element = document.querySelector<HTMLButtonElement>(selector);
      if (isVisible(element) && isButtonEnabled(element)) return element;
    }
    return null;
  }

  function normalizeText(text: string) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  async function writePrompt(inputField: HTMLElement | null, prompt: string) {
    const normalizedPrompt = normalizeText(prompt);
    for (let attempt = 0; attempt < 2; attempt++) {
      const activeField = findInputField() || inputField;
      if (!activeField) return false;

      activeField.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(activeField);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        document.execCommand("insertText", false, prompt);
      } catch {
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

  function getDownloadBtns(
    includeHidden = false,
    root: ParentNode = document
  ) {
    const selectors = [
      'button[aria-label="Download full size image"]',
      'button[aria-label="Download image"]',
      'button[aria-label*="Download"]',
      'button[mattooltip="Download full size"]',
      'button[mattooltip*="Download"]',
      'button[data-test-id*="download"]',
      "download-generated-image-button button"
    ];
    const buttons = new Set<HTMLButtonElement>();
    for (const selector of selectors) {
      root
        .querySelectorAll<HTMLButtonElement>(selector)
        .forEach((btn) => buttons.add(btn));
    }
    return Array.from(buttons).filter(
      (btn) => (includeHidden || isVisible(btn)) && isButtonEnabled(btn)
    );
  }

  function getGeneratedImageCandidates(root: ParentNode = document) {
    return Array.from(
      root.querySelectorAll<HTMLImageElement>(
        'img[src*="blob:"], img[src*="googleusercontent"], img[alt*="Generated"]'
      )
    );
  }

  function getGeneratedImages(root: ParentNode = document) {
    return getGeneratedImageCandidates(root).filter(
      (img) => isVisible(img) && img.width > 100
    );
  }

  function getChatRoot() {
    const selectors = ["#chat-history", ".chat-history-scroll-container", "main"];
    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (isVisible(el)) return el;
    }
    return document.body;
  }

  function getConversationContainer(anchor: Element | null) {
    if (!anchor) return null;
    const container = anchor.closest<HTMLElement>(
      ".conversation-container"
    );
    if (container) return container;
    const userQuery = anchor.closest("user-query");
    if (userQuery && userQuery.parentElement instanceof HTMLElement) {
      return userQuery.parentElement;
    }
    return null;
  }

  function getResponseContainerForAnchor(anchor: Element | null) {
    if (!anchor) return null;
    const userQuery = anchor.closest("user-query");
    if (!userQuery) return null;
    let next = userQuery.nextElementSibling as Element | null;
    while (next) {
      if (next.matches("model-response")) {
        return (
          next.querySelector<HTMLElement>(".response-container") ||
          (next as HTMLElement)
        );
      }
      const response = next.querySelector<HTMLElement>(
        ".response-container"
      );
      if (response) return response;
      next = next.nextElementSibling as Element | null;
    }
    return null;
  }

  function findPromptAnchor(promptText: string) {
    const target = normalizeText(promptText).toLowerCase();
    if (!target) return null;
    const root = getChatRoot();
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (!isVisible(node as Element)) return NodeFilter.FILTER_SKIP;
          if ((node as Element).children.length > 0) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    let found: HTMLElement | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as HTMLElement;
      const text = normalizeText(node.textContent || "").toLowerCase();
      if (text.includes(target)) {
        found = node;
      }
    }
    return found;
  }

  function getElementsAfterAnchor<T extends Element>(
    elements: T[],
    anchor: Element | null
  ) {
    if (!anchor) return elements;
    return elements.filter(
      (el) => anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  }

  function getDownloadButtonsAfterAnchor(
    anchor: Element | null,
    includeHidden = false
  ) {
    return getElementsAfterAnchor(getDownloadBtns(includeHidden), anchor);
  }

  function getDownloadButtonsInContainer(
    container: Element,
    includeHidden = false
  ) {
    return getDownloadBtns(includeHidden, container);
  }

  function getDownloadButtonNearLastImage(
    anchor: Element | null,
    container?: Element | null
  ) {
    const images = container
      ? getGeneratedImages(container)
      : getGeneratedImagesAfterAnchor(anchor);
    const lastImage = images[images.length - 1];
    if (!lastImage) return null;
    const containerEl = lastImage.closest(
      ".attachment-container, .generated-images, .response-container, .overlay-container"
    );
    if (!containerEl) return null;
    const button = containerEl.querySelector<HTMLButtonElement>(
      "download-generated-image-button button, button[data-test-id=\"download-generated-image-button\"]"
    );
    return button || null;
  }

  function getGeneratedImagesAfterAnchor(anchor: Element | null) {
    return getElementsAfterAnchor(getGeneratedImages(), anchor);
  }

  async function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
    const containers = ["#chat-history", ".chat-history-scroll-container", "main"];
    for (const selector of containers) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        el.scrollTop = el.scrollHeight;
        if (el.lastElementChild) {
          el.lastElementChild.scrollIntoView({
            behavior: "smooth",
            block: "end"
          });
        }
      }
    }
    await wait(CONFIG_STEP_DELAY);
  }

  // --- Main Logic ---
  try {
    // 1. Get current task from storage
    const data = await storageGet<{ currentTask?: TaskItem }>(["currentTask"]);
    const task = data.currentTask;

    if (!task) {
      logInfo("[Content] No task found.");
      runtimeSendMessage<void>({
        action: "TASK_ERROR",
        error: "No task found"
      });
      return;
    }

    logInfo(`[Content] Processing: ${task.name}`);
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
    const checkResult = await runtimeSendMessage<CheckFileExistsResponse>({
      action: "CHECK_FILE_EXISTS",
      filename
    });

    if (checkResult && checkResult.exists) {
      logInfo(`[Content] File exists, skipping: ${filename}`);
      updateStatus(`Skipped: ${task.name}`);
      runtimeSendMessage<void>({ action: "TASK_COMPLETE", skipped: true });
      return;
    }

    // 4. Wait for input field
    logInfo("[Content] Waiting for input field...");
    let inputField: HTMLElement | null = null;
    await waitFor(
      () => {
        inputField = findInputField();
        return !!inputField;
      },
      15000,
      CONFIG_POLL,
      "Timeout waiting for Input Field"
    );

    if (!inputField) {
      throw new Error("Input field not found after wait");
    }
    const initialInputField = inputField as HTMLElement;

    // 4.5 Wait for page to stabilize (previous images fully loaded)
    logInfo("[Content] Waiting for previous images to load...");

    // Find generated images (usually inside model response containers)
    const getStableGeneratedImages = () =>
      Array.from(
        document.querySelectorAll<HTMLImageElement>(
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

      const images = getStableGeneratedImages();
      const btns = getDownloadBtns();

      // Check if all images are fully loaded
      const allLoaded =
        images.length > 0 &&
        images.every((img) => img.complete && img.naturalWidth > 0);

      // Alternative: if no images found but we have download buttons, count those as stable
      const hasButtons = btns.length > 0;

      if (allLoaded || (hasButtons && Date.now() - stabilityStart > 10000)) {
        logInfo(
          "[Content] Page stable",
          {
            images: images.length,
            downloadButtons: btns.length
          }
        );
        break;
      }

      // Also allow proceeding if we waited 10+ seconds with 0 images (new conversation)
      if (
        images.length === 0 &&
        btns.length === 0 &&
        Date.now() - stabilityStart > 10000
      ) {
        logInfo("[Content] No existing images - proceeding with new conversation");
        break;
      }
    }

    // Extra safety wait before starting task
    logInfo("[Content] Waiting safety delay...");
    await wait(CONFIG_STEP_DELAY * 3);

    // 5. Scroll to bottom and prepare
    logInfo("[Content] Scrolling to bottom...");
    await scrollToBottom();
    await wait(CONFIG_STEP_DELAY); // Wait after scroll

    // 6. Activate and type
    logInfo("[Content] Typing prompt...");
    initialInputField.click();
    await wait(Math.max(200, CONFIG_STEP_DELAY / 5));
    initialInputField.focus();
    await wait(Math.max(200, CONFIG_STEP_DELAY / 5));

    // Clear if needed
    if (initialInputField.innerText.trim().length > 0) {
      document.execCommand("selectAll", false, undefined);
      document.execCommand("delete", false, undefined);
      await wait(Math.max(200, CONFIG_STEP_DELAY / 5));
    }

    // Type prompt
    const inputFieldForWrite = findInputField() || initialInputField;
    const promptWritten = await writePrompt(
      inputFieldForWrite,
      composedPrompt
    );
    if (!promptWritten) {
      throw new Error("Failed to write prompt into input field");
    }

    // Wait 1 second before clicking send
    await wait(CONFIG_STEP_DELAY);

    // 6. Click Send
    logInfo("[Content] Waiting for Send button...");
    let sendBtn: HTMLButtonElement | null = null;
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
      CONFIG_POLL,
      "Timeout waiting for Send Button"
    );

    if (!sendBtn) {
      throw new Error("Send button not found after wait");
    }
    const sendButton = sendBtn as HTMLButtonElement;

    const initialGlobalDownloadBtnCount = getDownloadBtns(true).length;
    const initialGlobalImageCount = getGeneratedImages().length;
    let initialDownloadBtnCount = initialGlobalDownloadBtnCount;
    let initialImageCount = initialGlobalImageCount;

    const userQueriesBeforeSend = Array.from(
      document.querySelectorAll("user-query")
    );
    const lastUserQueryBeforeSend = userQueriesBeforeSend.length
      ? (userQueriesBeforeSend[userQueriesBeforeSend.length - 1] as Element)
      : null;
    const initialUserQueryCount = userQueriesBeforeSend.length;

    const initialConversationCount = document.querySelectorAll(
      ".conversation-container"
    ).length;

    await wait(CONFIG_STEP_DELAY / 2);
    sendButton.click();
    logInfo("[Content] Prompt sent.");

    await wait(CONFIG_STEP_DELAY);

    await waitFor(
      () => {
        const field = findInputField();
        if (!field) return false;
        return normalizeText(field.innerText) === "";
      },
      10000,
      CONFIG_POLL,
      "Send click did not clear input"
    );

    const getLatestUserQueryAfter = () => {
      const queries = Array.from(document.querySelectorAll("user-query"));
      if (!queries.length) return null;
      if (!lastUserQueryBeforeSend) {
        return queries[queries.length - 1] as Element;
      }
      const after = getElementsAfterAnchor(queries, lastUserQueryBeforeSend);
      return after.length ? (after[after.length - 1] as Element) : null;
    };

    let latestUserQuery: Element | null = null;
    try {
      await waitFor(
        () => {
          const candidate = getLatestUserQueryAfter();
          if (!candidate) return false;
          latestUserQuery = candidate;
          return true;
        },
        10000,
        CONFIG_POLL,
        "Timeout waiting for prompt render"
      );
    } catch {
      logWarn("[Content] Prompt render wait timed out");
    }

    let latestConversationContainer: HTMLElement | null = null;
    let hasNewConversationContainer = false;
    try {
      await waitFor(
        () => {
          const containers = document.querySelectorAll(".conversation-container");
          if (containers.length > initialConversationCount) {
            latestConversationContainer =
              containers[containers.length - 1] as HTMLElement;
            hasNewConversationContainer = true;
            return true;
          }
          return false;
        },
        10000,
        CONFIG_POLL,
        "Timeout waiting for conversation container"
      );
    } catch {
      const containers = document.querySelectorAll(".conversation-container");
      if (containers.length > initialConversationCount) {
        latestConversationContainer =
          containers[containers.length - 1] as HTMLElement;
        hasNewConversationContainer = true;
        logWarn(
          "[Content] Conversation container wait timed out, but new container found"
        );
      } else {
        latestConversationContainer = null;
        logWarn("[Content] Conversation container wait timed out");
      }
    }

    let promptAnchor =
      latestUserQuery ||
      findPromptAnchor(promptAnchorText) ||
      findPromptAnchor(composedPrompt);
    if (
      promptAnchor &&
      lastUserQueryBeforeSend &&
      !(
        lastUserQueryBeforeSend.compareDocumentPosition(promptAnchor) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ) {
      logWarn("[Content] Prompt anchor not after last user query; ignoring", {
        text: promptAnchor.textContent?.trim().slice(0, 120) || "(none)"
      });
      promptAnchor = null;
    }
    logInfo("[Content] Prompt anchor found", {
      found: Boolean(promptAnchor),
      text: promptAnchor?.textContent?.trim().slice(0, 120) || "(none)",
      userQueryCount: document.querySelectorAll("user-query").length,
      hasNewConversationContainer
    });
    if (!promptAnchor && !hasNewConversationContainer) {
      throw new Error(
        "Prompt anchor not found; aborting to avoid downloading the wrong image"
      );
    }
    const conversationContainer =
      (hasNewConversationContainer ? latestConversationContainer : null) ||
      getConversationContainer(promptAnchor);
    let responseContainer =
      (conversationContainer
        ? conversationContainer.querySelector<HTMLElement>(".response-container")
        : null) ||
      (promptAnchor ? getResponseContainerForAnchor(promptAnchor) : null) ||
      conversationContainer;
    const resolveResponseContainer = () => {
      const anchor = latestUserQuery || promptAnchor;
      const anchoredResponse = getResponseContainerForAnchor(anchor);
      if (anchoredResponse) return anchoredResponse;
      const anchoredConversation = getConversationContainer(anchor);
      if (anchoredConversation) {
        return (
          anchoredConversation.querySelector<HTMLElement>(".response-container") ||
          anchoredConversation
        );
      }
      if (hasNewConversationContainer && latestConversationContainer) {
        return (
          latestConversationContainer.querySelector<HTMLElement>(
            ".response-container"
          ) || latestConversationContainer
        );
      }
      return null;
    };
    logInfo("[Content] Response container found", {
      found: Boolean(responseContainer),
      className: responseContainer?.className || "(none)"
    });
    if (responseContainer) {
      initialDownloadBtnCount =
        getDownloadButtonsInContainer(responseContainer, true).length;
      initialImageCount = getGeneratedImages(responseContainer).length;
    } else {
      logWarn("[Content] No response container; using anchor fallback");
    }

    // 7. Wait for generation
    updateStatus("Generating...");

    // CRITICAL: Record counts BEFORE sending prompt
    // This prevents detecting old buttons/images from previous responses
    logInfo("[Content] Initial counts before prompt", {
      btns: initialDownloadBtnCount,
      images: initialImageCount,
      globalButtons: initialGlobalDownloadBtnCount,
      globalImages: initialGlobalImageCount
    });

    let pollTick = 0;
    let latestDownloadButtons: HTMLButtonElement[] = [];
    await waitFor(
      () => {
        pollTick += 1;
        const globalButtons = getDownloadBtns(true);
        const globalImages = getGeneratedImages().filter(
          (img) => img.complete && img.naturalWidth > 0
        );
        const hasNewGlobalContent =
          globalButtons.length > initialGlobalDownloadBtnCount ||
          globalImages.length > initialGlobalImageCount;
        if (!hasNewGlobalContent) {
          if (pollTick % 5 === 0) {
            logInfo("[Content] Waiting for new global content", {
              globalButtons: globalButtons.length,
              globalImages: globalImages.length,
              initialGlobalButtons: initialGlobalDownloadBtnCount,
              initialGlobalImages: initialGlobalImageCount
            });
          }
          return false;
        }
        if (responseContainer && !responseContainer.isConnected) {
          responseContainer = resolveResponseContainer();
        }
        if (responseContainer) {
          const scopedButtons = getDownloadButtonsInContainer(
            responseContainer,
            true
          );
          const scopedImageCandidates =
            getGeneratedImageCandidates(responseContainer);
          const scopedVisibleImages = scopedImageCandidates.filter((img) =>
            isVisible(img)
          );
          const scopedLargeImages = scopedVisibleImages.filter(
            (img) => img.width > 100
          );
          const scopedImages = scopedLargeImages.filter(
            (img) => img.complete && img.naturalWidth > 0
          );
          latestDownloadButtons = scopedButtons;
          if (pollTick % 5 === 0) {
            logInfo("[Content] Download button poll", {
              scopedButtons: scopedButtons.length,
              scopedImages: scopedImages.length,
              scopedImageCandidates: scopedImageCandidates.length,
              scopedVisibleImages: scopedVisibleImages.length,
              scopedLargeImages: scopedLargeImages.length,
              scopedLoadedImages: scopedImages.length,
              responseConnected: responseContainer.isConnected,
              responseClass: responseContainer.className || "(none)",
              sampleImage: scopedImageCandidates.length
                ? describeImage(
                    scopedImageCandidates[scopedImageCandidates.length - 1]
                  )
                : null
            });
          }
          if (scopedButtons.length > 0 && scopedImages.length > 0) {
            return true;
          }
          const anchorButtons = getDownloadButtonsAfterAnchor(promptAnchor, true);
          const anchorImages = getGeneratedImagesAfterAnchor(promptAnchor).filter(
            (img) => img.complete && img.naturalWidth > 0
          );
          if (anchorButtons.length > 0 && anchorImages.length > 0) {
            latestDownloadButtons = anchorButtons;
            if (pollTick % 5 === 0) {
              logInfo("[Content] Download button poll (anchor)", {
                anchorButtons: anchorButtons.length,
                anchorImages: anchorImages.length
              });
            }
            return true;
          }
          return false;
        }

        const anchorButtons = getDownloadButtonsAfterAnchor(promptAnchor, true);
        latestDownloadButtons = anchorButtons;
        if (pollTick % 5 === 0) {
          logInfo("[Content] Download button poll", {
            anchorButtons: anchorButtons.length
          });
        }
        return anchorButtons.length > 0;
      },
      CONFIG_GEN_TIMEOUT,
      CONFIG_POLL,
      "Timeout waiting for Download Button"
    );

    logInfo("[Content] Download button detected", {
      count: latestDownloadButtons.length
    });
    await wait(CONFIG_STEP_DELAY * 2); // Stability wait

    // 8. Download
    updateStatus("Downloading...");
    let downloadBtns = latestDownloadButtons.length
      ? latestDownloadButtons
      : responseContainer
        ? getDownloadButtonsInContainer(responseContainer, true)
        : promptAnchor
          ? getDownloadButtonsAfterAnchor(promptAnchor, true)
          : [];
    logInfo("[Content] Download buttons after anchor", {
      count: downloadBtns.length,
      buttons: downloadBtns.map(describeButton)
    });
    if (!downloadBtns.length) {
      const fallbackButtons = responseContainer
        ? getDownloadButtonsInContainer(responseContainer, true)
        : promptAnchor
          ? getDownloadButtonsAfterAnchor(promptAnchor, true)
          : [];
      logInfo("[Content] Download buttons including hidden", {
        count: fallbackButtons.length,
        buttons: fallbackButtons.map(describeButton)
      });
      downloadBtns = fallbackButtons;
    }
    if (!downloadBtns.length) {
      logInfo("[Content] All download buttons on page", {
        count: getDownloadBtns(true).length,
        buttons: getDownloadBtns(true).map(describeButton)
      });
    }

    const nearestButton = getDownloadButtonNearLastImage(
      promptAnchor,
      responseContainer
    );
    if (!responseContainer && nearestButton && !downloadBtns.includes(nearestButton)) {
      downloadBtns.push(nearestButton);
    }

    if (!downloadBtns.length) {
      throw new Error("No download buttons found after generation");
    }
    const lastBtn = downloadBtns[downloadBtns.length - 1];

    logInfo("[Content] Clicking download", {
      filename,
      button: describeButton(lastBtn)
    });
    revealDownloadButton(lastBtn);
    await wait(150);
    if (!isClickable(lastBtn)) {
      logInfo("[Content] Download button still not clickable, retry hover");
      revealDownloadButton(lastBtn);
      await wait(150);
    }
    clickDownloadButton(lastBtn);

    // 9. Wait for download and rename (handled by background.ts)
    updateStatus("Waiting for file...");
    const renameResult = await runtimeSendMessage<WaitAndRenameResponse>({
      action: "WAIT_AND_RENAME",
      targetFilename: filename
    });

    if (!renameResult || !renameResult.success) {
      throw new Error(renameResult?.error || "File rename failed");
    }

    logInfo(`[Content] Task complete: ${task.name}`);
    updateStatus(`Complete: ${task.name}`);
    runtimeSendMessage<void>({ action: "TASK_COMPLETE", skipped: false });
  } catch (err) {
    const message = toErrorMessage(err);
    logError("[Content] Error", { message });
    updateStatus(`Error: ${message}`, true);
    runtimeSendMessage<void>({ action: "TASK_ERROR", error: message });
  }
})();

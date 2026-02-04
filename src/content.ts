import type { TaskItem } from "./types.js";
type Language = "en" | "zh";

const LANGUAGE_STORAGE_KEY = "uiLanguage";
const DEFAULT_LANGUAGE: Language = "en";

const translations: Record<Language, Record<string, string>> = {
  en: {
    "content.status.retryingDownload": "Retrying download...",
    "content.status.downloading": "Downloading...",
    "content.status.waitingForFile": "Waiting for file...",
    "content.status.processing": "Processing: {{name}}",
    "content.status.skipped": "Skipped: {{name}}",
    "content.status.complete": "Complete: {{name}}",
    "content.status.generating": "Generating...",
    "content.status.error": "Error: {{message}}",
    "content.error.existingResponseNotFound":
      "Existing response not found for download-only retry",
    "content.error.timeoutExistingResponse":
      "Timeout waiting for existing response",
    "content.error.noDownloadButtons": "No download buttons found after generation",
    "content.error.noDownloadButton": "No download button found after generation",
    "content.error.fileRenameFailed": "File rename failed",
    "content.error.lockedUrlRequired":
      "Locked conversation URL is required. Please lock a Gemini chat URL.",
    "content.error.lockedUrlMismatch":
      "Locked URL mismatch. Expected {{expected}}, got {{actual}}",
    "content.error.timeoutInputField": "Timeout waiting for Input Field",
    "content.error.inputFieldNotFound": "Input field not found after wait",
    "content.error.pageStabilityTimeout":
      "Page stability timeout ({{seconds}}s) - images not loaded",
    "content.error.failedToWritePrompt": "Failed to write prompt into input field",
    "content.error.timeoutSendButton": "Timeout waiting for Send Button",
    "content.error.sendButtonNotFound": "Send button not found after wait",
    "content.error.sendDidNotClearInput": "Send click did not clear input",
    "content.error.timeoutPromptRender": "Timeout waiting for prompt render",
    "content.error.timeoutConversationContainer":
      "Timeout waiting for conversation container",
    "content.error.promptAnchorNotFound":
      "Prompt anchor not found; aborting to avoid downloading the wrong image",
    "content.error.timeoutDownloadButton": "Timeout waiting for Download Button",
    "validation.lockedUrl.mustGemini": "Locked URL must be a Gemini URL",
    "validation.lockedUrl.mustSpecificConversation":
      "Locked URL is a new conversation URL (use a specific chat URL)",
    "validation.lockedUrl.mustConversation":
      "Locked URL must be a Gemini conversation URL",
    "validation.lockedUrl.invalid": "Locked URL is invalid"
  },
  zh: {
    "content.status.retryingDownload": "正在重试下载...",
    "content.status.downloading": "正在下载...",
    "content.status.waitingForFile": "等待文件...",
    "content.status.processing": "处理中：{{name}}",
    "content.status.skipped": "已跳过：{{name}}",
    "content.status.complete": "完成：{{name}}",
    "content.status.generating": "正在生成...",
    "content.status.error": "错误：{{message}}",
    "content.error.existingResponseNotFound": "未找到可用于仅下载重试的已有响应",
    "content.error.timeoutExistingResponse": "等待已有响应超时",
    "content.error.noDownloadButtons": "生成后未找到下载按钮",
    "content.error.noDownloadButton": "生成后未找到下载按钮",
    "content.error.fileRenameFailed": "文件重命名失败",
    "content.error.lockedUrlRequired":
      "需要锁定的对话链接。请先锁定 Gemini 对话链接。",
    "content.error.lockedUrlMismatch":
      "锁定链接不匹配。期望 {{expected}}，实际 {{actual}}",
    "content.error.timeoutInputField": "等待输入框超时",
    "content.error.inputFieldNotFound": "等待后仍未找到输入框",
    "content.error.pageStabilityTimeout": "页面稳定超时（{{seconds}}秒）- 图片未加载",
    "content.error.failedToWritePrompt": "写入提示词失败",
    "content.error.timeoutSendButton": "等待发送按钮超时",
    "content.error.sendButtonNotFound": "等待后仍未找到发送按钮",
    "content.error.sendDidNotClearInput": "点击发送后未清空输入框",
    "content.error.timeoutPromptRender": "等待提示渲染超时",
    "content.error.timeoutConversationContainer": "等待对话容器超时",
    "content.error.promptAnchorNotFound":
      "未找到提示锚点；为避免下载错误图片已中止",
    "content.error.timeoutDownloadButton": "等待下载按钮超时",
    "validation.lockedUrl.mustGemini": "锁定链接必须是 Gemini 链接",
    "validation.lockedUrl.mustSpecificConversation":
      "锁定链接是新对话链接（请使用具体对话链接）",
    "validation.lockedUrl.mustConversation": "锁定链接必须是 Gemini 对话链接",
    "validation.lockedUrl.invalid": "锁定链接无效"
  }
};

const normalizeLanguage = (value?: string): Language =>
  value === "zh" ? "zh" : "en";

const interpolate = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? "" : String(value);
  });
};

const createTranslator = (language: Language) =>
  (key: string, vars?: Record<string, string | number>) => {
    const template = translations[language][key] || translations.en[key] || key;
    return interpolate(template, vars);
  };

const getStoredLanguage = async (): Promise<Language> => {
  const result = (await chrome.storage.local.get([
    LANGUAGE_STORAGE_KEY
  ])) as unknown as Record<string, unknown>;
  return normalizeLanguage(result[LANGUAGE_STORAGE_KEY] as string | undefined);
};

let t = createTranslator(DEFAULT_LANGUAGE);

type TaskErrorType = "generation" | "download" | "folder" | "locked-url";
type TaskMode = "full" | "download-only";

type ContentSettings = {
  settings_generationTimeout?: number;
  settings_pageLoadTimeout?: number;
  settings_inputTimeout?: number;
  settings_stepDelay?: number;
  settings_pollInterval?: number;
  settings_inputPollInterval?: number;
  settings_sendPollInterval?: number;
  settings_generationPollInterval?: number;
};

type CheckFileExistsResponse = {
  exists: boolean;
  error?: string;
  errorType?: TaskErrorType;
};

type WaitAndRenameResponse = {
  success: boolean;
  filename?: string;
  error?: string;
  errorType?: TaskErrorType;
};

type ContentMessage =
  | { action: "CHECK_FILE_EXISTS"; filename: string }
  | { action: "WAIT_AND_RENAME"; targetFilename: string }
  | { action: "TASK_COMPLETE"; skipped: boolean }
  | { action: "TASK_ERROR"; error: string; errorType?: TaskErrorType }
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

const normalizeTaskMode = (mode?: string): TaskMode =>
  mode === "download-only" ? "download-only" : "full";

const normalizeUrlForCompare = (url: string) => {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return url.replace(/\/$/, "");
  }
};

const urlsMatch = (lockedUrl: string, currentUrl: string) =>
  normalizeUrlForCompare(lockedUrl) === normalizeUrlForCompare(currentUrl);

const isGeminiHost = (hostname: string) =>
  hostname === "gemini.google.com" || hostname.endsWith(".gemini.google.com");

const validateLockedConversationUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (!isGeminiHost(parsed.hostname)) {
      return {
        ok: false,
        message: t("validation.lockedUrl.mustGemini")
      } as const;
    }
    const normalizedPath = parsed.pathname.replace(/\/$/, "");
    const pathWithoutAccount = normalizedPath.replace(/^\/u\/\d+/, "");
    if (pathWithoutAccount === "/app") {
      return {
        ok: false,
        message: t("validation.lockedUrl.mustSpecificConversation")
      } as const;
    }
    if (!pathWithoutAccount.includes("/app/")) {
      return {
        ok: false,
        message: t("validation.lockedUrl.mustConversation")
      } as const;
    }
    return { ok: true } as const;
  } catch {
    return { ok: false, message: t("validation.lockedUrl.invalid") } as const;
  }
};

const isFolderAuthErrorMessage = (message: string) => {
  const normalized = message.toLowerCase();
  return [
    "missing directory handles",
    "permission lost",
    "directory iteration is not supported",
    "notallowederror",
    "securityerror",
    "permission",
    "not authorized",
    "denied"
  ].some((fragment) => normalized.includes(fragment));
};

class TaskError extends Error {
  errorType: TaskErrorType;

  constructor(message: string, errorType: TaskErrorType) {
    super(message);
    this.errorType = errorType;
  }
}

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
  const language = await getStoredLanguage();
  t = createTranslator(language);

  // 0. Load Settings
  const settings = await storageGet<ContentSettings>([
    "settings_generationTimeout",
    "settings_pageLoadTimeout",
    "settings_inputTimeout",
    "settings_stepDelay",
    "settings_pollInterval",
    "settings_inputPollInterval",
    "settings_sendPollInterval",
    "settings_generationPollInterval"
  ]);
  const CONFIG_GEN_TIMEOUT = (settings.settings_generationTimeout || 120) * 1000;
  const CONFIG_STABILITY_TIMEOUT =
    (settings.settings_pageLoadTimeout || 30) * 1000;
  const CONFIG_INPUT_TIMEOUT = (settings.settings_inputTimeout || 5) * 1000;
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
  const CONFIG_STABILITY_GRACE = Math.min(
    CONFIG_STABILITY_TIMEOUT,
    Math.max(CONFIG_POLL, CONFIG_STEP_DELAY) * 2
  );
  const CONFIG_SEND_TIMEOUT = Math.max(CONFIG_INPUT_TIMEOUT, CONFIG_STEP_DELAY * 5);

  logInfo("[Content] Timing config", {
    generationTimeoutMs: CONFIG_GEN_TIMEOUT,
    pageLoadTimeoutMs: CONFIG_STABILITY_TIMEOUT,
    inputTimeoutMs: CONFIG_INPUT_TIMEOUT,
    stepDelayMs: CONFIG_STEP_DELAY,
    pollMs: CONFIG_POLL
  });

  // No longer focus tab/window - only use element focus to avoid interrupting user

  // --- Helpers ---
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitFor = async (
    conditionFn: () => boolean | Promise<boolean>,
    timeout = CONFIG_GEN_TIMEOUT,
    checkInterval = CONFIG_POLL,
    errorMessage = "Timeout"
  ) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await conditionFn()) return true;
      const remaining = end - Date.now();
      if (remaining <= 0) break;
      await wait(Math.min(checkInterval, remaining));
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

  function getResponseReadyState(container: Element) {
    const busyElement = container.querySelector<HTMLElement>("[aria-busy]");
    const ariaBusy = busyElement?.getAttribute("aria-busy") || "";
    
    // Check for actual loading indicators, NOT ".processing-state-visible" 
    // which is a persistent UI class that stays even after generation is done
    const footer = container.querySelector<HTMLElement>(".response-footer");
    const footerComplete = footer ? footer.classList.contains("complete") : null;
    const loader = container.querySelector<HTMLElement>(".generated-image .loader");
    const hasVisibleLoader = loader ? isVisible(loader) : false;
    
    // Check if there's an image with the "loaded" class (Gemini's indicator for ready images)
    const loadedImage = container.querySelector<HTMLImageElement>('img.loaded');
    const hasLoadedImage = loadedImage !== null;
    
    // Ready when:
    // 1. Not aria-busy
    // 2. Footer is complete (if exists)
    // 3. No visible loader
    // 4. Has a loaded image OR footer is complete
    const ready =
      ariaBusy !== "true" &&
      (footerComplete !== false) &&
      !hasVisibleLoader &&
      (hasLoadedImage || footerComplete === true);
    return {
      ready,
      ariaBusy,
      footerComplete,
      hasVisibleLoader,
      hasLoadedImage
    };
  }

  function getImageSrc(img: HTMLImageElement) {
    return img.currentSrc || img.src || "";
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
    button.focus({ preventScroll: true });
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

  /**
   * Check if Gemini page is fully loaded and ready for interaction.
   * This goes beyond just finding the input field - it checks for core UI elements
   * that indicate the page has finished initializing.
   */
  function isGeminiPageReady(): { ready: boolean; details: Record<string, unknown> } {
    // 1. Check document ready state
    const docReady = document.readyState === "complete";
    
    // 2. Check for input field
    const inputField = findInputField();
    const hasInputField = inputField !== null;
    
    // 3. Check for chat container (indicates main app loaded)
    const chatContainerSelectors = [
      "#chat-history",
      ".chat-history-scroll-container",
      "main[role='main']",
      ".conversation-container"
    ];
    let hasChatContainer = false;
    for (const selector of chatContainerSelectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (isVisible(el)) {
        hasChatContainer = true;
        break;
      }
    }
    
    // 4. Check that there's no loading spinner/skeleton
    const loadingIndicators = [
      ".loading-spinner",
      ".skeleton-loader",
      "[aria-busy='true']",
      ".mat-progress-spinner"
    ];
    let hasLoadingIndicator = false;
    for (const selector of loadingIndicators) {
      const el = document.querySelector<HTMLElement>(selector);
      if (isVisible(el)) {
        hasLoadingIndicator = true;
        break;
      }
    }
    
    // 5. Check for Gemini's app root (indicates Angular/React bootstrapped)
    const appRoot = document.querySelector("bard-sidenav-container, chat-window, main");
    const hasAppRoot = appRoot !== null && isVisible(appRoot as HTMLElement);
    
    const ready = docReady && hasInputField && hasChatContainer && !hasLoadingIndicator && hasAppRoot;
    
    return {
      ready,
      details: {
        docReady,
        hasInputField,
        hasChatContainer,
        hasLoadingIndicator,
        hasAppRoot
      }
    };
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

  function userQueryMatchesPrompt(
    query: Element | null,
    promptText: string,
    fullPrompt: string
  ) {
    if (!query) return false;
    const text = normalizeText(query.textContent || "").toLowerCase();
    const target = normalizeText(promptText).toLowerCase();
    const fullTarget = normalizeText(fullPrompt).toLowerCase();
    if (target && text.includes(target)) return true;
    if (fullTarget && text.includes(fullTarget)) return true;
    return false;
  }

  function getDownloadMenuItemLabel(element: HTMLElement) {
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("mattooltip") ||
      element.textContent ||
      ""
    );
  }

  function isDownloadMenuLabel(label: string) {
    const normalized = normalizeText(label).toLowerCase();
    if (!normalized) return false;
    if (!normalized.includes("download")) return false;
    if (normalized.includes("copy") || normalized.includes("share")) return false;
    return true;
  }

  function getDownloadMenuItem() {
    const selectors = [
      "button[role=\"menuitem\"]",
      "[role=\"menuitem\"]",
      "button[mat-menu-item]",
      ".mat-mdc-menu-item",
      "button[aria-label*='Download']",
      "button[mattooltip*='Download']",
      "button[data-test-id*='download']",
      "a[download]"
    ];
    const candidates = new Set<HTMLElement>();
    const roots: ParentNode[] = [document];
    const overlay = document.querySelector<HTMLElement>(".cdk-overlay-container");
    if (overlay) {
      roots.unshift(overlay);
    }
    for (const root of roots) {
      for (const selector of selectors) {
        root
          .querySelectorAll<HTMLElement>(selector)
          .forEach((el) => candidates.add(el));
      }
    }
    for (const candidate of candidates) {
      if (candidate instanceof HTMLAnchorElement && candidate.hasAttribute("download")) {
        return candidate;
      }
      const label = getDownloadMenuItemLabel(candidate);
      if (isDownloadMenuLabel(label)) return candidate;
    }
    return null;
  }

  async function clickDownloadMenuItem() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const menuItem = getDownloadMenuItem();
      if (menuItem && isVisible(menuItem)) {
        menuItem.click();
        return true;
      }
      await wait(150);
    }
    return false;
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

  /**
   * Find conversation container by matching prompt/name text in user-query
   * Returns the LAST matching conversation (most recent)
   */
  function findConversationByPrompt(promptText: string, nameText: string) {
    const containers = Array.from(
      document.querySelectorAll<HTMLElement>(".conversation-container")
    );
    const targetName = normalizeText(nameText).toLowerCase();
    const targetPrompt = normalizeText(promptText).toLowerCase();
    
    let lastMatch: { container: HTMLElement; userQuery: HTMLElement } | null = null;
    
    // Iterate through ALL containers and keep the LAST match (most recent)
    for (const container of containers) {
      const userQuery = container.querySelector("user-query");
      if (!userQuery) continue;
      const text = normalizeText(userQuery.textContent || "").toLowerCase();
      
      // Match by name (more specific) or full prompt
      if (targetName && text.includes(targetName)) {
        lastMatch = { container, userQuery: userQuery as HTMLElement };
      } else if (targetPrompt && text.includes(targetPrompt)) {
        lastMatch = { container, userQuery: userQuery as HTMLElement };
      }
    }
    return lastMatch;
  }

  /**
   * Wait for a new conversation container to appear that matches the prompt
   */
  async function waitForConversationContainer(
    promptText: string,
    nameText: string,
    afterContainerId: string | null,
    timeout: number,
    pollInterval: number
  ): Promise<{ container: HTMLElement; userQuery: HTMLElement } | null> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const match = findConversationByPrompt(promptText, nameText);
      if (match) {
        // If we have an "after" container ID, make sure this is a NEW container
        if (afterContainerId) {
          if (match.container.id !== afterContainerId) {
            return match;
          }
        } else {
          return match;
        }
      }
      await wait(pollInterval);
    }
    return null;
  }

  /**
   * Check if image is fully loaded (via class or complete property)
   */
  function isImageLoaded(img: HTMLImageElement): boolean {
    // Gemini adds 'loaded' class when image is ready
    if (img.classList.contains("loaded")) return true;
    // Fallback: check native complete property
    return img.complete && img.naturalWidth > 0;
  }

  /**
   * Get generated images within a container that are fully loaded
   */
  function getLoadedImagesInContainer(container: Element): HTMLImageElement[] {
    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>(
        'img[src*="blob:"], img[src*="googleusercontent"], img[alt*="Generated"], generated-image img, single-image img'
      )
    );
    return images.filter((img) => isVisible(img) && isImageLoaded(img) && img.width > 100);
  }

  /**
   * Get download button within a conversation/response container
   */
  function getDownloadButtonInConversation(container: Element): HTMLButtonElement | null {
    const selectors = [
      'download-generated-image-button button',
      'button[data-test-id="download-generated-image-button"]',
      'button[aria-label="Download full size image"]',
      'button[mattooltip="Download full size"]',
      'button[aria-label*="Download"]',
      'button[mattooltip*="Download"]'
    ];
    for (const selector of selectors) {
      const btn = container.querySelector<HTMLButtonElement>(selector);
      if (btn && isButtonEnabled(btn)) return btn;
    }
    return null;
  }

  function getResponseContainerForAnchor(anchor: Element | null) {
    if (!anchor) return null;
    const responseSelector =
      ".presented-response-container, model-response, .response-container, .response-container-content, .response-content";
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(responseSelector)
    );
    const after = getElementsAfterAnchor(candidates, anchor);
    if (!after.length) return null;
    const first = after[0];
    return first.closest<HTMLElement>(".presented-response-container") || first;
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

  function findUserQueryByPromptText(promptText: string) {
    const target = normalizeText(promptText).toLowerCase();
    if (!target) return null;
    const queries = Array.from(document.querySelectorAll<HTMLElement>("user-query"));
    let matched: HTMLElement | null = null;
    for (const query of queries) {
      const text = normalizeText(query.textContent || "").toLowerCase();
      if (text.includes(target)) {
        matched = query;
      }
    }
    return matched;
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

  function isElementAfterAnchor(anchor: Element | null, element: Element | null) {
    if (!element) return false;
    if (!anchor) return true;
    if (element.contains(anchor)) return true;
    return Boolean(
      anchor.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
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

  function getDownloadButtonForImage(image: HTMLImageElement | null) {
    if (!image) return null;
    const containerEl = image.closest(
      ".attachment-container, .generated-images, .response-container, .overlay-container, .image-container"
    );
    if (!containerEl) return null;
    const button = containerEl.querySelector<HTMLButtonElement>(
      "download-generated-image-button button, button[data-test-id=\"download-generated-image-button\"], button[aria-label*=\"Download\"], button[mattooltip*=\"Download\"]"
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

  async function prepareDownloadOnlyContext(
    task: TaskItem,
    filename: string,
    composedPrompt: string,
    promptAnchorText: string
  ) {
    logInfo(`[Content] Download-only mode: ${filename}`);
    logInfo("[Content] Waiting for existing response", {
      timeoutMs: CONFIG_GEN_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    updateStatus(t("content.status.retryingDownload"));

    let responseContainer: Element | null = null;

    const conversationMatch = findConversationByPrompt(task.prompt, filename);
    if (conversationMatch?.container) {
      responseContainer = conversationMatch.container;
    }

    if (!responseContainer) {
      const anchor =
        findUserQueryByPromptText(promptAnchorText) ||
        findUserQueryByPromptText(composedPrompt) ||
        findPromptAnchor(promptAnchorText);
      responseContainer = anchor
        ? getResponseContainerForAnchor(anchor) ?? getConversationContainer(anchor)
        : null;
    }

    if (!responseContainer) {
      throw new TaskError(
        t("content.error.existingResponseNotFound"),
        "generation"
      );
    }

    let pollTick = 0;
    await waitFor(
      () => {
        pollTick += 1;
        if (!responseContainer || !responseContainer.isConnected) return false;
        const responseState = getResponseReadyState(responseContainer);
        if (!responseState.ready) return false;
        const buttons = getDownloadButtonsInContainer(responseContainer, true);
        const loadedImages = getLoadedImagesInContainer(responseContainer);
        return buttons.length > 0 && loadedImages.length > 0;
      },
      CONFIG_GEN_TIMEOUT,
      CONFIG_POLL,
      t("content.error.timeoutExistingResponse")
    );

    const latestDownloadButtons = getDownloadButtonsInContainer(responseContainer, true);
    const latestNewImages = getLoadedImagesInContainer(responseContainer);

    return { responseContainer, latestDownloadButtons, latestNewImages };
  }

  async function performDownload(params: {
    filename: string;
    responseContainer: Element | null;
    latestDownloadButtons: HTMLButtonElement[];
    latestNewImages: HTMLImageElement[];
  }) {
    const { filename, responseContainer, latestDownloadButtons, latestNewImages } =
      params;
    updateStatus(t("content.status.downloading"));

    let targetBtn: HTMLButtonElement | null = null;

    if (responseContainer) {
      targetBtn = getDownloadButtonInConversation(responseContainer);
    }

    if (!targetBtn) {
      let downloadBtns = latestDownloadButtons.length
        ? latestDownloadButtons
        : responseContainer
          ? getDownloadButtonsInContainer(responseContainer, true)
          : [];
      if (!downloadBtns.length) {
        const fallbackButtons = responseContainer
          ? getDownloadButtonsInContainer(responseContainer, true)
          : [];
        downloadBtns = fallbackButtons;
      }

      const nearestButton = getDownloadButtonForImage(
        latestNewImages.length
          ? latestNewImages[latestNewImages.length - 1]
          : responseContainer
            ? getGeneratedImages(responseContainer).slice(-1)[0] || null
            : null
      );
      if (nearestButton && !downloadBtns.includes(nearestButton)) {
        downloadBtns.push(nearestButton);
      }

      if (!downloadBtns.length) {
        throw new TaskError(t("content.error.noDownloadButtons"), "generation");
      }
      const lastBtn = downloadBtns[downloadBtns.length - 1];
      targetBtn = nearestButton || lastBtn;
    }

    if (!targetBtn) {
      throw new TaskError(t("content.error.noDownloadButton"), "generation");
    }

    logInfo(`[Content] Clicking download: ${filename}`);

    for (let revealAttempt = 0; revealAttempt < 3; revealAttempt++) {
      revealDownloadButton(targetBtn);
      await wait(200);
      if (isClickable(targetBtn)) {
        break;
      }
    }

    if (!isClickable(targetBtn)) {
      logWarn("[Content] Download button not clickable, trying anyway");
    }

    clickDownloadButton(targetBtn);
    await clickDownloadMenuItem();

    updateStatus(t("content.status.waitingForFile"));
    const renameResult = await runtimeSendMessage<WaitAndRenameResponse>({
      action: "WAIT_AND_RENAME",
      targetFilename: filename
    });

    if (!renameResult || !renameResult.success) {
      const fallbackType: TaskErrorType = renameResult?.errorType
        ? renameResult.errorType
        : renameResult?.error && isFolderAuthErrorMessage(renameResult.error)
          ? "folder"
          : "download";
      throw new TaskError(
        renameResult?.error || t("content.error.fileRenameFailed"),
        fallbackType
      );
    }
  }

  let currentPhase: "generation" | "download" = "generation";

  // --- Main Logic ---
  try {
    // 1. Get current task from storage
    const data = await storageGet<{
      currentTask?: TaskItem;
      currentTaskMode?: string;
      lockedConversationUrl?: string;
    }>(["currentTask", "currentTaskMode", "lockedConversationUrl"]);
    const task = data.currentTask;
    const taskMode = normalizeTaskMode(data.currentTaskMode);
    const lockedConversationUrl = (data.lockedConversationUrl || "").trim();

    if (!task) {
      logInfo("[Content] No task found.");
      runtimeSendMessage<void>({
        action: "TASK_ERROR",
        error: "No task found"
      });
      return;
    }

    logInfo(`[Content] Processing: ${task.name}`);
    updateStatus(
      t("content.status.processing", {
        name: task.name
      })
    );

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

    if (checkResult?.error) {
      const errorType: TaskErrorType = checkResult.errorType
        ? checkResult.errorType
        : isFolderAuthErrorMessage(checkResult.error)
          ? "folder"
          : "download";
      throw new TaskError(checkResult.error, errorType);
    }

    if (checkResult && checkResult.exists) {
      logInfo(`[Content] File exists, skipping: ${filename}`);
      updateStatus(
        t("content.status.skipped", {
          name: task.name
        })
      );
      runtimeSendMessage<void>({ action: "TASK_COMPLETE", skipped: true });
      return;
    }

    if (!lockedConversationUrl) {
      throw new TaskError(
        t("content.error.lockedUrlRequired"),
        "locked-url"
      );
    }
    const lockedValidation = validateLockedConversationUrl(lockedConversationUrl);
    if (!lockedValidation.ok) {
      throw new TaskError(lockedValidation.message, "locked-url");
    }
    const currentUrl = window.location.href;
    if (!urlsMatch(lockedConversationUrl, currentUrl)) {
      throw new TaskError(
        t("content.error.lockedUrlMismatch", {
          expected: lockedConversationUrl,
          actual: currentUrl
        }),
        "locked-url"
      );
    }

    if (taskMode === "download-only") {
      const downloadContext = await prepareDownloadOnlyContext(
        task,
        filename,
        composedPrompt,
        promptAnchorText
      );
      currentPhase = "download";
      await performDownload({
        filename,
        responseContainer: downloadContext.responseContainer,
        latestDownloadButtons: downloadContext.latestDownloadButtons,
        latestNewImages: downloadContext.latestNewImages
      });
      logInfo(`[Content] Task complete: ${task.name}`);
      updateStatus(
        t("content.status.complete", {
          name: task.name
        })
      );
      runtimeSendMessage<void>({ action: "TASK_COMPLETE", skipped: false });
      return;
    }

    // 4. Wait for Gemini page to be fully ready (not just input field)
    logInfo("[Content] Waiting for page ready", {
      timeoutMs: CONFIG_INPUT_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    let inputField: HTMLElement | null = null;
    const inputWaitStart = Date.now();
    let lastInputWaitLog = 0;
    const logPageReadyState = () => {
      logInfo("[Content] Page not ready yet", {
        elapsedMs: Date.now() - inputWaitStart,
        timeoutMs: CONFIG_INPUT_TIMEOUT
      });
    };

    try {
      await waitFor(
        () => {
          const pageState = isGeminiPageReady();
          if (pageState.ready) {
            inputField = findInputField();
            return true;
          }
          const now = Date.now();
          if (now - lastInputWaitLog >= 3000) {
            lastInputWaitLog = now;
            logPageReadyState();
          }
          return false;
        },
        CONFIG_INPUT_TIMEOUT,
        CONFIG_POLL,
        t("content.error.timeoutInputField")
      );
    } catch (err) {
      logError("[Content] Page ready wait timed out", {
        elapsedMs: Date.now() - inputWaitStart,
        timeoutMs: CONFIG_INPUT_TIMEOUT
      });
      throw err;
    }

    logInfo("[Content] Page ready", { elapsedMs: Date.now() - inputWaitStart });

    if (!inputField) {
      throw new Error(t("content.error.inputFieldNotFound"));
    }
    const initialInputField = inputField as HTMLElement;

    // 4.5 Wait for page to stabilize (previous images fully loaded)
    logInfo("[Content] Checking page stability", {
      timeoutMs: CONFIG_STABILITY_TIMEOUT,
      stepDelayMs: CONFIG_STEP_DELAY
    });

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
        const timeoutSeconds = Math.round(stabilityTimeout / 1000);
        throw new Error(
          t("content.error.pageStabilityTimeout", {
            seconds: timeoutSeconds
          })
        );
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

      if (
        allLoaded ||
        (hasButtons && Date.now() - stabilityStart > CONFIG_STABILITY_GRACE)
      ) {
        logInfo("[Content] Page stable");
        break;
      }

      // Also allow proceeding if we waited 10+ seconds with 0 images (new conversation)
      if (
        images.length === 0 &&
        btns.length === 0 &&
        Date.now() - stabilityStart > CONFIG_STABILITY_GRACE
      ) {
        logInfo("[Content] No existing images, proceeding");
        break;
      }
    }

    // Extra safety wait before starting task
    logInfo("[Content] Waiting safety delay", {
      sleepMs: CONFIG_STEP_DELAY * 3
    });
    await wait(CONFIG_STEP_DELAY * 3);

    // 5. Scroll to bottom and prepare
    logInfo("[Content] Scrolling to bottom", {
      sleepMs: CONFIG_STEP_DELAY
    });
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
      throw new Error(t("content.error.failedToWritePrompt"));
    }

    // Wait 1 second before clicking send
    logInfo("[Content] Sleep before send", { sleepMs: CONFIG_STEP_DELAY });
    await wait(CONFIG_STEP_DELAY);

    // 6. Click Send
    logInfo("[Content] Waiting for Send button", {
      timeoutMs: CONFIG_SEND_TIMEOUT,
      pollMs: CONFIG_POLL
    });
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
      CONFIG_SEND_TIMEOUT,
      CONFIG_POLL,
      t("content.error.timeoutSendButton")
    );

    if (!sendBtn) {
      throw new Error(t("content.error.sendButtonNotFound"));
    }
    const sendButton = sendBtn as HTMLButtonElement;

    const initialGlobalDownloadBtnCount = getDownloadBtns(true).length;
    const initialGlobalImageCount = getGeneratedImages().length;

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
    
    // CRITICAL: Record the ID of the last conversation container BEFORE sending
    // This ensures we wait for a NEW container and don't use old ones
    const containersBeforeSend = Array.from(
      document.querySelectorAll<HTMLElement>(".conversation-container")
    );
    const lastContainerBeforeSend = containersBeforeSend.length > 0
      ? containersBeforeSend[containersBeforeSend.length - 1]
      : null;
    const lastContainerIdBeforeSend = lastContainerBeforeSend?.id || null;

    await wait(CONFIG_STEP_DELAY / 2);
    sendButton.focus({ preventScroll: true });
    sendButton.click();
    logInfo("[Content] Prompt sent");

    logInfo("[Content] Sleep after send", { sleepMs: CONFIG_STEP_DELAY });
    await wait(CONFIG_STEP_DELAY);

    // CRITICAL: Verify URL hasn't changed after sending (Gemini might auto-create new conversation)
    const urlAfterSend = window.location.href;
    if (!urlsMatch(lockedConversationUrl, urlAfterSend)) {
      logError("[Content] URL changed after sending prompt");
      throw new TaskError(
        t("content.error.lockedUrlMismatch", {
          expected: lockedConversationUrl,
          actual: urlAfterSend
        }),
        "locked-url"
      );
    }

    logInfo("[Content] Waiting for input to clear", {
      timeoutMs: CONFIG_INPUT_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    await waitFor(
      () => {
        const field = findInputField();
        if (!field) return false;
        return normalizeText(field.innerText) === "";
      },
      CONFIG_INPUT_TIMEOUT,
      CONFIG_POLL,
      t("content.error.sendDidNotClearInput")
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
      logInfo("[Content] Waiting for prompt render", {
        timeoutMs: CONFIG_INPUT_TIMEOUT,
        pollMs: CONFIG_POLL
      });
      await waitFor(
        () => {
          const candidate = getLatestUserQueryAfter();
          if (!candidate) return false;
          latestUserQuery = candidate;
          return true;
        },
        CONFIG_INPUT_TIMEOUT,
        CONFIG_POLL,
        t("content.error.timeoutPromptRender")
      );
    } catch {
      logWarn("[Content] Prompt render wait timed out", {
        timeoutMs: CONFIG_INPUT_TIMEOUT
      });
    }

    let latestConversationContainer: HTMLElement | null = null;
    let hasNewConversationContainer = false;
    try {
      logInfo("[Content] Waiting for conversation container", {
        timeoutMs: CONFIG_INPUT_TIMEOUT,
        pollMs: CONFIG_POLL
      });
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
        CONFIG_INPUT_TIMEOUT,
        CONFIG_POLL,
        t("content.error.timeoutConversationContainer")
      );
    } catch {
      const containers = document.querySelectorAll(".conversation-container");
      if (containers.length > initialConversationCount) {
        latestConversationContainer =
          containers[containers.length - 1] as HTMLElement;
        hasNewConversationContainer = true;
        logWarn("[Content] Conversation container wait timed out", {
          timeoutMs: CONFIG_INPUT_TIMEOUT
        });
      } else {
        latestConversationContainer = null;
        logWarn("[Content] Conversation container wait timed out", {
          timeoutMs: CONFIG_INPUT_TIMEOUT
        });
      }
    }

    const namedUserQuery: Element | null =
      findUserQueryByPromptText(promptAnchorText) ||
      findUserQueryByPromptText(composedPrompt);
    let promptAnchor: Element | null =
      userQueryMatchesPrompt(latestUserQuery, promptAnchorText, composedPrompt)
        ? latestUserQuery
        : null;
    promptAnchor = promptAnchor ?? namedUserQuery;
    if (
      promptAnchor &&
      lastUserQueryBeforeSend &&
      !(
        lastUserQueryBeforeSend.compareDocumentPosition(promptAnchor) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ) {
      promptAnchor = null;
    }
    if (!promptAnchor) {
      throw new Error(t("content.error.promptAnchorNotFound"));
    }
    let responseContainer: Element | null = getResponseContainerForAnchor(promptAnchor);
    const resolveResponseContainer = () => {
      return promptAnchor ? getResponseContainerForAnchor(promptAnchor) : null;
    };

    // 7. Wait for generation
    logInfo("[Content] Waiting for generation", {
      timeoutMs: CONFIG_GEN_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    updateStatus(t("content.status.generating"));

    let pollTick = 0;
    let latestDownloadButtons: HTMLButtonElement[] = [];
    let latestNewImages: HTMLImageElement[] = [];
    let responseBaselineSrcs = new Set<string>();
    let baselineReady = false;
    
    // Track which container we're using - must be a NEW container (different ID from before send)
    let conversationMatch: { container: HTMLElement; userQuery: HTMLElement } | null = null;
    let confirmedNewContainerId: string | null = null;
    
    try {
      await waitFor(
        () => {
          pollTick += 1;
          
          // Find conversation by prompt/name - but ONLY accept containers that are NEW
          // (i.e., have a different ID than the last container before we sent the prompt)
          if (!conversationMatch || !confirmedNewContainerId) {
            const match = findConversationByPrompt(task.prompt, filename);
            if (match) {
              const matchId = match.container.id || "";
              
              // Check if this is a NEW container (different from before send)
              const isNewContainer = !lastContainerIdBeforeSend || matchId !== lastContainerIdBeforeSend;
              
              if (isNewContainer && matchId) {
                // Confirm this is our new container
                if (confirmedNewContainerId && confirmedNewContainerId !== matchId) {
                  // Container ID changed again - reset baseline
                  responseBaselineSrcs = new Set<string>();
                  baselineReady = false;
                }
                
                confirmedNewContainerId = matchId;
                conversationMatch = match;
              }
            }
          }
          
          const globalButtons = getDownloadBtns(true);
          const globalImages = getGeneratedImages().filter(
            (img) => isImageLoaded(img)
          );
          const hasNewGlobalContent =
            globalButtons.length > initialGlobalDownloadBtnCount ||
            globalImages.length > initialGlobalImageCount;
          const resolvedContainer = resolveResponseContainer();
          if (resolvedContainer && resolvedContainer !== responseContainer) {
            responseContainer = resolvedContainer;
            responseBaselineSrcs = new Set<string>();
            baselineReady = false;
          }
          if (responseContainer && !responseContainer.isConnected) {
            responseContainer = null;
          }
          
          // Prefer conversation container found by prompt/name
          const targetContainer = conversationMatch?.container || responseContainer;
          
          if (!targetContainer) {
            return false;
          }
          if (!baselineReady) {
            getGeneratedImageCandidates(targetContainer).forEach((img) => {
              const src = getImageSrc(img);
              if (src) responseBaselineSrcs.add(src);
            });
            baselineReady = true;
          }
          const responseState = getResponseReadyState(targetContainer);
          if (!responseState.ready) {
            return false;
          }
          
          // Use new helper to get loaded images in container
          const loadedImages = getLoadedImagesInContainer(targetContainer);
          
          let scopedButtons: HTMLButtonElement[] = [];
          let scopedImageCandidates: HTMLImageElement[] = [];
          let scopedVisibleImages: HTMLImageElement[] = [];
          let scopedLargeImages: HTMLImageElement[] = [];
          let scopedImages: HTMLImageElement[] = [];
          let scopedLoadedImages: HTMLImageElement[] = [];
          scopedButtons = getDownloadButtonsInContainer(targetContainer, true);
          scopedImageCandidates = getGeneratedImageCandidates(targetContainer);
          scopedVisibleImages = scopedImageCandidates.filter((img) => isVisible(img));
          scopedLargeImages = scopedVisibleImages.filter((img) => img.width > 100);
          scopedImages = scopedLargeImages.filter(
            (img) => isImageLoaded(img)
          );
          scopedLoadedImages = scopedImageCandidates.filter(
            (img) => isImageLoaded(img) && img.naturalWidth > 100
          );
          latestDownloadButtons = scopedButtons;
          const newImages = scopedImages.filter((img) => {
            const src = getImageSrc(img);
            return src && !responseBaselineSrcs.has(src);
          });
          const hasNewImage =
            newImages.length > 0 ||
            (responseBaselineSrcs.size === 0 && scopedLoadedImages.length > 0) ||
            loadedImages.length > 0;
          latestNewImages = newImages.length > 0 ? newImages : loadedImages;
          
          // Also try to get download button via new helper
          const directDownloadBtn = getDownloadButtonInConversation(targetContainer);
          if (directDownloadBtn && !scopedButtons.includes(directDownloadBtn)) {
            scopedButtons.push(directDownloadBtn);
            latestDownloadButtons = scopedButtons;
          }
          
          if (scopedButtons.length > 0 && hasNewImage) {
            latestDownloadButtons = scopedButtons;
            // Update responseContainer for later use
            if (conversationMatch) {
              responseContainer = conversationMatch.container;
            }
            return true;
          }
          return false;
        },
        CONFIG_GEN_TIMEOUT,
        CONFIG_POLL,
        t("content.error.timeoutDownloadButton")
      );
    } catch (err) {
      const stopBtn = getStopButton();
      if (stopBtn && isButtonEnabled(stopBtn)) {
        stopBtn.click();
        await wait(Math.max(200, CONFIG_STEP_DELAY));
      }
      throw err;
    }

    logInfo("[Content] Generation complete, waiting before download", {
      sleepMs: CONFIG_STEP_DELAY * 2
    });
    await wait(CONFIG_STEP_DELAY * 2); // Stability wait

    // 8. Download
    currentPhase = "download";
    await performDownload({
      filename,
      responseContainer,
      latestDownloadButtons,
      latestNewImages
    });

    logInfo(`[Content] Task complete: ${task.name}`);
    updateStatus(
      t("content.status.complete", {
        name: task.name
      })
    );
    runtimeSendMessage<void>({ action: "TASK_COMPLETE", skipped: false });
  } catch (err) {
    const message = toErrorMessage(err);
    const errorType: TaskErrorType =
      err instanceof TaskError
        ? err.errorType
        : isFolderAuthErrorMessage(message)
          ? "folder"
          : currentPhase === "download"
            ? "download"
            : "generation";
    logError("[Content] Error", { message, errorType });
    updateStatus(
      t("content.status.error", {
        message
      }),
      true
    );
    runtimeSendMessage<void>({
      action: "TASK_ERROR",
      error: message,
      errorType
    });
  }
})();

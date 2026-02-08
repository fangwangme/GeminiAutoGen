import type { TaskItem } from "./types.js";
import {
  applyI18n,
  createTranslator,
  DEFAULT_LANGUAGE,
  getStoredLanguage,
  Language,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage
} from "./i18n.js";
import {
  urlsMatch,
  validateLockedConversationUrl
} from "./utils/lockedConversation.js";
import { buildPendingTaskQueue, toSafeTaskFilename } from "./utils/taskQueue.js";
import { decideTaskErrorOutcome } from "./utils/retryPolicy.js";

const formatLogTimestamp = () => new Date().toISOString();
const attachConsoleTimestamps = () => {
  const levels: Array<"log" | "warn" | "error"> = ["log", "warn", "error"];
  levels.forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(`[${formatLogTimestamp()}]`, ...args);
    };
  });
};
attachConsoleTimestamps();

const LOG_COLLAPSED_STORAGE_KEY = "logCollapsed";

let currentLanguage: Language = DEFAULT_LANGUAGE;
let t = createTranslator(currentLanguage);
let logPanel: HTMLDivElement | null = null;
let logToggleBtn: HTMLButtonElement | null = null;
let logOutputEl: HTMLDivElement | null = null;
let logCollapsed = false;

const updateLogToggleLabel = () => {
  const label = logCollapsed
    ? t("sidepanel.log.toggle.show")
    : t("sidepanel.log.toggle.hide");
  const button = logToggleBtn as HTMLButtonElement | null;
  if (button) {
    button.textContent = label;
  }
};

const applyLogCollapsed = (collapsed: boolean) => {
  logCollapsed = collapsed;
  if (logPanel) {
    logPanel.classList.toggle("is-collapsed", logCollapsed);
  }
  const output = logOutputEl as HTMLDivElement | null;
  if (output) {
    output.style.display = "";
  }
  updateLogToggleLabel();
};

const applyLanguage = (language: Language) => {
  currentLanguage = language;
  t = createTranslator(currentLanguage);
  applyI18n(document, t);
  document.title = t("sidepanel.documentTitle");
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  updateLogToggleLabel();
};

type PanelMessage =
  | { action: "TASK_COMPLETE"; skipped?: boolean }
  | { action: "TASK_ERROR"; error: string; errorType?: TaskErrorType }
  | { action: "UPDATE_STATUS"; status: string; isError?: boolean }
  | {
      action: "PANEL_LOG";
      level: "log" | "warn" | "error";
      message: string;
      data?: unknown;
      source?: string;
      timestamp: string;
    };

type TaskErrorType = "generation" | "download" | "folder" | "locked-url";
type TaskRunMode = "full" | "download-only";

type PanelBackgroundMessage =
  | { action: "OPEN_OPTIONS" }
  | { action: "LIST_ALL_FILES" }
  | { action: "RESET_STATE" };

type ListFilesResponse = {
  files?: string[];
};

type ScriptInjection = chrome.scripting.ScriptInjection<unknown[], unknown>;
type InjectionResult = chrome.scripting.InjectionResult<unknown>;

const storageGet = <T,>(keys: string[]): Promise<T> =>
  chrome.storage.local.get(keys) as unknown as Promise<T>;

const storageSet = (items: Record<string, unknown>): Promise<void> =>
  chrome.storage.local.set(items) as unknown as Promise<void>;

const storageRemove = (keys: string | string[]): Promise<void> =>
  chrome.storage.local.remove(keys) as unknown as Promise<void>;

const storageClear = (): Promise<void> =>
  chrome.storage.local.clear() as unknown as Promise<void>;

const runtimeSendMessage = <T,>(
  message: PanelMessage | PanelBackgroundMessage
): Promise<T> => chrome.runtime.sendMessage(message) as unknown as Promise<T>;

const tabsQuery = (
  queryInfo: chrome.tabs.QueryInfo
): Promise<chrome.tabs.Tab[]> =>
  chrome.tabs.query(queryInfo) as unknown as Promise<chrome.tabs.Tab[]>;

const tabsUpdate = (
  tabId: number,
  props: chrome.tabs.UpdateProperties
): Promise<chrome.tabs.Tab> =>
  chrome.tabs.update(tabId, props) as unknown as Promise<chrome.tabs.Tab>;

const tabsCreate = (
  props: chrome.tabs.CreateProperties
): Promise<chrome.tabs.Tab> =>
  chrome.tabs.create(props) as unknown as Promise<chrome.tabs.Tab>;

const tabsGet = (tabId: number): Promise<chrome.tabs.Tab> =>
  chrome.tabs.get(tabId) as unknown as Promise<chrome.tabs.Tab>;

const tabsRemove = (tabId: number): Promise<void> =>
  chrome.tabs.remove(tabId) as unknown as Promise<void>;

const executeScript = (
  injection: ScriptInjection
): Promise<InjectionResult[]> =>
  chrome.scripting.executeScript(
    injection
  ) as unknown as Promise<InjectionResult[]>;


document.addEventListener("DOMContentLoaded", async () => {
  // UI Elements
  const jsonFileInput = document.getElementById("jsonFile") as HTMLInputElement;
  const fileInfo = document.getElementById("fileInfo") as HTMLDivElement;
  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
  const statusText = document.getElementById("statusText") as HTMLDivElement;
  const progressBar = document.getElementById("progressBar") as HTMLDivElement;
  const progressText = document.getElementById("progressText") as HTMLSpanElement;
  const elapsedTimeElement = document.getElementById(
    "elapsedTime"
  ) as HTMLSpanElement;
  const remainingTimeElement = document.getElementById(
    "remainingTime"
  ) as HTMLSpanElement;
  const settingsBtn = document.getElementById("settingsBtn") as
    | HTMLButtonElement
    | null;
  const conversationUrlInput = document.getElementById(
    "conversationUrlInput"
  ) as HTMLInputElement;
  const lockUrlBtn = document.getElementById("lockUrlBtn") as
    | HTMLButtonElement
    | null;
  const clearUrlBtn = document.getElementById("clearUrlBtn") as
    | HTMLButtonElement
    | null;
  const urlStatus = document.getElementById("urlStatus") as HTMLDivElement;
  const currentFileNameEl = document.getElementById(
    "currentFileName"
  ) as HTMLDivElement;
  const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
  const logOutput = document.getElementById("logOutput") as HTMLDivElement;
  const logCopyBtn = document.getElementById("logCopyBtn") as HTMLButtonElement;
  const logClearBtn = document.getElementById("logClearBtn") as HTMLButtonElement;
  logPanel = document.querySelector(".log-panel") as HTMLDivElement;
  logToggleBtn = document.getElementById("logToggleBtn") as HTMLButtonElement;
  logOutputEl = logOutput;

  const initLanguage = async () => {
    const storedLanguage = await getStoredLanguage();
    applyLanguage(storedLanguage);
  };

  await initLanguage();

  statusText.textContent = t("sidepanel.status.ready");
  fileInfo.textContent = t("sidepanel.file.noFile");
  urlStatus.textContent = t("sidepanel.lockedUrl.none");

  const logState = await storageGet<{ logCollapsed?: boolean }>([
    LOG_COLLAPSED_STORAGE_KEY
  ]);
  logCollapsed =
    typeof logState.logCollapsed === "boolean" ? logState.logCollapsed : true;
  applyLogCollapsed(logCollapsed);

  // State
  let loadedTasks: TaskItem[] = [];
  let taskQueue: TaskItem[] = [];
  let currentIndex = 0;
  let isRunning = false;
  let conversationUrl = "";
  let lockedConversationUrl = ""; // Locked URL from storage
  let timerInterval: number | undefined;
  let startTime = 0;
  let currentTabId: number | null = null;
  const retryCounts = new Map<number, number>();
  let lastLogTaskIndex: number | null = null;
  let skippedCount = 0;
  let failedCount = 0;
  let consecutiveFailureCount = 0;
  let nextTaskMode: TaskRunMode = "full";
  let shouldClearLogBeforeNextTask = false;

  const refreshDynamicLabels = () => {
    if (loadedTasks.length > 0) {
      fileInfo.textContent = t("sidepanel.status.loadedTasks", {
        count: loadedTasks.length
      });
      fileInfo.style.color = "var(--success)";
    } else {
      fileInfo.textContent = t("sidepanel.file.noFile");
      fileInfo.style.color = "var(--muted)";
    }

    if (!lockedConversationUrl) {
      urlStatus.textContent = t("sidepanel.lockedUrl.none");
      urlStatus.style.color = "var(--muted)";
      return;
    }

    const validation = validateLockedConversationUrl(lockedConversationUrl, t);
    if (validation.ok) {
      urlStatus.textContent = t("sidepanel.status.urlLocked");
      urlStatus.style.color = "var(--success)";
    } else {
      urlStatus.textContent = t("sidepanel.status.validationError", {
        reason: validation.message
      });
      urlStatus.style.color = "var(--danger)";
    }
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return t("time.short", { minutes, seconds });
  };

  const clearLogOutput = () => {
    if (logOutput) {
      logOutput.textContent = "";
    }
  };

  const formatLogData = (data?: unknown) => {
    if (data === undefined) return "";
    try {
      const serialized = JSON.stringify(data);
      return serialized ? ` ${serialized}` : "";
    } catch {
      return ` ${String(data)}`;
    }
  };

  const appendLogLine = (line: string) => {
    if (!logOutput) return;
    logOutput.textContent = logOutput.textContent
      ? `${logOutput.textContent}\n${line}`
      : line;
    requestAnimationFrame(() => {
      logOutput.scrollTop = logOutput.scrollHeight;
    });
  };

  // Settings Button
  if (settingsBtn) {
    settingsBtn.addEventListener("click", async () => {
      try {
        await chrome.runtime.openOptionsPage();
      } catch {
        runtimeSendMessage<void>({ action: "OPEN_OPTIONS" });
      }
    });
  } else {
    console.warn("[Panel] Settings button not found");
  }

  // Click filename to copy (without extension)
  if (currentFileNameEl) {
    currentFileNameEl.addEventListener("click", async () => {
      const text = currentFileNameEl.textContent || "";
      // Remove emoji prefix like "📷 " and file extension
      const filename = text.replace(/^[^\w]*/, "").trim();
      const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
      if (nameWithoutExt) {
        try {
          await navigator.clipboard.writeText(nameWithoutExt);
          // Brief visual feedback
          const original = currentFileNameEl.textContent;
          currentFileNameEl.textContent = t("sidepanel.currentFile.copied");
          setTimeout(() => {
            currentFileNameEl.textContent = original;
          }, 800);
        } catch (err) {
          console.error("[Panel] Failed to copy:", err);
        }
      }
    });
  }

  if (logCopyBtn) {
    logCopyBtn.addEventListener("click", async () => {
      if (!logOutput) return;
      const text = logOutput.textContent || "";
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        const originalText = logCopyBtn.textContent;
        logCopyBtn.textContent = t("sidepanel.currentFile.copied");
        setTimeout(() => {
          logCopyBtn.textContent = originalText;
        }, 800);
      } catch (err) {
        console.error("[Panel] Failed to copy logs:", err);
      }
    });
  }

  if (logClearBtn) {
    logClearBtn.addEventListener("click", () => {
      clearLogOutput();
    });
  }

  if (logToggleBtn) {
    logToggleBtn.addEventListener("click", async () => {
      applyLogCollapsed(!logCollapsed);
      await storageSet({ [LOG_COLLAPSED_STORAGE_KEY]: logCollapsed });
    });
  }

  // Load saved locked URL
  const urlData = await storageGet<{ lockedConversationUrl?: string }>([
    "lockedConversationUrl"
  ]);
  if (urlData.lockedConversationUrl) {
    const candidate = urlData.lockedConversationUrl.trim();
    const validation = validateLockedConversationUrl(candidate, t);
    conversationUrlInput.value = candidate;
    if (validation.ok) {
      lockedConversationUrl = candidate;
      urlStatus.textContent = t("sidepanel.status.urlLocked");
      urlStatus.style.color = "var(--success)";
    } else {
      lockedConversationUrl = "";
      urlStatus.textContent = t("sidepanel.status.validationError", {
        reason: validation.message
      });
      urlStatus.style.color = "var(--danger)";
    }
  }

  // Load saved tasks
  const data = await storageGet<{ loadedTasks?: TaskItem[] }>(["loadedTasks"]);
  if (data.loadedTasks) {
    loadedTasks = data.loadedTasks;
    fileInfo.textContent = t("sidepanel.status.loadedTasks", {
      count: loadedTasks.length
    });
    fileInfo.style.color = "var(--success)";
  }

  // Lock URL Button
  if (lockUrlBtn) {
    lockUrlBtn.addEventListener("click", async () => {
      if (!conversationUrlInput || !urlStatus) return;
      const url = conversationUrlInput.value.trim();
      if (!url) {
        urlStatus.textContent = t("sidepanel.status.urlEnter");
        urlStatus.style.color = "var(--danger)";
        return;
      }
      const validation = validateLockedConversationUrl(url, t);
      if (!validation.ok) {
        urlStatus.textContent = t("sidepanel.status.validationError", {
          reason: validation.message
        });
        urlStatus.style.color = "var(--danger)";
        return;
      }
      lockedConversationUrl = url;
      try {
        await storageSet({ lockedConversationUrl: url });
        urlStatus.textContent = t("sidepanel.status.urlLocked");
        urlStatus.style.color = "var(--success)";
        console.log(`[Panel] Locked conversation URL: ${url}`);
      } catch (err) {
        urlStatus.textContent = t("sidepanel.status.urlSaveFailed");
        urlStatus.style.color = "var(--danger)";
        console.error("[Panel] Failed to lock URL:", err);
      }
    });
  } else {
    console.warn("[Panel] Lock URL button not found");
  }

  // Clear URL Button
  if (clearUrlBtn) {
    clearUrlBtn.addEventListener("click", async () => {
      if (!conversationUrlInput || !urlStatus) return;
      lockedConversationUrl = "";
      conversationUrlInput.value = "";
      try {
        await storageRemove("lockedConversationUrl");
        urlStatus.textContent = t("sidepanel.lockedUrl.none");
        urlStatus.style.color = "var(--muted)";
        console.log("[Panel] Conversation URL lock cleared");
      } catch (err) {
        urlStatus.textContent = t("sidepanel.status.urlClearFailed");
        urlStatus.style.color = "var(--danger)";
        console.error("[Panel] Failed to clear URL:", err);
      }
    });
  } else {
    console.warn("[Panel] Clear URL button not found");
  }

  // JSON File Upload
  jsonFileInput.addEventListener("change", (event: Event) => {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) {
      loadedTasks = [];
      fileInfo.textContent = t("sidepanel.file.noFile");
      fileInfo.style.color = "var(--muted)";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result;
        const rawText = typeof result === "string" ? result : "";
        const json = JSON.parse(rawText) as unknown;
        if (Array.isArray(json)) {
          loadedTasks = json as TaskItem[];
          fileInfo.textContent = t("sidepanel.status.loadedTasks", {
            count: json.length
          });
          fileInfo.style.color = "var(--success)";
          void storageSet({ loadedTasks: json });
        } else {
          throw new Error("File must contain an array");
        }
      } catch {
        fileInfo.textContent = t("sidepanel.status.errorInvalidJson");
        fileInfo.style.color = "var(--danger)";
        loadedTasks = [];
      }
    };
    reader.readAsText(file);
  });

  // START Button
  startBtn.addEventListener("click", async () => {
    const storedUrl = await storageGet<{ lockedConversationUrl?: string }>([
      "lockedConversationUrl"
    ]);
    const lockedCandidate = storedUrl.lockedConversationUrl?.trim() || "";
    if (!lockedCandidate) {
      statusText.textContent = t("sidepanel.status.lockUrlFirst");
      statusText.style.color = "var(--danger)";
      return;
    }
    const lockedValidation = validateLockedConversationUrl(lockedCandidate, t);
    if (!lockedValidation.ok) {
      statusText.textContent = t("sidepanel.status.lockedUrlInvalid", {
        reason: lockedValidation.message
      });
      statusText.style.color = "var(--danger)";
      return;
    }
    lockedConversationUrl = lockedCandidate;

    if (loadedTasks.length === 0) {
      statusText.textContent = t("sidepanel.status.uploadJson");
      statusText.style.color = "var(--danger)";
      return;
    }

    // Use locked URL only
    conversationUrl = lockedConversationUrl;
    console.log(`[Panel] Using locked conversation URL: ${conversationUrl}`);

    const stepSettings = await storageGet<{
      settings_stepDelay?: number;
      settings_pageLoadTimeout?: number;
    }>(["settings_stepDelay", "settings_pageLoadTimeout"]);
    const pageLoadTimeoutMs = (stepSettings.settings_pageLoadTimeout || 30) * 1000;
    const rawStepDelay = stepSettings.settings_stepDelay;
    const normalizedStepDelay =
      rawStepDelay && rawStepDelay > 60 ? rawStepDelay / 1000 : rawStepDelay;
    const tabReadyDelayMs = (normalizedStepDelay || 1) * 2 * 1000;

    // Get or create tab for the locked URL
    const existingTab = (await tabsQuery({ currentWindow: true })).find(
      (tab) =>
        typeof tab.id === "number" &&
        typeof tab.url === "string" &&
        urlsMatch(conversationUrl, tab.url)
    );

    if (existingTab && typeof existingTab.id === "number") {
      currentTabId = existingTab.id;
      await tabsUpdate(currentTabId, { active: true });
      if (existingTab.status === "loading") {
        await waitForPageLoad(currentTabId, pageLoadTimeoutMs);
        await new Promise((r) => setTimeout(r, tabReadyDelayMs));
      }
    } else {
      // Create new tab with locked URL
      const newTab = await tabsCreate({ url: conversationUrl });
      currentTabId = newTab.id ?? null;
      if (currentTabId) {
        await waitForPageLoad(currentTabId, pageLoadTimeoutMs);
        await new Promise((r) => setTimeout(r, tabReadyDelayMs));
      }
    }

    if (!currentTabId) {
      statusText.textContent = t("sidepanel.status.failedToOpenTab");
      statusText.style.color = "var(--danger)";
      return;
    }

    const lockOk = await ensureLockedConversationTab(
      currentTabId,
      pageLoadTimeoutMs,
      normalizedStepDelay,
      "start"
    );
    if (!lockOk) {
      return;
    }

    // Pre-scan for existing files
    statusText.textContent = t("sidepanel.status.checkingExisting");
    let existingFiles = new Set<string>();
    try {
      const response = await runtimeSendMessage<ListFilesResponse>({
        action: "LIST_ALL_FILES"
      });
      existingFiles = new Set(response.files || []);
    } catch (err) {
      console.warn(
        "Could not list existing files (background might be restarting):",
        err
      );
      // Proceed without skipping (safer fallback)
    }

    // Filter queue
    taskQueue = buildPendingTaskQueue(loadedTasks, existingFiles);

    const skipped = loadedTasks.length - taskQueue.length;
    if (skipped > 0) {
      statusText.textContent = t("sidepanel.status.skippedExisting", {
        count: skipped
      });
    }

    if (taskQueue.length === 0) {
      statusText.textContent = t("sidepanel.status.allTasksCompleted");
      statusText.style.color = "var(--success)";
      return;
    }

    // Start
    currentIndex = 0;
    retryCounts.clear();
    skippedCount = 0;
    failedCount = 0;
    consecutiveFailureCount = 0;
    nextTaskMode = "full";
    isRunning = true;
    
    clearLogOutput();
    appendLogLine(t("sidepanel.log.starting"));
    if (skipped > 0) {
      appendLogLine(t("sidepanel.status.skippedExisting", { count: skipped }));
    }
    appendLogLine(t("sidepanel.status.taskProgress", { current: 1, total: taskQueue.length }));

    updateUI(true);
    startTimer();

    processNextTask();
  });

  // STOP Button
  stopBtn.addEventListener("click", () => {
    isRunning = false;
    retryCounts.clear();
    skippedCount = 0;
    failedCount = 0;
    consecutiveFailureCount = 0;
    nextTaskMode = "full";
    stopTimer();
    updateUI(false);
    statusText.textContent = t("sidepanel.status.stoppedByUser");
    statusText.style.color = "var(--danger)";
  });

  // RESET Button - Clear all state
  resetBtn.addEventListener("click", async () => {
    // Stop any running tasks
    isRunning = false;
    stopTimer();

    // Clear local state
    loadedTasks = [];
    taskQueue = [];
    currentIndex = 0;
    conversationUrl = "";
    currentTabId = null;
    retryCounts.clear();
    skippedCount = 0;
    lockedConversationUrl = ""; // Clear locked URL from memory

    // Clear storage (includes lockedConversationUrl)
    await storageClear();

    // Reset background state
    await runtimeSendMessage<void>({ action: "RESET_STATE" });

    // Reset UI
    fileInfo.textContent = t("sidepanel.file.noFile");
    fileInfo.style.color = "var(--muted)";
    progressBar.style.width = "0%";
    progressText.textContent = "0/0";
    elapsedTimeElement.textContent = t("time.short", { minutes: 0, seconds: 0 });
    remainingTimeElement.textContent = t("time.unknown");
    statusText.textContent = t("sidepanel.status.resetComplete");
    statusText.style.color = "var(--success)";
    currentFileNameEl.textContent = "";
    jsonFileInput.value = "";

    // Clear locked URL UI
    conversationUrlInput.value = "";
    urlStatus.textContent = "";

    updateUI(false);
    console.log("[Panel] Reset complete (including locked URL)");
  });

  // Process next task
  async function processNextTask() {
    if (!isRunning) return;

    if (currentIndex >= taskQueue.length) {
      // All done
      isRunning = false;
      stopTimer();
      updateUI(false);
      statusText.textContent = t("sidepanel.status.allTasksCompleted");
      statusText.style.color = "var(--success)";
      progressBar.style.width = "100%";
      currentFileNameEl.textContent = "";
      const elapsedMs = Date.now() - startTime;
      const totalTasks = taskQueue.length;
      const completedCount = Math.max(totalTasks - skippedCount - failedCount, 0);
      const averageMs = totalTasks > 0 ? Math.round(elapsedMs / totalTasks) : 0;
      appendLogLine(t("sidepanel.log.summaryTitle"));
      appendLogLine(
        t("sidepanel.log.summary.total", {
          count: totalTasks
        })
      );
      appendLogLine(
        t("sidepanel.log.summary.completed", {
          count: completedCount
        })
      );
      appendLogLine(
        t("sidepanel.log.summary.skipped", {
          count: skippedCount
        })
      );
      appendLogLine(
        t("sidepanel.log.summary.failed", {
          count: failedCount
        })
      );
      appendLogLine(
        t("sidepanel.log.summary.totalTime", {
          time: formatDuration(elapsedMs)
        })
      );
      appendLogLine(
        t("sidepanel.log.summary.avgPerTask", {
          time: formatDuration(averageMs)
        })
      );
      return;
    }

    const task = taskQueue[currentIndex];
    const taskMode = nextTaskMode;
    nextTaskMode = "full";
    lastLogTaskIndex = currentIndex;
    
    const total = taskQueue.length;

    // Get safe filename for display
    const displayName = toSafeTaskFilename(task.name);

    // Update progress
    progressText.textContent = t("sidepanel.status.taskProgress", {
      current: currentIndex + 1,
      total
    });
    progressBar.style.width = `${((currentIndex + 1) / total) * 100}%`;
    statusText.textContent =
      taskMode === "download-only"
        ? t("sidepanel.status.retryingDownload")
        : t("sidepanel.status.generating");
    statusText.style.color = "var(--text)";
    currentFileNameEl.textContent = t("sidepanel.currentFile", {
      name: displayName
    });

    // Save current task to storage
    await storageSet({ currentTask: task, currentTaskMode: taskMode });

    if (!currentTabId) {
      statusText.textContent = t("sidepanel.status.noActiveTab");
      statusText.style.color = "var(--danger)";
      isRunning = false;
      updateUI(false);
      return;
    }

    // Inject content script
    console.log(`[Panel] Injecting script for task ${currentIndex + 1}`);
    try {
      await executeScript({
        target: { tabId: currentTabId },
        files: ["content.js"]
      });
    } catch (err) {
      console.error("[Panel] Injection failed:", err);
      statusText.textContent = t("sidepanel.status.refreshGemini");
      statusText.style.color = "var(--danger)";
      isRunning = false;
      updateUI(false);
    }
  }

  async function handleTaskError(error: string, errorType?: TaskErrorType) {
    console.error(`[Panel] Task error: ${error}`);
    if (!isRunning) return;

    const settings = await storageGet<{
      settings_maxRetries?: number;
      settings_maxConsecutiveFailures?: number;
    }>(["settings_maxRetries", "settings_maxConsecutiveFailures"]);
    const maxRetries = Math.max(0, settings.settings_maxRetries ?? 3);
    const maxConsecutiveFailures = Math.max(
      0,
      settings.settings_maxConsecutiveFailures ?? 5
    );
    const currentRetries = retryCounts.get(currentIndex) ?? 0;
    const decision = decideTaskErrorOutcome({
      error,
      errorType,
      currentRetries,
      maxRetries,
      consecutiveFailureCount,
      maxConsecutiveFailures
    });
    const resolvedErrorType = decision.resolvedErrorType;

    if (decision.action === "stop-locked-url") {
      statusText.textContent = error || t("sidepanel.status.lockedUrlError");
      statusText.style.color = "var(--danger)";
      appendLogLine(`Locked URL error - stopped: ${error}`);
      isRunning = false;
      stopTimer();
      updateUI(false);
      const storedUrl = await storageGet<{ lockedConversationUrl?: string }>([
        "lockedConversationUrl"
      ]);
      const targetUrl = storedUrl.lockedConversationUrl || lockedConversationUrl;
      if (targetUrl) {
        conversationUrl = targetUrl;
        try {
          const newTab = await tabsCreate({ url: targetUrl, active: true });
          currentTabId = newTab.id ?? null;
        } catch (err) {
          console.warn("[Panel] Failed to open locked URL tab:", err);
        }
      }
      return;
    }

    if (decision.action === "stop-folder") {
      statusText.textContent = t("sidepanel.status.folderAccessError", {
        error
      });
      statusText.style.color = "var(--danger)";
      appendLogLine(`Folder access error - stopped: ${error}`);
      isRunning = false;
      stopTimer();
      updateUI(false);
      return;
    }

    if (decision.action === "retry-download" || decision.action === "retry-full") {
      const nextRetry = decision.nextRetryCount;
      retryCounts.set(currentIndex, nextRetry);
      const retryLabel =
        decision.action === "retry-download"
          ? t("sidepanel.status.retryingDownloadShort")
          : t("sidepanel.status.retrying");
      statusText.textContent = t("sidepanel.status.retryingWithCount", {
        label: retryLabel,
        current: nextRetry,
        max: maxRetries
      });
      statusText.style.color = "var(--warning)";
      if (decision.action === "retry-download") {
        nextTaskMode = "download-only";
        void processNextTask();
      } else {
        nextTaskMode = "full";
        recreateTab();
      }
      return;
    }

    retryCounts.delete(currentIndex);
    if (decision.shouldIncrementFailedCount) {
      failedCount += 1;
    }
    consecutiveFailureCount = decision.nextConsecutiveFailureCount;
    appendLogLine(`Failed task ${currentIndex + 1} (${resolvedErrorType}): ${error}`);
    statusText.textContent = t("sidepanel.status.failed", { error });
    statusText.style.color = "var(--danger)";

    if (decision.action === "fail-stop") {
      statusText.textContent = t("sidepanel.status.stoppedAfterFailures", {
        count: consecutiveFailureCount,
        error
      });
      statusText.style.color = "var(--danger)";
      isRunning = false;
      stopTimer();
      updateUI(false);
      return;
    }

    currentIndex += 1;
    updateRemainingTime();

    if (currentIndex < taskQueue.length && isRunning) {
      nextTaskMode = "full";
      recreateTab();
    } else {
      void processNextTask();
    }
  }

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request: PanelMessage) => {
    if (request.action === "TASK_COMPLETE") {
      console.log(
        `[Panel] Task ${currentIndex + 1} complete (skipped: ${
          request.skipped
        })`
      );
      retryCounts.delete(currentIndex);
      if (request.skipped) {
        skippedCount += 1;
      }
      consecutiveFailureCount = 0;
      shouldClearLogBeforeNextTask = true;
      currentIndex++;

      // Update remaining time estimate after each task completes
      updateRemainingTime();

      if (currentIndex < taskQueue.length && isRunning) {
        // Recreate tab for next task
        recreateTab();
      } else {
        // All done
        processNextTask();
      }
    }

    if (request.action === "TASK_ERROR") {
      void handleTaskError(request.error, request.errorType);
    }

    if (request.action === "UPDATE_STATUS") {
      statusText.textContent = request.status;
      statusText.style.color = request.isError
        ? "var(--danger)"
        : "var(--text)";
    }

    if (request.action === "PANEL_LOG") {
      const sourceTag = request.source ? `[${request.source}] ` : "";
      const levelTag = request.level ? `[${request.level}] ` : "";
      const dataText = formatLogData(request.data);
      appendLogLine(
        `[${request.timestamp}] ${sourceTag}${levelTag}${request.message}${dataText}`
      );
    }
  });

  const shouldCreatePlaceholder = (tabsCount: number): boolean => {
    return tabsCount <= 1;
  };

  // Recreate tab: close old tab, open new one
  async function recreateTab() {
    console.log("[Panel] Recreating tab...");
    statusText.textContent = t("sidepanel.status.resettingBrowserContext");

    // Get Settings
    const settings = await storageGet<{
      settings_taskInterval?: number;
      settings_pageLoadTimeout?: number;
      settings_stepDelay?: number;
    }>(["settings_taskInterval", "settings_pageLoadTimeout", "settings_stepDelay"]);
    const taskInterval = (settings.settings_taskInterval || 5) * 1000;
    const pageLoadTimeout = (settings.settings_pageLoadTimeout || 30) * 1000;

    // Close current tab with window protection
    if (currentTabId) {
      try {
        const tab = await tabsGet(currentTabId);
        const windowTabs = await tabsQuery({ windowId: tab.windowId });
        
        // If this is the last tab in the window, create a placeholder first
        if (shouldCreatePlaceholder(windowTabs.length)) {
          console.log("[Panel] Last tab in window, creating placeholder...");
          await tabsCreate({ windowId: tab.windowId, active: false, url: "about:blank" });
        }
        
        await tabsRemove(currentTabId);
      } catch (err) {
        console.log("[Panel] Tab already closed or window error:", err);
      }
    }

    // Wait for Task Interval (User Setting)
    await new Promise((r) => setTimeout(r, taskInterval));

    if (!isRunning) return;

    // Open new tab
    console.log(`[Panel] Opening new tab: ${conversationUrl}`);
    const newTab = await tabsCreate({ url: conversationUrl });
    currentTabId = newTab.id ?? null;

    if (!currentTabId) {
      statusText.textContent = t("sidepanel.status.errorCreateTab");
      statusText.style.color = "var(--danger)";
      isRunning = false;
      updateUI(false);
      return;
    }

    // Wait for page load
    await waitForPageLoad(currentTabId, pageLoadTimeout);

    // Extra wait for Gemini to initialize
    const rawStepDelay = settings.settings_stepDelay;
    const normalizedStepDelay =
      rawStepDelay && rawStepDelay > 60 ? rawStepDelay / 1000 : rawStepDelay;
    const tabReadyDelayMs = (normalizedStepDelay || 1) * 2 * 1000;
    await new Promise((r) => setTimeout(r, tabReadyDelayMs));

    if (lockedConversationUrl) {
      const lockOk = await ensureLockedConversationTab(
        currentTabId,
        pageLoadTimeout,
        normalizedStepDelay,
        "new tab"
      );
      if (!lockOk || !isRunning) return;
    }

    if (!isRunning) return;

    if (shouldClearLogBeforeNextTask) {
      clearLogOutput();
      shouldClearLogBeforeNextTask = false;
    }

    // Process next task
    processNextTask();
  }

  // Wait for page to finish loading
  async function waitForPageLoad(tabId: number, timeoutMs: number) {
    console.log(`[Panel] Waiting for tab ${tabId} to load...`);
    const start = Date.now();

    // 1. Immediate check
    try {
      const tab = await tabsGet(tabId);
      if (tab.status === "complete") {
        console.log(`[Panel] Tab ${tabId} already complete.`);
        return;
      }
    } catch (err) {
      console.warn("[Panel] Failed to check tab status immediately:", err);
    }

    // 2. Listener and Polling fallback
    return new Promise<void>((resolve) => {
      let resolved = false;

      const done = (reason: string) => {
        if (resolved) return;
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearInterval(pollInterval);
        console.log(`[Panel] Tab ${tabId} load finished (${reason})`);
        resolve();
      };

      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          done("event");
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Polling fallback every 1s
      const pollInterval = setInterval(async () => {
        try {
          const tab = await tabsGet(tabId);
          if (tab.status === "complete") {
            done("polling");
          }
        } catch {
          done("error-polling");
        }
      }, 1000);

      // Timeout fallback
      setTimeout(() => {
        done("timeout");
      }, timeoutMs);
    });
  }

  async function ensureLockedConversationTab(
    tabId: number,
    pageLoadTimeout: number,
    normalizedStepDelay: number | undefined,
    reason: string
  ) {
    if (!lockedConversationUrl) return true;
    try {
      const tab = await tabsGet(tabId);
      const currentUrl = tab.url || "";
      if (currentUrl && urlsMatch(lockedConversationUrl, currentUrl)) {
        return true;
      }
      console.warn(
        `[Panel] Locked URL mismatch (${reason}). Expected ${lockedConversationUrl}, got ${currentUrl}`
      );
      statusText.textContent = t("sidepanel.status.lockedUrlMismatch");
      statusText.style.color = "var(--warning)";

      if (currentTabId) {
        try {
          await tabsRemove(currentTabId);
        } catch (err) {
          console.log("[Panel] Tab already closed:", err);
        }
      }

      const freshTab = await tabsCreate({ url: lockedConversationUrl });
      currentTabId = freshTab.id ?? null;

      if (!currentTabId) {
        statusText.textContent = t("sidepanel.status.errorCreateTab");
        statusText.style.color = "var(--danger)";
        isRunning = false;
        updateUI(false);
        return false;
      }

      await waitForPageLoad(currentTabId, pageLoadTimeout);
      const tabReadyDelayMs = (normalizedStepDelay || 1) * 2 * 1000;
      await new Promise((r) => setTimeout(r, tabReadyDelayMs));
      return true;
    } catch (err) {
      console.warn("[Panel] Failed to validate locked URL:", err);
      return true;
    }
  }

  // UI Helpers
  function updateUI(running: boolean) {
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    jsonFileInput.disabled = running;
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return t("time.short", { minutes: m, seconds: s });
  }

  function startTimer() {
    startTime = Date.now();
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    // Only update elapsed time every second (remaining time is updated only when tasks complete)
    timerInterval = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      elapsedTimeElement.textContent = formatTime(elapsedSeconds);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = undefined;
    }
  }

  // Update remaining time estimate (called when a task completes)
  function updateRemainingTime() {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const completedTasks = currentIndex;
    const totalTasks = taskQueue.length;

    if (completedTasks > 0 && totalTasks > completedTasks) {
      const avgSecondsPerTask = elapsedSeconds / completedTasks;
      const remainingTasks = totalTasks - completedTasks;
      const remainingSeconds = Math.floor(avgSecondsPerTask * remainingTasks);
      const avgSeconds = Math.round(avgSecondsPerTask);
      remainingTimeElement.textContent = t("time.remainingWithAvg", {
        remaining: formatTime(remainingSeconds),
        avg: avgSeconds
      });
    } else if (totalTasks === completedTasks && totalTasks > 0) {
      const avgSeconds = Math.round(elapsedSeconds / totalTasks);
      remainingTimeElement.textContent = t("time.remainingWithAvg", {
        remaining: formatTime(0),
        avg: avgSeconds
      });
    } else {
      remainingTimeElement.textContent = t("time.unknown");
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[LANGUAGE_STORAGE_KEY]) {
      const nextLanguage = normalizeLanguage(
        changes[LANGUAGE_STORAGE_KEY].newValue as string | undefined
      );
      if (nextLanguage !== currentLanguage) {
        applyLanguage(nextLanguage);
        refreshDynamicLabels();
      }
    }
    if (changes[LOG_COLLAPSED_STORAGE_KEY]) {
      applyLogCollapsed(Boolean(changes[LOG_COLLAPSED_STORAGE_KEY].newValue));
    }
  });
});

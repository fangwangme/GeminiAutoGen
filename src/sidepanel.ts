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
  validateLockedConversationUrl
} from "./utils/lockedConversation.js";
import { attachConsoleTimestamps } from "./sidepanel/consoleTimestamp.js";
import {
  executeScript,
  runtimeSendMessage,
  storageClear,
  storageGet,
  storageRemove,
  storageSet,
  tabsCreate,
  tabsGet,
  tabsQuery,
  tabsRemove,
  tabsUpdate
} from "./sidepanel/chromeApi.js";
import {
  ensureLockedConversationTab as ensureLockedConversationTabHelper,
  waitForPageLoad as waitForPageLoadHelper
} from "./sidepanel/tabHelpers.js";
import { createLogView } from "./sidepanel/logView.js";
import {
  PanelMessage,
  TaskRunMode
} from "./sidepanel/panelTypes.js";
import { restoreInitialState } from "./sidepanel/initState.js";
import { updateRemainingTimeLabel } from "./sidepanel/remainingTime.js";
import { bindResetControl, bindStopControl } from "./sidepanel/runControls.js";
import {
  createTaskLifecycle,
  TaskLifecycleState
} from "./sidepanel/taskLifecycle.js";
import { startRun } from "./sidepanel/startRun.js";
import { bindUrlLockControls } from "./sidepanel/urlLock.js";
import {
  bindCurrentFileCopy,
  bindJsonFileUpload,
  bindLogControls,
  bindSettingsButton
} from "./sidepanel/uiBindings.js";
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
  let timerInterval: number | undefined;
  const runState: TaskLifecycleState = {
    taskQueue: [],
    currentIndex: 0,
    isRunning: false,
    conversationUrl: "",
    lockedConversationUrl: "",
    startTime: 0,
    currentTabId: null,
    retryCounts: new Map<number, number>(),
    lastLogTaskIndex: null,
    skippedCount: 0,
    failedCount: 0,
    consecutiveFailureCount: 0,
    nextTaskMode: "full" as TaskRunMode,
    shouldClearLogBeforeNextTask: false
  };

  const waitForPageLoad = (tabId: number, timeoutMs: number) =>
    waitForPageLoadHelper(tabId, timeoutMs, tabsGet);

  const ensureLockedConversationTab = (
    tabId: number,
    pageLoadTimeout: number,
    normalizedStepDelay: number | undefined,
    reason: string
  ) =>
    ensureLockedConversationTabHelper({
      tabId,
      pageLoadTimeout,
      normalizedStepDelay,
      reason,
      lockedConversationUrl: runState.lockedConversationUrl,
      t,
      tabsGet,
      tabsCreate,
      tabsRemove,
      setCurrentTabId: (id) => {
        runState.currentTabId = id;
      },
      getCurrentTabId: () => runState.currentTabId,
      setIsRunning: (running) => {
        runState.isRunning = running;
      },
      updateUI,
      setStatus: (text, color) => {
        statusText.textContent = text;
        statusText.style.color = color;
      },
      waitForPageLoad
    });

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

    if (!runState.lockedConversationUrl) {
      urlStatus.textContent = t("sidepanel.lockedUrl.none");
      urlStatus.style.color = "var(--muted)";
      return;
    }

    const validation = validateLockedConversationUrl(runState.lockedConversationUrl, t);
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

  const { clearLogOutput, formatLogData, appendLogLine } = createLogView(logOutput);

  bindSettingsButton(settingsBtn, runtimeSendMessage);
  bindCurrentFileCopy({
    currentFileNameEl,
    copiedLabel: () => t("sidepanel.currentFile.copied")
  });
  bindLogControls({
    logCopyBtn,
    logClearBtn,
    logToggleBtn,
    logOutput,
    clearLogOutput,
    applyLogCollapsed,
    getLogCollapsed: () => logCollapsed,
    setLogCollapsed: (collapsed) => {
      logCollapsed = collapsed;
    },
    storageSet,
    logCollapsedStorageKey: LOG_COLLAPSED_STORAGE_KEY,
    copiedLabel: () => t("sidepanel.currentFile.copied")
  });

  await restoreInitialState({
    runState,
    t,
    conversationUrlInput,
    urlStatus,
    fileInfo,
    setLoadedTasks: (tasks) => {
      loadedTasks = tasks;
    },
    storageGet
  });

  bindUrlLockControls({
    lockUrlBtn,
    clearUrlBtn,
    conversationUrlInput,
    urlStatus,
    runState,
    t,
    storageSet,
    storageRemove
  });

  bindJsonFileUpload({
    jsonFileInput,
    setLoadedTasks: (tasks) => {
      loadedTasks = tasks;
    },
    setFileInfo: (text, isError = false) => {
      fileInfo.textContent = text;
      fileInfo.style.color = isError ? "var(--danger)" : "var(--success)";
      if (text === t("sidepanel.file.noFile")) {
        fileInfo.style.color = "var(--muted)";
      }
    },
    t: (key, vars) => t(key, vars),
    storageSet
  });

  const taskLifecycle = createTaskLifecycle({
    state: runState,
    t,
    statusText,
    progressBar,
    progressText,
    currentFileNameEl,
    appendLogLine,
    formatLogData,
    clearLogOutput,
    formatDuration,
    updateUI,
    stopTimer,
    updateRemainingTime,
    waitForPageLoad,
    ensureLockedConversationTab,
    storageGet,
    storageSet,
    runtimeSendMessage,
    executeScript,
    tabsCreate,
    tabsGet,
    tabsQuery,
    tabsRemove
  });

  // START Button
  startBtn.addEventListener("click", async () => {
    const started = await startRun({
      loadedTasks,
      runState,
      t,
      statusText,
      clearLogOutput,
      appendLogLine,
      updateUI,
      startTimer,
      storageGet,
      runtimeSendMessage,
      tabsQuery,
      tabsUpdate,
      tabsCreate,
      waitForPageLoad,
      ensureLockedConversationTab
    });
    if (started) {
      void taskLifecycle.processNextTask();
    }
  });

  bindStopControl({
    stopBtn,
    runState,
    t,
    stopTimer,
    updateUI,
    statusText,
    onBeforeStop: () => taskLifecycle.cancelTaskWatchdog()
  });
  bindResetControl({
    resetBtn,
    runState,
    t,
    stopTimer,
    updateUI,
    storageClear,
    runtimeSendMessage,
    setLoadedTasks: (tasks) => {
      loadedTasks = tasks;
    },
    fileInfo,
    progressBar,
    progressText,
    elapsedTimeElement,
    remainingTimeElement,
    statusText,
    currentFileNameEl,
    jsonFileInput,
    conversationUrlInput,
    urlStatus,
    onBeforeReset: () => taskLifecycle.cancelTaskWatchdog()
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((request: PanelMessage) => {
    taskLifecycle.handlePanelMessage(request);
  });

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
    runState.startTime = Date.now();
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    // Only update elapsed time every second (remaining time is updated only when tasks complete)
    timerInterval = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - runState.startTime) / 1000);
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
    updateRemainingTimeLabel({
      t,
      startTime: runState.startTime,
      completedTasks: runState.currentIndex,
      totalTasks: runState.taskQueue.length,
      formatTime,
      setLabel: (label) => {
        remainingTimeElement.textContent = label;
      }
    });
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

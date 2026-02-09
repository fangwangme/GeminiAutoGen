import type { TaskItem } from "../types.js";
import { toSafeTaskFilename } from "../utils/taskQueue.js";
import {
  computeTaskWatchdogTimeoutMs,
  isWatchdogTimeoutError
} from "../utils/watchdogPolicy.js";
import { decideTaskErrorOutcome } from "../utils/retryPolicy.js";
import { closeCurrentTabWithPlaceholder } from "./tabHelpers.js";
import type { PanelMessage, TaskErrorType, TaskRunMode } from "./panelTypes.js";
import { appendRunSummary } from "./summaryLog.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export type TaskLifecycleState = {
  taskQueue: TaskItem[];
  currentIndex: number;
  isRunning: boolean;
  conversationUrl: string;
  lockedConversationUrl: string;
  startTime: number;
  currentTabId: number | null;
  retryCounts: Map<number, number>;
  lastLogTaskIndex: number | null;
  skippedCount: number;
  failedCount: number;
  consecutiveFailureCount: number;
  nextTaskMode: TaskRunMode;
  shouldClearLogBeforeNextTask: boolean;
};

type TaskLifecycleDeps = {
  state: TaskLifecycleState;
  t: Translator;
  statusText: HTMLDivElement;
  progressBar: HTMLDivElement;
  progressText: HTMLSpanElement;
  currentFileNameEl: HTMLDivElement;
  appendLogLine: (line: string) => void;
  formatLogData: (data: unknown) => string;
  clearLogOutput: () => void;
  formatDuration: (ms: number) => string;
  updateUI: (running: boolean) => void;
  stopTimer: () => void;
  updateRemainingTime: () => void;
  waitForPageLoad: (tabId: number, timeoutMs: number) => Promise<void>;
  ensureLockedConversationTab: (
    tabId: number,
    pageLoadTimeout: number,
    normalizedStepDelay: number | undefined,
    reason: string
  ) => Promise<boolean>;
  storageGet: <T>(keys: string[]) => Promise<T>;
  storageSet: (items: Record<string, unknown>) => Promise<void>;
  runtimeSendMessage: <T>(message: unknown) => Promise<T>;
  executeScript: (
    injection: chrome.scripting.ScriptInjection<unknown[], unknown>
  ) => Promise<chrome.scripting.InjectionResult<unknown>[]>;
  tabsCreate: (props: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>;
  tabsGet: (tabId: number) => Promise<chrome.tabs.Tab>;
  tabsQuery: (queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
  tabsRemove: (tabId: number) => Promise<void>;
};

type TimeoutSnapshot = {
  href: string;
  readyState: string;
  conversationContainers: number;
  userQueries: number;
  generatedImages: number;
  downloadButtons: number;
  hasInput: boolean;
};

type CheckFileExistsResponse = {
  exists: boolean;
  error?: string;
  errorType?: TaskErrorType;
};

export function createTaskLifecycle(deps: TaskLifecycleDeps) {
  const {
    state,
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
  } = deps;
  let activeTaskRunSeq = 0;
  let taskWatchdogTimer: number | undefined;
  const completionVerifyTimeoutMs = 10000;

  const clearTaskWatchdog = () => {
    if (taskWatchdogTimer) {
      window.clearTimeout(taskWatchdogTimer);
      taskWatchdogTimer = undefined;
    }
  };

  const getTaskWatchdogTimeoutMs = async (taskMode: TaskRunMode) => {
    const settings = await storageGet<{
      settings_generationTimeout?: number;
      settings_downloadTimeout?: number;
      settings_pageLoadTimeout?: number;
    }>([
      "settings_generationTimeout",
      "settings_downloadTimeout",
      "settings_pageLoadTimeout"
    ]);
    return computeTaskWatchdogTimeoutMs(taskMode, settings);
  };

  const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      promise
        .then((value) => {
          window.clearTimeout(timerId);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timerId);
          reject(error);
        });
    });

  async function processNextTask() {
    if (!state.isRunning) return;

    if (state.currentIndex >= state.taskQueue.length) {
      state.isRunning = false;
      stopTimer();
      updateUI(false);
      statusText.textContent = t("sidepanel.status.allTasksCompleted");
      statusText.style.color = "var(--success)";
      progressBar.style.width = "100%";
      currentFileNameEl.textContent = "";
      const elapsedMs = Date.now() - state.startTime;
      appendRunSummary({
        appendLogLine,
        t,
        elapsedMs,
        totalTasks: state.taskQueue.length,
        skippedCount: state.skippedCount,
        failedCount: state.failedCount,
        formatDuration
      });
      return;
    }

    const task = state.taskQueue[state.currentIndex];
    const taskMode = state.nextTaskMode;
    state.nextTaskMode = "full";
    state.lastLogTaskIndex = state.currentIndex;
    activeTaskRunSeq += 1;
    const currentRunSeq = activeTaskRunSeq;

    const total = state.taskQueue.length;
    const displayName = toSafeTaskFilename(task.name);

    progressText.textContent = t("sidepanel.status.taskProgress", {
      current: state.currentIndex + 1,
      total
    });
    progressBar.style.width = `${((state.currentIndex + 1) / total) * 100}%`;
    statusText.textContent =
      taskMode === "download-only"
        ? t("sidepanel.status.retryingDownload")
        : t("sidepanel.status.generating");
    statusText.style.color = "var(--text)";
    currentFileNameEl.textContent = t("sidepanel.currentFile", {
      name: displayName
    });

    await storageSet({
      currentTask: task,
      currentTaskMode: taskMode,
      currentTaskIndex: state.currentIndex,
      currentTaskRunSeq: currentRunSeq
    });

    clearTaskWatchdog();
    const watchdogTimeoutMs = await getTaskWatchdogTimeoutMs(taskMode);
    appendLogLine(
      `[Watchdog] Task timeout armed: ${Math.round(watchdogTimeoutMs / 1000)}s (mode: ${taskMode})`
    );
    taskWatchdogTimer = window.setTimeout(() => {
      // Ignore stale timers from previous task runs.
      if (currentRunSeq !== activeTaskRunSeq) return;
      if (!state.isRunning) return;
      const timeoutLabel = Math.round(watchdogTimeoutMs / 1000);
      const finalizeTimeout = (extra?: string) => {
        appendLogLine(
          `[Watchdog] Forced timeout after ${timeoutLabel}s (mode: ${taskMode})${
            extra ? ` | ${extra}` : ""
          }`
        );
        void handleTaskError(
          `Task watchdog timeout after ${timeoutLabel}s`,
          taskMode === "download-only" ? "download" : "generation"
        );
      };

      if (!state.currentTabId) {
        finalizeTimeout("no-tab");
        return;
      }

      void executeScript({
        target: { tabId: state.currentTabId },
        func: () => {
          const q = <T extends Element>(selector: string) =>
            document.querySelectorAll<T>(selector).length;
          return {
            href: location.href,
            readyState: document.readyState,
            conversationContainers: q<HTMLElement>(
              ".conversation-container, .response-container, model-response"
            ),
            userQueries: q<HTMLElement>("user-query"),
            generatedImages: q<HTMLImageElement>("single-image img, generated-image img, img.loaded"),
            downloadButtons: q<HTMLButtonElement>(
              "download-generated-image-button button, button[aria-label*='Download'], button[mattooltip*='Download']"
            ),
            hasInput:
              document.querySelector(
                '.ql-editor[contenteditable="true"], div[role="textbox"][contenteditable="true"]'
              ) !== null
          };
        }
      })
        .then((result) => {
          const snapshot = result?.[0]?.result as TimeoutSnapshot | undefined;
          if (!snapshot) {
            finalizeTimeout("snapshot-empty");
            return;
          }
          finalizeTimeout(
            `href=${snapshot.href}, ready=${snapshot.readyState}, containers=${snapshot.conversationContainers}, queries=${snapshot.userQueries}, images=${snapshot.generatedImages}, downloadBtns=${snapshot.downloadButtons}, hasInput=${snapshot.hasInput}`
          );
        })
        .catch(() => {
          finalizeTimeout("snapshot-failed");
        });
    }, watchdogTimeoutMs);

    if (!state.currentTabId) {
      clearTaskWatchdog();
      statusText.textContent = t("sidepanel.status.noActiveTab");
      statusText.style.color = "var(--danger)";
      state.isRunning = false;
      updateUI(false);
      return;
    }

    console.log(`[Panel] Injecting script for task ${state.currentIndex + 1}`);
    try {
      await executeScript({
        target: { tabId: state.currentTabId },
        func: async (...args: unknown[]) => {
          const cacheBust = Number(args[0] ?? Date.now());
          const moduleUrl = `${chrome.runtime.getURL("content.js")}?v=${cacheBust}`;
          await import(moduleUrl);
        },
        args: [Date.now()]
      });
    } catch (err) {
      clearTaskWatchdog();
      console.error("[Panel] Injection failed:", err);
      statusText.textContent = t("sidepanel.status.refreshGemini");
      statusText.style.color = "var(--danger)";
      state.isRunning = false;
      updateUI(false);
    }
  }

  async function recreateTab() {
    console.log("[Panel] Recreating tab...");
    statusText.textContent = t("sidepanel.status.resettingBrowserContext");

    const settings = await storageGet<{
      settings_taskInterval?: number;
      settings_pageLoadTimeout?: number;
      settings_stepDelay?: number;
    }>(["settings_taskInterval", "settings_pageLoadTimeout", "settings_stepDelay"]);
    const taskInterval = (settings.settings_taskInterval || 5) * 1000;
    const pageLoadTimeout = (settings.settings_pageLoadTimeout || 30) * 1000;

    await closeCurrentTabWithPlaceholder({
      currentTabId: state.currentTabId,
      tabsGet,
      tabsQuery,
      tabsCreate,
      tabsRemove
    });

    await new Promise((r) => setTimeout(r, taskInterval));
    if (!state.isRunning) return;

    console.log(`[Panel] Opening new tab: ${state.conversationUrl}`);
    const newTab = await tabsCreate({ url: state.conversationUrl });
    state.currentTabId = newTab.id ?? null;

    if (!state.currentTabId) {
      statusText.textContent = t("sidepanel.status.errorCreateTab");
      statusText.style.color = "var(--danger)";
      state.isRunning = false;
      updateUI(false);
      return;
    }

    await waitForPageLoad(state.currentTabId, pageLoadTimeout);

    const rawStepDelay = settings.settings_stepDelay;
    const normalizedStepDelay =
      rawStepDelay && rawStepDelay > 60 ? rawStepDelay / 1000 : rawStepDelay;
    const tabReadyDelayMs = (normalizedStepDelay || 1) * 2 * 1000;
    await new Promise((r) => setTimeout(r, tabReadyDelayMs));

    if (state.lockedConversationUrl) {
      const lockOk = await ensureLockedConversationTab(
        state.currentTabId,
        pageLoadTimeout,
        normalizedStepDelay,
        "new tab"
      );
      if (!lockOk || !state.isRunning) return;
    }

    if (!state.isRunning) return;

    if (state.shouldClearLogBeforeNextTask) {
      clearLogOutput();
      state.shouldClearLogBeforeNextTask = false;
    }

    void processNextTask();
  }

  async function handleTaskError(error: string, errorType?: TaskErrorType) {
    console.error(`[Panel] Task error: ${error}`);
    clearTaskWatchdog();
    if (!state.isRunning) return;
    const isWatchdogTimeout = isWatchdogTimeoutError(error);

    if (isWatchdogTimeout) {
      state.retryCounts.delete(state.currentIndex);
      state.failedCount += 1;
      state.consecutiveFailureCount += 1;
      appendLogLine(
        `Failed task ${state.currentIndex + 1} (watchdog-timeout): ${error}`
      );
      statusText.textContent = t("sidepanel.status.failed", { error });
      statusText.style.color = "var(--danger)";

      state.currentIndex += 1;
      updateRemainingTime();

      if (state.currentIndex < state.taskQueue.length && state.isRunning) {
        state.nextTaskMode = "full";
        void recreateTab();
      } else {
        void processNextTask();
      }
      return;
    }

    const settings = await storageGet<{
      settings_maxRetries?: number;
      settings_maxConsecutiveFailures?: number;
    }>(["settings_maxRetries", "settings_maxConsecutiveFailures"]);
    const maxRetries = Math.max(0, settings.settings_maxRetries ?? 3);
    const maxConsecutiveFailures = Math.max(
      0,
      settings.settings_maxConsecutiveFailures ?? 5
    );
    const currentRetries = state.retryCounts.get(state.currentIndex) ?? 0;
    const decision = decideTaskErrorOutcome({
      error,
      errorType,
      currentRetries,
      maxRetries,
      consecutiveFailureCount: state.consecutiveFailureCount,
      maxConsecutiveFailures
    });
    const resolvedErrorType = decision.resolvedErrorType;

    if (decision.action === "stop-locked-url") {
      statusText.textContent = error || t("sidepanel.status.lockedUrlError");
      statusText.style.color = "var(--danger)";
      appendLogLine(`Locked URL error - stopped: ${error}`);
      state.isRunning = false;
      stopTimer();
      updateUI(false);
      const storedUrl = await storageGet<{ lockedConversationUrl?: string }>([
        "lockedConversationUrl"
      ]);
      const targetUrl =
        storedUrl.lockedConversationUrl || state.lockedConversationUrl;
      if (targetUrl) {
        state.conversationUrl = targetUrl;
        try {
          const newTab = await tabsCreate({ url: targetUrl, active: true });
          state.currentTabId = newTab.id ?? null;
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
      state.isRunning = false;
      stopTimer();
      updateUI(false);
      return;
    }

    if (decision.action === "retry-download" || decision.action === "retry-full") {
      const nextRetry = decision.nextRetryCount;
      state.retryCounts.set(state.currentIndex, nextRetry);
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
        state.nextTaskMode = "download-only";
        void processNextTask();
      } else {
        state.nextTaskMode = "full";
        void recreateTab();
      }
      return;
    }

    state.retryCounts.delete(state.currentIndex);
    if (decision.shouldIncrementFailedCount) {
      state.failedCount += 1;
    }
    state.consecutiveFailureCount = decision.nextConsecutiveFailureCount;
    appendLogLine(
      `Failed task ${state.currentIndex + 1} (${resolvedErrorType}): ${error}`
    );
    statusText.textContent = t("sidepanel.status.failed", { error });
    statusText.style.color = "var(--danger)";

    if (decision.action === "fail-stop") {
      statusText.textContent = t("sidepanel.status.stoppedAfterFailures", {
        count: state.consecutiveFailureCount,
        error
      });
      statusText.style.color = "var(--danger)";
      state.isRunning = false;
      stopTimer();
      updateUI(false);
      return;
    }

    state.currentIndex += 1;
    updateRemainingTime();

    if (state.currentIndex < state.taskQueue.length && state.isRunning) {
      state.nextTaskMode = "full";
      void recreateTab();
    } else {
      void processNextTask();
    }
  }

  function handlePanelMessage(request: PanelMessage) {
    const isTaskScopedMessage =
      request.action === "TASK_COMPLETE" ||
      request.action === "TASK_ERROR" ||
      request.action === "UPDATE_STATUS";
    if (isTaskScopedMessage) {
      if (
        typeof request.taskRunSeq === "number" &&
        request.taskRunSeq !== activeTaskRunSeq
      ) {
        appendLogLine(
          `[Panel] Ignored stale ${request.action}: runSeq=${request.taskRunSeq}, current=${activeTaskRunSeq}`
        );
        return;
      }
      if (
        typeof request.taskIndex === "number" &&
        request.taskIndex !== state.currentIndex
      ) {
        appendLogLine(
          `[Panel] Ignored stale ${request.action}: taskIndex=${request.taskIndex}, current=${state.currentIndex}`
        );
        return;
      }
    }

    if (request.action === "TASK_COMPLETE") {
      clearTaskWatchdog();
      const completedTaskIndex = state.currentIndex;
      const completedRunSeq = activeTaskRunSeq;
      const finalizeTaskComplete = () => {
        if (!state.isRunning) return;
        if (
          completedTaskIndex !== state.currentIndex ||
          completedRunSeq !== activeTaskRunSeq
        ) {
          appendLogLine(
            `[Panel] Dropped late TASK_COMPLETE for task ${completedTaskIndex + 1}`
          );
          return;
        }
        console.log(
          `[Panel] Task ${state.currentIndex + 1} complete (skipped: ${
            request.skipped
          })`
        );
        state.retryCounts.delete(state.currentIndex);
        if (request.skipped) {
          state.skippedCount += 1;
        }
        state.consecutiveFailureCount = 0;
        state.shouldClearLogBeforeNextTask = true;
        state.currentIndex += 1;
        updateRemainingTime();

        if (state.currentIndex < state.taskQueue.length && state.isRunning) {
          void recreateTab();
        } else {
          void processNextTask();
        }
      };

      if (request.skipped) {
        finalizeTaskComplete();
        return;
      }

      const task = state.taskQueue[state.currentIndex];
      if (!task) {
        void handleTaskError("Task completion received with no active task", "generation");
        return;
      }
      const expectedFilename = toSafeTaskFilename(task.name);
      void withTimeout(
        runtimeSendMessage<CheckFileExistsResponse>({
          action: "CHECK_FILE_EXISTS",
          filename: expectedFilename
        }),
        completionVerifyTimeoutMs,
        `Post-check timeout after ${Math.round(completionVerifyTimeoutMs / 1000)}s for ${expectedFilename}`
      )
        .then((verifyResult) => {
          if (verifyResult?.error) {
            void handleTaskError(verifyResult.error, verifyResult.errorType);
            return;
          }
          if (!verifyResult?.exists) {
            appendLogLine(
              `[Panel] Completion verification failed: missing ${expectedFilename}`
            );
            void handleTaskError(
              `Post-check missing output: ${expectedFilename}`,
              "download"
            );
            return;
          }
          finalizeTaskComplete();
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          void handleTaskError(
            `Post-check failed for ${expectedFilename}: ${message}`,
            "download"
          );
        });
      return;
    }

    if (request.action === "TASK_ERROR") {
      clearTaskWatchdog();
      void handleTaskError(request.error, request.errorType);
      return;
    }

    if (request.action === "UPDATE_STATUS") {
      statusText.textContent = request.status;
      statusText.style.color = request.isError ? "var(--danger)" : "var(--text)";
      return;
    }

    if (request.action === "PANEL_LOG") {
      const sourceTag = request.source ? `[${request.source}] ` : "";
      const levelTag = request.level ? `[${request.level}] ` : "";
      const dataText = formatLogData(request.data);
      appendLogLine(
        `[${request.timestamp}] ${sourceTag}${levelTag}${request.message}${dataText}`
      );
    }
  }

  return {
    processNextTask,
    recreateTab,
    handleTaskError,
    handlePanelMessage,
    cancelTaskWatchdog: clearTaskWatchdog
  };
}

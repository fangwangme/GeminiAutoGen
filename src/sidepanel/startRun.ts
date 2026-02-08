import type { TaskItem } from "../types.js";
import { urlsMatch, validateLockedConversationUrl } from "../utils/lockedConversation.js";
import { buildPendingTaskQueue } from "../utils/taskQueue.js";
import type { ListFilesResponse } from "./panelTypes.js";
import type { TaskLifecycleState } from "./taskLifecycle.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export async function startRun(params: {
  loadedTasks: TaskItem[];
  runState: TaskLifecycleState;
  t: Translator;
  statusText: HTMLDivElement;
  clearLogOutput: () => void;
  appendLogLine: (line: string) => void;
  updateUI: (running: boolean) => void;
  startTimer: () => void;
  storageGet: <T>(keys: string[]) => Promise<T>;
  runtimeSendMessage: <T>(message: unknown) => Promise<T>;
  tabsQuery: (queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
  tabsUpdate: (
    tabId: number,
    props: chrome.tabs.UpdateProperties
  ) => Promise<chrome.tabs.Tab>;
  tabsCreate: (props: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>;
  waitForPageLoad: (tabId: number, timeoutMs: number) => Promise<void>;
  ensureLockedConversationTab: (
    tabId: number,
    pageLoadTimeout: number,
    normalizedStepDelay: number | undefined,
    reason: string
  ) => Promise<boolean>;
}) {
  const {
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
  } = params;

  const storedUrl = await storageGet<{ lockedConversationUrl?: string }>([
    "lockedConversationUrl"
  ]);
  const lockedCandidate = storedUrl.lockedConversationUrl?.trim() || "";
  if (!lockedCandidate) {
    statusText.textContent = t("sidepanel.status.lockUrlFirst");
    statusText.style.color = "var(--danger)";
    return false;
  }
  const lockedValidation = validateLockedConversationUrl(lockedCandidate, t);
  if (!lockedValidation.ok) {
    statusText.textContent = t("sidepanel.status.lockedUrlInvalid", {
      reason: lockedValidation.message
    });
    statusText.style.color = "var(--danger)";
    return false;
  }
  runState.lockedConversationUrl = lockedCandidate;

  if (loadedTasks.length === 0) {
    statusText.textContent = t("sidepanel.status.uploadJson");
    statusText.style.color = "var(--danger)";
    return false;
  }

  runState.conversationUrl = runState.lockedConversationUrl;
  console.log(`[Panel] Using locked conversation URL: ${runState.conversationUrl}`);

  const stepSettings = await storageGet<{
    settings_stepDelay?: number;
    settings_pageLoadTimeout?: number;
  }>(["settings_stepDelay", "settings_pageLoadTimeout"]);
  const pageLoadTimeoutMs = (stepSettings.settings_pageLoadTimeout || 30) * 1000;
  const rawStepDelay = stepSettings.settings_stepDelay;
  const normalizedStepDelay =
    rawStepDelay && rawStepDelay > 60 ? rawStepDelay / 1000 : rawStepDelay;
  const tabReadyDelayMs = (normalizedStepDelay || 1) * 2 * 1000;

  const existingTab = (await tabsQuery({ currentWindow: true })).find(
    (tab) =>
      typeof tab.id === "number" &&
      typeof tab.url === "string" &&
      urlsMatch(runState.conversationUrl, tab.url)
  );

  if (existingTab && typeof existingTab.id === "number") {
    runState.currentTabId = existingTab.id;
    await tabsUpdate(runState.currentTabId, { active: true });
    if (existingTab.status === "loading") {
      await waitForPageLoad(runState.currentTabId, pageLoadTimeoutMs);
      await new Promise((r) => setTimeout(r, tabReadyDelayMs));
    }
  } else {
    const newTab = await tabsCreate({ url: runState.conversationUrl });
    runState.currentTabId = newTab.id ?? null;
    if (runState.currentTabId) {
      await waitForPageLoad(runState.currentTabId, pageLoadTimeoutMs);
      await new Promise((r) => setTimeout(r, tabReadyDelayMs));
    }
  }

  if (!runState.currentTabId) {
    statusText.textContent = t("sidepanel.status.failedToOpenTab");
    statusText.style.color = "var(--danger)";
    return false;
  }

  const lockOk = await ensureLockedConversationTab(
    runState.currentTabId,
    pageLoadTimeoutMs,
    normalizedStepDelay,
    "start"
  );
  if (!lockOk) return false;

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
  }

  runState.taskQueue = buildPendingTaskQueue(loadedTasks, existingFiles);
  const skipped = loadedTasks.length - runState.taskQueue.length;
  if (skipped > 0) {
    statusText.textContent = t("sidepanel.status.skippedExisting", {
      count: skipped
    });
  }

  if (runState.taskQueue.length === 0) {
    statusText.textContent = t("sidepanel.status.allTasksCompleted");
    statusText.style.color = "var(--success)";
    return false;
  }

  runState.currentIndex = 0;
  runState.retryCounts.clear();
  runState.skippedCount = 0;
  runState.failedCount = 0;
  runState.consecutiveFailureCount = 0;
  runState.nextTaskMode = "full";
  runState.isRunning = true;

  clearLogOutput();
  appendLogLine(t("sidepanel.log.starting"));
  if (skipped > 0) {
    appendLogLine(t("sidepanel.status.skippedExisting", { count: skipped }));
  }
  appendLogLine(
    t("sidepanel.status.taskProgress", {
      current: 1,
      total: runState.taskQueue.length
    })
  );

  updateUI(true);
  startTimer();
  return true;
}

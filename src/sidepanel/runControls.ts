import type { TaskItem } from "../types.js";
import type { TaskLifecycleState } from "./taskLifecycle.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function bindStopControl(params: {
  stopBtn: HTMLButtonElement;
  runState: TaskLifecycleState;
  t: Translator;
  stopTimer: () => void;
  updateUI: (running: boolean) => void;
  statusText: HTMLDivElement;
  onBeforeStop?: () => void;
}) {
  const { stopBtn, runState, t, stopTimer, updateUI, statusText, onBeforeStop } =
    params;
  stopBtn.addEventListener("click", () => {
    onBeforeStop?.();
    runState.isRunning = false;
    runState.retryCounts.clear();
    runState.skippedCount = 0;
    runState.failedCount = 0;
    runState.consecutiveFailureCount = 0;
    runState.nextTaskMode = "full";
    stopTimer();
    updateUI(false);
    statusText.textContent = t("sidepanel.status.stoppedByUser");
    statusText.style.color = "var(--danger)";
  });
}

export function bindResetControl(params: {
  resetBtn: HTMLButtonElement;
  runState: TaskLifecycleState;
  t: Translator;
  stopTimer: () => void;
  updateUI: (running: boolean) => void;
  storageClear: () => Promise<void>;
  runtimeSendMessage: <T>(message: unknown) => Promise<T>;
  setLoadedTasks: (tasks: TaskItem[]) => void;
  fileInfo: HTMLDivElement;
  progressBar: HTMLDivElement;
  progressText: HTMLSpanElement;
  elapsedTimeElement: HTMLSpanElement;
  remainingTimeElement: HTMLSpanElement;
  statusText: HTMLDivElement;
  currentFileNameEl: HTMLDivElement;
  jsonFileInput: HTMLInputElement;
  conversationUrlInput: HTMLInputElement;
  urlStatus: HTMLDivElement;
  onBeforeReset?: () => void;
}) {
  const {
    resetBtn,
    runState,
    t,
    stopTimer,
    updateUI,
    storageClear,
    runtimeSendMessage,
    setLoadedTasks,
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
    onBeforeReset
  } = params;

  resetBtn.addEventListener("click", async () => {
    onBeforeReset?.();
    runState.isRunning = false;
    stopTimer();

    setLoadedTasks([]);
    runState.taskQueue = [];
    runState.currentIndex = 0;
    runState.conversationUrl = "";
    runState.currentTabId = null;
    runState.retryCounts.clear();
    runState.skippedCount = 0;
    runState.lockedConversationUrl = "";

    await storageClear();
    await runtimeSendMessage<void>({ action: "RESET_STATE" });

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
    conversationUrlInput.value = "";
    urlStatus.textContent = "";

    updateUI(false);
    console.log("[Panel] Reset complete (including locked URL)");
  });
}

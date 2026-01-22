import type { TaskItem } from "./types.js";

type PanelMessage =
  | { action: "TASK_COMPLETE"; skipped?: boolean }
  | { action: "TASK_ERROR"; error: string }
  | { action: "UPDATE_STATUS"; status: string; isError?: boolean };

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
          currentFileNameEl.textContent = "✓ Copied!";
          setTimeout(() => {
            currentFileNameEl.textContent = original;
          }, 800);
        } catch (err) {
          console.error("[Panel] Failed to copy:", err);
        }
      }
    });
  }

  // Load saved locked URL
  const urlData = await storageGet<{ lockedConversationUrl?: string }>([
    "lockedConversationUrl"
  ]);
  if (urlData.lockedConversationUrl) {
    lockedConversationUrl = urlData.lockedConversationUrl;
    conversationUrlInput.value = lockedConversationUrl;
    urlStatus.textContent = "✅ URL locked - will use this conversation";
    urlStatus.style.color = "#4caf50";
  }

  // Load saved tasks
  const data = await storageGet<{ loadedTasks?: TaskItem[] }>(["loadedTasks"]);
  if (data.loadedTasks) {
    loadedTasks = data.loadedTasks;
    fileInfo.textContent = `Loaded ${loadedTasks.length} tasks`;
    fileInfo.style.color = "green";
  }

  const focusSetting = await storageGet<{
    settings_focusWindowOnDownload?: boolean;
  }>(["settings_focusWindowOnDownload"]);
  if (focusSetting.settings_focusWindowOnDownload === undefined) {
    await storageSet({ settings_focusWindowOnDownload: true });
  }

  // Lock URL Button
  if (lockUrlBtn) {
    lockUrlBtn.addEventListener("click", async () => {
      if (!conversationUrlInput || !urlStatus) return;
      const url = conversationUrlInput.value.trim();
      if (!url) {
        urlStatus.textContent = "❌ Please enter a URL";
        urlStatus.style.color = "#f44336";
        return;
      }
      if (!url.includes("gemini.google.com")) {
        urlStatus.textContent = "❌ Must be a Gemini URL";
        urlStatus.style.color = "#f44336";
        return;
      }
      lockedConversationUrl = url;
      try {
        await storageSet({ lockedConversationUrl: url });
        urlStatus.textContent = "✅ URL locked - will use this conversation";
        urlStatus.style.color = "#4caf50";
        console.log(`[Panel] Locked conversation URL: ${url}`);
      } catch (err) {
        urlStatus.textContent = "❌ Failed to save URL";
        urlStatus.style.color = "#f44336";
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
        urlStatus.textContent = "No URL locked";
        urlStatus.style.color = "#999";
        console.log("[Panel] Conversation URL lock cleared");
      } catch (err) {
        urlStatus.textContent = "❌ Failed to clear URL";
        urlStatus.style.color = "#f44336";
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
      fileInfo.textContent = "No file loaded";
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
          fileInfo.textContent = `Loaded ${json.length} tasks`;
          fileInfo.style.color = "green";
          void storageSet({ loadedTasks: json });
        } else {
          throw new Error("File must contain an array");
        }
      } catch {
        fileInfo.textContent = "Error: Invalid JSON";
        fileInfo.style.color = "red";
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
    lockedConversationUrl = storedUrl.lockedConversationUrl || "";

    if (loadedTasks.length === 0) {
      statusText.textContent = "Please upload a JSON file";
      statusText.style.color = "red";
      return;
    }

    // Determine which URL to use
    if (lockedConversationUrl) {
      // Use locked URL
      conversationUrl = lockedConversationUrl;
      console.log(`[Panel] Using locked conversation URL: ${conversationUrl}`);

      // Get or create tab for the locked URL
      const [existingTab] = await tabsQuery({
        url: `${conversationUrl}*`,
        currentWindow: true
      });

      if (existingTab && typeof existingTab.id === "number") {
        currentTabId = existingTab.id;
        await tabsUpdate(currentTabId, { active: true });
      } else {
        // Create new tab with locked URL
        const newTab = await tabsCreate({ url: conversationUrl });
        currentTabId = newTab.id ?? null;
        if (currentTabId) {
          await waitForPageLoad(currentTabId);
          const settings = await storageGet<{ settings_tabReadyDelay?: number }>([
            "settings_tabReadyDelay"
          ]);
          const tabReadyDelay = settings.settings_tabReadyDelay || 1.5;
          await new Promise((r) => setTimeout(r, tabReadyDelay * 1000));
        }
      }
    } else {
      // Get current tab (original behavior)
      const [tab] = await tabsQuery({
        active: true,
        currentWindow: true
      });
      if (!tab || !tab.url || !tab.url.includes("gemini.google.com")) {
        statusText.textContent = "Please open gemini.google.com or lock a URL";
        statusText.style.color = "red";
        return;
      }
      currentTabId = tab.id ?? null;
      conversationUrl = tab.url;
      console.log(`[Panel] Conversation URL: ${conversationUrl}`);
    }

    if (!currentTabId) {
      statusText.textContent = "Failed to open Gemini tab";
      statusText.style.color = "red";
      return;
    }

    // Pre-scan for existing files
    statusText.textContent = "Checking existing files...";
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
    taskQueue = loadedTasks.filter((item) => {
      if (!item || !item.name) return false; // Skip invalid items
      let safeName = item.name.replace(/[^a-z0-9_\-.]/gi, "_");
      if (
        !safeName.toLowerCase().endsWith(".png") &&
        !safeName.toLowerCase().endsWith(".jpg")
      ) {
        safeName += ".png";
      }
      return !existingFiles.has(safeName);
    });

    const skipped = loadedTasks.length - taskQueue.length;
    if (skipped > 0) {
      statusText.textContent = `Skipped ${skipped} existing files`;
    }

    if (taskQueue.length === 0) {
      statusText.textContent = "All tasks completed!";
      statusText.style.color = "green";
      return;
    }

    // Start
    currentIndex = 0;
    isRunning = true;
    updateUI(true);
    startTimer();

    processNextTask();
  });

  // STOP Button
  stopBtn.addEventListener("click", () => {
    isRunning = false;
    stopTimer();
    updateUI(false);
    statusText.textContent = "Stopped by user";
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

    // Clear storage
    await storageClear();

    // Reset background state
    await runtimeSendMessage<void>({ action: "RESET_STATE" });

    // Reset UI
    fileInfo.textContent = "No file loaded";
    fileInfo.style.color = "#666";
    progressBar.style.width = "0%";
    progressText.textContent = "0/0";
    elapsedTimeElement.textContent = "0m 0s";
    remainingTimeElement.textContent = "--m --s";
    statusText.textContent = "Reset complete - Load new tasks to start";
    statusText.style.color = "green";
    currentFileNameEl.textContent = "";
    jsonFileInput.value = "";

    // Restore locked URL if still set
    const savedUrl = await storageGet<{ lockedConversationUrl?: string }>([
      "lockedConversationUrl"
    ]);
    if (savedUrl.lockedConversationUrl) {
      lockedConversationUrl = savedUrl.lockedConversationUrl;
      conversationUrlInput.value = lockedConversationUrl;
      urlStatus.textContent = "✅ URL locked - will use this conversation";
      urlStatus.style.color = "#4caf50";
    }

    updateUI(false);
    console.log("[Panel] Reset complete");
  });

  // Process next task
  async function processNextTask() {
    if (!isRunning) return;

    if (currentIndex >= taskQueue.length) {
      // All done
      isRunning = false;
      stopTimer();
      updateUI(false);
      statusText.textContent = "All Tasks Completed!";
      statusText.style.color = "green";
      progressBar.style.width = "100%";
      currentFileNameEl.textContent = "";
      return;
    }

    const task = taskQueue[currentIndex];
    const total = taskQueue.length;

    // Get safe filename for display
    let displayName = task.name.replace(/[^a-z0-9_\-.]/gi, "_");
    if (
      !displayName.toLowerCase().endsWith(".png") &&
      !displayName.toLowerCase().endsWith(".jpg")
    ) {
      displayName += ".png";
    }

    // Update progress
    progressText.textContent = `Task ${currentIndex + 1} of ${total}`;
    progressBar.style.width = `${((currentIndex + 1) / total) * 100}%`;
    statusText.textContent = "Generating...";
    statusText.style.color = "#333";
    currentFileNameEl.textContent = `📷 ${displayName}`;

    // Save current task to storage
    await storageSet({ currentTask: task });

    if (!currentTabId) {
      statusText.textContent = "Error: No active Gemini tab";
      statusText.style.color = "red";
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
      statusText.textContent = "Error: Please refresh Gemini page";
      statusText.style.color = "red";
      isRunning = false;
      updateUI(false);
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
      console.error(`[Panel] Task error: ${request.error}`);
      statusText.textContent = `Error: ${request.error}`;
      statusText.style.color = "red";
      isRunning = false;
      stopTimer();
      updateUI(false);
    }

    if (request.action === "UPDATE_STATUS") {
      statusText.textContent = request.status;
      statusText.style.color = request.isError ? "red" : "#333";
    }
  });

  // Recreate tab: close old tab, open new one
  async function recreateTab() {
    console.log("[Panel] Recreating tab...");
    statusText.textContent = "Resetting browser context...";

    // Get Settings
    const settings = await storageGet<{
      settings_taskInterval?: number;
      settings_pageLoadTimeout?: number;
    }>(["settings_taskInterval", "settings_pageLoadTimeout"]);
    const taskInterval = (settings.settings_taskInterval || 2) * 1000;
    const pageLoadTimeout = (settings.settings_pageLoadTimeout || 30) * 1000;

    // Close current tab
    if (currentTabId) {
      try {
        await tabsRemove(currentTabId);
      } catch (err) {
        console.log("[Panel] Tab already closed:", err);
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
      statusText.textContent = "Error: Could not create Gemini tab";
      statusText.style.color = "red";
      isRunning = false;
      updateUI(false);
      return;
    }

    // Wait for page load
    await waitForPageLoad(currentTabId, pageLoadTimeout);

    // Extra wait for Gemini to initialize
    const tabSettings = await storageGet<{ settings_tabReadyDelay?: number }>([
      "settings_tabReadyDelay"
    ]);
    const tabReadyDelay = tabSettings.settings_tabReadyDelay || 1.5;
    await new Promise((r) => setTimeout(r, tabReadyDelay * 1000));

    if (!isRunning) return;

    // Process next task
    processNextTask();
  }

  // Wait for page to finish loading
  function waitForPageLoad(tabId: number, timeoutMs = 30000) {
    return new Promise<void>((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout fallback
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);
    });
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
    return `${m}m ${s}s`;
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
      remainingTimeElement.textContent = `${formatTime(
        remainingSeconds
      )} (avg ${avgSeconds}s)`;
    } else if (totalTasks === completedTasks && totalTasks > 0) {
      const avgSeconds = Math.round(elapsedSeconds / totalTasks);
      remainingTimeElement.textContent = `0m 0s (avg ${avgSeconds}s)`;
    } else {
      remainingTimeElement.textContent = "--m --s";
    }
  }
});

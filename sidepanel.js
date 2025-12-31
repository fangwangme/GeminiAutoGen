document.addEventListener("DOMContentLoaded", async () => {
  // UI Elements
  const jsonFileInput = document.getElementById("jsonFile");
  const fileInfo = document.getElementById("fileInfo");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const statusText = document.getElementById("statusText");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const elapsedTimeElement = document.getElementById("elapsedTime");
  const remainingTimeElement = document.getElementById("remainingTime");
  const settingsBtn = document.getElementById("settingsBtn");
  const conversationUrlInput = document.getElementById("conversationUrlInput");
  const lockUrlBtn = document.getElementById("lockUrlBtn");
  const clearUrlBtn = document.getElementById("clearUrlBtn");
  const urlStatus = document.getElementById("urlStatus");
  const currentFileNameEl = document.getElementById("currentFileName");

  // State
  let loadedTasks = [];
  let taskQueue = [];
  let currentIndex = 0;
  let isRunning = false;
  let conversationUrl = "";
  let lockedConversationUrl = ""; // Locked URL from storage
  let timerInterval;
  let startTime = 0;
  let currentTabId = null;

  // Settings Button
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "OPEN_OPTIONS" });
  });

  // Load saved locked URL
  const urlData = await chrome.storage.local.get(["lockedConversationUrl"]);
  if (urlData.lockedConversationUrl) {
    lockedConversationUrl = urlData.lockedConversationUrl;
    conversationUrlInput.value = lockedConversationUrl;
    urlStatus.textContent = "✅ URL locked - will use this conversation";
    urlStatus.style.color = "#4caf50";
  }

  // Load saved tasks
  const data = await chrome.storage.local.get(["loadedTasks"]);
  if (data.loadedTasks) {
    loadedTasks = data.loadedTasks;
    fileInfo.textContent = `Loaded ${loadedTasks.length} tasks`;
    fileInfo.style.color = "green";
  }

  // Lock URL Button
  lockUrlBtn.addEventListener("click", async () => {
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
    await chrome.storage.local.set({ lockedConversationUrl: url });
    urlStatus.textContent = "✅ URL locked - will use this conversation";
    urlStatus.style.color = "#4caf50";
    console.log(`[Panel] Locked conversation URL: ${url}`);
  });

  // Clear URL Button
  clearUrlBtn.addEventListener("click", async () => {
    lockedConversationUrl = "";
    conversationUrlInput.value = "";
    await chrome.storage.local.remove("lockedConversationUrl");
    urlStatus.textContent = "No URL locked";
    urlStatus.style.color = "#999";
    console.log("[Panel] Conversation URL lock cleared");
  });

  // JSON File Upload
  jsonFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
      loadedTasks = [];
      fileInfo.textContent = "No file loaded";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (Array.isArray(json)) {
          loadedTasks = json;
          fileInfo.textContent = `Loaded ${json.length} tasks`;
          fileInfo.style.color = "green";
          chrome.storage.local.set({ loadedTasks: json });
        } else {
          throw new Error("File must contain an array");
        }
      } catch (err) {
        fileInfo.textContent = "Error: Invalid JSON";
        fileInfo.style.color = "red";
        loadedTasks = [];
      }
    };
    reader.readAsText(file);
  });

  // START Button
  startBtn.addEventListener("click", async () => {
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
      const [existingTab] = await chrome.tabs.query({
        url: conversationUrl + "*",
        currentWindow: true,
      });

      if (existingTab) {
        currentTabId = existingTab.id;
        await chrome.tabs.update(currentTabId, { active: true });
      } else {
        // Create new tab with locked URL
        const newTab = await chrome.tabs.create({ url: conversationUrl });
        currentTabId = newTab.id;
        await waitForPageLoad(currentTabId);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } else {
      // Get current tab (original behavior)
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab || !tab.url || !tab.url.includes("gemini.google.com")) {
        statusText.textContent = "Please open gemini.google.com or lock a URL";
        statusText.style.color = "red";
        return;
      }
      currentTabId = tab.id;
      conversationUrl = tab.url;
      console.log(`[Panel] Conversation URL: ${conversationUrl}`);
    }

    // Pre-scan for existing files
    statusText.textContent = "Checking existing files...";
    const response = await chrome.runtime.sendMessage({
      action: "LIST_ALL_FILES",
    });
    const existingFiles = new Set(response.files || []);

    // Filter queue
    taskQueue = loadedTasks.filter((item) => {
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
  const resetBtn = document.getElementById("resetBtn");
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
    await chrome.storage.local.clear();

    // Reset background state
    await chrome.runtime.sendMessage({ action: "RESET_STATE" });

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
    const savedUrl = await chrome.storage.local.get(["lockedConversationUrl"]);
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
    await chrome.storage.local.set({ currentTask: task });

    // Inject content script
    console.log(`[Panel] Injecting script for task ${currentIndex + 1}`);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        files: ["content.js"],
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
  chrome.runtime.onMessage.addListener((request) => {
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

    // Close current tab
    try {
      await chrome.tabs.remove(currentTabId);
    } catch (e) {
      console.log("[Panel] Tab already closed:", e);
    }

    // Wait 2 seconds
    await new Promise((r) => setTimeout(r, 2000));

    if (!isRunning) return;

    // Open new tab
    console.log(`[Panel] Opening new tab: ${conversationUrl}`);
    const newTab = await chrome.tabs.create({ url: conversationUrl });
    currentTabId = newTab.id;

    // Wait for page load
    await waitForPageLoad(currentTabId);

    // Extra wait for Gemini to initialize
    await new Promise((r) => setTimeout(r, 1500));

    if (!isRunning) return;

    // Process next task
    processNextTask();
  }

  // Wait for page to finish loading
  function waitForPageLoad(tabId) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
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
      }, 30000);
    });
  }

  // UI Helpers
  function updateUI(running) {
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    jsonFileInput.disabled = running;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }

  function startTimer() {
    startTime = Date.now();
    clearInterval(timerInterval);
    // Only update elapsed time every second
    timerInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      elapsedTimeElement.textContent = formatTime(elapsedSeconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
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
      remainingTimeElement.textContent = formatTime(remainingSeconds);
    } else if (totalTasks === completedTasks && totalTasks > 0) {
      remainingTimeElement.textContent = "0m 0s";
    } else {
      remainingTimeElement.textContent = "--m --s";
    }
  }
});

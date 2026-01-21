import { setHandle, getHandle } from "./utils/idb.js";

type TimingSettings = {
  settings_generationTimeout?: number;
  settings_downloadTimeout?: number;
  settings_pageLoadTimeout?: number;
  settings_stepDelay?: number;
  settings_taskInterval?: number;
  settings_tabReadyDelay?: number;
  settings_pollInterval?: number;
  settings_inputPollInterval?: number;
  settings_sendPollInterval?: number;
  settings_generationPollInterval?: number;
  settings_downloadPollInterval?: number;
  settings_downloadStabilityInterval?: number;
  settings_focusWindowOnDownload?: boolean;
  outputSubfolder?: string;
  sourceSubfolder?: string;
};

type DirectoryPickerOptions = {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: FileSystemHandle | string;
};

declare global {
  interface Window {
    showDirectoryPicker(
      options?: DirectoryPickerOptions
    ): Promise<FileSystemDirectoryHandle>;
  }
}

const storageGet = <T,>(keys: string[]): Promise<T> =>
  chrome.storage.local.get(keys) as unknown as Promise<T>;

const storageSet = (items: Record<string, unknown>): Promise<void> =>
  chrome.storage.local.set(items) as unknown as Promise<void>;

const storageRemove = (keys: string[]): Promise<void> =>
  chrome.storage.local.remove(keys) as unknown as Promise<void>;

const selectSourceBtn = document.getElementById(
  "selectSourceBtn"
) as HTMLButtonElement;
const sourceStatus = document.getElementById("sourceStatus") as HTMLSpanElement;
const selectOutputBtn = document.getElementById(
  "selectOutputBtn"
) as HTMLButtonElement;
const outputStatus = document.getElementById("outputStatus") as HTMLSpanElement;

// Timing Inputs
const generationTimeoutInput = document.getElementById(
  "generationTimeout"
) as HTMLInputElement;
const downloadTimeoutInput = document.getElementById(
  "downloadTimeout"
) as HTMLInputElement;
const pageLoadTimeoutInput = document.getElementById(
  "pageLoadTimeout"
) as HTMLInputElement;
const stepDelayInput = document.getElementById("stepDelay") as HTMLInputElement;
const taskIntervalInput = document.getElementById(
  "taskInterval"
) as HTMLInputElement;
const tabReadyDelayInput = document.getElementById(
  "tabReadyDelay"
) as HTMLInputElement;
const pollIntervalInput = document.getElementById(
  "pollInterval"
) as HTMLInputElement;
const focusWindowOnDownloadInput = document.getElementById(
  "focusWindowOnDownload"
) as HTMLInputElement;
const saveSettingsBtn = document.getElementById(
  "saveSettingsBtn"
) as HTMLButtonElement;
const saveStatus = document.getElementById("saveStatus") as HTMLDivElement;

// Default Values (seconds)
const DEFAULTS = {
  settings_generationTimeout: 300,
  settings_downloadTimeout: 120,
  settings_pageLoadTimeout: 30,
  settings_stepDelay: 1,
  settings_taskInterval: 2,
  settings_tabReadyDelay: 1.5,
  settings_pollInterval: 1,
  settings_focusWindowOnDownload: true
};

// Load saved settings
async function loadSettings() {
  const result = await storageGet<TimingSettings>([
    "outputSubfolder",
    "sourceSubfolder",
    "settings_generationTimeout",
    "settings_downloadTimeout",
    "settings_pageLoadTimeout",
    "settings_stepDelay",
    "settings_taskInterval",
    "settings_tabReadyDelay",
    "settings_pollInterval",
    "settings_inputPollInterval",
    "settings_sendPollInterval",
    "settings_generationPollInterval",
    "settings_downloadPollInterval",
    "settings_downloadStabilityInterval",
    "settings_focusWindowOnDownload"
  ]);

  // Set Timing Inputs (or defaults)
  generationTimeoutInput.value = String(
    result.settings_generationTimeout ?? DEFAULTS.settings_generationTimeout
  );
  downloadTimeoutInput.value = String(
    result.settings_downloadTimeout ?? DEFAULTS.settings_downloadTimeout
  );
  pageLoadTimeoutInput.value = String(
    result.settings_pageLoadTimeout ?? DEFAULTS.settings_pageLoadTimeout
  );
  stepDelayInput.value = String(
    result.settings_stepDelay ?? DEFAULTS.settings_stepDelay
  );
  taskIntervalInput.value = String(
    result.settings_taskInterval ?? DEFAULTS.settings_taskInterval
  );
  tabReadyDelayInput.value = String(
    result.settings_tabReadyDelay ?? DEFAULTS.settings_tabReadyDelay
  );
  const fallbackPollInterval =
    result.settings_pollInterval ??
    result.settings_generationPollInterval ??
    result.settings_downloadPollInterval ??
    result.settings_inputPollInterval ??
    result.settings_sendPollInterval ??
    result.settings_downloadStabilityInterval ??
    DEFAULTS.settings_pollInterval;
  pollIntervalInput.value = String(fallbackPollInterval);
  focusWindowOnDownloadInput.checked =
    result.settings_focusWindowOnDownload ??
    DEFAULTS.settings_focusWindowOnDownload;

  // Check Source Handle
  const sourceHandle = await getHandle<FileSystemDirectoryHandle>("sourceHandle");
  if (sourceHandle) {
    sourceStatus.textContent = `✅ Selected: ${sourceHandle.name}`;
    sourceStatus.className = "status success";
  } else if (result.sourceSubfolder) {
    sourceStatus.textContent = `⚠️ Saved: ${result.sourceSubfolder} (Re-select needed)`;
  }

  // Check Output Handle
  const outputHandle = await getHandle<FileSystemDirectoryHandle>("outputHandle");
  if (outputHandle) {
    outputStatus.textContent = `✅ Selected: ${outputHandle.name}`;
    outputStatus.className = "status success";
  } else if (result.outputSubfolder) {
    outputStatus.textContent = `⚠️ Saved: ${result.outputSubfolder} (Re-select needed)`;
  }
}

function toSecondsNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

// Save Timing Settings
saveSettingsBtn.addEventListener("click", async () => {
  try {
    const settings = {
      settings_generationTimeout: toSecondsNumber(
        generationTimeoutInput.value,
        DEFAULTS.settings_generationTimeout
      ),
      settings_downloadTimeout: toSecondsNumber(
        downloadTimeoutInput.value,
        DEFAULTS.settings_downloadTimeout
      ),
      settings_pageLoadTimeout: toSecondsNumber(
        pageLoadTimeoutInput.value,
        DEFAULTS.settings_pageLoadTimeout
      ),
      settings_stepDelay: toSecondsNumber(
        stepDelayInput.value,
        DEFAULTS.settings_stepDelay
      ),
      settings_taskInterval: toSecondsNumber(
        taskIntervalInput.value,
        DEFAULTS.settings_taskInterval
      ),
      settings_tabReadyDelay: toSecondsNumber(
        tabReadyDelayInput.value,
        DEFAULTS.settings_tabReadyDelay
      ),
      settings_pollInterval: toSecondsNumber(
        pollIntervalInput.value,
        DEFAULTS.settings_pollInterval
      ),
      settings_focusWindowOnDownload: focusWindowOnDownloadInput.checked
    };

    await storageSet(settings);
    await storageRemove([
      "settings_inputPollInterval",
      "settings_sendPollInterval",
      "settings_generationPollInterval",
      "settings_downloadPollInterval",
      "settings_downloadStabilityInterval"
    ]);

    saveStatus.textContent = "✅ Settings Saved!";
    saveStatus.className = "status success";
    setTimeout(() => {
      saveStatus.textContent = "";
    }, 3000);
  } catch (err) {
    console.error(err);
    saveStatus.textContent = "❌ Error Saving";
    saveStatus.className = "status error";
  }
});

void loadSettings();

// Select Source Folder
selectSourceBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({
      id: "gemini-autogen-source",
      mode: "readwrite"
    });

    await setHandle("sourceHandle", handle);
    await storageSet({ sourceSubfolder: handle.name });

    sourceStatus.textContent = `✅ Selected: ${handle.name}`;
    sourceStatus.className = "status success";
  } catch (err) {
    console.error(err);
  }
});

// Select Output Folder
selectOutputBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({
      id: "gemini-autogen-output",
      mode: "readwrite"
    });

    await setHandle("outputHandle", handle);
    await storageSet({ outputSubfolder: handle.name });

    outputStatus.textContent = `✅ Selected: ${handle.name}`;
    outputStatus.className = "status success";
  } catch (err) {
    console.error(err);
  }
});

export {};

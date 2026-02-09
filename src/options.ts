import { setHandle, getHandle } from "./utils/idb.js";
import {
  applyI18n,
  createTranslator,
  DEFAULT_LANGUAGE,
  getStoredLanguage,
  Language,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  setStoredLanguage
} from "./i18n.js";

type TimingSettings = {
  settings_generationTimeout?: number;
  settings_downloadTimeout?: number;
  settings_pageLoadTimeout?: number;
  settings_inputTimeout?: number;
  settings_stepDelay?: number;
  settings_taskInterval?: number;
  settings_pollInterval?: number;
  settings_inputPollInterval?: number;
  settings_sendPollInterval?: number;
  settings_generationPollInterval?: number;
  settings_downloadPollInterval?: number;
  settings_downloadStabilityInterval?: number;
  settings_maxRetries?: number;
  settings_maxConsecutiveFailures?: number;
  outputSubfolder?: string;
  sourceSubfolder?: string;
  uiLanguage?: string;
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
const inputTimeoutInput = document.getElementById(
  "inputTimeout"
) as HTMLInputElement;
const stepDelayInput = document.getElementById("stepDelay") as HTMLInputElement;
const taskIntervalInput = document.getElementById(
  "taskInterval"
) as HTMLInputElement;
const pollIntervalInput = document.getElementById(
  "pollInterval"
) as HTMLInputElement;
const maxRetriesInput = document.getElementById(
  "maxRetries"
) as HTMLInputElement;
const maxConsecutiveFailuresInput = document.getElementById(
  "maxConsecutiveFailures"
) as HTMLInputElement;
const saveSettingsBtn = document.getElementById(
  "saveSettingsBtn"
) as HTMLButtonElement;
const saveStatus = document.getElementById("saveStatus") as HTMLDivElement;
const languageSelect = document.getElementById(
  "languageSelect"
) as HTMLSelectElement;

let currentLanguage: Language = DEFAULT_LANGUAGE;
let t = createTranslator(currentLanguage);

const setDocumentLanguage = (language: Language) => {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = t("options.documentTitle");
};

const renderLanguageOptions = () => {
  if (!languageSelect) return;
  languageSelect.textContent = "";
  const options = [
    { value: "en", label: t("language.english") },
    { value: "zh", label: t("language.chinese") }
  ];
  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    languageSelect.appendChild(element);
  });
  languageSelect.value = currentLanguage;
};

const applyTranslations = () => {
  applyI18n(document, t);
  renderLanguageOptions();
  setDocumentLanguage(currentLanguage);
};

const applyLanguage = (language: Language) => {
  currentLanguage = language;
  t = createTranslator(currentLanguage);
  applyTranslations();
};

// Default Values (seconds)
const DEFAULTS = {
  settings_generationTimeout: 120,
  settings_downloadTimeout: 120,
  settings_pageLoadTimeout: 30,
  settings_inputTimeout: 5,
  settings_stepDelay: 1,
  settings_taskInterval: 5,
  settings_pollInterval: 1,
  settings_maxRetries: 3,
  settings_maxConsecutiveFailures: 5
};

// Load saved settings
async function loadSettings() {
  const result = await storageGet<TimingSettings>([
    "outputSubfolder",
    "sourceSubfolder",
    LANGUAGE_STORAGE_KEY,
    "settings_generationTimeout",
    "settings_downloadTimeout",
    "settings_pageLoadTimeout",
    "settings_inputTimeout",
    "settings_stepDelay",
    "settings_taskInterval",
    "settings_pollInterval",
    "settings_inputPollInterval",
    "settings_sendPollInterval",
    "settings_generationPollInterval",
    "settings_downloadPollInterval",
    "settings_downloadStabilityInterval",
    "settings_maxRetries",
    "settings_maxConsecutiveFailures"
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
  inputTimeoutInput.value = String(
    result.settings_inputTimeout ?? DEFAULTS.settings_inputTimeout
  );
  stepDelayInput.value = String(
    result.settings_stepDelay ?? DEFAULTS.settings_stepDelay
  );
  taskIntervalInput.value = String(
    result.settings_taskInterval ?? DEFAULTS.settings_taskInterval
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
  maxRetriesInput.value = String(
    result.settings_maxRetries ?? DEFAULTS.settings_maxRetries
  );
  maxConsecutiveFailuresInput.value = String(
    result.settings_maxConsecutiveFailures ?? DEFAULTS.settings_maxConsecutiveFailures
  );

  // Check Source Handle
  const sourceHandle = await getHandle<FileSystemDirectoryHandle>("sourceHandle");
  if (sourceHandle) {
    sourceStatus.textContent = t("options.status.selected", {
      name: sourceHandle.name
    });
    sourceStatus.className = "status success";
  } else if (result.sourceSubfolder) {
    sourceStatus.textContent = t("options.status.savedNeedsReselect", {
      name: result.sourceSubfolder
    });
  }

  // Check Output Handle
  const outputHandle = await getHandle<FileSystemDirectoryHandle>("outputHandle");
  if (outputHandle) {
    outputStatus.textContent = t("options.status.selected", {
      name: outputHandle.name
    });
    outputStatus.className = "status success";
  } else if (result.outputSubfolder) {
    outputStatus.textContent = t("options.status.savedNeedsReselect", {
      name: result.outputSubfolder
    });
  }
}

function toSecondsNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toCountNumber(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
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
      settings_inputTimeout: toSecondsNumber(
        inputTimeoutInput.value,
        DEFAULTS.settings_inputTimeout
      ),
      settings_stepDelay: toSecondsNumber(
        stepDelayInput.value,
        DEFAULTS.settings_stepDelay
      ),
      settings_taskInterval: toSecondsNumber(
        taskIntervalInput.value,
        DEFAULTS.settings_taskInterval
      ),
      settings_pollInterval: toSecondsNumber(
        pollIntervalInput.value,
        DEFAULTS.settings_pollInterval
      ),
      settings_maxRetries: toCountNumber(
        maxRetriesInput.value,
        DEFAULTS.settings_maxRetries
      ),
      settings_maxConsecutiveFailures: toCountNumber(
        maxConsecutiveFailuresInput.value,
        DEFAULTS.settings_maxConsecutiveFailures
      )
    };

    await storageSet(settings);
    await storageRemove([
      "settings_inputPollInterval",
      "settings_sendPollInterval",
      "settings_generationPollInterval",
      "settings_downloadPollInterval",
      "settings_downloadStabilityInterval",
      "settings_downloadDetectTimeout",
      "settings_downloadStabilityTimeout"
    ]);

    saveStatus.textContent = t("options.status.settingsSaved");
    saveStatus.className = "status success";
    setTimeout(() => {
      saveStatus.textContent = "";
    }, 3000);
  } catch (err) {
    console.error(err);
    saveStatus.textContent = t("options.status.errorSaving");
    saveStatus.className = "status error";
  }
});

const initLanguage = async () => {
  const storedLanguage = await getStoredLanguage();
  applyLanguage(storedLanguage);
};

void initLanguage().then(loadSettings);

// Select Source Folder
selectSourceBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({
      id: "gemini-autogen-source",
      mode: "readwrite"
    });

    await setHandle("sourceHandle", handle);
    await storageSet({ sourceSubfolder: handle.name });

    sourceStatus.textContent = t("options.status.selected", {
      name: handle.name
    });
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

    outputStatus.textContent = t("options.status.selected", {
      name: handle.name
    });
    outputStatus.className = "status success";
  } catch (err) {
    console.error(err);
  }
});

if (languageSelect) {
  languageSelect.addEventListener("change", async () => {
    const selected = normalizeLanguage(languageSelect.value);
    await setStoredLanguage(selected);
    applyLanguage(selected);
    await loadSettings();
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[LANGUAGE_STORAGE_KEY]) return;
  const nextLanguage = normalizeLanguage(
    changes[LANGUAGE_STORAGE_KEY].newValue as string | undefined
  );
  if (nextLanguage !== currentLanguage) {
    applyLanguage(nextLanguage);
    void loadSettings();
  }
});

export {};

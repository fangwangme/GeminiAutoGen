import { setHandle, getHandle } from './utils/idb.js';

const selectSourceBtn = document.getElementById('selectSourceBtn');
const sourceStatus = document.getElementById('sourceStatus');
const selectOutputBtn = document.getElementById('selectOutputBtn');
const outputStatus = document.getElementById('outputStatus');

// Timing Inputs
const generationTimeoutInput = document.getElementById('generationTimeout');
const downloadTimeoutInput = document.getElementById('downloadTimeout');
const pageLoadTimeoutInput = document.getElementById('pageLoadTimeout');
const stepDelayInput = document.getElementById('stepDelay');
const taskIntervalInput = document.getElementById('taskInterval');
const tabReadyDelayInput = document.getElementById('tabReadyDelay');
const inputPollIntervalInput = document.getElementById('inputPollInterval');
const sendPollIntervalInput = document.getElementById('sendPollInterval');
const generationPollIntervalInput = document.getElementById('generationPollInterval');
const downloadPollIntervalInput = document.getElementById('downloadPollInterval');
const downloadStabilityIntervalInput = document.getElementById('downloadStabilityInterval');
const focusWindowOnDownloadInput = document.getElementById('focusWindowOnDownload');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const saveStatus = document.getElementById('saveStatus');

// Default Values (seconds)
const DEFAULTS = {
    settings_generationTimeout: 300,
    settings_downloadTimeout: 120,
    settings_pageLoadTimeout: 30,
    settings_stepDelay: 1,
    settings_taskInterval: 2,
    settings_tabReadyDelay: 1.5,
    settings_inputPollInterval: 2,
    settings_sendPollInterval: 0.5,
    settings_generationPollInterval: 1,
    settings_downloadPollInterval: 2,
    settings_downloadStabilityInterval: 1,
    settings_focusWindowOnDownload: true
};

// Load saved settings
async function loadSettings() {
    const result = await chrome.storage.local.get([
        'outputSubfolder', 
        'sourceSubfolder',
        'settings_generationTimeout',
        'settings_downloadTimeout',
        'settings_pageLoadTimeout',
        'settings_stepDelay',
        'settings_taskInterval',
        'settings_tabReadyDelay',
        'settings_inputPollInterval',
        'settings_sendPollInterval',
        'settings_generationPollInterval',
        'settings_downloadPollInterval',
        'settings_downloadStabilityInterval',
        'settings_focusWindowOnDownload'
    ]);

    // Set Timing Inputs (or defaults)
    generationTimeoutInput.value = result.settings_generationTimeout ?? DEFAULTS.settings_generationTimeout;
    downloadTimeoutInput.value = result.settings_downloadTimeout ?? DEFAULTS.settings_downloadTimeout;
    pageLoadTimeoutInput.value = result.settings_pageLoadTimeout ?? DEFAULTS.settings_pageLoadTimeout;
    stepDelayInput.value = result.settings_stepDelay ?? DEFAULTS.settings_stepDelay;
    taskIntervalInput.value = result.settings_taskInterval ?? DEFAULTS.settings_taskInterval;
    tabReadyDelayInput.value = result.settings_tabReadyDelay ?? DEFAULTS.settings_tabReadyDelay;
    inputPollIntervalInput.value = result.settings_inputPollInterval ?? DEFAULTS.settings_inputPollInterval;
    sendPollIntervalInput.value = result.settings_sendPollInterval ?? DEFAULTS.settings_sendPollInterval;
    generationPollIntervalInput.value = result.settings_generationPollInterval ?? DEFAULTS.settings_generationPollInterval;
    downloadPollIntervalInput.value = result.settings_downloadPollInterval ?? DEFAULTS.settings_downloadPollInterval;
    downloadStabilityIntervalInput.value = result.settings_downloadStabilityInterval ?? DEFAULTS.settings_downloadStabilityInterval;
    focusWindowOnDownloadInput.checked = result.settings_focusWindowOnDownload ?? DEFAULTS.settings_focusWindowOnDownload;

    // Check Source Handle
    const sourceHandle = await getHandle('sourceHandle');
    if (sourceHandle) {
        sourceStatus.textContent = `✅ Selected: ${sourceHandle.name}`;
        sourceStatus.className = 'status success';
    } else if (result.sourceSubfolder) {
        sourceStatus.textContent = `⚠️ Saved: ${result.sourceSubfolder} (Re-select needed)`;
    }

    // Check Output Handle
    const outputHandle = await getHandle('outputHandle');
    if (outputHandle) {
        outputStatus.textContent = `✅ Selected: ${outputHandle.name}`;
        outputStatus.className = 'status success';
    } else if (result.outputSubfolder) {
        outputStatus.textContent = `⚠️ Saved: ${result.outputSubfolder} (Re-select needed)`;
    }
}

function toSecondsNumber(value, fallback) {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return parsed;
}

// Save Timing Settings
saveSettingsBtn.addEventListener('click', async () => {
    try {
        const settings = {
            settings_generationTimeout: toSecondsNumber(generationTimeoutInput.value, DEFAULTS.settings_generationTimeout),
            settings_downloadTimeout: toSecondsNumber(downloadTimeoutInput.value, DEFAULTS.settings_downloadTimeout),
            settings_pageLoadTimeout: toSecondsNumber(pageLoadTimeoutInput.value, DEFAULTS.settings_pageLoadTimeout),
            settings_stepDelay: toSecondsNumber(stepDelayInput.value, DEFAULTS.settings_stepDelay),
            settings_taskInterval: toSecondsNumber(taskIntervalInput.value, DEFAULTS.settings_taskInterval),
            settings_tabReadyDelay: toSecondsNumber(tabReadyDelayInput.value, DEFAULTS.settings_tabReadyDelay),
            settings_inputPollInterval: toSecondsNumber(inputPollIntervalInput.value, DEFAULTS.settings_inputPollInterval),
            settings_sendPollInterval: toSecondsNumber(sendPollIntervalInput.value, DEFAULTS.settings_sendPollInterval),
            settings_generationPollInterval: toSecondsNumber(generationPollIntervalInput.value, DEFAULTS.settings_generationPollInterval),
            settings_downloadPollInterval: toSecondsNumber(downloadPollIntervalInput.value, DEFAULTS.settings_downloadPollInterval),
            settings_downloadStabilityInterval: toSecondsNumber(downloadStabilityIntervalInput.value, DEFAULTS.settings_downloadStabilityInterval),
            settings_focusWindowOnDownload: focusWindowOnDownloadInput.checked
        };

        await chrome.storage.local.set(settings);
        
        saveStatus.textContent = '✅ Settings Saved!';
        saveStatus.className = 'status success';
        setTimeout(() => { saveStatus.textContent = ''; }, 3000);
    } catch (err) {
        console.error(err);
        saveStatus.textContent = '❌ Error Saving';
        saveStatus.className = 'status error';
    }
});

loadSettings();

// Select Source Folder
selectSourceBtn.addEventListener('click', async () => {
    try {
        const handle = await window.showDirectoryPicker({
            id: 'gemini-autogen-source',
            mode: 'readwrite'
        });

        await setHandle('sourceHandle', handle);
        await chrome.storage.local.set({ sourceSubfolder: handle.name });

        sourceStatus.textContent = `✅ Selected: ${handle.name}`;
        sourceStatus.className = 'status success';
    } catch (err) {
        console.error(err);
    }
});

// Select Output Folder
selectOutputBtn.addEventListener('click', async () => {
    try {
        const handle = await window.showDirectoryPicker({
            id: 'gemini-autogen-output',
            mode: 'readwrite'
        });

        await setHandle('outputHandle', handle);
        await chrome.storage.local.set({ outputSubfolder: handle.name });

        outputStatus.textContent = `✅ Selected: ${handle.name}`;
        outputStatus.className = 'status success';
    } catch (err) {
        console.error(err);
    }
});

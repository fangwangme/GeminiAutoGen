import { setHandle, getHandle } from './utils/idb.js';

const selectSourceBtn = document.getElementById('selectSourceBtn');
const sourceStatus = document.getElementById('sourceStatus');
const selectOutputBtn = document.getElementById('selectOutputBtn');
const outputStatus = document.getElementById('outputStatus');

// Load saved settings
async function loadSettings() {
    const result = await chrome.storage.local.get(['outputSubfolder', 'sourceSubfolder']);

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

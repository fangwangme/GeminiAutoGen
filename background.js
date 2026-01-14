import { getHandle } from './utils/idb.js';

// --- 1. Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // A. Check File Exists (Output Directory)
  if (request.action === "CHECK_FILE_EXISTS") {
    checkFileExistsFS(request.filename)
      .then((exists) => sendResponse({ exists: exists }))
      .catch((err) => {
        console.error("FS Check Error:", err);
        sendResponse({ exists: false, error: err.message });
      });
    return true;
  }

  // B. Wait for Download and Rename (Polling Mode)
  if (request.action === "WAIT_AND_RENAME") {
    waitForDownloadAndRename(request.targetFilename)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // C. List All Files (Output Directory)
  if (request.action === "LIST_ALL_FILES") {
    listAllFilesFS()
      .then((files) => sendResponse({ files: files }))
      .catch((err) => sendResponse({ files: [] }));
    return true;
  }

  // D. Open Options Page
  if (request.action === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
  }

  // E. Reset State
  if (request.action === "RESET_STATE") {
    lastFileHash = null;
    console.log("[Background] State reset - lastFileHash cleared");
    sendResponse({ success: true });
  }
});

// --- 2. File System Helpers ---

async function getSourceHandle() {
  try {
    const handle = await getHandle('sourceHandle');
    if (!handle) {
      console.warn("[Background] No Source Handle found.");
      return null;
    }
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      console.warn("[Background] Source Permission lost.");
      return null;
    }
    return handle;
  } catch (e) { return null; }
}

async function getOutputHandle() {
  try {
    const handle = await getHandle('outputHandle');
    if (!handle) {
      console.warn("[Background] No Output Handle found.");
      return null;
    }
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      console.warn("[Background] Output Permission lost.");
      return null;
    }
    return handle;
  } catch (e) { return null; }
}

async function checkFileExistsFS(filename) {
  const outputHandle = await getOutputHandle();
  if (!outputHandle) return false;

  try {
    await outputHandle.getFileHandle(filename);
    return true;
  } catch (e) {
    return false;
  }
}

async function listAllFilesFS() {
  const outputHandle = await getOutputHandle();
  if (!outputHandle) return [];

  const files = [];
  for await (const entry of outputHandle.values()) {
    if (entry.kind === 'file') {
      files.push(entry.name);
    }
  }
  return files;
}

// --- 3. Polling-Based Download Detection ---

let lastFileHash = null; // Track hash of last downloaded file

async function calculateFileHash(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function waitForDownloadAndRename(targetFilename) {
  const sourceHandle = await getSourceHandle();
  const outputHandle = await getOutputHandle();

  // Get Timeout Setting
  const settings = await chrome.storage.local.get(['settings_downloadTimeout']);
  const downloadTimeoutSeconds = settings.settings_downloadTimeout || 120;

  if (!sourceHandle || !outputHandle) {
    return { success: false, error: "Missing directory handles. Please configure in Options." };
  }

  console.log(`[Background] Waiting for new Gemini image to rename as: ${targetFilename}`);

  // 1. Get initial file list (before download)
  const initialFiles = new Set();
  for await (const entry of sourceHandle.values()) {
    if (entry.kind === 'file' && entry.name.startsWith('Gemini_Generated_Image')) {
      initialFiles.add(entry.name);
    }
  }
  console.log(`[Background] Initial Gemini files in source: ${initialFiles.size}`);

  // 2. Poll for new file
  const startTime = Date.now();
  const timeout = downloadTimeoutSeconds * 1000; // Convert to ms
  const interval = 2000; // 2 seconds

  while (Date.now() - startTime < timeout) {
    // Check for file FIRST (before waiting), so we detect immediately
    let newFile = null;
    for await (const entry of sourceHandle.values()) {
      if (entry.kind === 'file' &&
        entry.name.startsWith('Gemini_Generated_Image') &&
        !initialFiles.has(entry.name)) {
        newFile = entry.name;
        break;
      }
    }

    if (newFile) {
      console.log(`[Background] New file detected: ${newFile}`);

      // 3. Wait for file size to stabilize (download complete)
      let lastSize = 0;
      let stableCount = 0;

      while (stableCount < 3) { // 3 consecutive same-size checks
        await new Promise(r => setTimeout(r, 1000));
        try {
          const fileHandle = await sourceHandle.getFileHandle(newFile);
          const file = await fileHandle.getFile();

          if (file.size === lastSize && file.size > 0) {
            stableCount++;
          } else {
            stableCount = 0;
            lastSize = file.size;
          }
        } catch (e) {
          console.log("[Background] File not ready yet...");
          stableCount = 0;
        }
      }

      console.log(`[Background] File download complete: ${newFile} (${lastSize} bytes)`);

      // 3.5 Check Aspect Ratio (Replaces Size Check)
      try {
        const fileHandle = await sourceHandle.getFileHandle(newFile);
        const file = await fileHandle.getFile();
        const bitmap = await self.createImageBitmap(file);
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();

        const ratio = width / height;
        console.log(`[Background] Image Analysis: ${width}x${height} (Ratio: ${ratio.toFixed(2)})`);

        // Check for 1:1 (Failure) - Tolerance 0.15
        if (Math.abs(ratio - 1.0) < 0.15) {
          console.error(`[Background] FAILURE: Image is ~1:1 (Ratio: ${ratio.toFixed(2)}). Gemini failed to generate landscape.`);
          
          // Try to delete the failed file
          try {
            await sourceHandle.removeEntry(newFile);
            console.log("[Background] Deleted failed 1:1 image.");
          } catch (e) {
            console.warn("[Background] Could not delete file:", e);
          }
          
          return { 
            success: false, 
            error: `Image is square (1:1). Generation failed (expected 16:9). Workflow stopped.` 
          };
        }

        // Check for 16:9 (Success) - Tolerance 0.2
        const targetRatio = 16 / 9; // ~1.77
        if (Math.abs(ratio - targetRatio) < 0.25) {
          console.log("[Background] SUCCESS: Image is ~16:9.");
        } else {
          console.warn(`[Background] WARNING: Image ratio ${ratio.toFixed(2)} is not 16:9 (Target ~1.77). Proceeding anyway.`);
        }

      } catch (e) {
        console.error("[Background] Aspect ratio check error:", e);
        // We continue if check fails (don't block workflow due to check error, unless critical)
      }

      // 4. Read file and calculate hash
      try {
        const sourceFileHandle = await sourceHandle.getFileHandle(newFile);
        const file = await sourceFileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();

        // Calculate SHA-256 hash
        const fileHash = await calculateFileHash(arrayBuffer);
        console.log(`[Background] File hash: ${fileHash.substring(0, 16)}...`);

        // Check for duplicate
        if (lastFileHash && fileHash === lastFileHash) {
          console.error("[Background] DUPLICATE DETECTED! Same image as previous download.");
          // Delete the source file (it's a duplicate)
          await sourceHandle.removeEntry(newFile);
          return { success: false, error: "Duplicate image detected - workflow terminated" };
        }

        // 5. Move file to output
        const targetHandle = await outputHandle.getFileHandle(targetFilename, { create: true });
        const writable = await targetHandle.createWritable();
        await writable.write(arrayBuffer);
        await writable.close();

        // Delete source
        await sourceHandle.removeEntry(newFile);

        // Update last hash
        lastFileHash = fileHash;

        console.log(`[Background] Success! Moved: ${newFile} -> ${targetFilename}`);
        return { success: true, filename: targetFilename };

      } catch (e) {
        console.error("[Background] Rename failed:", e);
        return { success: false, error: e.message };
      }
    }

    // Wait before next check (only if file not found)
    await new Promise(r => setTimeout(r, interval));
  }

  return { success: false, error: "Timeout waiting for download" };
}

// --- 4. Side Panel Behavior ---
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
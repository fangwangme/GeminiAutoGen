import { getHandle } from "./utils/idb.js";

const formatLogTimestamp = () => new Date().toISOString();
const attachConsoleTimestamps = () => {
  const levels: Array<"log" | "warn" | "error"> = ["log", "warn", "error"];
  levels.forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(`[${formatLogTimestamp()}]`, ...args);
    };
  });
};
attachConsoleTimestamps();

type BackgroundRequest =
  | { action: "CHECK_FILE_EXISTS"; filename: string }
  | { action: "WAIT_AND_RENAME"; targetFilename: string }
  | { action: "LIST_ALL_FILES" }
  | { action: "OPEN_OPTIONS" }
  | { action: "RESET_STATE" }
  | { action: "PANEL_LOG" }
  | {
      action: "LOG";
      level?: "log" | "warn" | "error";
      message: string;
      data?: unknown;
      source?: string;
    };

type WaitAndRenameResult = {
  success: boolean;
  filename?: string;
  error?: string;
};

type DownloadSettings = {
  settings_downloadTimeout?: number;
  settings_pollInterval?: number;
  settings_downloadPollInterval?: number;
  settings_downloadStabilityInterval?: number;
};

const storageGet = <T,>(keys: string[]): Promise<T> =>
  chrome.storage.local.get(keys) as unknown as Promise<T>;

const normalizePositive = (value: number | undefined, fallback: number) =>
  typeof value === "number" && value > 0 ? value : fallback;

const isImageFilename = (filename: string) =>
  /\.(png|jpe?g|webp)$/i.test(filename);

const isPreferredGeminiFilename = (filename: string) =>
  filename.startsWith("Gemini_Generated_Image") ||
  filename.startsWith("Gemini_Image");

const getDirectoryValues = (
  handle: FileSystemDirectoryHandle
): (() => AsyncIterable<FileSystemHandle>) | null =>
  typeof handle.values === "function" ? handle.values.bind(handle) : null;

const hasReadWritePermission = async (
  handle: FileSystemDirectoryHandle
): Promise<boolean> => {
  if (typeof handle.queryPermission !== "function") {
    return true;
  }
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
};

// --- 1. Message Handling ---
chrome.runtime.onMessage.addListener(
  (
    request: BackgroundRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    if (request.action === "PANEL_LOG") {
      return;
    }
    if (request.action === "LOG") {
      const level = request.level ?? "log";
      const prefix = request.source ? `[${request.source}] ` : "";
      const logger =
        level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      if (request.data !== undefined) {
        logger(`${prefix}${request.message}`, request.data);
      } else {
        logger(`${prefix}${request.message}`);
      }
      try {
        chrome.runtime.sendMessage({
          action: "PANEL_LOG",
          level,
          message: request.message,
          data: request.data,
          source: request.source,
          timestamp: formatLogTimestamp()
        });
      } catch {
        // Ignore if panel is not open
      }
      sendResponse({ ok: true });
      return;
    }

    // A. Check File Exists (Output Directory)
    if (request.action === "CHECK_FILE_EXISTS") {
      checkFileExistsFS(request.filename)
        .then((exists) => sendResponse({ exists }))
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error("FS Check Error:", err);
          sendResponse({ exists: false, error: message });
        });
      return true;
    }

    // B. Wait for Download and Rename (Polling Mode)
    if (request.action === "WAIT_AND_RENAME") {
      waitForDownloadAndRename(request.targetFilename, {
        tabId: sender.tab?.id,
        windowId: sender.tab?.windowId
      })
        .then((result) => sendResponse(result))
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ success: false, error: message });
        });
      return true;
    }

    // C. List All Files (Output Directory)
    if (request.action === "LIST_ALL_FILES") {
      listAllFilesFS()
        .then((files) => sendResponse({ files }))
        .catch(() => sendResponse({ files: [] }));
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
  }
);

// --- 2. File System Helpers ---
async function getSourceHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await getHandle<FileSystemDirectoryHandle>("sourceHandle");
    if (!handle) {
      console.warn("[Background] No Source Handle found.");
      return null;
    }
    if (!(await hasReadWritePermission(handle))) {
      console.warn("[Background] Source Permission lost.");
      return null;
    }
    return handle;
  } catch {
    return null;
  }
}

async function getOutputHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await getHandle<FileSystemDirectoryHandle>("outputHandle");
    if (!handle) {
      console.warn("[Background] No Output Handle found.");
      return null;
    }
    if (!(await hasReadWritePermission(handle))) {
      console.warn("[Background] Output Permission lost.");
      return null;
    }
    return handle;
  } catch {
    return null;
  }
}

async function checkFileExistsFS(filename: string): Promise<boolean> {
  const outputHandle = await getOutputHandle();
  if (!outputHandle) return false;

  try {
    await outputHandle.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}

async function listAllFilesFS(): Promise<string[]> {
  const outputHandle = await getOutputHandle();
  if (!outputHandle) return [];

  const outputValues = getDirectoryValues(outputHandle);
  if (!outputValues) return [];

  const files: string[] = [];
  for await (const entry of outputValues()) {
    if (entry.kind === "file") {
      files.push(entry.name);
    }
  }
  return files;
}

// --- 3. Polling-Based Download Detection ---
let lastFileHash: string | null = null; // Track hash of last downloaded file

async function calculateFileHash(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function waitForDownloadAndRename(
  targetFilename: string,
  tabInfo?: { tabId?: number; windowId?: number }
): Promise<WaitAndRenameResult> {
  const sourceHandle = await getSourceHandle();
  const outputHandle = await getOutputHandle();

  // Get Timeout Setting
  const settings = await storageGet<DownloadSettings>([
    "settings_downloadTimeout",
    "settings_pollInterval",
    "settings_downloadPollInterval",
    "settings_downloadStabilityInterval"
  ]);
  const downloadTimeoutSeconds = normalizePositive(
    settings.settings_downloadTimeout,
    120
  );
  const downloadPollIntervalSeconds = normalizePositive(
    settings.settings_pollInterval ?? settings.settings_downloadPollInterval,
    1
  );
  const downloadStabilityIntervalSeconds = normalizePositive(
    settings.settings_pollInterval ??
      settings.settings_downloadStabilityInterval,
    1
  );
  void tabInfo;

  if (!sourceHandle || !outputHandle) {
    return {
      success: false,
      error: "Missing directory handles. Please configure in Options."
    };
  }

  const sourceValues = getDirectoryValues(sourceHandle);
  if (!sourceValues) {
    return {
      success: false,
      error: "Directory iteration is not supported in this browser."
    };
  }

  console.log(
    `[Background] Waiting for new Gemini image to rename as: ${targetFilename}`
  );

  // 1. Get initial file list (before download)
  const initialFiles = new Set<string>();
  for await (const entry of sourceValues()) {
    if (entry.kind === "file" && isImageFilename(entry.name)) {
      initialFiles.add(entry.name);
    }
  }
  console.log(`[Background] Initial image files in source: ${initialFiles.size}`);

  // 2. Poll for new file
  const startTime = Date.now();
  const timeout = downloadTimeoutSeconds * 1000; // Convert to ms
  const interval = downloadPollIntervalSeconds * 1000;
  const allowAnyImageAfterMs = Math.min(
    downloadTimeoutSeconds * 1000,
    Math.max(
      Math.round(downloadTimeoutSeconds * 1000 * 0.1),
      downloadPollIntervalSeconds * 1000 * 5
    )
  );
  let allowAnyImageLogged = false;

  while (Date.now() - startTime < timeout) {
    await new Promise((r) => setTimeout(r, interval));

    let newFile: string | null = null;
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs >= allowAnyImageAfterMs && !allowAnyImageLogged) {
      console.log(
        "[Background] No Gemini-named download detected yet; widening search to any new image file."
      );
      allowAnyImageLogged = true;
    }
    for await (const entry of sourceValues()) {
      if (
        entry.kind === "file" &&
        isImageFilename(entry.name) &&
        !initialFiles.has(entry.name) &&
        (isPreferredGeminiFilename(entry.name) ||
          elapsedMs >= allowAnyImageAfterMs)
      ) {
        newFile = entry.name;
        break;
      }
    }

    if (newFile) {
      console.log(`[Background] New file detected: ${newFile}`);

      // 3. Wait for file size to stabilize (download complete)
      let lastSize = 0;
      let stableCount = 0;

      while (stableCount < 3) {
        await new Promise((r) =>
          setTimeout(r, downloadStabilityIntervalSeconds * 1000)
        );
        try {
          const fileHandle = await sourceHandle.getFileHandle(newFile);
          const file = await fileHandle.getFile();

          if (file.size === lastSize && file.size > 0) {
            stableCount++;
          } else {
            stableCount = 0;
            lastSize = file.size;
          }
        } catch {
          console.log("[Background] File not ready yet...");
          stableCount = 0;
        }
      }

      console.log(
        `[Background] File download complete: ${newFile} (${lastSize} bytes)`
      );

      // 3.5 Check Aspect Ratio (Replaces Size Check)
      try {
        const fileHandle = await sourceHandle.getFileHandle(newFile);
        const file = await fileHandle.getFile();
        const bitmap = await createImageBitmap(file);
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();

        const ratio = width / height;
        console.log(
          `[Background] Image Analysis: ${width}x${height} (Ratio: ${ratio.toFixed(
            2
          )})`
        );

        // Check for 1:1 (Failure) - Tolerance 0.15
        if (Math.abs(ratio - 1.0) < 0.15) {
          console.error(
            `[Background] FAILURE: Image is ~1:1 (Ratio: ${ratio.toFixed(
              2
            )}). Gemini failed to generate landscape.`
          );

          // Try to delete the failed file
          try {
            await sourceHandle.removeEntry(newFile);
            console.log("[Background] Deleted failed 1:1 image.");
          } catch (err) {
            console.warn("[Background] Could not delete file:", err);
          }

          return {
            success: false,
            error:
              "Image is square (1:1). Generation failed (expected 16:9). Workflow stopped."
          };
        }

        // Check for 16:9 (Success) - Tolerance 0.2
        const targetRatio = 16 / 9; // ~1.77
        if (Math.abs(ratio - targetRatio) < 0.25) {
          console.log("[Background] SUCCESS: Image is ~16:9.");
        } else {
          console.warn(
            `[Background] WARNING: Image ratio ${ratio.toFixed(
              2
            )} is not 16:9 (Target ~1.77). Proceeding anyway.`
          );
        }
      } catch (err) {
        console.error("[Background] Aspect ratio check error:", err);
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
          console.error(
            "[Background] DUPLICATE DETECTED! Same image as previous download."
          );
          // Delete the source file (it's a duplicate)
          await sourceHandle.removeEntry(newFile);
          return {
            success: false,
            error: "Duplicate image detected - workflow terminated"
          };
        }

        // 5. Move file to output
        const targetHandle = await outputHandle.getFileHandle(targetFilename, {
          create: true
        });
        const writable = await targetHandle.createWritable();
        await writable.write(arrayBuffer);
        await writable.close();

        // Delete source
        await sourceHandle.removeEntry(newFile);

        // Update last hash
        lastFileHash = fileHash;

        console.log(`[Background] Success! Moved: ${newFile} -> ${targetFilename}`);
        return { success: true, filename: targetFilename };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[Background] Rename failed:", err);
        return { success: false, error: message };
      }
    }
  }

  return { success: false, error: "Timeout waiting for download" };
}

// --- 4. Side Panel Behavior ---
const sidePanelApi = (
  chrome as typeof chrome & {
    sidePanel?: {
      setPanelBehavior: (options: { openPanelOnActionClick: boolean }) =>
        | Promise<void>
        | void;
    };
  }
).sidePanel;

sidePanelApi
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  ?.catch?.((error) => console.error(error));

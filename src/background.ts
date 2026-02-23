import { getHandle } from "./utils/idb.js";
import {
  createTranslator,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage
} from "./i18n.js";
import { isFolderAuthErrorMessage } from "./utils/errorClassifier.js";

const formatLogTimestamp = () => {
  const now = new Date();
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const millis = pad(now.getMilliseconds(), 3);
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetAbs = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(offsetAbs / 60));
  const offsetMins = pad(offsetAbs % 60);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis} GMT${sign}${offsetHours}:${offsetMins}`;
};
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

type FileErrorType = "folder" | "download" | "generation";

type WaitAndRenameResult = {
  success: boolean;
  filename?: string;
  error?: string;
  errorType?: FileErrorType;
};

type DownloadSettings = {
  settings_downloadTimeout?: number;
  settings_pollInterval?: number;
  settings_downloadPollInterval?: number;
  settings_downloadStabilityInterval?: number;
};

type Translator = (key: string, vars?: Record<string, string | number>) => string;

const storageGet = <T,>(keys: string[]): Promise<T> =>
  chrome.storage.local.get(keys) as unknown as Promise<T>;

const getTranslator = async () => {
  const data = await storageGet<Record<string, unknown>>([LANGUAGE_STORAGE_KEY]);
  const language = normalizeLanguage(data[LANGUAGE_STORAGE_KEY] as string | undefined);
  return createTranslator(language || DEFAULT_LANGUAGE);
};

const normalizePositive = (value: number | undefined, fallback: number) =>
  typeof value === "number" && value > 0 ? value : fallback;

const toErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

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
  const result = await handle.queryPermission({ mode: "readwrite" });
  if (result === "granted") {
    return true;
  }
  // Try to request permission if not granted (handles permission lost after browser restart)
  if (typeof handle.requestPermission === "function") {
    try {
      const requestResult = await handle.requestPermission({ mode: "readwrite" });
      return requestResult === "granted";
    } catch {
      return false;
    }
  }
  return false;
};

// --- Fallback: Use Chrome Downloads API when FS API fails ---
// Use chrome.downloads API as fallback when FS API fails
async function waitForDownloadAndRenameFallback(
  targetFilename: string,
  downloadTimeoutSeconds: number,
  downloadStabilityIntervalSeconds: number,
  t: Translator
): Promise<WaitAndRenameResult> {
  console.log("[Background] Using Chrome Downloads API fallback");

  // Get default download directory - use empty string to let Chrome determine it
  const timeoutMs = downloadTimeoutSeconds * 1000;

  // Use chrome.downloads API to wait for new downloads
  let resolveDownload: ((downloadId: number) => void) | null = null;
  const downloadPromise = new Promise<number>((resolve) => {
    resolveDownload = resolve;
  });

  const onCreated = (downloadItem: chrome.downloads.DownloadItem) => {
    if (isImageFilename(downloadItem.filename) && 
        (isPreferredGeminiFilename(downloadItem.filename) || 
         downloadItem.filename.includes('Gemini'))) {
      console.log(`[Background] Download detected: ${downloadItem.filename}`);
      chrome.downloads.onCreated.removeListener(onCreated);
      if (resolveDownload) {
        resolveDownload(downloadItem.id);
      }
    }
  };

  chrome.downloads.onCreated.addListener(onCreated);

  try {
    // Wait for download with timeout
    const downloadId = await Promise.race([
      downloadPromise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(t("errors.timeoutWaitingDownload"))), timeoutMs)
      )
    ]);

    // Wait for download to complete
    await new Promise<void>((resolve, reject) => {
      const checkComplete = (downloadItem: chrome.downloads.DownloadItem) => {
        if (downloadItem.id === downloadId) {
          if (downloadItem.state === 'completed') {
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve();
          } else if (downloadItem.state === 'interrupted') {
            chrome.downloads.onChanged.removeListener(onChanged);
            reject(new Error("Download interrupted"));
          }
        }
      };
      const onChanged = (downloadDelta: chrome.downloads.DownloadDelta) => {
        if (downloadDelta.item) {
          checkComplete(downloadDelta.item);
        }
      };
      chrome.downloads.onChanged.addListener(onChanged);
      // Also set a timeout
      setTimeout(() => {
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(new Error("Download timeout"));
      }, timeoutMs);
    });

    // Find the downloaded file
    const downloads = await new Promise<chrome.downloads.DownloadItem[]>((resolve) => {
      chrome.downloads.search({ id: downloadId }, resolve);
    });

    if (!downloads.length) {
      return { success: false, error: "Download not found", errorType: "download" };
    }

    const downloadedFile = downloads[0];
    const sourcePath = downloadedFile.filename;

    // Try to get output handle for writing
    const outputHandle = await getOutputHandle();
    if (!outputHandle) {
      return {
        success: false,
        error: t("errors.missingDirectoryHandles"),
        errorType: "folder"
      };
    }

    // Read the downloaded file using fetch (works for file:// URLs in Chrome extensions)
    let arrayBuffer: ArrayBuffer;
    try {
      const response = await fetch('file://' + sourcePath);
      arrayBuffer = await response.arrayBuffer();
    } catch {
      // Fallback: try to get file handle directly
      try {
        // @ts-expect-error - getFileHandle is not in standard types
        const fileHandle = await chrome.downloads.getFileHandle(downloadId);
        const file = await fileHandle.getFile();
        arrayBuffer = await file.arrayBuffer();
      } catch (err) {
        return {
          success: false,
          error: "Could not read downloaded file",
          errorType: "download"
        };
      }
    }

    const fileHash = await calculateFileHash(arrayBuffer);

    // Check for duplicate
    if (lastFileHash && fileHash === lastFileHash) {
      console.error("[Background] DUPLICATE DETECTED in fallback!");
      return {
        success: false,
        error: t("errors.duplicateImage"),
        errorType: "generation"
      };
    }

    // Move to output folder
    const targetHandle = await outputHandle.getFileHandle(targetFilename, { create: true });
    const writable = await targetHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();

    // Delete source file
    try {
      await chrome.downloads.removeFile(downloadId);
    } catch {
      // Ignore if can't delete
    }

    lastFileHash = fileHash;
    console.log(`[Background] Fallback Success! Moved to: ${targetFilename}`);
    return { success: true, filename: targetFilename };

  } catch (err) {
    const message = toErrorMessage(err);
    console.error("[Background] Fallback error:", err);
    return { success: false, error: message, errorType: "download" };
  } finally {
    chrome.downloads.onCreated.removeListener(onCreated);
  }
}

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
      getTranslator()
        .then((translator) => checkFileExistsFS(request.filename, translator))
        .then((exists) => sendResponse({ exists }))
        .catch((err) => {
          const message = toErrorMessage(err);
          console.error("FS Check Error:", err);
          const errorType: FileErrorType = isFolderAuthErrorMessage(message)
            ? "folder"
            : "download";
          sendResponse({ exists: false, error: message, errorType });
        });
      return true;
    }

    // B. Wait for Download and Rename (Polling Mode)
    if (request.action === "WAIT_AND_RENAME") {
      getTranslator()
        .then((translator) =>
          waitForDownloadAndRename(
            request.targetFilename,
            {
              tabId: sender.tab?.id,
              windowId: sender.tab?.windowId
            },
            translator
          )
        )
        .then((result) => sendResponse(result))
        .catch((err) => {
          const message = toErrorMessage(err);
          const errorType: FileErrorType = isFolderAuthErrorMessage(message)
            ? "folder"
            : "download";
          sendResponse({ success: false, error: message, errorType });
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

async function checkFileExistsFS(filename: string, t: Translator): Promise<boolean> {
  const outputHandle = await getOutputHandle();
  if (!outputHandle) {
    throw new Error(t("errors.missingDirectoryHandles"));
  }

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
  tabInfo: { tabId?: number; windowId?: number } | undefined,
  t: Translator
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
    console.log("[Background] FS API handles not available, using Chrome Downloads API fallback");
    return waitForDownloadAndRenameFallback(
      targetFilename,
      downloadTimeoutSeconds,
      downloadStabilityIntervalSeconds,
      t
    );
  }

  const sourceValues = getDirectoryValues(sourceHandle);
  if (!sourceValues) {
    console.log("[Background] FS API directory iteration not supported, using Chrome Downloads API fallback");
    return waitForDownloadAndRenameFallback(
      targetFilename,
      downloadTimeoutSeconds,
      downloadStabilityIntervalSeconds,
      t
    );
  }

  console.log(
    `[Background] Waiting for new Gemini image to rename as: ${targetFilename} (Timeout: ${downloadTimeoutSeconds}s, Poll: ${downloadPollIntervalSeconds}s)`
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
  const timeoutMs = downloadTimeoutSeconds * 1000; // Convert to ms
  const deadline = startTime + timeoutMs;
  const interval = downloadPollIntervalSeconds * 1000;
  const allowAnyImageAfterMs = Math.min(
    timeoutMs,
    Math.max(
      Math.round(timeoutMs * 0.1),
      downloadPollIntervalSeconds * 1000 * 5
    )
  );
  let allowAnyImageLogged = false;

  while (Date.now() < deadline) {
    const pollRemainingMs = deadline - Date.now();
    if (pollRemainingMs <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(interval, pollRemainingMs)));

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
        const stabilizationRemainingMs = deadline - Date.now();
        if (stabilizationRemainingMs <= 0) {
          const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
          console.error(
            `[Background] Timeout waiting for file stabilization: ${newFile} (${Math.round(
              elapsedSeconds
            )}s)`
          );
          return {
            success: false,
            error: t("errors.timeoutWaitingDownload"),
            errorType: "download"
          };
        }

        await new Promise((r) =>
          setTimeout(
            r,
            Math.min(
              downloadStabilityIntervalSeconds * 1000,
              stabilizationRemainingMs
            )
          )
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
          if (stableCount === 0) {
            console.log(
              `[Background] Waiting file stabilize: ${newFile}, size=${file.size}, elapsed=${Math.round(
                (Date.now() - startTime) / 1000
              )}s`
            );
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
            error: t("errors.imageSquareGenerationFailed"),
            errorType: "generation"
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
            error: t("errors.duplicateImage"),
            errorType: "generation"
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
        const message = toErrorMessage(err);
        const errorType: FileErrorType = isFolderAuthErrorMessage(message)
          ? "folder"
          : "download";
        console.error("[Background] Rename failed:", err);
        return { success: false, error: message, errorType };
      }
    }
  }

  return {
    success: false,
    error: t("errors.timeoutWaitingDownload"),
    errorType: "download"
  };
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

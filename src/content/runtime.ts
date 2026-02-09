export type TaskErrorType = "generation" | "download" | "folder" | "locked-url";
export type TaskMode = "full" | "download-only";

export type ContentSettings = {
  settings_generationTimeout?: number;
  settings_downloadTimeout?: number;
  settings_pageLoadTimeout?: number;
  settings_inputTimeout?: number;
  settings_stepDelay?: number;
  settings_pollInterval?: number;
  settings_inputPollInterval?: number;
  settings_sendPollInterval?: number;
  settings_generationPollInterval?: number;
};

export type CheckFileExistsResponse = {
  exists: boolean;
  error?: string;
  errorType?: TaskErrorType;
};

export type WaitAndRenameResponse = {
  success: boolean;
  filename?: string;
  error?: string;
  errorType?: TaskErrorType;
};

type ContentMessage =
  | { action: "CHECK_FILE_EXISTS"; filename: string }
  | { action: "WAIT_AND_RENAME"; targetFilename: string }
  | {
      action: "TASK_COMPLETE";
      skipped: boolean;
      taskIndex?: number;
      taskRunSeq?: number;
    }
  | {
      action: "TASK_ERROR";
      error: string;
      errorType?: TaskErrorType;
      taskIndex?: number;
      taskRunSeq?: number;
    }
  | {
      action: "UPDATE_STATUS";
      status: string;
      isError?: boolean;
      taskIndex?: number;
      taskRunSeq?: number;
    }
  | {
      action: "LOG";
      level: "log" | "warn" | "error";
      message: string;
      data?: unknown;
      source?: string;
    };

export const storageGet = <T,>(keys: string[]): Promise<T> =>
  chrome.storage.local.get(keys) as unknown as Promise<T>;

export const runtimeSendMessage = <T,>(message: ContentMessage): Promise<T> =>
  chrome.runtime.sendMessage(message) as unknown as Promise<T>;

export const toErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const normalizeTaskMode = (mode?: string): TaskMode =>
  mode === "download-only" ? "download-only" : "full";

export const toSafeTaskFilename = (name: string): string => {
  let safeName = (name || "").replace(/[^a-z0-9_\-.]/gi, "_");
  if (
    !safeName.toLowerCase().endsWith(".png") &&
    !safeName.toLowerCase().endsWith(".jpg")
  ) {
    safeName += ".png";
  }
  return safeName;
};

const FOLDER_ERROR_FRAGMENTS = [
  "missing directory handles",
  "permission lost",
  "directory iteration is not supported",
  "notallowederror",
  "securityerror",
  "permission",
  "not authorized",
  "denied"
];

const DOWNLOAD_ERROR_FRAGMENTS = [
  "rename",
  "waiting for file",
  "timeout waiting for download"
];

const toNormalized = (message: string) => (message || "").toLowerCase();

export const isFolderAuthErrorMessage = (message: string): boolean => {
  const normalized = toNormalized(message);
  return FOLDER_ERROR_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment)
  );
};

const isDownloadErrorMessage = (message: string): boolean => {
  const normalized = toNormalized(message);
  return DOWNLOAD_ERROR_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment)
  );
};

export const resolveTaskErrorType = (
  error: string,
  explicitType?: TaskErrorType
): TaskErrorType => {
  if (explicitType) return explicitType;
  if (isFolderAuthErrorMessage(error)) return "folder";
  if (isDownloadErrorMessage(error)) return "download";
  return "generation";
};

export class TaskError extends Error {
  errorType: TaskErrorType;

  constructor(message: string, errorType: TaskErrorType) {
    super(message);
    this.errorType = errorType;
  }
}

export const createContentLogger = (
  sendMessage: typeof runtimeSendMessage
) => {
  const logToBackground = (
    level: "log" | "warn" | "error",
    message: string,
    data?: unknown
  ) => {
    sendMessage<void>({
      action: "LOG",
      level,
      message,
      data,
      source: "content"
    }).catch(() => {});
  };

  return {
    logInfo: (message: string, data?: unknown) =>
      logToBackground("log", message, data),
    logWarn: (message: string, data?: unknown) =>
      logToBackground("warn", message, data),
    logError: (message: string, data?: unknown) =>
      logToBackground("error", message, data)
  };
};

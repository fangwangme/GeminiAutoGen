export type TaskErrorType = "generation" | "download" | "folder" | "locked-url";
export type TaskRunMode = "full" | "download-only";

export type PanelMessage =
  | { action: "TASK_COMPLETE"; skipped?: boolean }
  | { action: "TASK_ERROR"; error: string; errorType?: TaskErrorType }
  | { action: "UPDATE_STATUS"; status: string; isError?: boolean }
  | {
      action: "PANEL_LOG";
      level: "log" | "warn" | "error";
      message: string;
      data?: unknown;
      source?: string;
      timestamp: string;
    };

export type ListFilesResponse = {
  files?: string[];
};

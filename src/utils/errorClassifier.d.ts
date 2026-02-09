export type TaskErrorType = "generation" | "download" | "folder" | "locked-url";

export declare const isFolderAuthErrorMessage: (message: string) => boolean;
export declare const isDownloadErrorMessage: (message: string) => boolean;
export declare const resolveTaskErrorType: (
  error: string,
  explicitType?: TaskErrorType
) => TaskErrorType;

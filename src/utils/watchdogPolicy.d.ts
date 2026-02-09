export declare const isWatchdogTimeoutError: (message: string) => boolean;

export declare const computeTaskWatchdogTimeoutMs: (
  taskMode: "full" | "download-only",
  settings?: {
    settings_generationTimeout?: number;
    settings_downloadTimeout?: number;
    settings_pageLoadTimeout?: number;
  }
) => number;

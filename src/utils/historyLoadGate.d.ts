export type HistoryImageWaitInput = {
  hasHistory: boolean;
  hasAnyImage: boolean;
  lastImageLoaded: boolean;
  elapsedMs: number;
  graceMs: number;
};

export type HistoryImageWaitDecision = {
  shouldWait: boolean;
  reason:
    | "no-history"
    | "last-image-ready"
    | "waiting-last-image"
    | "history-no-image"
    | "waiting-image-appear";
};

export declare const evaluateHistoryImageWait: (
  input: HistoryImageWaitInput
) => HistoryImageWaitDecision;

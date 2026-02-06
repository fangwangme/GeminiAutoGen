import type { TaskErrorType } from "./errorClassifier.js";

export type TaskErrorDecisionParams = {
  error: string;
  errorType?: TaskErrorType;
  currentRetries: number;
  maxRetries: number;
  consecutiveFailureCount: number;
  maxConsecutiveFailures: number;
};

export type TaskErrorDecision = {
  resolvedErrorType: TaskErrorType;
  action:
    | "stop-locked-url"
    | "stop-folder"
    | "retry-download"
    | "retry-full"
    | "fail-stop"
    | "fail-next";
  nextRetryCount: number;
  nextConsecutiveFailureCount: number;
  shouldIncrementFailedCount: boolean;
};

export declare const decideTaskErrorOutcome: (
  params: TaskErrorDecisionParams
) => TaskErrorDecision;

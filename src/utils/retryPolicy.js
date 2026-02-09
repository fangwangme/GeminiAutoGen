import { resolveTaskErrorType } from "./errorClassifier.js";

export const decideTaskErrorOutcome = (params) => {
  const {
    error,
    errorType,
    currentRetries,
    maxRetries,
    consecutiveFailureCount,
    maxConsecutiveFailures
  } = params;

  const resolvedErrorType = resolveTaskErrorType(error, errorType);

  if (resolvedErrorType === "locked-url") {
    return {
      resolvedErrorType,
      action: "stop-locked-url",
      nextRetryCount: currentRetries,
      nextConsecutiveFailureCount: consecutiveFailureCount,
      shouldIncrementFailedCount: false
    };
  }

  if (resolvedErrorType === "folder") {
    return {
      resolvedErrorType,
      action: "stop-folder",
      nextRetryCount: currentRetries,
      nextConsecutiveFailureCount: consecutiveFailureCount,
      shouldIncrementFailedCount: false
    };
  }

  if (currentRetries < maxRetries) {
    const retryAction =
      resolvedErrorType === "download" ? "retry-download" : "retry-full";
    return {
      resolvedErrorType,
      action: retryAction,
      nextRetryCount: currentRetries + 1,
      nextConsecutiveFailureCount: consecutiveFailureCount,
      shouldIncrementFailedCount: false
    };
  }

  const nextConsecutiveFailureCount = consecutiveFailureCount + 1;
  const shouldStopAfterFailure =
    maxConsecutiveFailures > 0 &&
    nextConsecutiveFailureCount >= maxConsecutiveFailures;

  return {
    resolvedErrorType,
    action: shouldStopAfterFailure ? "fail-stop" : "fail-next",
    nextRetryCount: 0,
    nextConsecutiveFailureCount,
    shouldIncrementFailedCount: true
  };
};

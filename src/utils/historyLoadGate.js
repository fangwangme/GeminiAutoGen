export const evaluateHistoryImageWait = ({
  hasHistory,
  hasAnyImage,
  lastImageLoaded,
  elapsedMs,
  graceMs
}) => {
  if (!hasHistory) {
    return { shouldWait: false, reason: "no-history" };
  }

  if (hasAnyImage) {
    if (lastImageLoaded) {
      return { shouldWait: false, reason: "last-image-ready" };
    }
    return { shouldWait: true, reason: "waiting-last-image" };
  }

  if (elapsedMs >= graceMs) {
    return { shouldWait: false, reason: "history-no-image" };
  }

  return { shouldWait: true, reason: "waiting-image-appear" };
};

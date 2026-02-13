export const evaluateContentHistoryImageWait = ({
  hasAnyImage,
  lastImageLoaded,
  hasTextOnlyWarning = false
}) => {
  if (hasTextOnlyWarning) {
    return { shouldWait: false, reason: "last-response-text-warning" };
  }
  if (!hasAnyImage) {
    return { shouldWait: true, reason: "waiting-last-image-appear" };
  }
  if (!lastImageLoaded) {
    return { shouldWait: true, reason: "waiting-last-image-loaded" };
  }
  return { shouldWait: false, reason: "last-image-loaded" };
};

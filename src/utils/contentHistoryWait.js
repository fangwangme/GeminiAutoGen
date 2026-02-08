export const evaluateContentHistoryImageWait = ({
  hasAnyImage,
  lastImageLoaded
}) => {
  if (!hasAnyImage) {
    return { shouldWait: true, reason: "waiting-last-image-appear" };
  }
  if (!lastImageLoaded) {
    return { shouldWait: true, reason: "waiting-last-image-loaded" };
  }
  return { shouldWait: false, reason: "last-image-loaded" };
};

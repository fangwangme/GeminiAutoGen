import { evaluateContentHistoryImageWait } from "../utils/contentHistoryWait.js";

export const evaluateHistoryImageWait = ({
  hasAnyImage,
  lastImageLoaded,
  hasTextOnlyWarning
}: {
  hasAnyImage: boolean;
  lastImageLoaded: boolean;
  hasTextOnlyWarning?: boolean;
}) =>
  evaluateContentHistoryImageWait({
    hasAnyImage,
    lastImageLoaded,
    hasTextOnlyWarning
  });

import { evaluateContentHistoryImageWait } from "../utils/contentHistoryWait.js";

export const evaluateHistoryImageWait = ({
  hasAnyImage,
  lastImageLoaded
}: {
  hasAnyImage: boolean;
  lastImageLoaded: boolean;
}) =>
  evaluateContentHistoryImageWait({
    hasAnyImage,
    lastImageLoaded
  });

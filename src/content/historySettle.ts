import { evaluateHistoryImageWait } from "./historyWait.js";
import {
  getLastConversationContainer,
  getLastGeneratedImageInConversation,
  getResponseReadyState,
  hasTextOnlyModerationWarning,
  isImageLoaded
} from "./domHelpers.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;
type Logger = (message: string, data?: unknown) => void;

export async function waitForHistoryImagesToSettle(params: {
  stabilityTimeoutMs: number;
  stepDelayMs: number;
  wait: (ms: number) => Promise<void>;
  t: Translator;
  logInfo: Logger;
}) {
  const { stabilityTimeoutMs, stepDelayMs, wait, t, logInfo } = params;
  const stabilityStart = Date.now();
  let lastReportTime = 0;

  while (true) {
    const elapsedMs = Date.now() - stabilityStart;
    if (elapsedMs > stabilityTimeoutMs) {
      const timeoutSeconds = Math.round(stabilityTimeoutMs / 1000);
      throw new Error(
        t("content.error.pageStabilityTimeout", {
          seconds: timeoutSeconds
        })
      );
    }

    const lastConversation = getLastConversationContainer();
    const responseState = lastConversation
      ? getResponseReadyState(lastConversation)
      : null;
    const hasTextOnlyWarning =
      !!responseState &&
      responseState.ariaBusy !== "true" &&
      !responseState.hasVisibleLoader &&
      hasTextOnlyModerationWarning(lastConversation);
    const lastImage = hasTextOnlyWarning
      ? null
      : getLastGeneratedImageInConversation(lastConversation);
    const hasAnyImage = Boolean(lastImage);
    const lastImageLoaded =
      !!lastImage &&
      isImageLoaded(lastImage) &&
      (lastImage.naturalWidth > 100 || lastImage.width > 100);

    const waitDecision = evaluateHistoryImageWait({
      hasAnyImage,
      lastImageLoaded,
      hasTextOnlyWarning
    });
    if (!waitDecision.shouldWait) {
      logInfo(`[Content] History ready: ${waitDecision.reason}`);
      return;
    }

    if (Date.now() - lastReportTime > 2000) {
      logInfo(
        `[Content] Still waiting: ${waitDecision.reason} (${Math.round(elapsedMs / 1000)}s, hasImage=${hasAnyImage}, loaded=${lastImageLoaded}, textWarning=${hasTextOnlyWarning})`
      );
      lastReportTime = Date.now();
    }

    await wait(stepDelayMs);
  }
}

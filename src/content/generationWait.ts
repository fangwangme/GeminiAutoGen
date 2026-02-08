import {
  findConversationByPrompt,
  getDownloadButtonInConversation,
  getDownloadButtonsInContainer,
  getGeneratedImageCandidates,
  getImageSrc,
  getLoadedImagesInContainer,
  getResponseReadyState,
  isImageLoaded,
  isVisible
} from "./domHelpers.js";
import { TaskError } from "./runtime.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;
type Logger = (message: string, data?: unknown) => void;
type WaitForFn = (
  conditionFn: () => boolean | Promise<boolean>,
  timeout: number,
  checkInterval: number,
  errorMessage: string
) => Promise<boolean>;

export async function waitForGenerationReady(params: {
  taskPrompt: string;
  filename: string;
  responseContainer: Element | null;
  lastContainerIdBeforeSend: string | null;
  resolveResponseContainer: () => Element | null;
  waitFor: WaitForFn;
  configGenTimeoutMs: number;
  configPollMs: number;
  configStabilityTimeoutMs: number;
  t: Translator;
  logInfo: Logger;
}) {
  const {
    taskPrompt,
    filename,
    lastContainerIdBeforeSend,
    resolveResponseContainer,
    waitFor,
    configGenTimeoutMs,
    configPollMs,
    configStabilityTimeoutMs,
    t,
    logInfo
  } = params;

  let responseContainer = params.responseContainer;
  let pollTick = 0;
  let latestDownloadButtons: HTMLButtonElement[] = [];
  let latestNewImages: HTMLImageElement[] = [];
  let responseBaselineSrcs = new Set<string>();
  let baselineReady = false;
  let noProgressSince = Date.now();
  const noProgressTimeoutMs = Math.min(
    configGenTimeoutMs,
    Math.max(configStabilityTimeoutMs, 15000)
  );

  let conversationMatch: { container: HTMLElement; userQuery: HTMLElement } | null =
    null;
  let confirmedNewContainerId: string | null = null;
  let lastPollLogTime = Date.now();

  await waitFor(
    () => {
      pollTick += 1;
      const now = Date.now();
      const shouldLog = now - lastPollLogTime >= 5000;
      if (shouldLog) lastPollLogTime = now;

      const match = findConversationByPrompt(taskPrompt, filename);
      if (match) {
        const matchId = match.container.id || "";
        const isDifferentId =
          matchId && lastContainerIdBeforeSend && matchId !== lastContainerIdBeforeSend;
        const isNewlyCreated = !lastContainerIdBeforeSend || isDifferentId || !matchId;

        if (isNewlyCreated) {
          const shouldAdopt =
            !conversationMatch ||
            conversationMatch.container !== match.container ||
            (!confirmedNewContainerId && !!matchId);
          if (shouldAdopt) {
            conversationMatch = match;
            confirmedNewContainerId = matchId || null;
            responseBaselineSrcs = new Set<string>();
            baselineReady = false;
            noProgressSince = Date.now();
            if (matchId) {
              logInfo(`[Content] Target container identified by ID: ${matchId}`);
            } else if (!confirmedNewContainerId) {
              logInfo("[Content] Target container identified by position (no ID)");
            }
          }
        }
      }

      const resolvedContainer = resolveResponseContainer();
      if (resolvedContainer && resolvedContainer !== responseContainer) {
        responseContainer = resolvedContainer;
        responseBaselineSrcs = new Set<string>();
        baselineReady = false;
      }

      const targetContainer = conversationMatch?.container || responseContainer;
      if (!targetContainer) {
        if (shouldLog) logInfo("[Content] Still searching for response container...");
        return false;
      }

      const responseState = getResponseReadyState(targetContainer);
      if (shouldLog) {
        logInfo("[Content] Generation poll status", {
          tick: pollTick,
          isReady: responseState.ready,
          ariaBusy: responseState.ariaBusy,
          footerComplete: responseState.footerComplete,
          hasVisibleLoader: responseState.hasVisibleLoader,
          hasLoadedImage: responseState.hasLoadedImage,
          baselineReady
        });
      }

      const hasProgressSignal =
        responseState.ariaBusy === "true" ||
        responseState.footerComplete ||
        responseState.hasLoadedImage;
      if (hasProgressSignal) {
        noProgressSince = now;
      } else if (now - noProgressSince >= noProgressTimeoutMs) {
        throw new TaskError(
          `${t("content.error.timeoutDownloadButton")} (no progress for ${Math.round(
            noProgressTimeoutMs / 1000
          )}s)`,
          "generation"
        );
      }

      if (!responseState.ready) {
        return false;
      }

      if (!baselineReady) {
        getGeneratedImageCandidates(targetContainer).forEach((img) => {
          const src = getImageSrc(img);
          if (src) responseBaselineSrcs.add(src);
        });
        baselineReady = true;
      }

      const loadedImages = getLoadedImagesInContainer(targetContainer);
      let scopedButtons = getDownloadButtonsInContainer(targetContainer, true, true);
      const scopedImageCandidates = getGeneratedImageCandidates(targetContainer);
      const scopedVisibleImages = scopedImageCandidates.filter((img) => isVisible(img));
      const scopedLargeImages = scopedVisibleImages.filter((img) => img.width > 100);
      const scopedImages = scopedLargeImages.filter((img) => isImageLoaded(img));
      const scopedLoadedImages = scopedImageCandidates.filter(
        (img) => isImageLoaded(img) && img.naturalWidth > 100
      );

      latestDownloadButtons = scopedButtons;
      const newImages = scopedImages.filter((img) => {
        const src = getImageSrc(img);
        return src && !responseBaselineSrcs.has(src);
      });
      const hasNewImage =
        newImages.length > 0 ||
        (responseBaselineSrcs.size === 0 && scopedLoadedImages.length > 0) ||
        loadedImages.length > 0;
      latestNewImages = newImages.length > 0 ? newImages : loadedImages;
      const hasGenerationOutputSignal =
        hasNewImage ||
        scopedImageCandidates.length > 0 ||
        responseState.footerComplete ||
        responseState.hasLoadedImage;

      const directDownloadBtn = getDownloadButtonInConversation(targetContainer);
      if (directDownloadBtn && !scopedButtons.includes(directDownloadBtn)) {
        scopedButtons.push(directDownloadBtn);
        latestDownloadButtons = scopedButtons;
      }

      if (scopedButtons.length > 0 && hasGenerationOutputSignal) {
        latestDownloadButtons = scopedButtons;
        if (conversationMatch) {
          responseContainer = conversationMatch.container;
        }
        return true;
      }
      return false;
    },
    configGenTimeoutMs,
    configPollMs,
    t("content.error.timeoutDownloadButton")
  );

  return { latestDownloadButtons, latestNewImages, responseContainer };
}

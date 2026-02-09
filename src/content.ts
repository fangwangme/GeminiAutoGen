import type { TaskItem } from "./types.js";
import {
  findConversationByPrompt,
  findPromptAnchor,
  findUserQueryByPromptText,
  getConversationContainer,
  getDownloadButtonForImage,
  getDownloadButtonInConversation,
  getDownloadButtonsInContainer,
  getDownloadBtns,
  getElementsAfterAnchor,
  getGeneratedImageCandidates,
  getGeneratedImages,
  getLastConversationContainer,
  getLoadedImagesInContainer,
  getResponseContainerForAnchor,
  getResponseReadyState,
  isButtonEnabled,
  normalizeText,
  userQueryMatchesPrompt
} from "./content/domHelpers.js";
import { waitForGenerationReady } from "./content/generationWait.js";
import { waitForHistoryImagesToSettle } from "./content/historySettle.js";
import {
  clickDownloadButton,
  isClickable,
  revealDownloadButton
} from "./content/interactions.js";
import {
  urlsMatch,
  validateLockedConversationUrl
} from "./content/lockedUrl.js";
import {
  createTranslator,
  defaultContentTranslator,
  getStoredLanguage
} from "./content/localization.js";
import {
  findInputField,
  getSendButton,
  getStopButton,
  isGeminiPageReady
} from "./content/pageSelectors.js";
import {
  clickDownloadMenuItem,
  scrollToBottom,
  writePrompt
} from "./content/uxActions.js";
import {
  CheckFileExistsResponse,
  ContentSettings,
  createContentLogger,
  isFolderAuthErrorMessage,
  normalizeTaskMode,
  resolveTaskErrorType,
  runtimeSendMessage,
  storageGet,
  toSafeTaskFilename,
  TaskError,
  TaskErrorType,
  TaskMode,
  toErrorMessage,
  WaitAndRenameResponse
} from "./content/runtime.js";

let t = defaultContentTranslator();
const { logInfo, logWarn, logError } = createContentLogger(runtimeSendMessage);

// --- Gemini AutoGen Content Script (Single Task Mode) ---
// This script processes ONE task and then signals completion

(async function () {
  const language = await getStoredLanguage();
  t = createTranslator(language);
  let activeTaskIndex: number | undefined;
  let activeTaskRunSeq: number | undefined;

  // 0. Load Settings
  const settings = await storageGet<ContentSettings>([
    "settings_generationTimeout",
    "settings_downloadTimeout",
    "settings_pageLoadTimeout",
    "settings_inputTimeout",
    "settings_stepDelay",
    "settings_pollInterval",
    "settings_inputPollInterval",
    "settings_sendPollInterval",
    "settings_generationPollInterval"
  ]);
  const CONFIG_GEN_TIMEOUT = (settings.settings_generationTimeout || 120) * 1000;
  const CONFIG_DOWNLOAD_TIMEOUT = (settings.settings_downloadTimeout || 120) * 1000;
  const CONFIG_STABILITY_TIMEOUT =
    (settings.settings_pageLoadTimeout || 30) * 1000;
  const CONFIG_INPUT_TIMEOUT = (settings.settings_inputTimeout || 5) * 1000;
  const rawStepDelaySeconds = settings.settings_stepDelay;
  const normalizedStepDelaySeconds =
    rawStepDelaySeconds && rawStepDelaySeconds > 60
      ? rawStepDelaySeconds / 1000
      : rawStepDelaySeconds;
  const CONFIG_STEP_DELAY = (normalizedStepDelaySeconds || 1) * 1000;
  const pollIntervalSeconds =
    settings.settings_pollInterval ??
    settings.settings_inputPollInterval ??
    settings.settings_generationPollInterval ??
    settings.settings_sendPollInterval ??
    1;
  const normalizedPollIntervalSeconds =
    pollIntervalSeconds > 0 ? pollIntervalSeconds : 1;
  const CONFIG_POLL = normalizedPollIntervalSeconds * 1000;
  const CONFIG_SEND_TIMEOUT = Math.max(CONFIG_INPUT_TIMEOUT, CONFIG_STEP_DELAY * 5);

  logInfo("[Content] Timing config", {
    generationTimeoutMs: CONFIG_GEN_TIMEOUT,
    downloadTimeoutMs: CONFIG_DOWNLOAD_TIMEOUT,
    pageLoadTimeoutMs: CONFIG_STABILITY_TIMEOUT,
    inputTimeoutMs: CONFIG_INPUT_TIMEOUT,
    stepDelayMs: CONFIG_STEP_DELAY,
    pollMs: CONFIG_POLL
  });

  // No longer focus tab/window - only use element focus to avoid interrupting user

  // --- Helpers ---
  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const waitFor = async (
    conditionFn: () => boolean | Promise<boolean>,
    timeout = CONFIG_GEN_TIMEOUT,
    checkInterval = CONFIG_POLL,
    errorMessage = "Timeout"
  ) => {
    const start = Date.now();
    const end = start + timeout;
    while (Date.now() < end) {
      if (await conditionFn()) return true;
      const remaining = end - Date.now();
      if (remaining <= 0) break;
      await wait(Math.min(checkInterval, remaining));
    }
    const actualElapsed = Math.round((Date.now() - start) / 1000);
    throw new Error(`${errorMessage} (waited ${actualElapsed}s, limit ${Math.round(timeout / 1000)}s)`);
  };

  function updateStatus(text: string, isError = false) {
    runtimeSendMessage<void>({
      action: "UPDATE_STATUS",
      status: text,
      isError,
      taskIndex: activeTaskIndex,
      taskRunSeq: activeTaskRunSeq
    }).catch(() => {});
  }

  const reportTaskComplete = (skipped: boolean) => {
    runtimeSendMessage<void>({
      action: "TASK_COMPLETE",
      skipped,
      taskIndex: activeTaskIndex,
      taskRunSeq: activeTaskRunSeq
    }).catch(() => {});
  };

  const reportTaskError = (error: string, errorType?: TaskErrorType) => {
    runtimeSendMessage<void>({
      action: "TASK_ERROR",
      error,
      errorType,
      taskIndex: activeTaskIndex,
      taskRunSeq: activeTaskRunSeq
    }).catch(() => {});
  };

  async function prepareDownloadOnlyContext(
    task: TaskItem,
    filename: string,
    composedPrompt: string,
    promptAnchorText: string
  ) {
    logInfo(`[Content] Download-only mode: ${filename}`);
    logInfo("[Content] Waiting for existing response", {
      timeoutMs: CONFIG_GEN_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    updateStatus(t("content.status.retryingDownload"));

    let responseContainer: Element | null = null;

    const conversationMatch = findConversationByPrompt(task.prompt, filename);
    if (conversationMatch?.container) {
      responseContainer = conversationMatch.container;
    }

    if (!responseContainer) {
      const anchor =
        findUserQueryByPromptText(promptAnchorText) ||
        findUserQueryByPromptText(composedPrompt) ||
        findPromptAnchor(promptAnchorText);
      responseContainer = anchor
        ? getResponseContainerForAnchor(anchor) ?? getConversationContainer(anchor)
        : null;
    }

    if (!responseContainer) {
      throw new TaskError(
        t("content.error.existingResponseNotFound"),
        "generation"
      );
    }

    let pollTick = 0;
    await waitFor(
      () => {
        pollTick += 1;
        if (!responseContainer || !responseContainer.isConnected) return false;
        const responseState = getResponseReadyState(responseContainer);
        if (!responseState.ready) return false;
        const buttons = getDownloadButtonsInContainer(responseContainer, true, true);
        const loadedImages = getLoadedImagesInContainer(responseContainer);
        return buttons.length > 0 && loadedImages.length > 0;
      },
      CONFIG_GEN_TIMEOUT,
      CONFIG_POLL,
      t("content.error.timeoutExistingResponse")
    );

    const latestDownloadButtons = getDownloadButtonsInContainer(responseContainer, true, true);
    const latestNewImages = getLoadedImagesInContainer(responseContainer);

    return { responseContainer, latestDownloadButtons, latestNewImages };
  }

  async function performDownload(params: {
    filename: string;
    responseContainer: Element | null;
    latestDownloadButtons: HTMLButtonElement[];
    latestNewImages: HTMLImageElement[];
  }) {
    const { filename, responseContainer, latestDownloadButtons, latestNewImages } =
      params;
    updateStatus(t("content.status.downloading"));

    let targetBtn: HTMLButtonElement | null = null;

    if (responseContainer) {
      targetBtn = getDownloadButtonInConversation(responseContainer);
    }

    if (!targetBtn) {
      let downloadBtns = latestDownloadButtons.length
        ? latestDownloadButtons
        : responseContainer
          ? getDownloadButtonsInContainer(responseContainer, true, true)
          : [];
      if (!downloadBtns.length) {
        const fallbackButtons = responseContainer
          ? getDownloadButtonsInContainer(responseContainer, true, true)
          : [];
        downloadBtns = fallbackButtons;
      }

      const nearestButton = getDownloadButtonForImage(
        latestNewImages.length
          ? latestNewImages[latestNewImages.length - 1]
          : responseContainer
            ? getGeneratedImages(responseContainer).slice(-1)[0] || null
            : null
      );
      if (nearestButton && !downloadBtns.includes(nearestButton)) {
        downloadBtns.push(nearestButton);
      }

      if (!downloadBtns.length) {
        throw new TaskError(t("content.error.noDownloadButtons"), "generation");
      }
      const lastBtn = downloadBtns[downloadBtns.length - 1];
      targetBtn = nearestButton || lastBtn;
    }

    if (!targetBtn) {
      throw new TaskError(t("content.error.noDownloadButton"), "generation");
    }

    logInfo(`[Content] Clicking download: ${filename}`);

    for (let revealAttempt = 0; revealAttempt < 3; revealAttempt++) {
      revealDownloadButton(targetBtn);
      await wait(200);
      if (isClickable(targetBtn)) {
        break;
      }
    }

    if (!isClickable(targetBtn)) {
      logWarn("[Content] Download button not clickable, trying anyway");
    }

    clickDownloadButton(targetBtn);
    await clickDownloadMenuItem(wait);

    updateStatus(t("content.status.waitingForFile"));
    const renameResult = await Promise.race([
      runtimeSendMessage<WaitAndRenameResponse>({
        action: "WAIT_AND_RENAME",
        targetFilename: filename
      }),
      new Promise<WaitAndRenameResponse>((resolve) => {
        setTimeout(() => {
          resolve({
            success: false,
            error: t("errors.timeoutWaitingDownload"),
            errorType: "download"
          });
        }, CONFIG_DOWNLOAD_TIMEOUT);
      })
    ]);

    if (!renameResult || !renameResult.success) {
      const fallbackType: TaskErrorType = renameResult?.errorType
        ? renameResult.errorType
        : renameResult?.error && isFolderAuthErrorMessage(renameResult.error)
          ? "folder"
          : "download";
      throw new TaskError(
        renameResult?.error || t("content.error.fileRenameFailed"),
        fallbackType
      );
    }
  }

  let currentPhase: "generation" | "download" = "generation";

  // --- Main Logic ---
  try {
    // 1. Get current task from storage
    const data = await storageGet<{
      currentTask?: TaskItem;
      currentTaskMode?: string;
      lockedConversationUrl?: string;
      currentTaskIndex?: number;
      currentTaskRunSeq?: number;
    }>([
      "currentTask",
      "currentTaskMode",
      "lockedConversationUrl",
      "currentTaskIndex",
      "currentTaskRunSeq"
    ]);
    activeTaskIndex =
      typeof data.currentTaskIndex === "number" ? data.currentTaskIndex : undefined;
    activeTaskRunSeq =
      typeof data.currentTaskRunSeq === "number"
        ? data.currentTaskRunSeq
        : undefined;
    const task = data.currentTask;
    const taskMode = normalizeTaskMode(data.currentTaskMode);
    const lockedConversationUrl = (data.lockedConversationUrl || "").trim();

    if (!task) {
      logInfo("[Content] No task found.");
      reportTaskError("No task found");
      return;
    }

    logInfo(`[Content] Processing: ${task.name}`);
    updateStatus(
      t("content.status.processing", {
        name: task.name
      })
    );

    // 2. Prepare filename for skip check
    const filename = toSafeTaskFilename(task.name);

    const composedPrompt = `name: ${filename}\nprompt: ${task.prompt}`;
    const promptAnchorText = `name: ${filename}`;

    // 3. Check if file exists (skip logic)
    const checkResult = await runtimeSendMessage<CheckFileExistsResponse>({
      action: "CHECK_FILE_EXISTS",
      filename
    });

    if (checkResult?.error) {
      const errorType: TaskErrorType = checkResult.errorType
        ? checkResult.errorType
        : resolveTaskErrorType(checkResult.error);
      throw new TaskError(checkResult.error, errorType);
    }

    if (checkResult && checkResult.exists) {
      logInfo(`[Content] File exists, skipping: ${filename}`);
      updateStatus(
        t("content.status.skipped", {
          name: task.name
        })
      );
      reportTaskComplete(true);
      return;
    }

    if (!lockedConversationUrl) {
      throw new TaskError(
        t("content.error.lockedUrlRequired"),
        "locked-url"
      );
    }
    const lockedValidation = validateLockedConversationUrl(
      lockedConversationUrl,
      t
    );
    if (!lockedValidation.ok) {
      throw new TaskError(
        lockedValidation.message || t("validation.lockedUrl.invalid"),
        "locked-url"
      );
    }
    const assertLockedConversationUrlMatch = (phase: string) => {
      const currentUrl = window.location.href;
      if (urlsMatch(lockedConversationUrl, currentUrl)) {
        return;
      }
      logError("[Content] Locked URL mismatch", {
        phase,
        expected: lockedConversationUrl,
        actual: currentUrl
      });
      throw new TaskError(
        t("content.error.lockedUrlMismatch", {
          expected: lockedConversationUrl,
          actual: currentUrl
        }),
        "locked-url"
      );
    };

    assertLockedConversationUrlMatch("task-start");

    if (taskMode === "download-only") {
      const downloadContext = await prepareDownloadOnlyContext(
        task,
        filename,
        composedPrompt,
        promptAnchorText
      );
      currentPhase = "download";
      await performDownload({
        filename,
        responseContainer: downloadContext.responseContainer,
        latestDownloadButtons: downloadContext.latestDownloadButtons,
        latestNewImages: downloadContext.latestNewImages
      });
      logInfo(`[Content] Task complete: ${task.name}`);
      updateStatus(
        t("content.status.complete", {
          name: task.name
        })
      );
      reportTaskComplete(false);
      return;
    }

    // 4. Wait for Gemini page to be fully ready (not just input field)
    logInfo("[Content] Waiting for page ready", {
      timeoutMs: CONFIG_INPUT_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    let inputField: HTMLElement | null = null;
    const inputWaitStart = Date.now();
    let lastInputWaitLog = 0;
    const logPageReadyState = () => {
      logInfo("[Content] Page not ready yet", {
        elapsedMs: Date.now() - inputWaitStart,
        timeoutMs: CONFIG_INPUT_TIMEOUT
      });
    };

    try {
      await waitFor(
        () => {
          const pageState = isGeminiPageReady();
          if (pageState.ready) {
            inputField = findInputField();
            return true;
          }
          const now = Date.now();
          if (now - lastInputWaitLog >= 3000) {
            lastInputWaitLog = now;
            logPageReadyState();
          }
          return false;
        },
        CONFIG_INPUT_TIMEOUT,
        CONFIG_POLL,
        t("content.error.timeoutInputField")
      );
    } catch (err) {
      logError("[Content] Page ready wait timed out", {
        elapsedMs: Date.now() - inputWaitStart,
        timeoutMs: CONFIG_INPUT_TIMEOUT
      });
      throw err;
    }

    logInfo("[Content] Page ready", { elapsedMs: Date.now() - inputWaitStart });

    if (!inputField) {
      throw new Error(t("content.error.inputFieldNotFound"));
    }
    const initialInputField = inputField as HTMLElement;

    try {
      if (!task) throw new Error("Task object is missing at processor start");

      logInfo(`[Content] Task started: ${task.name} (mode: ${taskMode})`);

      // 4.5 Wait for history to settle (last image in last conversation)
      const containers = document.querySelectorAll(
        ".conversation-container, .response-container, model-response"
      );
      const hasHistory = containers.length > 0;

      const lastConversation = hasHistory ? getLastConversationContainer() : null;
      const historyImages = lastConversation
        ? getGeneratedImageCandidates(lastConversation)
        : [];

      logInfo(
        `[Content] History check: hasHistory=${hasHistory}, containers=${containers.length}, lastConvImages=${historyImages.length}`
      );

      logInfo("[Content] Waiting for history images to settle...");
      await waitForHistoryImagesToSettle({
        stabilityTimeoutMs: CONFIG_STABILITY_TIMEOUT * 2,
        stepDelayMs: CONFIG_STEP_DELAY,
        wait,
        t,
        logInfo
      });
    } catch (initErr) {
      logError("[Content] Critical error during history wait initialization", {
        error: String(initErr),
        stack: (initErr as Error).stack
      });
      throw initErr;
    }

    // Extra safety wait before starting task
    logInfo("[Content] Waiting safety delay", {
      sleepMs: CONFIG_STEP_DELAY * 3
    });
    await wait(CONFIG_STEP_DELAY * 3);

    // 5. Scroll to bottom and prepare
    logInfo("[Content] Scrolling to bottom", {
      sleepMs: CONFIG_STEP_DELAY
    });
    await scrollToBottom({ wait, stepDelayMs: CONFIG_STEP_DELAY });
    await wait(CONFIG_STEP_DELAY); // Wait after scroll

    assertLockedConversationUrlMatch("before-type");

    // 6. Activate and type
    logInfo("[Content] Typing prompt...");
    initialInputField.click();
    await wait(Math.max(200, CONFIG_STEP_DELAY / 5));
    initialInputField.focus();
    await wait(Math.max(200, CONFIG_STEP_DELAY / 5));

    // Clear existing text if any
    if (initialInputField.innerText.trim().length > 0) {
      document.execCommand("selectAll", false, undefined);
      document.execCommand("delete", false, undefined);
      await wait(Math.max(200, CONFIG_STEP_DELAY / 5));
    }

    // Type prompt
    const inputFieldForWrite = findInputField() || initialInputField;
    const promptWritten = await writePrompt({
      inputField: inputFieldForWrite,
      prompt: composedPrompt,
      wait,
      stepDelayMs: CONFIG_STEP_DELAY
    });
    if (!promptWritten) {
      throw new Error(t("content.error.failedToWritePrompt"));
    }

    // Wait 1 second before clicking send
    logInfo("[Content] Sleep before send", { sleepMs: CONFIG_STEP_DELAY });
    await wait(CONFIG_STEP_DELAY);

    // 6. Click Send
    logInfo("[Content] Waiting for Send button", {
      timeoutMs: CONFIG_SEND_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    let sendBtn: HTMLButtonElement | null = null;
    await waitFor(
      () => {
        if (getStopButton()) return false;
        const btn = getSendButton();
        if (btn) {
          sendBtn = btn;
          return true;
        }
        if (inputField) {
          inputField.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return false;
      },
      CONFIG_SEND_TIMEOUT,
      CONFIG_POLL,
      t("content.error.timeoutSendButton")
    );

    if (!sendBtn) {
      throw new Error(t("content.error.sendButtonNotFound"));
    }
    const sendButton = sendBtn as HTMLButtonElement;

    const initialGlobalDownloadBtnCount = getDownloadBtns(true).length;
    const initialGlobalImageCount = getGeneratedImages().length;

    const userQueriesBeforeSend = Array.from(
      document.querySelectorAll("user-query")
    );
    const lastUserQueryBeforeSend = userQueriesBeforeSend.length
      ? (userQueriesBeforeSend[userQueriesBeforeSend.length - 1] as Element)
      : null;
    const initialUserQueryCount = userQueriesBeforeSend.length;

    const initialConversationCount = document.querySelectorAll(
      ".conversation-container"
    ).length;
    
    // CRITICAL: Record the ID of the last conversation container BEFORE sending
    // This ensures we wait for a NEW container and don't use old ones
    const containersBeforeSend = Array.from(
      document.querySelectorAll<HTMLElement>(".conversation-container")
    );
    const lastContainerBeforeSend = containersBeforeSend.length > 0
      ? containersBeforeSend[containersBeforeSend.length - 1]
      : null;
    const lastContainerIdBeforeSend = lastContainerBeforeSend?.id || null;

    assertLockedConversationUrlMatch("before-send");

    await wait(CONFIG_STEP_DELAY / 2);
    sendButton.focus({ preventScroll: true });
    sendButton.click();
    logInfo("[Content] Prompt sent");

    logInfo("[Content] Sleep after send", { sleepMs: CONFIG_STEP_DELAY });
    await wait(CONFIG_STEP_DELAY);

    logInfo("[Content] Waiting for input to clear", {
      timeoutMs: CONFIG_INPUT_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    await waitFor(
      () => {
        const field = findInputField();
        if (!field) return false;
        return normalizeText(field.innerText) === "";
      },
      CONFIG_INPUT_TIMEOUT,
      CONFIG_POLL,
      t("content.error.sendDidNotClearInput")
    );

    const getLatestUserQueryAfter = () => {
      const queries = Array.from(document.querySelectorAll("user-query"));
      if (!queries.length) return null;
      if (!lastUserQueryBeforeSend) {
        return queries[queries.length - 1] as Element;
      }
      const after = getElementsAfterAnchor(queries, lastUserQueryBeforeSend);
      return after.length ? (after[after.length - 1] as Element) : null;
    };

    let latestUserQuery: Element | null = null;
    try {
      logInfo("[Content] Waiting for prompt render", {
        timeoutMs: CONFIG_INPUT_TIMEOUT,
        pollMs: CONFIG_POLL
      });
      await waitFor(
        () => {
          const candidate = getLatestUserQueryAfter();
          if (!candidate) return false;
          latestUserQuery = candidate;
          return true;
        },
        CONFIG_INPUT_TIMEOUT,
        CONFIG_POLL,
        t("content.error.timeoutPromptRender")
      );
    } catch {
      logWarn("[Content] Prompt render wait timed out", {
        timeoutMs: CONFIG_INPUT_TIMEOUT
      });
    }

    let latestConversationContainer: HTMLElement | null = null;
    let hasNewConversationContainer = false;
    try {
      logInfo("[Content] Waiting for conversation container", {
        timeoutMs: CONFIG_INPUT_TIMEOUT,
        pollMs: CONFIG_POLL
      });
      await waitFor(
        () => {
          const containers = document.querySelectorAll(".conversation-container");
          if (containers.length > initialConversationCount) {
            latestConversationContainer =
              containers[containers.length - 1] as HTMLElement;
            hasNewConversationContainer = true;
            return true;
          }
          return false;
        },
        CONFIG_INPUT_TIMEOUT,
        CONFIG_POLL,
        t("content.error.timeoutConversationContainer")
      );
    } catch {
      const containers = document.querySelectorAll(".conversation-container");
      if (containers.length > initialConversationCount) {
        latestConversationContainer =
          containers[containers.length - 1] as HTMLElement;
        hasNewConversationContainer = true;
        logWarn("[Content] Conversation container wait timed out", {
          timeoutMs: CONFIG_INPUT_TIMEOUT
        });
      } else {
        latestConversationContainer = null;
        logWarn("[Content] Conversation container wait timed out", {
          timeoutMs: CONFIG_INPUT_TIMEOUT
        });
      }
    }

    const namedUserQuery: Element | null =
      findUserQueryByPromptText(promptAnchorText) ||
      findUserQueryByPromptText(composedPrompt);
    let promptAnchor: Element | null =
      userQueryMatchesPrompt(latestUserQuery, promptAnchorText, composedPrompt)
        ? latestUserQuery
        : null;
    promptAnchor = promptAnchor ?? namedUserQuery;
    if (
      promptAnchor &&
      lastUserQueryBeforeSend &&
      !(
        lastUserQueryBeforeSend.compareDocumentPosition(promptAnchor) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ) {
      promptAnchor = null;
    }
    if (!promptAnchor) {
      throw new Error(t("content.error.promptAnchorNotFound"));
    }
    let responseContainer: Element | null = getResponseContainerForAnchor(promptAnchor);
    const resolveResponseContainer = () => {
      return promptAnchor ? getResponseContainerForAnchor(promptAnchor) : null;
    };

    // 7. Wait for generation
    logInfo("[Content] Waiting for generation", {
      timeoutMs: CONFIG_GEN_TIMEOUT,
      pollMs: CONFIG_POLL
    });
    updateStatus(t("content.status.generating"));

    let latestDownloadButtons: HTMLButtonElement[] = [];
    let latestNewImages: HTMLImageElement[] = [];

    try {
      const generationResult = await waitForGenerationReady({
        taskPrompt: task.prompt,
        filename,
        responseContainer,
        lastContainerIdBeforeSend,
        resolveResponseContainer,
        waitFor,
        configGenTimeoutMs: CONFIG_GEN_TIMEOUT,
        configPollMs: CONFIG_POLL,
        configStabilityTimeoutMs: CONFIG_STABILITY_TIMEOUT,
        t,
        logInfo
      });
      latestDownloadButtons = generationResult.latestDownloadButtons;
      latestNewImages = generationResult.latestNewImages;
      responseContainer = generationResult.responseContainer;
    } catch (err) {
      const stopBtn = getStopButton();
      if (stopBtn && isButtonEnabled(stopBtn)) {
        stopBtn.click();
        await wait(Math.max(200, CONFIG_STEP_DELAY));
      }
      const message = toErrorMessage(err);
      if (message.includes(t("content.error.timeoutDownloadButton"))) {
        throw new TaskError(message, "generation");
      }
      throw err;
    }

    logInfo("[Content] Generation complete, waiting before download", {
      sleepMs: CONFIG_STEP_DELAY * 2
    });
    await wait(CONFIG_STEP_DELAY * 2); // Stability wait

    // 8. Download
    currentPhase = "download";
    await performDownload({
      filename,
      responseContainer,
      latestDownloadButtons,
      latestNewImages
    });

    logInfo(`[Content] Task complete: ${task.name}`);
    updateStatus(
      t("content.status.complete", {
        name: task.name
      })
    );
    reportTaskComplete(false);
  } catch (err) {
    const message = toErrorMessage(err);
    const errorType: TaskErrorType =
      err instanceof TaskError
        ? err.errorType
        : currentPhase === "download"
          ? resolveTaskErrorType(message, "download")
          : resolveTaskErrorType(message);
    logError("[Content] Error", { message, errorType });
    updateStatus(
      t("content.status.error", {
        message
      }),
      true
    );
    reportTaskError(message, errorType);
  }
})();

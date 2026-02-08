# GeminiAutoGen Architecture

This is the high-level architecture overview.
For detailed logic, use `docs/README.md` as the entry index.

## Runtime Flow (Overview)

1. `sidepanel` starts a run (`src/sidepanel.ts`).
2. Task state machine executes (`src/sidepanel/taskLifecycle.ts`):
   - load current task
   - inject content module into Gemini tab
   - handle retries/failures
   - recreate tab between tasks
   - watchdog hard-timeout fallback
3. Content script performs one task (`src/content.ts`):
   - validate locked conversation URL
   - wait page/input readiness
   - enforce history-image settle gate
   - type/send prompt
   - wait generation
   - trigger download button
4. Background handles file operations (`src/background.ts`):
   - poll source folder
   - wait file stabilization
   - hash check / duplicate guard
   - move/rename to output folder

## Source Structure (Overview)

```text
src/
  background.ts
  content.ts
  content/
    domHelpers.ts
    generationWait.ts
    historySettle.ts
    historyWait.ts
    interactions.ts
    localization.ts
    lockedUrl.ts
    pageSelectors.ts
    runtime.ts
    uxActions.ts
  sidepanel.ts
  sidepanel/
    chromeApi.ts
    consoleTimestamp.ts
    initState.ts
    logView.ts
    panelTypes.ts
    remainingTime.ts
    runControls.ts
    startRun.ts
    summaryLog.ts
    tabHelpers.ts
    taskLifecycle.ts
    uiBindings.ts
    urlLock.ts
  utils/
    contentHistoryWait.js
    errorClassifier.js
    historyLoadGate.js
    lockedConversation.js
    placeholderPolicy.js
    retryPolicy.js
    taskQueue.js
    watchdogPolicy.js
```

## Timeout Model (Overview)

User-configurable settings are stored in extension local storage.

Primary defaults:
- generation timeout: `120s`
- download timeout: `120s`
- page stability timeout: `30s`
- input timeout: `5s`
- step delay: `1s`
- poll interval: `1s`

Behavior:
- Content/background enforce per-step timeouts.
- Sidepanel watchdog is a hard fail-safe:
  - `full`: `generationTimeout + 15s`
  - `download-only`: `downloadTimeout + 15s`
- Watchdog timeout marks task failed and proceeds, preventing infinite stuck loops.

## Retry and Error Policy (Overview)

- Error classification: `src/utils/errorClassifier.js`
- Retry decision: `src/utils/retryPolicy.js`
- Locked URL and folder permission errors stop immediately.
- Download/generation errors retry within configured limits.
- Consecutive-failure cap can stop the run.

## Detailed Documents

- `docs/flow-sidepanel-task-lifecycle.md`
- `docs/flow-content-execution.md`
- `docs/flow-background-download-pipeline.md`
- `docs/timeout-and-retry-model.md`
- `docs/testing-and-quality.md`
- `docs/troubleshooting-playbook.md`

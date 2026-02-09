# GeminiAutoGen Architecture

This is the high-level architecture overview.
For detailed logic, use `docs/README.md` as the entry index.

## Runtime Flow (Overview)

1. `sidepanel` starts a run (`src/sidepanel.ts`).
2. Task state machine executes (`src/sidepanel/taskLifecycle.ts`):
   - load current task
   - persist task index/run sequence for message scoping
   - inject content module into Gemini tab
   - reject stale task messages from prior runs
   - verify output exists before accepting task completion
   - handle retries/failures
   - recreate tab between tasks
   - watchdog hard-timeout fallback
3. Content script performs one task (`src/content.ts`):
   - validate locked conversation URL
   - read task index/run sequence context for scoped reporting
   - wait page/input readiness
   - enforce history-image settle gate
   - type/send prompt
   - wait generation
   - trigger download button
   - report completion/error with task scope fields
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
- download response timeout (content race guard): `120s`
- download detect timeout (background poll phase): `120s`
- download stabilization timeout (background stabilize phase): `120s`
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

## Conversation Preconditions

For stable operation, run on a locked existing conversation that already contains at least one generated image.
Avoid fresh `new conversation` threads for production runs.

Reasoning:
- retry-download mode depends on existing response/download targets in conversation history
- history settle gate relies on prior image-load signals
- fresh threads provide weaker targeting context and are more prone to race conditions

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

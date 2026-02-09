# Sidepanel Task Lifecycle

This document describes the run orchestration behavior implemented by sidepanel modules.

## Main Modules

- `src/sidepanel.ts`: wiring and composition.
- `src/sidepanel/startRun.ts`: Start button pre-flight and queue initialization.
- `src/sidepanel/taskLifecycle.ts`: core state machine.
- `src/sidepanel/tabHelpers.ts`: tab load waiting and placeholder handling.
- `src/sidepanel/runControls.ts`: stop/reset actions.

## Run State

State is centralized in `TaskLifecycleState` (`src/sidepanel/taskLifecycle.ts`), including:

- queue and current index
- running flag
- current/locked conversation URL
- current tab id
- retry counters
- failure counters
- next task mode (`full` / `download-only`)

## Start Flow

`startRun.ts` performs:

1. locked conversation URL validation
2. operational precondition: locked URL should be an existing conversation that already has at least one generated image
3. tab acquisition (reuse or create)
4. optional lock URL reconciliation
5. existing-file pre-scan (`LIST_ALL_FILES`)
6. pending queue build
7. state reset and timer start

Then `taskLifecycle.processNextTask()` is called.

Why avoid new conversation:

- download-only retry depends on finding an existing response container and download button in history
- history settle gate uses existing image load state to avoid race with unfinished rendering
- in fresh conversation (no generated image yet), targeting is less stable and recovery path is weaker

## Task Processing

`processNextTask()` does:

1. check run complete
2. set UI status/progress
3. persist `currentTask` + `currentTaskMode` + `currentTaskIndex` + `currentTaskRunSeq`
4. arm watchdog
5. inject content module into target tab

Content script then returns completion/error via runtime messages that carry `taskIndex` and `taskRunSeq`.

## Message Handling

`handlePanelMessage()` consumes:

- `TASK_COMPLETE`
  - reject stale messages by `taskIndex` / `taskRunSeq`
  - if `skipped=false`, verify output with `CHECK_FILE_EXISTS` before accepting completion
  - if verification fails, convert to `download` error and route retry policy
  - if verification passes, clear retry and advance queue
- `TASK_ERROR`
  - reject stale messages by `taskIndex` / `taskRunSeq`
  - route to `handleTaskError()`
- `UPDATE_STATUS`
  - reject stale status updates by `taskIndex` / `taskRunSeq`
  - update sidepanel status text
- `PANEL_LOG`
  - append timestamped log line

## Error Handling and Retry

`handleTaskError()` combines:

- error classification (`errorClassifier`)
- retry decision (`retryPolicy`)
- policy actions:
  - stop locked-url errors immediately
  - stop folder permission errors immediately
  - retry download-only for download errors
  - retry full for generation errors
  - fail-next/fail-stop when retry budget exhausted

Watchdog timeout is treated as a dedicated fail-fast path and moves to next task.

## Tab Recreation Strategy

`recreateTab()`:

1. close current tab safely (create placeholder if last tab in window)
2. wait configured task interval
3. open locked conversation URL in a fresh tab
4. wait page load and readiness delay
5. re-validate locked URL
6. continue next task

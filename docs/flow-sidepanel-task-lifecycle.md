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
2. tab acquisition (reuse or create)
3. optional lock URL reconciliation
4. existing-file pre-scan (`LIST_ALL_FILES`)
5. pending queue build
6. state reset and timer start

Then `taskLifecycle.processNextTask()` is called.

## Task Processing

`processNextTask()` does:

1. check run complete
2. set UI status/progress
3. persist `currentTask` + `currentTaskMode`
4. arm watchdog
5. inject content module into target tab

Content script then returns completion/error via runtime messages.

## Message Handling

`handlePanelMessage()` consumes:

- `TASK_COMPLETE`
  - clear retry for task
  - update counters
  - update remaining time
  - recreate tab for next task
- `TASK_ERROR`
  - route to `handleTaskError()`
- `UPDATE_STATUS`
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

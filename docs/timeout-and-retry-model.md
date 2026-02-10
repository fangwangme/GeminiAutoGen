# Timeout and Retry Model

This document defines timeout ownership and retry behavior.

## Timeout Layers

## Content Layer (`src/content.ts`)

- generation wait: `settings_generationTimeout`
- input/page waits: `settings_inputTimeout`
- history settle gate budget: `settings_pageLoadTimeout * 2`
- send wait budget: `max(inputTimeout, stepDelay * 5)`
- local download response race timeout: `settings_downloadTimeout`

## Background Layer (`src/background.ts`)

- `WAIT_AND_RENAME` uses one global deadline: `settings_downloadTimeout`
- polling + stabilization + rename pipeline must complete within that single budget

## Sidepanel Layer (`src/sidepanel/taskLifecycle.ts`)

- watchdog hard timeout:
  - `full`: `generationTimeout + downloadTimeout + 15s`
  - `download-only`: `downloadTimeout + 15s`
- watchdog is fail-safe, not primary business timeout
- completion consistency guard: non-skipped `TASK_COMPLETE` must pass `CHECK_FILE_EXISTS`, otherwise treated as `download` error
- completion consistency guard has a hard check timeout (`10s`) to avoid panel-side deadlock

## Retry Policy

Policy source: `src/utils/retryPolicy.js`.

Inputs:
- error classification
- current retry count
- max retries
- consecutive failure count
- max consecutive failures

Actions:
- `stop-locked-url`
- `stop-folder`
- `retry-download`
- `retry-full`
- `fail-next`
- `fail-stop`

Special case:
- watchdog timeout bypasses normal retry loop and advances to next task.

## Practical Effect

- generation issues: usually retry full
- download issues: retry download-only (with tab recreation) until retry budget is exhausted
- every retry path recreates the tab first to avoid cross-task context contamination
- hard infrastructure issues (folder/URL mismatch): stop run immediately

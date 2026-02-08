# Timeout and Retry Model

This document defines timeout ownership and retry behavior.

## Timeout Layers

## Content Layer (`src/content.ts`)

- generation wait: `settings_generationTimeout`
- input/page waits: `settings_inputTimeout`
- history settle gate budget: `settings_pageLoadTimeout * 2`
- send wait budget: `max(inputTimeout, stepDelay * 5)`
- local download response race timeout: `downloadTimeout + small buffer`

## Background Layer (`src/background.ts`)

- `WAIT_AND_RENAME` uses `settings_downloadTimeout` as a **global deadline**
- polling and stabilization share the same deadline

## Sidepanel Layer (`src/sidepanel/taskLifecycle.ts`)

- watchdog hard timeout:
  - `full`: `generationTimeout + 15s`
  - `download-only`: `downloadTimeout + 15s`
- watchdog is fail-safe, not primary business timeout

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
- download issues: usually retry download-only first
- hard infrastructure issues (folder/URL mismatch): stop run immediately

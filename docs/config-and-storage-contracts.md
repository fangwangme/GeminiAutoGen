# Config and Storage Contracts

This document defines extension storage keys, ownership, and defaults.

## Ownership Map

- Sidepanel controls run-state and task pointers.
- Options page controls user settings.
- Background/content consume settings read-only at runtime.

## Core Keys

## Task/Run Keys

- `loadedTasks`: `TaskItem[]` from uploaded JSON
- `currentTask`: current task payload for content execution
- `currentTaskMode`: `"full" | "download-only"`
- `currentTaskIndex`: current task index owned by sidepanel, used for message scoping
- `currentTaskRunSeq`: per-run monotonic sequence owned by sidepanel, used for stale message rejection
- `lockedConversationUrl`: locked Gemini chat URL

## UI Keys

- `uiLanguage`: `"en" | "zh"`
- `logCollapsed`: `boolean`

## Folder Handle Keys (IndexedDB via `utils/idb.ts`)

- `sourceHandle`: `FileSystemDirectoryHandle`
- `outputHandle`: `FileSystemDirectoryHandle`

## Timing/Policy Keys

- `settings_generationTimeout` (default `120`)
- `settings_downloadTimeout` (default `120`)
- `settings_pageLoadTimeout` (default `30`)
- `settings_inputTimeout` (default `5`)
- `settings_stepDelay` (default `1`)
- `settings_taskInterval` (default `5`)
- `settings_pollInterval` (default `1`)
- `settings_maxRetries` (default `3`)
- `settings_maxConsecutiveFailures` (default `5`)

## Legacy Compatibility Keys (read fallback, removed on save)

- `settings_inputPollInterval`
- `settings_sendPollInterval`
- `settings_generationPollInterval`
- `settings_downloadPollInterval`
- `settings_downloadStabilityInterval`

## Obsolete Keys (no longer read, removed on save)

- `settings_downloadDetectTimeout`
- `settings_downloadStabilityTimeout`

## Reset Semantics

`RESET_STATE` clears background in-memory hash guard.
Sidepanel reset clears local storage and runtime queue state.

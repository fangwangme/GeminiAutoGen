# Content Execution Flow

This document describes single-task execution in `src/content.ts`.

## Entry

`content.ts` is injected dynamically per task and runs as an IIFE.
It loads settings and reads the current task from storage.

## Stage Breakdown

## 1) Pre-check

- load current task + task mode + locked URL + `currentTaskIndex` + `currentTaskRunSeq`
- build safe target filename
- `CHECK_FILE_EXISTS` to skip already completed outputs

If exists, task reports `TASK_COMPLETE(skipped=true)` immediately.

## 2) Locked URL Guard

- validate locked URL format/domain/path
- assert current page URL matches locked URL before critical actions
- operational requirement: use an existing conversation with at least one generated image; avoid fresh `new conversation` threads

Any mismatch raises `locked-url` error.

Why this requirement improves stability:

- download-only retry needs an existing response container/download button target
- history settle logic is more reliable when prior generated-image state exists
- fresh threads have weaker anchor context and are more prone to mis-targeting/race

## 3) Page and History Readiness

- wait for Gemini page ready (input + app container + no active loading gate)
- run history-image settle gate:
  - no image yet -> wait
  - last image exists but not loaded -> wait
  - last image loaded -> continue

This prevents sending prompt while previous generation is unfinished.

## 4) Prompt Send

- scroll to bottom
- focus input and clear stale text
- write composed prompt (`name: ...` + `prompt: ...`)
- wait send button ready
- click send
- verify input is cleared after send

## 5) Response Targeting

- wait user-query render
- wait new conversation container if available
- locate prompt anchor from rendered query text
- resolve response container for that anchor

This minimizes cross-message mis-targeting in long history threads.

## 6) Generation Wait

Implemented in `src/content/generationWait.ts`.

Signals used:

- response readiness (`aria-busy`, footer complete, loaded image)
- new image candidates in target container
- scoped download button availability

No-progress timeout triggers `generation` error.

## 7) Download Trigger

- choose nearest/last valid download button in target container
- reveal/hover/focus/click
- click menu item for download when needed
- call background `WAIT_AND_RENAME`
- use one end-to-end download budget: `settings_downloadTimeout`
  - content-side response race timeout: `settings_downloadTimeout`
  - background detect/stabilize/rename: same global `settings_downloadTimeout` deadline

Download response is enforced with race timeout and mapped to `download` or `folder` errors.

## 8) Completion/Error Reporting

- success -> `TASK_COMPLETE` with `taskIndex` + `taskRunSeq`
- failure -> `TASK_ERROR` with typed error classification + `taskIndex` + `taskRunSeq`

All status/log updates are mirrored through runtime messages for sidepanel visibility.
Sidepanel performs an additional `CHECK_FILE_EXISTS` verification before accepting non-skipped completion.
That post-check has a hard `10s` timeout; timeout is classified as `download` error.

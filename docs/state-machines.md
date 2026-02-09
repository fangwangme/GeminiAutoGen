# State Machines

This document formalizes runtime state transitions.

## Sidepanel Run State Machine

State holder: `TaskLifecycleState` in `src/sidepanel/taskLifecycle.ts`.

## States

- `idle`: no active run
- `running`: processing queue
- `stopping`: transient via stop/reset actions
- `finished`: all tasks complete
- `failed-stopped`: run aborted due to stop policy

## Transitions

1. `idle -> running`
   - trigger: Start button + successful `startRun` pre-flight
2. `running -> running`
   - trigger: `TASK_COMPLETE` verified by output existence check and more tasks remain
   - action: increment index, recreate tab, process next
3. `running -> running`
   - trigger: retry policy action (`retry-download` / `retry-full`)
   - action: re-run same index with mode override
4. `running -> failed-stopped`
   - trigger: `stop-locked-url`, `stop-folder`, `fail-stop`, user stop/reset
5. `running -> finished`
   - trigger: current index >= queue length
6. `running -> running`
   - trigger: watchdog timeout
   - action: mark current failed, advance index
7. `running -> running`
   - trigger: stale `TASK_COMPLETE` / `TASK_ERROR` / `UPDATE_STATUS`
   - action: ignore message by task index/run sequence guard

## Content Task State Machine

Entry: injected module execution (`src/content.ts`).

## Stages

1. `load-config`
2. `load-task`
3. `skip-check`
4. `locked-url-guard`
5. `page-ready`
6. `history-settle`
7. `prompt-send`
8. `target-resolve`
9. `generation-wait`
10. `download-trigger`
11. `report-complete` or `report-error`

Any stage exception routes to `report-error`.

## Background Download State Machine

Entry: `WAIT_AND_RENAME`.

## Stages

1. `resolve-handles`
2. `snapshot-initial-files`
3. `poll-new-file`
4. `stabilize-file`
5. `validate-image`
6. `hash-check`
7. `move-rename`
8. `return-success` / `return-error`

`poll-new-file` and `stabilize-file` are both bounded by one global timeout budget (`settings_downloadTimeout`).

# Protocol: Runtime Message Contracts

This document defines the runtime message protocol between sidepanel, content, and background.

## Channel Topology

- `sidepanel -> background`: extension-level commands (`chrome.runtime.sendMessage`)
- `content -> background`: file checks/rename + log relay
- `background -> sidepanel`: relayed log events (`PANEL_LOG`)
- `content -> sidepanel`: task status via runtime broadcast (`TASK_COMPLETE`, `TASK_ERROR`, `UPDATE_STATUS`)

## Message Schemas

## Sidepanel/Content -> Background

### `CHECK_FILE_EXISTS`

Request:

```ts
{ action: "CHECK_FILE_EXISTS"; filename: string }
```

Response:

```ts
{ exists: boolean; error?: string; errorType?: "folder" | "download" | "generation" }
```

### `WAIT_AND_RENAME`

Request:

```ts
{ action: "WAIT_AND_RENAME"; targetFilename: string }
```

Response:

```ts
{
  success: boolean;
  filename?: string;
  error?: string;
  errorType?: "folder" | "download" | "generation";
}
```

### `LIST_ALL_FILES`

Request:

```ts
{ action: "LIST_ALL_FILES" }
```

Response:

```ts
{ files: string[] }
```

### `RESET_STATE`

Request:

```ts
{ action: "RESET_STATE" }
```

Response:

```ts
{ success: true }
```

### `OPEN_OPTIONS`

Request:

```ts
{ action: "OPEN_OPTIONS" }
```

## Content -> Sidepanel

### `TASK_COMPLETE`

```ts
{
  action: "TASK_COMPLETE";
  skipped: boolean;
  taskIndex?: number;
  taskRunSeq?: number;
}
```

### `TASK_ERROR`

```ts
{
  action: "TASK_ERROR";
  error: string;
  errorType?: "generation" | "download" | "folder" | "locked-url";
  taskIndex?: number;
  taskRunSeq?: number;
}
```

### `UPDATE_STATUS`

```ts
{
  action: "UPDATE_STATUS";
  status: string;
  isError?: boolean;
  taskIndex?: number;
  taskRunSeq?: number;
}
```

`taskIndex` + `taskRunSeq` are used by sidepanel to reject stale messages from previous task runs.

## Log Relay

### Content -> Background

```ts
{
  action: "LOG";
  level: "log" | "warn" | "error";
  message: string;
  data?: unknown;
  source?: string; // "content"
}
```

### Background -> Sidepanel

```ts
{
  action: "PANEL_LOG";
  level: "log" | "warn" | "error";
  message: string;
  data?: unknown;
  source?: string;
  timestamp: string; // ISO
}
```

## Error Semantics

- `locked-url`: URL validation/mismatch; stop immediately.
- `folder`: directory handle/permission errors; stop immediately.
- `download`: download detect/rename timeout or related failures; retry policy applies.
- `generation`: model output / DOM progress / prompt-anchor failures; retry policy applies.

## Completion Consistency Guard

When sidepanel receives `TASK_COMPLETE(skipped=false)`, it performs `CHECK_FILE_EXISTS` for the target filename before advancing queue index.

- if file exists: accept completion
- if file missing: convert to `download` error and enter retry policy

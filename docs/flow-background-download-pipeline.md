# Background Download Pipeline

This document describes file handling logic in `src/background.ts`.

## Responsibilities

- persistent directory handle access
- output existence checks
- source folder polling for newly downloaded image
- stabilization wait for file completion
- image validation and duplicate protection
- rename/move from source to output

## Message Endpoints

- `CHECK_FILE_EXISTS`
- `WAIT_AND_RENAME`
- `LIST_ALL_FILES`
- `RESET_STATE`

## WAIT_AND_RENAME Flow

1. load source/output handles and permissions
2. load timeout/poll settings
3. snapshot initial source image files
4. poll for new file:
   - prefer Gemini naming patterns first
   - after grace window, widen to any new image
   - timeout source: `settings_downloadDetectTimeout` (fallback: `settings_downloadTimeout`)
5. once detected, wait stabilization:
   - file size must stay stable for multiple ticks
   - timeout source: `settings_downloadStabilityTimeout` (fallback: `settings_downloadTimeout`)
6. run image checks:
   - 1:1 aspect ratio treated as generation failure
   - optional 16:9 warning check
7. hash duplicate check against last successful file
8. write to output filename, remove source file, return success

## Error Typing

- folder/permission related -> `folder`
- polling/rename/timeout related -> `download`
- invalid generated content (e.g., square fallback) -> `generation`

## State Notes

- `lastFileHash` is kept in memory and reset by `RESET_STATE`.
- all timestamps and events are logged with ISO timestamp prefix.

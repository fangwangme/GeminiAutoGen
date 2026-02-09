# Troubleshooting Playbook

Use this checklist for stuck tasks, repeated failures, or timeout confusion.

## 1) Confirm Build/Load Baseline

1. `npm run typecheck`
2. `npm run build`
3. Reload extension in `chrome://extensions`

## 2) Identify Failure Stage from Log

Look for latest content log marker:

- `Waiting for page ready`
- `Waiting for history images to settle`
- `Typing prompt...`
- `Waiting for generation`
- `Clicking download`
- `Waiting for file...`

This tells which module likely failed.

## 3) Watchdog Snapshot

On watchdog timeout, inspect appended snapshot:

- `href`
- `ready`
- `containers`
- `queries`
- `images`
- `downloadBtns`
- `hasInput`

Typical interpretation:
- no input: Gemini editor selector drift
- images present but no download buttons: download selector drift
- containers/queries zero: wrong tab or locked URL mismatch

## 4) Common Root Causes

- Locked URL mismatch after tab recreate
- Using a fresh `new conversation` thread with no prior generated image history
- Gemini DOM selector change
- Source/output folder permission loss
- Download file naming changed and widening logic not catching quickly
- Network slow causing long non-progress phases

## 5) Fast Recovery

1. Stop run
2. Reset in sidepanel
3. Verify locked URL points to specific conversation
4. Prefer a conversation that already has at least one generated image (not a fresh new conversation)
5. Re-check folder permissions in options
6. Re-run with small task subset

## 6) Missing Image After Run

If summary says task completed but output is missing:

1. Confirm logs include `Completion verification failed: missing ...`
2. Check whether retry policy switched to download-only retries afterward
3. Validate source/output folders for delayed or failed rename

## 7) What to Capture for Debugging

- full sidepanel log block for one failed task
- watchdog snapshot line
- first content error stack line
- whether output file was created in source folder or not

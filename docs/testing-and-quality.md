# Testing and Quality

This document tracks automated coverage and validation workflow.

## Validation Commands

```bash
npm run typecheck
npm run test:bdd:quiet
npm run build
```

## Current Automated Coverage

BDD suite directory: `tests/bdd/`

Covered areas:
- error classification (`errorClassifier`)
- retry decisions (`retryPolicy`)
- queue and filename normalization (`taskQueue`)
- locked URL validation/matching (`lockedConversation`)
- content history wait policy (`contentHistoryWait`)
- watchdog timeout policy (`watchdogPolicy`)
- placeholder tab policy (`placeholderPolicy`)

## Coverage Gaps (Known)

- End-to-end browser-driven flow tests are not automated in CI.
- DOM-heavy content execution is covered mainly by runtime logging + manual verification.
- Background FS operations are validated indirectly, not with full integration harness.

## Quality Gate Recommendation

Before release:

1. Run all validation commands above.
2. Reload extension and run at least one small real task batch.
3. Confirm sidepanel log has:
   - timing config
   - successful generation detection
   - successful download rename/move
4. Print and verify release title in terminal:
   - `echo "Release title: vX.Y.Z"`

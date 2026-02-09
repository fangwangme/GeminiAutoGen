import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { decideTaskErrorOutcome } from "../../src/utils/retryPolicy.js";

const bddIt = createBddIt(it);

describe("Retry policy decisions (BDD)", () => {
  bddIt("Given locked-url error, When deciding, Then workflow stops immediately", () => {
    const outcome = decideTaskErrorOutcome({
      error: "locked mismatch",
      errorType: "locked-url",
      currentRetries: 0,
      maxRetries: 3,
      consecutiveFailureCount: 0,
      maxConsecutiveFailures: 5
    });
    assert.equal(outcome.action, "stop-locked-url");
  });

  bddIt("Given folder permission error, When deciding, Then workflow stops immediately", () => {
    const outcome = decideTaskErrorOutcome({
      error: "Permission denied",
      errorType: undefined,
      currentRetries: 0,
      maxRetries: 3,
      consecutiveFailureCount: 0,
      maxConsecutiveFailures: 5
    });
    assert.equal(outcome.action, "stop-folder");
  });

  bddIt("Given download failure with retry budget, When deciding, Then do download-only retry", () => {
    const outcome = decideTaskErrorOutcome({
      error: "Timeout waiting for download",
      errorType: undefined,
      currentRetries: 1,
      maxRetries: 3,
      consecutiveFailureCount: 0,
      maxConsecutiveFailures: 5
    });
    assert.equal(outcome.action, "retry-download");
    assert.equal(outcome.nextRetryCount, 2);
  });

  bddIt("Given generation failure with retry budget, When deciding, Then do full retry", () => {
    const outcome = decideTaskErrorOutcome({
      error: "Prompt anchor not found",
      errorType: undefined,
      currentRetries: 0,
      maxRetries: 2,
      consecutiveFailureCount: 1,
      maxConsecutiveFailures: 5
    });
    assert.equal(outcome.action, "retry-full");
    assert.equal(outcome.nextRetryCount, 1);
  });

  bddIt("Given retries exhausted but below failure cap, When deciding, Then mark failed and continue", () => {
    const outcome = decideTaskErrorOutcome({
      error: "Prompt anchor not found",
      errorType: "generation",
      currentRetries: 2,
      maxRetries: 2,
      consecutiveFailureCount: 1,
      maxConsecutiveFailures: 5
    });
    assert.equal(outcome.action, "fail-next");
    assert.equal(outcome.shouldIncrementFailedCount, true);
    assert.equal(outcome.nextConsecutiveFailureCount, 2);
  });

  bddIt("Given retries exhausted and failure cap reached, When deciding, Then stop run", () => {
    const outcome = decideTaskErrorOutcome({
      error: "Prompt anchor not found",
      errorType: "generation",
      currentRetries: 2,
      maxRetries: 2,
      consecutiveFailureCount: 4,
      maxConsecutiveFailures: 5
    });
    assert.equal(outcome.action, "fail-stop");
    assert.equal(outcome.nextConsecutiveFailureCount, 5);
  });

  bddIt("Given maxConsecutiveFailures is 0, When deciding after exhausted retries, Then never stop by cap", () => {
    const outcome = decideTaskErrorOutcome({
      error: "Prompt anchor not found",
      errorType: "generation",
      currentRetries: 1,
      maxRetries: 1,
      consecutiveFailureCount: 99,
      maxConsecutiveFailures: 0
    });
    assert.equal(outcome.action, "fail-next");
  });
});

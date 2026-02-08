import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import {
  computeTaskWatchdogTimeoutMs,
  isWatchdogTimeoutError
} from "../../src/utils/watchdogPolicy.js";

const bddIt = createBddIt(it);

describe("Watchdog policy (BDD)", () => {
  bddIt("Given full mode and defaults, When computing timeout, Then it is generation plus safety", () => {
    const timeoutMs = computeTaskWatchdogTimeoutMs("full", {});
    assert.equal(timeoutMs, 135000);
  });

  bddIt("Given download-only mode and defaults, When computing timeout, Then it is download plus safety", () => {
    const timeoutMs = computeTaskWatchdogTimeoutMs("download-only", {});
    assert.equal(timeoutMs, 135000);
  });

  bddIt("Given custom generation timeout, When full mode, Then watchdog follows generation budget", () => {
    const timeoutMs = computeTaskWatchdogTimeoutMs("full", {
      settings_generationTimeout: 45,
      settings_downloadTimeout: 300
    });
    assert.equal(timeoutMs, 60000);
  });

  bddIt("Given watchdog timeout error text, When classifying, Then it is detected", () => {
    assert.equal(
      isWatchdogTimeoutError("Task watchdog timeout after 135s"),
      true
    );
    assert.equal(isWatchdogTimeoutError("Prompt anchor not found"), false);
  });
});

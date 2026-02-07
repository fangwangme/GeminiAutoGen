import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { evaluateHistoryImageWait } from "../../src/utils/historyLoadGate.js";

const bddIt = createBddIt(it);

describe("History image load gate (BDD)", () => {
  bddIt("Given no history, When evaluating load gate, Then it proceeds immediately", () => {
    const result = evaluateHistoryImageWait({
      hasHistory: false,
      hasAnyImage: false,
      lastImageLoaded: false,
      elapsedMs: 0,
      graceMs: 2000
    });

    assert.equal(result.shouldWait, false);
    assert.equal(result.reason, "no-history");
  });

  bddIt("Given history with image not loaded, When evaluating load gate, Then it keeps waiting", () => {
    const result = evaluateHistoryImageWait({
      hasHistory: true,
      hasAnyImage: true,
      lastImageLoaded: false,
      elapsedMs: 800,
      graceMs: 2000
    });

    assert.equal(result.shouldWait, true);
    assert.equal(result.reason, "waiting-last-image");
  });

  bddIt("Given history with last image loaded, When evaluating load gate, Then it proceeds", () => {
    const result = evaluateHistoryImageWait({
      hasHistory: true,
      hasAnyImage: true,
      lastImageLoaded: true,
      elapsedMs: 1200,
      graceMs: 2000
    });

    assert.equal(result.shouldWait, false);
    assert.equal(result.reason, "last-image-ready");
  });

  bddIt("Given history but image not yet discovered within grace, When evaluating load gate, Then it waits", () => {
    const result = evaluateHistoryImageWait({
      hasHistory: true,
      hasAnyImage: false,
      lastImageLoaded: false,
      elapsedMs: 1500,
      graceMs: 2000
    });

    assert.equal(result.shouldWait, true);
    assert.equal(result.reason, "waiting-image-appear");
  });

  bddIt("Given history but no image discovered after grace, When evaluating load gate, Then it proceeds", () => {
    const result = evaluateHistoryImageWait({
      hasHistory: true,
      hasAnyImage: false,
      lastImageLoaded: false,
      elapsedMs: 2200,
      graceMs: 2000
    });

    assert.equal(result.shouldWait, false);
    assert.equal(result.reason, "history-no-image");
  });
});

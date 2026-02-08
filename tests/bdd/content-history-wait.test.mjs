import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { evaluateContentHistoryImageWait } from "../../src/utils/contentHistoryWait.js";

const bddIt = createBddIt(it);

describe("Content history wait (BDD)", () => {
  bddIt("Given no image yet, When evaluating wait state, Then keep waiting for image appear", () => {
    const result = evaluateContentHistoryImageWait({
      hasAnyImage: false,
      lastImageLoaded: false
    });
    assert.equal(result.shouldWait, true);
    assert.equal(result.reason, "waiting-last-image-appear");
  });

  bddIt("Given image exists but not loaded, When evaluating wait state, Then keep waiting for image load", () => {
    const result = evaluateContentHistoryImageWait({
      hasAnyImage: true,
      lastImageLoaded: false
    });
    assert.equal(result.shouldWait, true);
    assert.equal(result.reason, "waiting-last-image-loaded");
  });

  bddIt("Given image exists and loaded, When evaluating wait state, Then proceed", () => {
    const result = evaluateContentHistoryImageWait({
      hasAnyImage: true,
      lastImageLoaded: true
    });
    assert.equal(result.shouldWait, false);
    assert.equal(result.reason, "last-image-loaded");
  });
});

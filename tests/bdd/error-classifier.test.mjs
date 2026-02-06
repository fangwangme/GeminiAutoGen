import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import {
  isDownloadErrorMessage,
  isFolderAuthErrorMessage,
  resolveTaskErrorType
} from "../../src/utils/errorClassifier.js";

const bddIt = createBddIt(it);

describe("Error classification (BDD)", () => {
  bddIt("Given permission denied text, When classifying, Then folder auth is detected", () => {
    assert.equal(
      isFolderAuthErrorMessage("NotAllowedError: Permission denied"),
      true
    );
    assert.equal(
      resolveTaskErrorType("NotAllowedError: Permission denied"),
      "folder"
    );
  });

  bddIt("Given download timeout text, When classifying, Then download error is detected", () => {
    assert.equal(
      isDownloadErrorMessage("Timeout waiting for download"),
      true
    );
    assert.equal(resolveTaskErrorType("Timeout waiting for download"), "download");
  });

  bddIt("Given unknown text, When classifying, Then generation is the default", () => {
    assert.equal(resolveTaskErrorType("some random runtime failure"), "generation");
  });

  bddIt("Given explicit error type, When classifying, Then explicit value wins", () => {
    assert.equal(resolveTaskErrorType("timeout waiting for download", "locked-url"), "locked-url");
  });
});

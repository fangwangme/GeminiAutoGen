import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import {
  normalizeUrlForCompare,
  urlsMatch,
  validateLockedConversationUrl
} from "../../src/utils/lockedConversation.js";

const t = (key) => key;
const bddIt = createBddIt(it);

describe("Locked conversation URL validation (BDD)", () => {
  bddIt("Given a Gemini conversation URL, When validating, Then it is accepted", () => {
    const result = validateLockedConversationUrl(
      "https://gemini.google.com/app/abc123",
      t
    );
    assert.equal(result.ok, true);
  });

  bddIt("Given a non-Gemini URL, When validating, Then it is rejected with mustGemini", () => {
    const result = validateLockedConversationUrl("https://example.com/app/abc", t);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, "validation.lockedUrl.mustGemini");
    }
  });

  bddIt("Given /app root URL, When validating, Then it is rejected as non-specific conversation", () => {
    const result = validateLockedConversationUrl("https://gemini.google.com/app", t);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.message,
        "validation.lockedUrl.mustSpecificConversation"
      );
    }
  });

  bddIt("Given an invalid URL string, When validating, Then it is rejected as invalid", () => {
    const result = validateLockedConversationUrl("not-a-valid-url", t);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, "validation.lockedUrl.invalid");
    }
  });
});

describe("URL matching behavior (BDD)", () => {
  bddIt("Given trailing slash difference, When matching, Then URLs are equal", () => {
    assert.equal(
      urlsMatch(
        "https://gemini.google.com/app/abc123/",
        "https://gemini.google.com/app/abc123"
      ),
      true
    );
  });

  bddIt("Given different conversation IDs, When matching, Then URLs are not equal", () => {
    assert.equal(
      urlsMatch(
        "https://gemini.google.com/app/abc123",
        "https://gemini.google.com/app/xyz987"
      ),
      false
    );
  });

  bddIt("Given URL with query/hash, When normalizing, Then query/hash are ignored", () => {
    assert.equal(
      normalizeUrlForCompare("https://gemini.google.com/app/abc123?x=1#section"),
      "https://gemini.google.com/app/abc123"
    );
  });
});

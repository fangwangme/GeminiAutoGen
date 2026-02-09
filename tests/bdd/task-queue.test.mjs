import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBddIt } from "./_bddSteps.mjs";
import { buildPendingTaskQueue, toSafeTaskFilename } from "../../src/utils/taskQueue.js";

const bddIt = createBddIt(it);

describe("Task filename normalization (BDD)", () => {
  bddIt("Given unsafe characters, When normalizing, Then they are replaced with underscores", () => {
    assert.equal(toSafeTaskFilename("hello world?.png"), "hello_world_.png");
  });

  bddIt("Given no extension, When normalizing, Then .png is appended", () => {
    assert.equal(toSafeTaskFilename("scene-01"), "scene-01.png");
  });

  bddIt("Given .jpg extension, When normalizing, Then extension is preserved", () => {
    assert.equal(toSafeTaskFilename("portrait.jpg"), "portrait.jpg");
  });
});

describe("Task queue filtering (BDD)", () => {
  bddIt("Given existing files set, When building queue, Then only pending tasks remain", () => {
    const tasks = [
      { name: "a.png", prompt: "A" },
      { name: "b", prompt: "B" },
      { name: "c.jpg", prompt: "C" }
    ];
    const existingFiles = new Set(["a.png", "b.png"]);

    const queue = buildPendingTaskQueue(tasks, existingFiles);

    assert.equal(queue.length, 1);
    assert.equal(queue[0].name, "c.jpg");
  });

  bddIt("Given invalid task entries, When building queue, Then invalid entries are dropped", () => {
    const tasks = [
      { name: "ok", prompt: "A" },
      { name: "", prompt: "B" },
      null,
      { prompt: "C" }
    ];
    const queue = buildPendingTaskQueue(tasks, new Set());
    assert.equal(queue.length, 1);
    assert.equal(queue[0].name, "ok");
  });
});

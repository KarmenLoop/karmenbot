import assert from "node:assert/strict";
import test from "node:test";
import { shouldAutoRunScripts } from "../src/skills/runner.mjs";

test("autoRunScripts defaults off", () => {
  assert.equal(shouldAutoRunScripts({}), false);
  assert.equal(shouldAutoRunScripts({ skills: {} }), false);
  assert.equal(shouldAutoRunScripts({ skills: { autoRunScripts: false } }), false);
});

test("autoRunScripts opt-in", () => {
  assert.equal(shouldAutoRunScripts({ skills: { autoRunScripts: true } }), true);
});

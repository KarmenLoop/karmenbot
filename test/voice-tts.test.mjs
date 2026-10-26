import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { speakText, saveLastReply, readLastReply, detectTtsBin } from "../src/voice/tts.mjs";

test("detectTtsBin returns string or null", () => {
  const bin = detectTtsBin();
  assert.ok(bin === null || typeof bin === "string");
});

test("saveLastReply / readLastReply roundtrip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-voice-"));
  const env = { HOME: dir, KARMENBOT_HOME: path.join(dir, ".karmenbot") };
  saveLastReply("hello voice", env);
  assert.equal(readLastReply(env).trim(), "hello voice");
});

test("speakText empty returns not ok", () => {
  const out = speakText("");
  assert.equal(out.ok, false);
});

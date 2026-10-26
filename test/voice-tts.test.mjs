import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { speakText, saveLastReply, readLastReply, detectTtsBin, escapePsSingleQuoted } from "../src/voice/tts.mjs";

test("detectTtsBin returns string or null", () => {
  const bin = detectTtsBin();
  assert.ok(bin === null || typeof bin === "string");
});

test("detectTtsBin win32 is powershell", () => {
  assert.equal(detectTtsBin({ platform: "win32" }), "powershell");
});

test("detectTtsBin darwin is say", () => {
  assert.equal(detectTtsBin({ platform: "darwin" }), "say");
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

test("escapePsSingleQuoted doubles single quotes", () => {
  assert.equal(escapePsSingleQuoted("it's"), "it''s");
});

test("speakText win32 uses PowerShell System.Speech with escaped text", () => {
  const calls = [];
  const spawn = (bin, args) => {
    calls.push({ bin, args });
    return { status: 0, stderr: "", error: null };
  };
  const out = speakText("hi'; it's me", { platform: "win32", spawn });
  assert.equal(out.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, "powershell");
  const script = calls[0].args.at(-1);
  assert.match(script, /System\.Speech/);
  assert.match(script, /SpeechSynthesizer/);
  // PowerShell single-quoted string: every ' in the text becomes ''.
  assert.match(script, /Speak\('hi''; it''s me'\)/);
  assert.ok(script.includes("System.Speech"));
});

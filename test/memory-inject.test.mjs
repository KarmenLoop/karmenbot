import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addFact } from "../src/memory/profile.mjs";
import { appendJournal } from "../src/memory/journal.mjs";
import { buildInjection, redactAgainstSecrets } from "../src/memory/inject.mjs";
import { saveSecret } from "../src/home.mjs";

test("inject block never contains secrets.json values", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-inj-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  const secret = "sk-live-SUPER-SECRET-VALUE-999";
  saveSecret("models", "demo", { apiKey: secret }, env);
  addFact(`User likes tea and somehow pasted ${secret}`, env);
  appendJournal("Prefers morning standups", env);
  const { block, hits } = await buildInjection({ query: "tea standup", env, lang: "en" });
  assert.doesNotMatch(block, /sk-live-SUPER-SECRET/);
  assert.doesNotMatch(JSON.stringify(hits), /sk-live-SUPER-SECRET/);
  // The contaminated fact should be redacted or dropped
  for (const hit of hits) {
    assert.doesNotMatch(hit.text, /sk-live/);
  }
});

test("--no-memory and session none skip injection", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-inj2-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  addFact("Prefers dark theme", env);
  const skipped = await buildInjection({ query: "theme", env, noMemory: true });
  assert.equal(skipped.block, "");
  const none = await buildInjection({ query: "theme", env, session: "none" });
  assert.equal(none.block, "");
  const ok = await buildInjection({ query: "theme", env, lang: "en" });
  assert.match(ok.block, /dark theme/);
});

test("redactAgainstSecrets strips known secret substrings", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-inj3-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  saveSecret("platforms", "slack", { botToken: "xoxb-secret-token-value" }, env);
  assert.equal(redactAgainstSecrets("token xoxb-secret-token-value here", env).includes("xoxb-secret-token-value"), false);
});

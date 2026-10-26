import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addFact, listFacts, searchFacts, clearProfile } from "../src/memory/profile.mjs";
import { appendJournal, searchJournal, clearJournal } from "../src/memory/journal.mjs";
import { openMemory, workspaceMemoryId } from "../src/memory-store.mjs";

test("profile and journal persist under KARMENBOT_HOME/memory", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-mem-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  const fact = addFact("Prefers short answers", env);
  assert.ok(fact.id);
  assert.equal(listFacts(env).length, 1);
  assert.equal(searchFacts("short", env)[0].text, "Prefers short answers");
  const entry = appendJournal("Shipped the memory layer", env);
  assert.ok(entry.id);
  const hits = searchJournal("memory", env);
  assert.ok(hits.some((item) => item.text.includes("memory")));
  clearProfile(env);
  clearJournal(env);
  assert.equal(listFacts(env).length, 0);
});

test("workspace notes stay isolated across workspaces", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-mem-ws-"));
  const wsA = await fs.mkdtemp(path.join(os.tmpdir(), "kb-ws-a-"));
  const wsB = await fs.mkdtemp(path.join(os.tmpdir(), "kb-ws-b-"));
  t.after(() => Promise.all([
    fs.rm(home, { recursive: true, force: true }),
    fs.rm(wsA, { recursive: true, force: true }),
    fs.rm(wsB, { recursive: true, force: true }),
  ]));
  const env = { KARMENBOT_HOME: home };
  assert.notEqual(workspaceMemoryId(wsA), workspaceMemoryId(wsB));
  const memA = openMemory(wsA, env, "default");
  const memB = openMemory(wsB, env, "default");
  memA.write({ messages: [], notes: [{ id: "a1", text: "only in A", at: 1 }] });
  memB.write({ messages: [], notes: [{ id: "b1", text: "only in B", at: 1 }] });
  assert.equal(memA.read().notes[0].text, "only in A");
  assert.equal(memB.read().notes[0].text, "only in B");
  assert.doesNotMatch(JSON.stringify(memA.read()), /only in B/);
  assert.doesNotMatch(JSON.stringify(memB.read()), /only in A/);
});

test("refuses to store secret-like profile text", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-mem-sec-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  assert.throws(() => addFact("api_key=sk-abcdefghijklmnopqrstuvwxyz", env));
});

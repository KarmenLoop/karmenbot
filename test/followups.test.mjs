import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cancelFollowup,
  enqueueFollowup,
  followupConfig,
  formatFollowupOutbound,
  inQuietHours,
  listFollowups,
  parseDueAt,
  selectDueFollowups,
  followupsFile,
} from "../src/gateway/followups.mjs";
import { tickFollowups } from "../src/gateway/followup-tick.mjs";
import { saveConfig } from "../src/home.mjs";

test("parseDueAt relative and ISO", () => {
  const now = Date.parse("2026-10-26T12:00:00.000Z");
  assert.equal(parseDueAt("+2h", now), now + 2 * 3_600_000);
  assert.equal(parseDueAt("+30m", now), now + 30 * 60_000);
  assert.equal(parseDueAt("2026-10-27T00:00:00.000Z", now), Date.parse("2026-10-27T00:00:00.000Z"));
  assert.throws(() => parseDueAt("nope", now));
});

test("enqueue list cancel persist with mode 600", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-fu-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  const now = Date.parse("2026-10-26T12:00:00.000Z");
  const item = enqueueFollowup({
    platform: "telegram",
    chatId: "c1",
    text: "follow up please",
    dueAt: now + 60_000,
  }, env, now);
  assert.equal(item.requireConfirm, true);
  assert.equal(item.status, "pending");
  assert.equal(listFollowups(env).length, 1);

  const st = await fs.stat(followupsFile(env));
  assert.equal(st.mode & 0o777, 0o600);

  const cancelled = cancelFollowup(item.id, env, now + 1);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(listFollowups(env, { status: "pending" }).length, 0);
});

test("selectDue respects quiet hours and rate limit; deferred stay pending", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-fu2-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  saveConfig({
    gateway: {
      followups: { maxPerDay: 1, quietHours: { start: "22:00", end: "08:00" } },
    },
  }, env);

  const quiet = new Date("2026-10-26T23:30:00"); // local interpretation of components
  // Build a Date that is 23:30 local
  const quietNow = new Date();
  quietNow.setFullYear(2026, 9, 26);
  quietNow.setHours(23, 30, 0, 0);

  assert.equal(inQuietHours({ start: "22:00", end: "08:00" }, quietNow), true);
  assert.equal(inQuietHours({ start: "22:00", end: "08:00" }, (() => { const d = new Date(quietNow); d.setHours(12, 0, 0, 0); return d; })()), false);

  // due far in the past so both noon and 23:30 consider them due
  const dueAt = quietNow.getTime() - 86_400_000;
  enqueueFollowup({ platform: "telegram", chatId: "c1", text: "a", dueAt }, env, dueAt - 10);
  enqueueFollowup({ platform: "telegram", chatId: "c1", text: "b", dueAt }, env, dueAt - 9);

  const duringQuiet = selectDueFollowups(env, quietNow.getTime());
  assert.equal(duringQuiet.due.length, 0);
  assert.ok(duringQuiet.skipped.length >= 1);
  assert.match(duringQuiet.skipped[0].reason, /quiet hours/);
  assert.equal(listFollowups(env, { status: "pending" }).length, 2);

  // Outside quiet hours with maxPerDay 1
  const day = new Date(quietNow);
  day.setHours(12, 0, 0, 0);
  const mid = selectDueFollowups(env, day.getTime());
  assert.equal(mid.due.length, 1);
  assert.equal(mid.skipped.length, 1);
  assert.match(mid.skipped[0].reason, /rate limit/);
});

test("confirm gate formats draft by default", () => {
  const draft = formatFollowupOutbound({ text: "hello", requireConfirm: true }, { draftThenSend: true });
  assert.match(draft, /待确认草稿/);
  assert.match(draft, /hello/);
  const immediate = formatFollowupOutbound({ text: "hello", requireConfirm: false }, { draftThenSend: false });
  assert.match(immediate, /【主动跟进】/);
  assert.ok(!immediate.includes("待确认草稿"));
});

test("tick sends due items and cancels skip delivery", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-fu3-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  saveConfig({ gateway: { followups: { maxPerDay: 10 }, draftThenSend: true } }, env);
  const now = Date.parse("2026-10-26T12:00:00.000Z");
  const a = enqueueFollowup({ platform: "telegram", chatId: "c1", text: "one", dueAt: now - 1 }, env, now - 10);
  const b = enqueueFollowup({ platform: "telegram", chatId: "c1", text: "two", dueAt: now + 999999 }, env, now);
  cancelFollowup(b.id, env, now);

  const sent = [];
  const { results } = await tickFollowups({
    env,
    now,
    send: async (platform, chatId, text) => {
      sent.push({ platform, chatId, text });
    },
  });
  assert.equal(results.filter((r) => r.status === "sent").length, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].platform, "telegram");
  assert.match(sent[0].text, /one/);
  assert.match(sent[0].text, /待确认草稿/);
  assert.equal(listFollowups(env).find((i) => i.id === a.id).status, "sent");
  assert.equal(listFollowups(env).find((i) => i.id === b.id).status, "cancelled");
});

test("followupConfig defaults", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-fu4-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  const cfg = followupConfig(env);
  assert.equal(cfg.maxPerDay, 10);
  assert.equal(cfg.draftThenSend, true);
});

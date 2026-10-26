import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeSchedule, nextRunAfter, isDue } from "../src/routines/cron.mjs";
import {
  createRoutine,
  deleteRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
  routinesDir,
} from "../src/routines/store.mjs";
import { safetyCheck } from "../src/routines/safety.mjs";
import { resolveSteps } from "../src/routines/execute.mjs";
import { tickRoutines } from "../src/routines/tick.mjs";
import { installSnippets } from "../src/routines/install.mjs";
import { loadFlowSteps, flowHasShell } from "../src/flow-format.mjs";

test("cron parse: 5-field, names, and @every", () => {
  const daily = normalizeSchedule("@daily");
  assert.equal(daily.kind, "cron");
  assert.equal(daily.label, "0 0 * * *");
  assert.ok(daily.minute.has(0) && daily.hour.has(0));

  const every = normalizeSchedule("@every 2h");
  assert.equal(every.kind, "every");
  assert.equal(every.everyMs, 2 * 3_600_000);

  const custom = normalizeSchedule("*/15 9-17 * * 1-5");
  assert.ok(custom.minute.has(0) && custom.minute.has(15) && custom.minute.has(45));
  assert.ok(custom.hour.has(9) && custom.hour.has(17));
  assert.ok(!custom.hour.has(8));

  assert.throws(() => normalizeSchedule("not a schedule"));
  assert.throws(() => normalizeSchedule("* * *"));
});

test("nextRunAfter and isDue", () => {
  const from = Date.parse("2026-10-26T08:00:00");
  const nextDaily = nextRunAfter("@daily", from);
  assert.equal(nextDaily, Date.parse("2026-10-27T00:00:00"));

  const nextEvery = nextRunAfter("@every 30m", from);
  assert.equal(nextEvery, from + 30 * 60_000);

  const routine = { enabled: true, nextRunAt: from - 1000 };
  assert.equal(isDue(routine, from), true);
  assert.equal(isDue({ ...routine, nextRunAt: from + 1000 }, from), false);
  assert.equal(isDue({ ...routine, enabled: false }, from), false);
});

test("persist routines under home with mode 600/700", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-routines-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  const now = Date.parse("2026-10-26T12:00:00");

  const created = createRoutine({
    id: "morning",
    schedule: "@hourly",
    prompt: "hi",
    allowUnattended: true,
  }, env, now);
  assert.equal(created.id, "morning");
  assert.equal(created.allowUnattended, true);
  assert.equal(created.allowShell, false);
  assert.ok(created.nextRunAt > now);

  const dirStat = await fs.stat(routinesDir(env));
  assert.equal(dirStat.mode & 0o777, 0o700);

  const fileStat = await fs.stat(path.join(routinesDir(env), "morning.json"));
  assert.equal(fileStat.mode & 0o777, 0o600);

  assert.equal(listRoutines(env).length, 1);
  assert.equal(getRoutine("morning", env).prompt, "hi");

  updateRoutine("morning", { enabled: false }, env);
  assert.equal(getRoutine("morning", env).enabled, false);

  assert.equal(deleteRoutine("morning", env), true);
  assert.equal(getRoutine("morning", env), null);
});

test("safety gate: unattended and shell", () => {
  const stepsAsk = [{ ask: "read only" }];
  const stepsShell = [{ shell: "echo hi" }];
  assert.equal(safetyCheck({ allowUnattended: false }, stepsAsk).ok, false);
  assert.equal(safetyCheck({ allowUnattended: true, allowShell: false }, stepsAsk).ok, true);
  assert.equal(safetyCheck({ allowUnattended: true, allowShell: false }, stepsShell).ok, false);
  assert.equal(safetyCheck({ allowUnattended: true, allowShell: true }, stepsShell).ok, true);
  assert.equal(safetyCheck({ allowUnattended: false }, stepsAsk, { force: true }).ok, true);
});

test("loadFlowSteps accepts array and { steps }", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-flow-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const a = path.join(dir, "a.json");
  const b = path.join(dir, "b.json");
  await fs.writeFile(a, JSON.stringify([{ run: "x" }]));
  await fs.writeFile(b, JSON.stringify({ steps: [{ ask: "y" }, { shell: "true" }] }));
  assert.deepEqual(loadFlowSteps(a), [{ run: "x" }]);
  assert.equal(flowHasShell(loadFlowSteps(b)), true);
});

test("tick skips without allowUnattended and respects shell gate", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-tick-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  const now = Date.parse("2026-10-26T12:00:00");

  createRoutine({ id: "locked", schedule: "@every 1h", prompt: "nope" }, env, now - 3_600_000);
  updateRoutine("locked", { nextRunAt: now - 1 }, env);

  createRoutine({
    id: "open",
    schedule: "@every 1h",
    steps: [{ shell: "echo should-not-run" }],
    allowUnattended: true,
    allowShell: false,
  }, env, now - 3_600_000);
  updateRoutine("open", { nextRunAt: now - 1 }, env);

  const ctx = {
    env,
    cwd: home,
    workspace: home,
    stdout: { write() {} },
    stderr: { write() {} },
    opts: {},
    t: { lang: "en" },
  };

  const results = await tickRoutines(ctx, { now });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(byId.locked.skipped, true);
  assert.match(byId.locked.reason, /allowUnattended/);
  assert.equal(byId.open.skipped, true);
  assert.match(byId.open.reason, /allowShell/);
});

test("install snippets mention routine tick", () => {
  const s = installSnippets({ bin: "karmenbot", home: "/tmp/home" });
  assert.match(s.cron, /routine tick/);
  assert.match(s.launchd, /routine tick/);
  assert.match(s.systemd, /routine tick/);
});

test("resolveSteps from prompt", () => {
  assert.deepEqual(resolveSteps({ prompt: "hello" }, "/tmp"), [{ run: "hello" }]);
});

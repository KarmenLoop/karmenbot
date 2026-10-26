import path from "node:path";
import { loadFlowSteps } from "../flow-format.mjs";
import { nextRunAfter, normalizeSchedule } from "./cron.mjs";
import { saveRoutine } from "./store.mjs";
import { safetyCheck } from "./safety.mjs";

export { safetyCheck } from "./safety.mjs";

export function resolveSteps(routine, cwd) {
  if (Array.isArray(routine.steps) && routine.steps.length) return routine.steps;
  if (routine.flowFile) {
    const file = path.isAbsolute(routine.flowFile) ? routine.flowFile : path.resolve(cwd, routine.flowFile);
    return loadFlowSteps(file);
  }
  if (routine.prompt) return [{ run: routine.prompt }];
  return [];
}

export async function executeRoutine(ctx, routine, { force = false, now = Date.now() } = {}) {
  const steps = resolveSteps(routine, ctx.cwd || process.cwd());
  if (!steps.length) {
    return { code: 2, skipped: true, reason: "routine has no flowFile, prompt, or steps" };
  }
  const gate = safetyCheck(routine, steps, { force });
  if (!gate.ok) {
    return { code: 0, skipped: true, reason: gate.reason };
  }

  // Lazy-load flow runner so unit tests of tick/safety need no vendor kernel.
  const { runFlow } = await import("../commands/flow.mjs");

  const workspace = routine.workspace
    ? path.resolve(ctx.cwd || process.cwd(), routine.workspace)
    : ctx.workspace;

  const childCtx = {
    ...ctx,
    workspace,
    opts: { ...ctx.opts, yes: true },
  };

  let code = 0;
  let error = null;
  try {
    code = await runFlow(childCtx, steps, { allowShell: routine.allowShell === true });
  } catch (err) {
    code = err?.exitCode ?? 1;
    error = err?.message || String(err);
  }

  const parsed = normalizeSchedule(routine.schedule);
  const updated = {
    ...routine,
    lastRunAt: now,
    lastStatus: code === 0 ? "ok" : `exit ${code}${error ? `: ${error}` : ""}`,
    nextRunAt: nextRunAfter(parsed, now),
  };
  saveRoutine(updated, ctx.env);
  return { code, skipped: false, reason: error, routine: updated };
}

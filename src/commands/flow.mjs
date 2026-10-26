import { spawnSync } from "node:child_process";
import { KarmenError } from "../errors.mjs";
import { loadFlowSteps as loadSteps, flowHasShell } from "../flow-format.mjs";
import { run as runTask } from "./ask.mjs";

export function loadFlowSteps(file) {
  try {
    return loadSteps(file);
  } catch (error) {
    throw new KarmenError("err.failed", { message: error.message });
  }
}

export { flowHasShell };

/** Run ask / run / shell steps. Used by `karmenbot flow` and by routines. */
export async function runFlow(ctx, steps, { allowShell = true } = {}) {
  if (!Array.isArray(steps)) throw new KarmenError("err.failed", { message: "flow steps must be an array" });
  for (const step of steps) {
    const kind = step?.run || step?.ask || step?.shell;
    if (step?.shell) {
      if (!allowShell) throw new KarmenError("err.failed", { message: "flow shell step blocked (allowShell=false)" });
      const result = spawnSync(step.shell, { cwd: ctx.workspace, shell: true, encoding: "utf8" });
      ctx.stdout.write(result.stdout || "");
      if (result.stderr) ctx.stderr?.write(result.stderr);
      if (result.status) return result.status;
      continue;
    }
    if (step?.ask || step?.run) {
      const code = await runTask({
        ...ctx,
        args: [step.ask || step.run],
        opts: { ...ctx.opts, interaction: step.ask ? "ask" : "agent", yes: step.ask ? false : ctx.opts.yes },
      });
      if (code) return code;
      continue;
    }
    throw new KarmenError("err.failed", { message: `flow step needs ask, run, or shell: ${JSON.stringify(kind)}` });
  }
  return 0;
}

export async function run(ctx) {
  const file = ctx.args[0];
  if (!file) throw new KarmenError("err.flagValue", { flag: "flow <file.json>" });
  const steps = loadFlowSteps(file);
  return runFlow(ctx, steps);
}

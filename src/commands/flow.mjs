import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { KarmenError } from "../errors.mjs";
import { run as runTask } from "./ask.mjs";

export async function run(ctx) {
  const file = ctx.args[0];
  if (!file) throw new KarmenError("err.flagValue", { flag: "flow <file.json>" });
  const steps = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(steps)) throw new KarmenError("err.failed", { message: "flow file must be a JSON array" });
  for (const step of steps) {
    const kind = step?.run || step?.ask || step?.shell;
    if (step?.shell) {
      const result = spawnSync(step.shell, { cwd: ctx.workspace, shell: true, encoding: "utf8" });
      ctx.stdout.write(result.stdout || "");
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

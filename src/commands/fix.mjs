import { spawnSync } from "node:child_process";
import { run as runTask } from "./ask.mjs";

function runCheck(workspace, command, timeoutSec) {
  const result = spawnSync(command, { cwd: workspace, shell: true, encoding: "utf8", timeout: timeoutSec * 1000 });
  return { code: result.status ?? 1, output: `${result.stdout || ""}${result.stderr || ""}`.slice(-12_000) };
}

export async function run(ctx) {
  const command = ctx.opts.command;
  const attempts = Number(ctx.opts.attempts || 3);
  const timeout = Number(ctx.opts.timeout || 600);
  if (!command) {
    ctx.stderr.write(ctx.t.lang === "en" ? "Pass --command \"npm test\" so the fix can be checked.\n" : "请加上 --command \"npm test\"，修好之后用它复查。\n");
    return 2;
  }
  for (let i = 1; i <= attempts; i += 1) {
    const check = runCheck(ctx.workspace, command, timeout);
    if (check.code === 0) {
      ctx.stdout.write(ctx.t.lang === "en" ? `Check passed on attempt ${i}.\n` : `第 ${i} 次检查通过。\n`);
      return 0;
    }
    const prompt = [`The check failed (${command}, attempt ${i} of ${attempts}). Fix the cause. Do not weaken the check.`, ctx.args.join(" ").trim(), check.output].filter(Boolean).join("\n\n");
    const code = await runTask({ ...ctx, args: [prompt], opts: { ...ctx.opts, yes: true, interaction: "agent", mode: ctx.opts.mode || "code" } });
    if (code !== 0) return code;
  }
  return 1;
}

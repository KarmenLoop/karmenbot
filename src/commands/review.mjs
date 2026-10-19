import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { run as runTask } from "./ask.mjs";

function gitDiff(workspace, base) {
  const args = base ? ["diff", base] : ["diff"];
  const result = spawnSync("git", args, { cwd: workspace, encoding: "utf8" });
  if (result.status !== 0) return result.stderr || "git diff failed";
  const text = (result.stdout || "").trim();
  return text || "(no diff)";
}

export async function run(ctx) {
  const diff = gitDiff(ctx.workspace, ctx.opts.base);
  const prompt = [
    "Review this diff. Write what changed, what looks wrong, and what to check. Do not edit files.",
    ctx.args.join(" ").trim(),
    "```diff",
    diff.slice(0, 80_000),
    "```",
  ].filter(Boolean).join("\n\n");
  let captured = "";
  const stdout = {
    write(chunk) {
      captured += chunk;
      ctx.stdout.write(chunk);
    },
  };
  const code = await runTask({ ...ctx, args: [prompt], stdout, opts: { ...ctx.opts, interaction: "ask", mode: ctx.opts.mode || "report" } });
  if (ctx.opts.out) fs.writeFileSync(ctx.opts.out, captured);
  return code;
}

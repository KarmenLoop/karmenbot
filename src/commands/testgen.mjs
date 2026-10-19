import { run as runTask } from "./ask.mjs";
import { run as fix } from "./fix.mjs";

export async function run(ctx) {
  const files = ctx.args.join(" ").trim() || "the code that changed";
  const prompt = `Add tests in the style already used in this folder for: ${files}. Do not change the behavior under test.`;
  const code = await runTask({ ...ctx, args: [prompt], opts: { ...ctx.opts, interaction: "agent", mode: ctx.opts.mode || "code" } });
  if (code !== 0 || !ctx.opts.command) return code;
  return fix({ ...ctx, args: [] });
}

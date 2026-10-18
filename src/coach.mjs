import { depthOf } from "./term.mjs";
import { sp, toAnsi } from "./tui/paint.mjs";
import { C, gradient } from "./tui/theme.mjs";

// The wizard's narrator: a step header with progress dots, what this step is
// for and how to choose, and one light remark.
export function createCoach(ctx, prompter) {
  const depth = ctx.stdout.isTTY ? depthOf(ctx.stdout, ctx.env, ctx.opts?.color) : "none";
  const line = (spans) => prompter.print(depth === "none" ? spans.map((item) => item.text).join("") : toAnsi(spans, depth));
  return {
    step({ step, total, title, tips = [], quip = "" }) {
      prompter.print("");
      const dots = `${"●".repeat(step)}${"○".repeat(Math.max(0, total - step))}`;
      line([sp("── ", { fg: C.border }), ...gradient(ctx.t.lang === "en" ? `Step ${step} of ${total} · ${title}` : `第 ${step} 步 / 共 ${total} 步 · ${title}`, { bold: true, from: 0.5 }), sp(`  ${dots}`, { fg: C.accent })]);
      for (const tip of tips) line([sp("   "), sp(tip, { fg: C.soft })]);
      if (quip) line([sp("   "), sp(`（${quip}）`, { fg: C.dim })]);
    },
    tip(text) {
      line([sp("   "), sp(text, { fg: C.soft })]);
    },
    quip(text) {
      line([sp("   "), sp(`（${text}）`, { fg: C.dim })]);
    },
    done(title, tips = []) {
      prompter.print("");
      line([sp("✓ ", { fg: C.ok, bold: true }), ...gradient(title, { bold: true, from: 0.5 })]);
      for (const tip of tips) line([sp("   "), sp(tip, { fg: C.soft })]);
    },
  };
}

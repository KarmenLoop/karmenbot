import { createPrompter } from "../prompt.mjs";
import { depthOf } from "../term.mjs";
import { KarmenError } from "../errors.mjs";
import { SYSTEMS, chapterMarkdown, chaptersFor, currentSystem, normalizeSystem } from "../tutorial/chapters.mjs";
import { logoLines } from "../tui/banner.mjs";
import { renderMarkdown } from "../tui/markdown.mjs";
import { sp, toAnsi } from "../tui/paint.mjs";
import { C, gradient } from "../tui/theme.mjs";

const QUIPS = ["这章不长，泡杯茶的工夫。", "看完这章，你就比昨天的自己多会一招。", "放轻松，这里没有考试。", "有问题？那说明你在认真看。"];

// `karmenbot 教程 [章号|all] [--os mac|win|linux]`: the whole Chinese tutorial
// for this computer's system. On a terminal it reads chapter by chapter; piped,
// it prints everything.
export async function run(ctx) {
  const { stdout, stdin, env, opts } = ctx;
  let os = opts.os ? normalizeSystem(opts.os) : currentSystem(ctx.io.platform);
  if (!os) throw new KarmenError("learn.badOs", { os: opts.os });
  let CHAPTERS = chaptersFor(os);
  const depth = depthOf(stdout, env, opts.color);
  const width = Math.max(40, Math.min((stdout.columns || 100) - 4, 100));
  const print = (lines) => {
    for (const line of lines) stdout.write(`  ${depth === "none" ? line.map((item) => item.text ?? "").join("") : toAnsi(line, depth)}\n`);
  };
  const show = (index) => {
    stdout.write("\n");
    print(renderMarkdown(chapterMarkdown(CHAPTERS[index], index), width));
    stdout.write("\n");
  };
  const arg = ctx.args[0];
  const picked = Number(arg) - 1;
  if (!stdin.isTTY || !stdout.isTTY || arg === "all" || arg === "全部") {
    if (Number.isInteger(picked) && CHAPTERS[picked]) show(picked);
    else CHAPTERS.forEach((_, index) => show(index));
    return 0;
  }

  const prompter = createPrompter({ input: stdin, output: stdout, answers: ctx.io.answers });
  const menu = () => {
    stdout.write("\n");
    if (depth !== "none") for (const line of logoLines({ size: 20, depth })) stdout.write(`  ${line}\n`);
    print([gradient(`Karmen 使用教程 · ${SYSTEMS[os].name} 版`, { bold: true, from: 0.5 }), [sp("一句话进来，一件事办妥。从安装讲到毕业，每一步怎么按、怎么选都在这里。", { fg: C.dim })], [sp("换系统看：输入 s，或运行 karmenbot 教程 --os mac / win / linux", { fg: C.faint })], []]);
    print(CHAPTERS.map((chapter, i) => [sp(`  ${String(i + 1).padStart(2)}. `, { fg: C.accent, bold: true }), sp(chapter.title, { fg: C.text })]));
    stdout.write("\n");
  };
  try {
    let index = Number.isInteger(picked) && CHAPTERS[picked] ? picked : -1;
    if (index < 0) {
      menu();
      let answer = await prompter.ask("输入章号开始（回车从第 1 章开始，s 换系统，q 退出）：");
      while (answer.toLowerCase() === "s") {
        os = await pickSystem(prompter, os);
        CHAPTERS = chaptersFor(os);
        menu();
        answer = await prompter.ask("输入章号开始（回车从第 1 章开始，s 换系统，q 退出）：");
      }
      if (answer.toLowerCase() === "q") return 0;
      index = Number(answer) - 1;
      if (!CHAPTERS[index]) index = 0;
    }
    for (;;) {
      show(index);
      const last = index === CHAPTERS.length - 1;
      const hint = last ? "全部看完了，恭喜毕业！（回车退出，m 回目录）" : `${QUIPS[index % QUIPS.length]}  回车看下一章 · 输入章号跳转 · m 目录 · q 退出：`;
      const answer = (await prompter.ask(hint)).toLowerCase();
      if (answer === "q" || (last && !answer)) return 0;
      if (answer === "m") {
        menu();
        const next = Number(await prompter.ask("输入章号：")) - 1;
        index = CHAPTERS[next] ? next : index;
        continue;
      }
      const jump = Number(answer) - 1;
      index = CHAPTERS[jump] ? jump : Math.min(CHAPTERS.length - 1, index + 1);
    }
  } finally {
    prompter.close();
  }
}

async function pickSystem(prompter, current) {
  const ids = Object.keys(SYSTEMS);
  const answer = await prompter.ask(`看哪个系统的？${ids.map((id, i) => `${i + 1}. ${SYSTEMS[id].name}`).join("  ")}（回车不换）：`);
  return ids[Number(answer) - 1] || normalizeSystem(answer) || current;
}

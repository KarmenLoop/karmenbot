import path from "node:path";
import { KarmenError } from "../errors.mjs";
import { createPrompter } from "../prompt.mjs";
import {
  discoverSkills,
  getSkill,
  installSkillFromPath,
  uninstallSkill,
  isSkillEnabled,
  setSkillEnabled,
  enabledSkillSummaries,
} from "../skills/loader.mjs";
import { runSkill, parseSteps } from "../skills/runner.mjs";

const pick = (ctx, zh, en) => (ctx.t.lang === "en" ? en : zh);

function printSkill(ctx, skill) {
  const flag = isSkillEnabled(skill.id, ctx.env) ? "on " : "off";
  const scan = skill.scan.ok ? "ok" : `BLOCKED:${skill.scan.blocked.map((item) => item.id).join(",")}`;
  ctx.stdout.write(`${flag}  ${skill.id}  v${skill.version}  [${skill.scope}]  ${scan}  ${skill.name}\n`);
  if (skill.description) ctx.stdout.write(`      ${skill.description}\n`);
}

export async function run(ctx) {
  const [action = "list", ...args] = ctx.args;
  const en = ctx.t.lang === "en";

  if (action === "list" || action === "ls") {
    const skills = discoverSkills({ env: ctx.env, workspace: ctx.workspace });
    if (!skills.length) {
      ctx.stdout.write(`${pick(ctx, "还没有技能包。把包放到 ~/.karmenbot/skills/ 或 .karmenbot/skills/，或运行 karmenbot skill install <目录>。", "No skills yet. Place packs in ~/.karmenbot/skills/ or .karmenbot/skills/, or run karmenbot skill install <dir>.")}\n`);
      return 0;
    }
    for (const skill of skills) printSkill(ctx, skill);
    return 0;
  }

  if (action === "show") {
    const id = args[0];
    if (!id) throw new KarmenError("err.failed", { message: en ? "Usage: skill show <id>" : "用法：skill show <id>" });
    const skill = getSkill(id, { env: ctx.env, workspace: ctx.workspace });
    if (!skill) throw new KarmenError("err.failed", { message: en ? `Unknown skill: ${id}` : `没有这个技能：${id}` });
    if (ctx.opts.json) {
      ctx.stdout.write(`${JSON.stringify({ ...skill, markdown: skill.markdown, scripts: skill.scripts.map((item) => item.path) }, null, 2)}\n`);
      return 0;
    }
    printSkill(ctx, skill);
    ctx.stdout.write(`permissions: network=${skill.permissions.network} shell=${skill.permissions.shell} write=${skill.permissions.write}\n`);
    ctx.stdout.write(`steps: ${parseSteps(skill.markdown).length}\n`);
    if (skill.scan.findings.length) {
      for (const finding of skill.scan.findings) {
        ctx.stdout.write(`  [${finding.severity}] ${finding.id}: ${finding.message} (${finding.source})\n`);
      }
    }
    return 0;
  }

  if (action === "install") {
    const source = args[0];
    if (!source) throw new KarmenError("err.failed", { message: en ? "Usage: skill install <path>" : "用法：skill install <路径>" });
    if (/^https?:\/\//i.test(source)) {
      throw new KarmenError("err.failed", { message: en ? "URL install is not enabled in Wave3. Clone/download locally, then skill install <dir>." : "Wave3 不支持直接 URL 安装。请先下载到本地，再 skill install <目录>。" });
    }
    const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
    try {
      ctx.stdout.write(`${pick(ctx, `将安装技能目录：${path.resolve(source)}`, `Install skill from: ${path.resolve(source)}`)}\n`);
      // --yes must never skip install confirmation for skills.
      const ok = await prompter.confirm(pick(ctx, "确认安装？扫描通过后才会复制。[y/N] ", "Confirm install? Copy only if scan passes. [y/N] "), false);
      if (!ok) return 1;
      const installed = installSkillFromPath(source, { env: ctx.env, force: true });
      ctx.stdout.write(`${pick(ctx, `已安装 ${installed.id}`, `Installed ${installed.id}`)}\n`);
      if (installed.scan.warnings.length) {
        for (const warning of installed.scan.warnings) ctx.stdout.write(`  warn: ${warning.message}\n`);
      }
      return 0;
    } catch (error) {
      if (error.code === "SKILL_BLOCKED") {
        ctx.stderr.write(`${pick(ctx, "安装被扫描拦截：", "Install blocked by scanner: ")}${error.message}\n`);
        return 1;
      }
      throw error;
    } finally {
      prompter.close();
    }
  }

  if (action === "uninstall" || action === "remove" || action === "rm") {
    const id = args[0];
    if (!id) throw new KarmenError("err.failed", { message: en ? "Usage: skill uninstall <id>" : "用法：skill uninstall <id>" });
    const ok = uninstallSkill(id, ctx.env);
    ctx.stdout.write(ok ? `${pick(ctx, `已卸载 ${id}`, `Uninstalled ${id}`)}\n` : `${pick(ctx, "未找到全局安装", "Not found in global skills")}\n`);
    return ok ? 0 : 1;
  }

  if (action === "on" || action === "enable") {
    const id = args[0];
    if (!id) throw new KarmenError("err.failed", { message: "skill on <id>" });
    setSkillEnabled(id, true, ctx.env);
    ctx.stdout.write(`${id} on\n`);
    return 0;
  }
  if (action === "off" || action === "disable") {
    const id = args[0];
    if (!id) throw new KarmenError("err.failed", { message: "skill off <id>" });
    setSkillEnabled(id, false, ctx.env);
    ctx.stdout.write(`${id} off\n`);
    return 0;
  }

  if (action === "scan") {
    const id = args[0];
    if (!id) throw new KarmenError("err.failed", { message: "skill scan <id>" });
    const skill = getSkill(id, { env: ctx.env, workspace: ctx.workspace });
    if (!skill) throw new KarmenError("err.failed", { message: en ? `Unknown skill: ${id}` : `没有这个技能：${id}` });
    ctx.stdout.write(`${skill.scan.ok ? "ok" : "blocked"}\n`);
    for (const finding of skill.scan.findings) {
      ctx.stdout.write(`[${finding.severity}] ${finding.id}: ${finding.message} (${finding.source})\n`);
    }
    return skill.scan.ok ? 0 : 1;
  }

  if (action === "run") {
    const id = args[0];
    if (!id) throw new KarmenError("err.failed", { message: en ? "Usage: skill run <id>" : "用法：skill run <id>" });
    // Skills never inherit --yes for shell/write.
    const prompter = ctx.stdin.isTTY ? createPrompter({ input: ctx.stdin, output: ctx.stderr, answers: ctx.io.answers }) : null;
    const decide = async (pause) => {
      if (!prompter) return { accept: false };
      if (pause.kind === "change") {
        return { accept: await prompter.confirm(pick(ctx, `技能要写入 ${pause.path} [y/N] `, `Skill wants to write ${pause.path} [y/N] `), false) };
      }
      return { accept: await prompter.confirm(pick(ctx, `技能要运行命令：\n${pause.command}\n[y/N] `, `Skill wants to run:\n${pause.command}\n[y/N] `), false) };
    };
    try {
      const outcome = await runSkill(id, {
        workspace: ctx.workspace,
        env: ctx.env,
        decide,
        yes: false,
        onEvent(event) {
          if (event.type === "skill.step") ctx.stderr.write(`  → ${event.step.label || event.step.type}\n`);
        },
      });
      ctx.stdout.write(ctx.opts.json ? `${JSON.stringify(outcome)}\n` : `${outcome.ok ? "ok" : "failed"} · ${outcome.results.length} step result(s)\n`);
      return outcome.ok ? 0 : 1;
    } finally {
      prompter?.close();
    }
  }

  if (action === "summary") {
    const rows = enabledSkillSummaries({ env: ctx.env, workspace: ctx.workspace });
    ctx.stdout.write(ctx.opts.json ? `${JSON.stringify(rows)}\n` : (rows.map((row) => `${row.id}: ${row.description || row.name}`).join("\n") || (en ? "No enabled skills." : "没有启用的技能。")) + "\n");
    return 0;
  }

  throw new KarmenError("err.unknownCommand", { name: `skill ${action}` });
}

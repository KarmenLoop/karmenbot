import path from "node:path";
import { KarmenError } from "../errors.mjs";
import {
  createRoutine,
  deleteRoutine,
  getRoutine,
  listRoutines,
  updateRoutine,
} from "../routines/store.mjs";
import { executeRoutine } from "../routines/execute.mjs";
import { tickRoutines } from "../routines/tick.mjs";
import { installSnippets } from "../routines/install.mjs";
import { normalizeSchedule, nextRunAfter } from "../routines/cron.mjs";

function say(ctx, line) {
  ctx.stdout.write(`${line}\n`);
}

function parseFlags(args) {
  const out = { rest: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--flow" || a === "--prompt" || a === "--schedule" || a === "--name" || a === "--workspace") {
      out[a.slice(2)] = args[++i];
    } else if (a === "--allow-unattended") out.allowUnattended = true;
    else if (a === "--allow-shell") out.allowShell = true;
    else if (a === "--force") out.force = true;
    else out.rest.push(a);
  }
  return out;
}

function formatRoutine(r, en) {
  const when = r.nextRunAt ? new Date(r.nextRunAt).toISOString() : "-";
  const last = r.lastRunAt ? new Date(r.lastRunAt).toISOString() : "-";
  const flags = [
    r.enabled === false ? (en ? "paused" : "已暂停") : (en ? "on" : "启用"),
    r.allowUnattended ? "unattended" : "attended-only",
    r.allowShell ? "shell-ok" : "no-shell",
  ].join(",");
  const target = r.flowFile || r.prompt || (r.steps ? `${r.steps.length} steps` : "?");
  return `${r.id}  ${r.schedule}  next=${when}  last=${last}  [${flags}]  ${target}${r.name && r.name !== r.id ? `  (${r.name})` : ""}`;
}

export async function run(ctx) {
  const en = ctx.t.lang === "en";
  const [action = "list", ...raw] = ctx.args;
  const flags = parseFlags(raw);

  if (action === "list" || action === "ls") {
    const items = listRoutines(ctx.env);
    if (ctx.opts.json) {
      say(ctx, JSON.stringify(items));
      return 0;
    }
    if (!items.length) {
      say(ctx, en ? "No routines. Add one with: karmenbot routine add <id> --schedule '@daily' --prompt '...'" : "还没有例行任务。添加：karmenbot routine add <id> --schedule '@daily' --prompt '…'");
      return 0;
    }
    for (const item of items) say(ctx, formatRoutine(item, en));
    return 0;
  }

  if (action === "add" || action === "create") {
    const id = flags.rest[0];
    if (!id) throw new KarmenError("err.flagValue", { flag: "routine add <id> --schedule … (--flow|--prompt)" });
    if (!flags.schedule) throw new KarmenError("err.flagValue", { flag: "--schedule <cron|@daily|@every 1h>" });
    if (!flags.flow && !flags.prompt) throw new KarmenError("err.flagValue", { flag: "--flow <file.json> or --prompt <text>" });
    try {
      normalizeSchedule(flags.schedule);
    } catch (error) {
      throw new KarmenError("err.failed", { message: error.message });
    }
    let routine;
    try {
      routine = createRoutine({
        id,
        schedule: flags.schedule,
        flowFile: flags.flow || null,
        prompt: flags.prompt || null,
        name: flags.name || id,
        allowUnattended: flags.allowUnattended === true,
        allowShell: flags.allowShell === true,
        workspace: flags.workspace || null,
      }, ctx.env);
    } catch (error) {
      throw new KarmenError("err.failed", { message: error.message });
    }
    say(ctx, en
      ? `Created ${routine.id}. next=${new Date(routine.nextRunAt).toISOString()}. Unattended tick requires --allow-unattended.`
      : `已创建 ${routine.id}。下次=${new Date(routine.nextRunAt).toISOString()}。定时执行需加 --allow-unattended。`);
    return 0;
  }

  if (action === "pause") {
    const id = flags.rest[0];
    if (!id) throw new KarmenError("err.flagValue", { flag: "routine pause <id>" });
    try {
      updateRoutine(id, { enabled: false }, ctx.env);
    } catch (error) {
      throw new KarmenError("err.failed", { message: error.message });
    }
    say(ctx, en ? "Paused." : "已暂停。");
    return 0;
  }

  if (action === "resume") {
    const id = flags.rest[0];
    if (!id) throw new KarmenError("err.flagValue", { flag: "routine resume <id>" });
    try {
      const current = getRoutine(id, ctx.env);
      if (!current) throw new Error(`routine not found: ${id}`);
      const parsed = normalizeSchedule(current.schedule);
      updateRoutine(id, { enabled: true, nextRunAt: nextRunAfter(parsed, Date.now()) }, ctx.env);
    } catch (error) {
      throw new KarmenError("err.failed", { message: error.message });
    }
    say(ctx, en ? "Resumed." : "已恢复。");
    return 0;
  }

  if (action === "delete" || action === "rm" || action === "remove") {
    const id = flags.rest[0];
    if (!id) throw new KarmenError("err.flagValue", { flag: "routine delete <id>" });
    if (!deleteRoutine(id, ctx.env)) throw new KarmenError("err.failed", { message: en ? "Routine not found." : "找不到该例行任务。" });
    say(ctx, en ? "Deleted." : "已删除。");
    return 0;
  }

  if (action === "show") {
    const id = flags.rest[0];
    if (!id) throw new KarmenError("err.flagValue", { flag: "routine show <id>" });
    const routine = getRoutine(id, ctx.env);
    if (!routine) throw new KarmenError("err.failed", { message: en ? "Routine not found." : "找不到该例行任务。" });
    say(ctx, ctx.opts.json ? JSON.stringify(routine, null, 2) : formatRoutine(routine, en) + `\n${JSON.stringify(routine, null, 2)}`);
    return 0;
  }

  if (action === "run") {
    const id = flags.rest[0];
    if (!id) throw new KarmenError("err.flagValue", { flag: "routine run <id>" });
    const routine = getRoutine(id, ctx.env);
    if (!routine) throw new KarmenError("err.failed", { message: en ? "Routine not found." : "找不到该例行任务。" });
    // Manual run: force bypasses allowUnattended so owners can test; shell still gated.
    const outcome = await executeRoutine(ctx, routine, { force: true });
    if (outcome.skipped) {
      say(ctx, `${en ? "Skipped" : "已跳过"}: ${outcome.reason}`);
      return 0;
    }
    say(ctx, en ? `Finished with code ${outcome.code}.` : `结束，退出码 ${outcome.code}。`);
    return outcome.code;
  }

  if (action === "tick") {
    const results = await tickRoutines(ctx);
    if (ctx.opts.json) {
      say(ctx, JSON.stringify(results));
      return 0;
    }
    for (const row of results) {
      if (row.skipped) say(ctx, `${row.id}: skip (${row.reason})`);
      else say(ctx, `${row.id}: ran code=${row.code}`);
    }
    if (!results.length) say(ctx, en ? "No routines." : "没有例行任务。");
    return 0;
  }

  if (action === "install" || action === "install-hint" || action === "cron-install") {
    const snippets = installSnippets({
      bin: process.argv[1] && !process.argv[1].includes("node") ? path.basename(process.argv[1]) : "karmenbot",
      home: ctx.env.HOME || undefined,
    });
    say(ctx, en ? "# Wire an OS scheduler to call: karmenbot routine tick\n" : "# 用系统定时器调用：karmenbot routine tick\n");
    say(ctx, "## crontab\n" + snippets.cron + "\n");
    say(ctx, "## launchd (macOS)\n" + snippets.launchd + "\n");
    say(ctx, "## systemd --user (Linux)\n" + snippets.systemd);
    return 0;
  }

  throw new KarmenError("err.unknownCommand", { name: `routine ${action}` });
}

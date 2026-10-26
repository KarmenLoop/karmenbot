import path from "node:path";
import { KarmenError } from "../errors.mjs";
import { karmenHome } from "../home.mjs";
import {
  cancelFollowup,
  enqueueFollowup,
  followupConfig,
  listFollowups,
  parseDueAt,
} from "../gateway/followups.mjs";
import { tickFollowups } from "../gateway/followup-tick.mjs";
import { PLATFORMS, platformName } from "../gateway/platforms/index.mjs";
import { configuredPlatforms } from "./connect.mjs";

function parseFlags(args) {
  const out = { rest: [], requireConfirm: true };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--platform" || a === "--chat" || a === "--text" || a === "--at" || a === "--session" || a === "--user") {
      out[a.slice(2)] = args[++i];
    } else if (a === "--no-confirm") out.requireConfirm = false;
    else if (a === "--dry-run") out.dryRun = true;
    else out.rest.push(a);
  }
  return out;
}

async function createSender(ctx) {
  const platforms = configuredPlatforms(ctx.env);
  if (!platforms.length) throw new KarmenError("gw.noPlatforms");
  const stateDir = path.join(karmenHome(ctx.env), "state");
  const adapters = Object.fromEntries(platforms.map(({ name, settings, secrets }) => [name, PLATFORMS[name].create({
    settings,
    secrets,
    fetchImpl: ctx.io.fetchImpl || globalThis.fetch,
    WebSocketImpl: ctx.io.WebSocketImpl || globalThis.WebSocket,
    stateDir,
  })]));
  return async (platform, chatId, text) => {
    const adapter = adapters[platform];
    if (!adapter) throw new Error(`platform not connected: ${platform}`);
    await adapter.send(chatId, text);
  };
}

export async function runFollowupCommand(ctx) {
  const zh = ctx.t.lang !== "en";
  // ctx.args: ["followup", sub, ...] or ["tick", ...]
  let sub;
  let raw;
  if (ctx.args[0] === "tick") {
    sub = "tick";
    raw = ctx.args.slice(1);
  } else {
    sub = ctx.args[1] || "list";
    raw = ctx.args.slice(2);
  }
  const flags = parseFlags(raw);

  if (sub === "list" || sub === "ls") {
    const status = flags.rest[0] || null;
    const items = listFollowups(ctx.env, status ? { status } : {});
    if (ctx.opts.json) {
      ctx.stdout.write(`${JSON.stringify(items)}\n`);
      return 0;
    }
    if (!items.length) {
      ctx.stdout.write(zh ? "没有跟进任务。\n" : "No follow-ups.\n");
      return 0;
    }
    for (const item of items) {
      ctx.stdout.write(`${item.id}  ${item.status}  due=${new Date(item.dueAt).toISOString()}  ${item.platform}:${item.chatId}  confirm=${item.requireConfirm !== false}  ${item.text.slice(0, 80)}\n`);
    }
    return 0;
  }

  if (sub === "add" || sub === "enqueue") {
    const platform = platformName(flags.platform) || flags.platform;
    if (!platform || !flags.chat || !flags.text || flags.at == null) {
      throw new KarmenError("err.flagValue", {
        flag: 'gateway followup add --platform <name> --chat <id> --at <+1h|ISO> --text "..."',
      });
    }
    let dueAt;
    try {
      dueAt = parseDueAt(flags.at);
    } catch (error) {
      throw new KarmenError("err.failed", { message: error.message });
    }
    const item = enqueueFollowup({
      platform,
      chatId: flags.chat,
      text: flags.text,
      dueAt,
      session: flags.session || null,
      userId: flags.user || null,
      requireConfirm: flags.requireConfirm !== false,
    }, ctx.env);
    ctx.stdout.write(zh
      ? `已排队 ${item.id}，到期 ${new Date(item.dueAt).toISOString()}，确认=${item.requireConfirm !== false}\n`
      : `Queued ${item.id}, due ${new Date(item.dueAt).toISOString()}, confirm=${item.requireConfirm !== false}\n`);
    return 0;
  }

  if (sub === "cancel" || sub === "rm") {
    const id = flags.rest[0];
    if (!id) throw new KarmenError("err.flagValue", { flag: "gateway followup cancel <id>" });
    const item = cancelFollowup(id, ctx.env);
    if (!item) throw new KarmenError("err.failed", { message: zh ? "找不到该跟进。" : "Follow-up not found." });
    ctx.stdout.write(zh ? `已取消 ${id}\n` : `Cancelled ${id}\n`);
    return 0;
  }

  if (sub === "tick") {
    const dryRun = Boolean(flags.dryRun || ctx.opts.dryRun);
    const send = dryRun ? async () => {} : await createSender(ctx);
    const { results } = await tickFollowups({ env: ctx.env, send, dryRun });
    if (ctx.opts.json) {
      ctx.stdout.write(`${JSON.stringify(results)}\n`);
      return 0;
    }
    for (const row of results) {
      ctx.stdout.write(`${row.id}: ${row.status}${row.reason ? ` (${row.reason})` : ""}\n`);
    }
    if (!results.length) ctx.stdout.write(zh ? "没有到期跟进。\n" : "No due follow-ups.\n");
    return 0;
  }

  if (sub === "config") {
    ctx.stdout.write(`${JSON.stringify(followupConfig(ctx.env), null, 2)}\n`);
    return 0;
  }

  throw new KarmenError("err.unknownCommand", { name: `gateway followup ${sub}` });
}


import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openAgent } from "../agent.mjs";
import { KarmenError } from "../errors.mjs";
import { karmenHome, loadConfig } from "../home.mjs";
import { createGateway } from "../gateway/core.mjs";
import { createPairing } from "../gateway/pairing.mjs";
import { PLATFORMS } from "../gateway/platforms/index.mjs";
import { pidFile, runningPid, startGateway, stopGateway } from "../gateway/control.mjs";
import { installService, logFile, stopService } from "../gateway/service.mjs";
import { activeModel } from "../models.mjs";
import { resolveMoa } from "../moa.mjs";
import { configuredPlatforms } from "./connect.mjs";


// Files and commands Karmen touches from chat live in their own folder unless
// the owner picks another with -w or gateway.workspace.
function gatewayWorkspace(ctx) {
  const chosen = ctx.opts.workspace ? ctx.workspace : loadConfig(ctx.env).gateway?.workspace || path.join(ctx.env.HOME || os.homedir(), "karmenbot-workspace");
  fs.mkdirSync(chosen, { recursive: true });
  return chosen;
}

async function runForeground(ctx) {
  const { env, t } = ctx;
  const platforms = configuredPlatforms(env);
  if (!platforms.length) throw new KarmenError("gw.noPlatforms");
  const log = (level, message) => ctx.stdout.write(`${new Date().toISOString()} ${level.padEnd(5)} ${message}\n`);
  const config = loadConfig(env);
  const workspace = gatewayWorkspace(ctx);
  const model = ctx.io.providerOverride ? null : activeModel({ env, modelFile: ctx.opts.modelFile });
  if (!model && !ctx.io.providerOverride) throw new KarmenError("model.notConfigured");
  const agent = await openAgent({ workspace, env, model, moa: resolveMoa(config), providerOverride: ctx.io.providerOverride, fetchImpl: ctx.io.fetchImpl });
  const stateDir = path.join(karmenHome(env), "state");
  const adapters = Object.fromEntries(platforms.map(({ name, settings, secrets }) => [name, PLATFORMS[name].create({ settings, secrets, fetchImpl: ctx.io.fetchImpl || globalThis.fetch, WebSocketImpl: ctx.io.WebSocketImpl || globalThis.WebSocket, stateDir })]));
  const gateway = createGateway({ agent, adapters, pairing: createPairing({ env }), t, log, groupPolicy: config.gateway?.groupPolicy || "mention", approvalTimeoutMs: ctx.io.approvalTimeoutMs });
  fs.mkdirSync(karmenHome(env), { recursive: true, mode: 0o700 });
  fs.writeFileSync(pidFile(env), String(process.pid));
  log("info", `karmenbot gateway ${ctx.version} · ${platforms.map((item) => item.name).join(", ")} · ${agent.current?.label || "no model"} · workspace ${workspace}`);
  const stop = () => gateway.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  ctx.io.signal?.addEventListener("abort", stop, { once: true });
  try {
    await gateway.start();
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    if (runningPid(env) === process.pid) fs.rmSync(pidFile(env), { force: true });
    log("info", "gateway stopped");
  }
  return 0;
}

export async function run(ctx) {
  const { env, stdout } = ctx;
  const zh = ctx.t.lang !== "en";
  const action = ctx.args[0] || "status";
  if (action === "run") return runForeground(ctx);
  if (action === "start") {
    const existing = runningPid(env);
    if (existing) {
      stdout.write(zh ? `网关已经在运行（进程 ${existing}）。\n` : `Gateway already running (pid ${existing}).\n`);
      return 0;
    }
    if (!configuredPlatforms(env).length) throw new KarmenError("gw.noPlatforms");
    const pid = await startGateway(env, { workspace: ctx.opts.workspace ? ctx.workspace : null });
    const log = logFile(env);
    stdout.write(pid ? (zh ? `网关已在后台运行（进程 ${pid}），日志：${log}\n` : `Gateway running in the background (pid ${pid}); log: ${log}\n`) : (zh ? `网关没有起来，看看日志：${log}\n` : `Gateway did not start; see ${log}\n`));
    return pid ? 0 : 1;
  }
  if (action === "stop") {
    const stopped = await stopGateway(env);
    stdout.write(stopped ? (zh ? "网关已停止。\n" : "Gateway stopped.\n") : (zh ? "网关没有在运行。\n" : "Gateway is not running.\n"));
    return 0;
  }
  if (action === "status") {
    const pid = runningPid(env);
    const names = configuredPlatforms(env).map((item) => PLATFORMS[item.name][zh ? "zh" : "en"]);
    stdout.write(`${pid ? (zh ? `● 运行中（进程 ${pid}）` : `● running (pid ${pid})`) : (zh ? "○ 未运行" : "○ not running")}\n`);
    stdout.write(`${zh ? "已接入" : "Platforms"}: ${names.length ? names.join("、") : zh ? "无（karmenbot connect）" : "none (karmenbot connect)"}\n`);
    stdout.write(`${zh ? "日志" : "Log"}: ${logFile(env)}\n`);
    return 0;
  }
  if (action === "logs") {
    const file = logFile(env);
    const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trimEnd().split("\n") : [];
    stdout.write(`${lines.slice(-60).join("\n")}\n`);
    return 0;
  }
  if (action === "install") {
    const where = await installService(ctx);
    stdout.write(where ? (zh ? `已设置开机自动运行：${where}\n` : `Will start at login: ${where}\n`) : (zh ? "这个系统暂不支持自动运行，请用 karmenbot gateway start。\n" : "Auto-start is not supported here; use karmenbot gateway start.\n"));
    return where ? 0 : 1;
  }
  if (action === "uninstall") {
    await stopService(ctx, { remove: true });
    stdout.write(zh ? "已取消开机自动运行。\n" : "Auto-start removed.\n");
    return 0;
  }
  throw new KarmenError("err.unknownCommand", { name: `gateway ${action}` });
}

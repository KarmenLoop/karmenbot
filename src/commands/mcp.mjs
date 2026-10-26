import { KarmenError } from "../errors.mjs";
import { createRegistry, listConfiguredServers, upsertServer, removeServer, enableServer, addPreset, listPresets, getPreset } from "../mcp/registry.mjs";
import { createPrompter } from "../prompt.mjs";

const pick = (ctx, zh, en) => (ctx.t.lang === "en" ? en : zh);

function printServers(ctx, servers) {
  if (!servers.length) {
    ctx.stdout.write(`${pick(ctx, "还没有配置 MCP 服务器。运行 karmenbot connect playwright 或 karmenbot mcp add。", "No MCP servers configured. Run karmenbot connect playwright or karmenbot mcp add.")}\n`);
    return;
  }
  for (const server of servers) {
    const flag = server.enabled ? "on " : "off";
    const preset = server.preset ? ` · preset ${server.preset}` : "";
    ctx.stdout.write(`${flag}  ${server.id}  ${server.command} ${(server.args || []).join(" ")}${preset}\n`);
  }
}

async function cmdList(ctx) {
  printServers(ctx, listConfiguredServers(ctx.env));
  return 0;
}

async function cmdPresets(ctx) {
  for (const preset of listPresets()) {
    ctx.stdout.write(`${preset.id.padEnd(12)} ${preset.name} — ${preset.description}\n`);
  }
  return 0;
}

async function cmdAdd(ctx, prompter) {
  const idArg = ctx.args[1];
  const preset = idArg && getPreset(idArg) ? getPreset(idArg) : null;
  if (preset) {
    const entry = addPreset(preset.id, {}, ctx.env);
    ctx.stdout.write(`${pick(ctx, `已添加预设 ${entry.id}。`, `Added preset ${entry.id}.`)}\n`);
    return 0;
  }
  const id = idArg || (await prompter.ask(pick(ctx, "服务器 id（字母开头）：", "Server id (letter first): ")));
  if (!id) return 1;
  const command = await prompter.ask(pick(ctx, "启动命令（例如 npx）：", "Command (e.g. npx): "), { fallback: "npx" });
  const argsLine = await prompter.ask(pick(ctx, "参数（空格分隔，可回车）：", "Args (space-separated, Enter for none): "));
  const args = argsLine.trim() ? argsLine.trim().split(/\s+/) : [];
  upsertServer({ id, command, args, enabled: true }, ctx.env);
  ctx.stdout.write(`${pick(ctx, `已保存 ${id}。用 karmenbot mcp test ${id} 试连。`, `Saved ${id}. Try karmenbot mcp test ${id}.`)}\n`);
  return 0;
}

async function cmdRemove(ctx) {
  const id = ctx.args[1];
  if (!id) throw new KarmenError("mcp.needId");
  removeServer(id, ctx.env);
  ctx.stdout.write(`${pick(ctx, `已移除 ${id}`, `Removed ${id}`)}\n`);
  return 0;
}

async function cmdEnable(ctx, enabled) {
  const id = ctx.args[1];
  if (!id) throw new KarmenError("mcp.needId");
  const target = enableServer(id, enabled, ctx.env);
  if (!target) throw new KarmenError("mcp.unknownServer", { id });
  ctx.stdout.write(`${id} ${enabled ? "on" : "off"}\n`);
  return 0;
}

async function cmdTest(ctx) {
  const id = ctx.args[1];
  if (!id) throw new KarmenError("mcp.needId");
  const registry = createRegistry({ env: ctx.env });
  try {
    const client = await registry.start(id);
    const tools = await client.listTools();
    ctx.stdout.write(`${pick(ctx, `已连接 ${id}，工具 ${tools.length} 个：`, `Connected ${id}, ${tools.length} tool(s):`)}\n`);
    for (const tool of tools.slice(0, 40)) {
      ctx.stdout.write(`  mcp.${id}.${tool.name}${tool.description ? ` — ${String(tool.description).slice(0, 80)}` : ""}\n`);
    }
    if (tools.length > 40) ctx.stdout.write(`  … +${tools.length - 40}\n`);
    return 0;
  } catch (error) {
    ctx.stderr.write(`${pick(ctx, "连接失败：", "Connection failed: ")}${error?.message || error}\n`);
    return 1;
  } finally {
    await registry.dispose();
  }
}

async function cmdDoctor(ctx) {
  const servers = listConfiguredServers(ctx.env);
  printServers(ctx, servers);
  if (!servers.length) return 0;
  const registry = createRegistry({ env: ctx.env });
  try {
    const { errors } = await registry.startEnabled();
    for (const id of registry.running) {
      const tools = registry.getClient(id)?.tools || [];
      ctx.stdout.write(`✓ ${id} · ${tools.length} tools\n`);
    }
    for (const error of errors) {
      ctx.stdout.write(`✗ ${error.id} · ${error.message}\n`);
    }
    return errors.length ? 1 : 0;
  } finally {
    await registry.dispose();
  }
}

export async function run(ctx) {
  const sub = (ctx.args[0] || "list").toLowerCase();
  const prompter = ["add"].includes(sub) ? createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers }) : null;
  try {
    if (sub === "list" || sub === "ls") return await cmdList(ctx);
    if (sub === "presets") return await cmdPresets(ctx);
    if (sub === "add") return await cmdAdd(ctx, prompter);
    if (sub === "remove" || sub === "rm") return await cmdRemove(ctx);
    if (sub === "on" || sub === "enable") return await cmdEnable(ctx, true);
    if (sub === "off" || sub === "disable") return await cmdEnable(ctx, false);
    if (sub === "test") return await cmdTest(ctx);
    if (sub === "doctor") return await cmdDoctor(ctx);
    throw new KarmenError("mcp.unknownSub", { name: sub });
  } finally {
    prompter?.close();
  }
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { karmenHome, loadConfig, loadSecrets } from "../home.mjs";
import { listModels } from "../models.mjs";
import { resolveMoa } from "../moa.mjs";
import { OFFICIAL } from "../official.mjs";
import { listConfiguredServers } from "../mcp/registry.mjs";
import { connectorDoctor } from "../connectors/status.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Every vendored kernel file must match the manifest written at sync time.
export function checkVendor() {
  const manifest = JSON.parse(fs.readFileSync(path.join(pkg, "vendor", "MANIFEST.json"), "utf8"));
  const bad = [];
  for (const [rel, sum] of Object.entries(manifest.files)) {
    const file = path.join(pkg, "vendor", rel);
    const actual = fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "missing";
    if (actual !== sum) bad.push(rel);
  }
  return { total: Object.keys(manifest.files).length, bad };
}

export async function run(ctx) {
  const { env, stdout } = ctx;
  const zh = ctx.t.lang !== "en";
  const line = (ok, text) => stdout.write(`${ok === null ? "·" : ok ? "✓" : "✗"} ${text}\n`);
  const major = Number(process.versions.node.split(".")[0]);
  line(major >= 22, `Node.js ${process.versions.node}${major >= 22 ? "" : zh ? "（需要 22 或更高）" : " (22+ required)"}`);
  line(null, `${zh ? "安装位置" : "Installed at"} ${pkg}`);
  line(null, `${zh ? "配置目录" : "Home"} ${karmenHome(env)}`);
  const vendor = checkVendor();
  line(!vendor.bad.length, `${zh ? "内核快照" : "Kernel snapshot"} ${vendor.total - vendor.bad.length}/${vendor.total}${vendor.bad.length ? ` ${zh ? "被改动" : "changed"}: ${vendor.bad.join(", ")}` : ""}`);
  const started = performance.now();
  await import("../kernel.mjs").then((kernel) => kernel.loadKernel());
  line(true, `${zh ? "内核加载" : "Kernel load"} ${Math.round(performance.now() - started)} ms`);
  const config = loadConfig(env);
  const models = listModels(env);
  const keys = loadSecrets(env).models || {};
  line(models.length > 0, `${zh ? "模型" : "Models"} ${models.length ? models.map((item) => `${item.id}${item.id === config.model ? "*" : ""}${keys[item.id]?.apiKey || item.auth === "none" || item.keyEnv ? "" : zh ? "(缺密钥)" : "(no key)"}`).join(", ") : zh ? "未配置，运行 karmenbot setup" : "none; run karmenbot setup"}`);
  const moa = resolveMoa(config);
  line(null, `MoA ${moa.preset ? `${moa.enabled ? "on" : "off"} · ${moa.preset.references.join("+")} → ${moa.preset.aggregator}` : zh ? "未配置" : "not configured"}`);
  line(null, `${zh ? "官网" : "Official site"} ${OFFICIAL.site}`);
  line(null, `${zh ? "查看更新" : "Updates"} ${OFFICIAL.updates}`);
  const platforms = Object.keys(config.gateway?.platforms || {});
  line(null, `${zh ? "聊天平台" : "Platforms"} ${platforms.length ? platforms.join(", ") : zh ? "未接入" : "none"}`);
  const mcpServers = listConfiguredServers(env);
  line(null, `MCP ${mcpServers.length ? mcpServers.map((item) => `${item.id}${item.enabled ? "" : "(off)"}`).join(", ") : zh ? "未配置（karmenbot connect playwright）" : "none (karmenbot connect playwright)"}`);
  const connectors = connectorDoctor(env);
  const connSummary = connectors.connectors.filter((row) => row.configured).map((row) => row.id).join(", ") || (zh ? "未接入" : "none");
  line(null, `${zh ? "邮件/日历连接器" : "Mail/calendar connectors"} ${connSummary}`);
  const mcpSecrets = Object.keys(loadSecrets(env).mcp || {});
  line(null, `${zh ? "MCP 密钥" : "MCP secrets"} ${mcpSecrets.length ? mcpSecrets.map((id) => `mcp.${id}`).join(", ") : zh ? "无（写在 secrets.json → mcp.<id>）" : "none (secrets.json → mcp.<id>)"}`);
  const voiceKey = Boolean(loadSecrets(env).voice?.apiKey || env.KARMENBOT_STT_API_KEY || env.OPENAI_API_KEY);
  line(null, `${zh ? "语音 STT 密钥" : "Voice STT key"} ${voiceKey ? (zh ? "已配置" : "set") : zh ? "未配置（可选 BYOK）" : "unset (optional BYOK)"}`);
  line(null, zh ? "密钥库：karmenbot vault list（只列名称，不打印明文）" : "Vault: karmenbot vault list (names only; never prints values)");

  return vendor.bad.length || major < 22 ? 1 : 0;
}

import crypto from "node:crypto";
import { KarmenError } from "../errors.mjs";
import { loadConfig, loadSecrets } from "../home.mjs";
import { removePlatform, savePlatform, writeSlackManifest } from "../gateway/platforms/forms.mjs";
import { PLATFORMS, platformName } from "../gateway/platforms/index.mjs";
import { DISCORD_PERMISSIONS } from "../gateway/platforms/discord.mjs";
import { registerDingtalkApp } from "../gateway/platforms/dingtalk.mjs";
import { registerFeishuApp } from "../gateway/platforms/feishu.mjs";
import { registerWecomBot } from "../gateway/platforms/wecom.mjs";
import { loginWeixin } from "../gateway/platforms/weixin.mjs";
import { encodeQr, renderQr } from "../gateway/qr.mjs";
import { createPrompter } from "../prompt.mjs";
import { getConnectorPreset, listConnectorPresets, resolveConnectorId, serverFromConnectorPreset } from "../connectors/presets.mjs";
import { hasMcpClient } from "../connectors/status.mjs";
import { upsertViaRegistryOrHome } from "../mcp/home-servers.mjs";
import { addPreset, getConfiguredServer, removeServer } from "../mcp/registry.mjs";
import { listPresets } from "../mcp/presets.mjs";

async function connectPlaywright(ctx, prompter) {
  const existing = getConfiguredServer("playwright", ctx.env);
  if (existing) {
    prompter.print(pick(ctx, "Playwright MCP 已配置。可用 karmenbot mcp test playwright 试连，或 karmenbot mcp remove playwright 后重装。", "Playwright MCP is already configured. Try karmenbot mcp test playwright, or remove it with karmenbot mcp remove playwright."));
    return true;
  }
  prompter.print(pick(ctx,
    "将添加官方 Playwright MCP（npx -y @playwright/mcp@latest）。首次会拉包；浏览器能力走 y/n 审批，提交类操作不会被 --yes 绕过。",
    "This adds the official Playwright MCP (npx -y @playwright/mcp@latest). First run may download packages. Browser tools use y/n approval; submit-class calls are never bypassed by --yes."));
  const ok = await prompter.confirm(pick(ctx, "现在写入配置吗？[Y/n] ", "Write the config now? [Y/n] "), true);
  if (!ok) return false;
  addPreset("playwright", { enabled: true }, ctx.env);
  prompter.print(pick(ctx, "已写入。试一下：karmenbot mcp test playwright", "Saved. Try: karmenbot mcp test playwright"));
  prompter.print(pick(ctx, "需要 Chromium 时再运行：npx playwright install chromium", "If Chromium is missing, run: npx playwright install chromium"));
  return true;
}

async function connectMcp(ctx, prompter, wantedPreset = null) {
  if (wantedPreset === "playwright" || ctx.args[0] === "playwright") return connectPlaywright(ctx, prompter);
  const presets = listPresets();
  prompter.print(pick(ctx, "可选 MCP 预设：", "MCP presets:"));
  const labels = presets.map((item) => `${item.id} — ${item.description}`);
  const index = await prompter.choose(pick(ctx, "输入编号（回车取消）：", "Number (Enter to cancel): "), labels, { allowEmpty: true });
  if (index < 0) return false;
  const preset = presets[index];
  if (preset.id === "playwright") return connectPlaywright(ctx, prompter);
  if (getConfiguredServer(preset.id, ctx.env)) {
    prompter.print(pick(ctx, `${preset.id} 已存在。`, `${preset.id} already configured.`));
    return true;
  }
  if (preset.id === "filesystem") {
    const root = await prompter.ask(pick(ctx, "允许访问的目录（绝对路径）：", "Allowed root directory (absolute path): "));
    if (!root) return false;
    addPreset("filesystem", { extraArgs: [root], enabled: true }, ctx.env);
  } else {
    addPreset(preset.id, { enabled: true }, ctx.env);
  }
  prompter.print(pick(ctx, `已添加 ${preset.id}。karmenbot mcp test ${preset.id}`, `Added ${preset.id}. karmenbot mcp test ${preset.id}`));
  return true;
}


const pick = (ctx, zh, en) => (ctx.t.lang === "en" ? en : zh);

function showCode(ctx, prompter, url, hint) {
  prompter.print("");
  for (const line of renderQr(encodeQr(url).modules, { color: !ctx.env.NO_COLOR })) prompter.print(`  ${line}`);
  prompter.print("");
  prompter.print(hint);
  prompter.print(pick(ctx, `扫不了的话，用手机打开：${url}`, `If scanning fails, open on your phone: ${url}`));
}

function save(ctx, name, settings, secrets, owner) {
  savePlatform(ctx.env, name, settings, secrets, owner);
}

async function viaQrOrManual(ctx, prompter, label) {
  const choice = await prompter.ask(pick(ctx, `${label}：1. 扫码一键创建（推荐）  2. 手动填写凭证（回车 1）：`, `${label}: 1. scan to create (recommended)  2. enter credentials (Enter for 1): `));
  return choice === "2" ? "manual" : "qr";
}

const FLOWS = {
  async feishu(ctx, prompter) {
    const mode = await viaQrOrManual(ctx, prompter, pick(ctx, "接入飞书", "Connect Feishu"));
    if (mode === "qr") {
      const result = await registerFeishuApp({
        fetchImpl: ctx.io.fetchImpl,
        source: ctx.env.KARMENBOT_REGISTRATION_SOURCE || "karmenbot",
        onCode: ({ url }) => showCode(ctx, prompter, url, pick(ctx, "用飞书扫码，确认创建 Karmen 机器人。", "Scan with Feishu and confirm creating the Karmen bot.")),
      });
      save(ctx, "feishu", { domain: result.domain }, { appId: result.appId, appSecret: result.appSecret }, result.ownerOpenId);
      return true;
    }
    prompter.print(pick(ctx,
      "在 open.feishu.cn 创建企业自建应用 → 添加「机器人」能力 → 事件与回调选择「使用长连接接收事件」并订阅「接收消息 im.message.receive_v1」→ 开通权限 im:message、im:message:send_as_bot → 发布版本。",
      "On open.feishu.cn create a custom app → add the Bot capability → Events: choose long connection and subscribe to im.message.receive_v1 → grant im:message and im:message:send_as_bot → publish."));
    const appId = await prompter.ask("App ID: ");
    const appSecret = await prompter.secret("App Secret: ");
    if (!appId || !appSecret) return false;
    const domain = (await prompter.ask(pick(ctx, "国际版 Lark 吗？[y/N] ", "Lark (international)? [y/N] "))).toLowerCase() === "y" ? "lark" : "feishu";
    save(ctx, "feishu", { domain }, { appId, appSecret });
    return true;
  },
  async wecom(ctx, prompter) {
    const mode = await viaQrOrManual(ctx, prompter, pick(ctx, "接入企业微信", "Connect WeCom"));
    if (mode === "qr") {
      const result = await registerWecomBot({
        fetchImpl: ctx.io.fetchImpl,
        source: ctx.env.KARMENBOT_REGISTRATION_SOURCE || "karmenbot",
        onCode: ({ url }) => showCode(ctx, prompter, url, pick(ctx, "用企业微信扫码，创建并授权智能机器人。", "Scan with WeCom to create and authorize the smart bot.")),
      });
      save(ctx, "wecom", {}, result);
      return true;
    }
    prompter.print(pick(ctx, "企业微信管理后台 → 智能机器人 → 创建 → API 模式选择「长连接」，复制 Bot ID 和 Secret。", "WeCom admin → Smart bots → create → API mode: long connection; copy the Bot ID and Secret."));
    const botId = await prompter.ask("Bot ID: ");
    const secret = await prompter.secret("Secret: ");
    if (!botId || !secret) return false;
    save(ctx, "wecom", {}, { botId, secret });
    return true;
  },
  async weixin(ctx, prompter) {
    prompter.print(pick(ctx, "个人微信通过腾讯 iLink 扫码登录。", "Personal WeChat signs in by scanning a code (Tencent iLink)."));
    const result = await loginWeixin({
      fetchImpl: ctx.io.fetchImpl,
      onCode: ({ url }) => showCode(ctx, prompter, url, pick(ctx, "用微信扫码并在手机上确认。", "Scan with WeChat and confirm on the phone.")),
      onStatus: (status) => prompter.print(status === "scanned" ? pick(ctx, "已扫码，请在手机上确认…", "Scanned; confirm on the phone…") : pick(ctx, "二维码过期，换一个…", "Code expired; refreshing…")),
    });
    save(ctx, "weixin", {}, { accountId: result.accountId, token: result.token, baseUrl: result.baseUrl }, result.ownerId);
    return true;
  },
  async dingtalk(ctx, prompter) {
    const mode = await viaQrOrManual(ctx, prompter, pick(ctx, "接入钉钉", "Connect DingTalk"));
    if (mode === "qr") {
      const result = await registerDingtalkApp({
        fetchImpl: ctx.io.fetchImpl,
        source: ctx.env.KARMENBOT_REGISTRATION_SOURCE || "karmenbot",
        onCode: ({ url }) => showCode(ctx, prompter, url, pick(ctx, "用钉钉扫码，确认创建应用。", "Scan with DingTalk and confirm creating the app.")),
      });
      save(ctx, "dingtalk", {}, result);
      return true;
    }
    prompter.print(pick(ctx, "open-dev.dingtalk.com 创建应用 → 添加「机器人」→ 消息接收模式选「Stream 模式」→ 发布。复制 Client ID 和 Client Secret。", "On open-dev.dingtalk.com create an app → add a Robot → message mode: Stream → publish; copy the Client ID and Secret."));
    const clientId = await prompter.ask("Client ID (AppKey): ");
    const clientSecret = await prompter.secret("Client Secret (AppSecret): ");
    if (!clientId || !clientSecret) return false;
    save(ctx, "dingtalk", {}, { clientId, clientSecret });
    return true;
  },
  async telegram(ctx, prompter) {
    prompter.print(pick(ctx, "在 Telegram 里找 @BotFather，发送 /newbot，按提示起名，把它给你的令牌粘贴到这里。", "In Telegram open @BotFather, send /newbot, follow the prompts and paste the token here."));
    const token = await prompter.secret(pick(ctx, "Bot 令牌：", "Bot token: "));
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
      prompter.print(pick(ctx, "令牌格式不对，应类似 123456:ABC…", "That does not look like a bot token (123456:ABC…)."));
      return false;
    }
    save(ctx, "telegram", {}, { token });
    return true;
  },
  async slack(ctx, prompter) {
    const file = writeSlackManifest(ctx.env);
    prompter.print(pick(ctx,
      `api.slack.com/apps → Create New App → From a manifest，粘贴 ${file} 的内容 → Install to Workspace。\nBasic Information → App-Level Tokens 生成带 connections:write 的令牌（xapp-）；OAuth & Permissions 复制 Bot Token（xoxb-）。`,
      `api.slack.com/apps → Create New App → From a manifest, paste ${file} → Install to Workspace.\nBasic Information → App-Level Tokens: create one with connections:write (xapp-); OAuth & Permissions: copy the Bot Token (xoxb-).`));
    const appToken = await prompter.secret("App token (xapp-…): ");
    const botToken = await prompter.secret("Bot token (xoxb-…): ");
    if (!appToken.startsWith("xapp-") || !botToken.startsWith("xoxb-")) {
      prompter.print(pick(ctx, "令牌前缀不对。", "Token prefixes do not match."));
      return false;
    }
    save(ctx, "slack", {}, { appToken, botToken });
    return true;
  },
  async discord(ctx, prompter) {
    prompter.print(pick(ctx,
      "discord.com/developers/applications → New Application → Bot：Reset Token 复制令牌，并打开「MESSAGE CONTENT INTENT」。",
      "discord.com/developers/applications → New Application → Bot: Reset Token to copy it, and enable MESSAGE CONTENT INTENT."));
    const token = await prompter.secret(pick(ctx, "Bot 令牌：", "Bot token: "));
    const applicationId = await prompter.ask("Application ID: ");
    if (!token) return false;
    save(ctx, "discord", {}, { token });
    if (applicationId) prompter.print(pick(ctx, "用这个链接把机器人邀请进服务器：", "Invite the bot with: ") + `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot&permissions=${DISCORD_PERMISSIONS}`);
    return true;
  },
  async whatsapp(ctx, prompter) {
    prompter.print(pick(ctx,
      "WhatsApp 走 Meta 的 Business Cloud API：需要 Meta 开发者应用、一个企业电话号码，以及能从公网访问的 HTTPS 地址（可以用隧道转发到本机端口）。个人 WhatsApp 号暂不支持。",
      "WhatsApp uses Meta's Business Cloud API: a Meta developer app, a business phone number, and a public HTTPS URL (a tunnel to the local port works). Personal WhatsApp accounts are not supported."));
    const accessToken = await prompter.secret("Access token: ");
    const phoneNumberId = await prompter.ask("Phone number ID: ");
    const appSecret = await prompter.secret(pick(ctx, "App Secret（用于校验签名，可回车跳过）：", "App secret (verifies signatures; Enter to skip): "));
    const port = Number(await prompter.ask(pick(ctx, "本机监听端口（回车 8787）：", "Local port (Enter for 8787): "))) || 8787;
    if (!accessToken || !phoneNumberId) return false;
    const verifyToken = crypto.randomBytes(16).toString("hex");
    save(ctx, "whatsapp", { port }, { accessToken, phoneNumberId, appSecret, verifyToken });
    prompter.print(pick(ctx, `在 Meta 后台 Webhooks 填：回调地址 https://<你的公网地址>/whatsapp/webhook，验证令牌 ${verifyToken}，订阅 messages。`, `In Meta Webhooks set callback https://<your public host>/whatsapp/webhook, verify token ${verifyToken}, and subscribe to messages.`));
    return true;
  },
};


async function connectConnector(ctx, prompter, wanted) {
  const preset = getConnectorPreset(wanted);
  if (!preset) return false;
  const existing = getConfiguredServer(preset.id, ctx.env);
  if (existing) {
    prompter.print(pick(ctx,
      `${preset.name} 已在 mcp.servers 里（id=${preset.id}）。可用 karmenbot connect ${preset.id} remove 移除，或查看 docs/CONNECTORS.md。`,
      `${preset.name} is already in mcp.servers (id=${preset.id}). Remove with karmenbot connect ${preset.id} remove, or see docs/CONNECTORS.md.`));
    return true;
  }

  prompter.print(pick(ctx,
    `将写入 MCP 预设「${preset.name}」到 ~/.karmenbot/config.json → mcp.servers[]。\n默认用社区包 google-services-mcp（stdio）。官方 Google 远程 MCP：${preset.remoteUrl}`,
    `This writes the "${preset.name}" MCP preset into ~/.karmenbot/config.json → mcp.servers[].\nDefault stdio package: google-services-mcp. Official Google remote MCP: ${preset.remoteUrl}`));

  if (ctx.opts.dryRun) {
    const entry = serverFromConnectorPreset(preset.id, { enabled: true });
    prompter.print(pick(ctx, "[dry-run] 将写入：", "[dry-run] would write:"));
    prompter.print(JSON.stringify(entry, null, 2));
    return true;
  }

  let clientId = "";
  let clientSecret = "";
  if (ctx.stdin.isTTY && !ctx.opts.yes) {
    prompter.print(pick(ctx,
      "在 Google Cloud 创建 OAuth「桌面应用」客户端，启用 Gmail / Calendar API。凭证可稍后用环境变量补。",
      "Create a Google Cloud OAuth Desktop client with Gmail / Calendar API enabled. You can fill secrets later via env."));
    clientId = (await prompter.ask("GOOGLE_MCP_CLIENT_ID (Enter to skip): ")).trim();
    if (clientId) clientSecret = (await prompter.secret("GOOGLE_MCP_CLIENT_SECRET: ")).trim();
  }

  const entry = serverFromConnectorPreset(preset.id, { enabled: true });
  const secret = {};
  if (clientId) secret.GOOGLE_MCP_CLIENT_ID = clientId;
  if (clientSecret) secret.GOOGLE_MCP_CLIENT_SECRET = clientSecret;
  await upsertViaRegistryOrHome(entry, Object.keys(secret).length ? secret : null, ctx.env);

  if (!hasMcpClient()) {
    prompter.print(pick(ctx,
      "配置已保存。当前安装还没有 MCP 客户端运行时（见 PR #5）；合并后工具调用才会真正拉起该 server。",
      "Config saved. This install has no MCP client runtime yet (see PR #5); tool calling starts after that lands."));
  } else {
    prompter.print(pick(ctx,
      `已写入。首次授权可运行：npx -y google-services-mcp add personal`,
      `Saved. For first-time OAuth run: npx -y google-services-mcp add personal`));
  }
  prompter.print(pick(ctx,
    "发信若走聊天网关，仍应遵守 draft-then-send（见 docs/GATEWAY.md / PR #8）。详情：docs/CONNECTORS.md",
    "Outbound mail via the chat gateway should still respect draft-then-send (docs/GATEWAY.md / PR #8). Details: docs/CONNECTORS.md"));
  return true;
}

export async function connectWizard(ctx, prompter, wanted = null) {
  const configured = loadConfig(ctx.env).gateway?.platforms || {};
  const names = Object.keys(PLATFORMS);
  let name = wanted;
  if (!name) {
    prompter.print(pick(ctx, "选择要接入的平台：", "Pick a platform to connect:"));
    const index = await prompter.choose(pick(ctx, "输入编号（回车跳过）：", "Number (Enter to skip): "), names.map((key) => `${PLATFORMS[key][ctx.t.lang === "en" ? "en" : "zh"]}${configured[key] ? pick(ctx, "  · 已接入", "  · connected") : ""}`), { allowEmpty: true });
    if (index < 0) return false;
    name = names[index];
  }
  const ok = await FLOWS[name](ctx, prompter);
  if (ok) {
    prompter.print(pick(ctx, `${PLATFORMS[name].zh} 已接入。运行 karmenbot gateway run 试试，或 karmenbot gateway start 放到后台。`, `${PLATFORMS[name].en} connected. Try karmenbot gateway run, or karmenbot gateway start to keep it running.`));
    prompter.print(pick(ctx, "第一次在聊天里找它时会收到配对码，用 karmenbot pair approve <配对码> 授权。", "The first chat message returns a pairing code; authorize it with karmenbot pair approve <code>."));
  }
  return ok;
}

export async function run(ctx) {
  const raw = ctx.args[0] ? String(ctx.args[0]).toLowerCase() : null;
  const connectorId = raw ? resolveConnectorId(raw) : null;

  if (connectorId) {
    if (ctx.args[1] === "remove" || ctx.args[1] === "off") {
      removeServer(connectorId, ctx.env);
      ctx.stdout.write(`${pick(ctx, "已移除", "Removed")} ${connectorId}\n`);
      return 0;
    }
    const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
    try {
      return (await connectConnector(ctx, prompter, connectorId)) ? 0 : 1;
    } finally {
      prompter.close();
    }
  }

  if (raw === "mcp" || raw === "playwright" || raw === "browser") {
    const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
    try {
      const preset = raw === "mcp" ? (ctx.args[1] || null) : "playwright";
      if ((ctx.args[1] === "remove" || ctx.args[1] === "off") && raw === "mcp") {
        removeServer(ctx.args[2] || "playwright", ctx.env);
        ctx.stdout.write(`${pick(ctx, "已移除", "Removed")} ${ctx.args[2] || "playwright"}\n`);
        return 0;
      }
      return (await connectMcp(ctx, prompter, preset)) ? 0 : 1;
    } finally {
      prompter.close();
    }
  }

  const wanted = raw ? platformName(raw) : null;
  if (raw && !wanted) {
    const known = listConnectorPresets().map((item) => item.id).concat(listConnectorPresets().flatMap((item) => item.aliases || []));
    throw new KarmenError("gw.unknownPlatform", { name: `${ctx.args[0]} (chat platforms, mcp/playwright, or connectors: ${known.join(", ")})` });
  }
  if (wanted && (ctx.args[1] === "remove" || ctx.args[1] === "off")) {
    removePlatform(ctx.env, wanted);
    ctx.stdout.write(`${pick(ctx, "已移除", "Removed")} ${wanted}\n`);
    return 0;
  }
  const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
  try {
    return (await connectWizard(ctx, prompter, wanted)) ? 0 : 1;
  } finally {
    prompter.close();
  }
}

export function configuredPlatforms(env) {
  const platforms = loadConfig(env).gateway?.platforms || {};
  const secrets = loadSecrets(env).platforms || {};
  return Object.entries(platforms).filter(([name, value]) => value?.enabled !== false && PLATFORMS[name] && secrets[name]).map(([name, settings]) => ({ name, settings, secrets: secrets[name] }));
}

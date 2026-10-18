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
  const wanted = ctx.args[0] ? platformName(ctx.args[0]) : null;
  if (ctx.args[0] && !wanted) throw new KarmenError("gw.unknownPlatform", { name: ctx.args[0] });
  if (ctx.args[1] === "remove" || ctx.args[1] === "off") {
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

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { karmenHome, loadConfig, saveConfig, saveSecret } from "../../home.mjs";
import { createPairing } from "../pairing.mjs";
import { registerDingtalkApp } from "./dingtalk.mjs";
import { registerFeishuApp } from "./feishu.mjs";
import { registerWecomBot } from "./wecom.mjs";
import { slackManifest } from "./slack.mjs";
import { loginWeixin } from "./weixin.mjs";

// What each platform needs when filled in by hand, shared by the settings
// centre and `karmenbot connect`. Weixin has no manual form: it only logs in by scanning.
export const FORMS = {
  feishu: {
    steps: "飞书开放平台建“企业自建应用” → 添加“机器人” → 事件订阅选“使用长连接接收事件”并订阅“接收消息” → 开通发消息权限 → 发布版本。",
    fields: [
      { key: "appId", label: "App ID" },
      { key: "appSecret", label: "App Secret", secret: true },
      { key: "lark", label: "国际版 Lark", toggle: true },
    ],
    build: (v) => ({ settings: { domain: v.lark ? "lark" : "feishu" }, secrets: { appId: v.appId, appSecret: v.appSecret } }),
  },
  wecom: {
    steps: "企业微信管理后台 → 智能机器人 → 创建 → API 模式选“长连接”，复制 Bot ID 和 Secret。",
    fields: [{ key: "botId", label: "Bot ID" }, { key: "secret", label: "Secret", secret: true }],
    build: (v) => ({ settings: {}, secrets: { botId: v.botId, secret: v.secret } }),
  },
  dingtalk: {
    steps: "钉钉开放平台建应用 → 添加机器人 → 消息接收模式选“Stream 模式” → 发布，复制 Client ID 和 Client Secret。",
    fields: [{ key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client Secret", secret: true }],
    build: (v) => ({ settings: {}, secrets: { clientId: v.clientId, clientSecret: v.clientSecret } }),
  },
  telegram: {
    steps: "在 Telegram 找 @BotFather，发送 /newbot，起好名字后把它给的令牌粘贴进来。",
    fields: [{ key: "token", label: "Bot 令牌", secret: true, check: (v) => /^\d+:[A-Za-z0-9_-]{30,}$/.test(v) || "令牌格式不对，应类似 123456:ABC…" }],
    build: (v) => ({ settings: {}, secrets: { token: v.token } }),
  },
  slack: {
    steps: "api.slack.com/apps → From a manifest（清单见 ~/.karmenbot/slack-manifest.json）→ 安装到工作区；生成带 connections:write 的 App Token。",
    fields: [
      { key: "appToken", label: "App Token (xapp-)", secret: true, check: (v) => v.startsWith("xapp-") || "App Token 应以 xapp- 开头" },
      { key: "botToken", label: "Bot Token (xoxb-)", secret: true, check: (v) => v.startsWith("xoxb-") || "Bot Token 应以 xoxb- 开头" },
    ],
    build: (v) => ({ settings: {}, secrets: { appToken: v.appToken, botToken: v.botToken } }),
  },
  discord: {
    steps: "Discord 开发者后台 → New Application → Bot：复制令牌，并打开 MESSAGE CONTENT INTENT。",
    fields: [{ key: "token", label: "Bot 令牌", secret: true }, { key: "applicationId", label: "Application ID（生成邀请链接用）", optional: true }],
    build: (v) => ({ settings: {}, secrets: { token: v.token } }),
  },
  whatsapp: {
    steps: "需要 Meta Business Cloud API：企业号码、访问令牌和一个公网 HTTPS 回调地址（可用隧道转发到本机端口）。",
    fields: [
      { key: "accessToken", label: "Access token", secret: true },
      { key: "phoneNumberId", label: "Phone number ID" },
      { key: "appSecret", label: "App Secret（校验签名，可留空）", secret: true, optional: true },
      { key: "port", label: "本机端口", optional: true, initial: "8787", check: (v) => !v || /^\d{2,5}$/.test(v) || "端口应是数字" },
    ],
    build: (v) => ({ settings: { port: Number(v.port) || 8787 }, secrets: { accessToken: v.accessToken, phoneNumberId: v.phoneNumberId, appSecret: v.appSecret || "", verifyToken: crypto.randomBytes(16).toString("hex") } }),
  },
};

// Returns an error message, or null when every required field is acceptable.
export function checkForm(name, values) {
  for (const field of FORMS[name].fields) {
    if (field.toggle) continue;
    const value = String(values[field.key] ?? "").trim();
    if (!value && !field.optional) return `${field.label} 还没填`;
    if (value && field.check) {
      const verdict = field.check(value);
      if (verdict !== true) return verdict;
    }
  }
  return null;
}

export function savePlatform(env, name, settings, secrets, owner = "") {
  const config = loadConfig(env);
  const gateway = config.gateway || {};
  saveConfig({ gateway: { ...gateway, platforms: { ...(gateway.platforms || {}), [name]: { enabled: true, ...settings } } } }, env);
  saveSecret("platforms", name, secrets, env);
  if (owner) createPairing({ env }).approve(name, owner, "owner");
}

export function removePlatform(env, name) {
  const config = loadConfig(env);
  const platforms = { ...(config.gateway?.platforms || {}) };
  delete platforms[name];
  saveConfig({ gateway: { ...(config.gateway || {}), platforms } }, env);
  saveSecret("platforms", name, null, env);
}

// Scan-to-connect: each resolves { settings, secrets, owner } for savePlatform.
// options: { fetchImpl, source, onCode({ url }), onStatus, signal }
export const SCAN = {
  feishu: {
    hint: "用飞书扫码，确认创建 Karmen 机器人。",
    async run(options) {
      const result = await registerFeishuApp(options);
      return { settings: { domain: result.domain }, secrets: { appId: result.appId, appSecret: result.appSecret }, owner: result.ownerOpenId };
    },
  },
  wecom: {
    hint: "用企业微信扫码，创建并授权智能机器人。",
    run: async (options) => ({ settings: {}, secrets: await registerWecomBot(options) }),
  },
  dingtalk: {
    hint: "用钉钉扫码，确认创建应用。",
    run: async (options) => ({ settings: {}, secrets: await registerDingtalkApp(options) }),
  },
  weixin: {
    hint: "用微信扫一扫，在手机上点确认。",
    async run(options) {
      const result = await loginWeixin(options);
      return { settings: {}, secrets: { accountId: result.accountId, token: result.token, baseUrl: result.baseUrl }, owner: result.ownerId };
    },
  },
};

export function writeSlackManifest(env) {
  const file = path.join(karmenHome(env), "slack-manifest.json");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(slackManifest(), null, 2)}\n`);
  return file;
}

import { createDingtalk } from "./dingtalk.mjs";
import { createDiscord } from "./discord.mjs";
import { createFeishu } from "./feishu.mjs";
import { createSlack } from "./slack.mjs";
import { createTelegram } from "./telegram.mjs";
import { createWecom } from "./wecom.mjs";
import { createWeixin } from "./weixin.mjs";
import { createWhatsapp } from "./whatsapp.mjs";
import { PLATFORM_LABELS as L } from "./labels.mjs";

// Order shown in `karmenbot connect`: Chinese platforms first, scan-to-connect where possible.
export const PLATFORMS = {
  feishu: { ...L.feishu, create: createFeishu, qr: true },
  wecom: { ...L.wecom, create: createWecom, qr: true },
  weixin: { ...L.weixin, create: createWeixin, qr: true },
  dingtalk: { ...L.dingtalk, create: createDingtalk, qr: true },
  telegram: { ...L.telegram, create: createTelegram },
  slack: { ...L.slack, create: createSlack },
  discord: { ...L.discord, create: createDiscord },
  whatsapp: { ...L.whatsapp, create: createWhatsapp },
};

export const PLATFORM_ALIASES = { 飞书: "feishu", lark: "feishu", 企业微信: "wecom", 企微: "wecom", 微信: "weixin", wechat: "weixin", 钉钉: "dingtalk" };

export function platformName(value) {
  const text = String(value || "").trim();
  if (PLATFORMS[text.toLowerCase()]) return text.toLowerCase();
  return PLATFORM_ALIASES[text] || PLATFORM_ALIASES[text.toLowerCase()] || null;
}

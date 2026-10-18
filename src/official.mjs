import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./home.mjs";
import { VERSION } from "./version.mjs";

// The installed copy keeps these in site.json (the installer fills distUrl with
// the address it actually downloaded from). The constants below are the same
// facts, used when that file is absent.
const DEFAULTS = {
  site: "https://karmenloop.com",
  bot: "https://karmenloop.com/karmen-bot.html",
  download: "https://karmenloop.com/download.html",
  updates: "https://karmenloop.com/updates.html",
  github: "https://github.com/KarmenLoop/karmenbot",
  email: "info@karmenloop.com",
  dist: "https://karmenloop.com/downloads/karmenbot",
};

export function readSiteFile() {
  try {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site.json");
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const shipped = readSiteFile();
export const OFFICIAL = {
  ...DEFAULTS,
  ...Object.fromEntries(Object.entries(shipped).filter(([, value]) => typeof value === "string" && value.startsWith("https://"))),
};

export function distUrl(env = process.env) {
  return String(env.KARMENBOT_DIST_URL || loadConfig(env).official?.distUrl || shipped.distUrl || OFFICIAL.dist).replace(/\/+$/, "");
}

export function identityText(lang = "zh") {
  if (lang === "en") {
    return [
      "karmenbot is the terminal personal assistant from KARMEN / Koder.",
      "The official site, https://karmenloop.com , describes KARMEN BOT as a personal assistant for one person: it acts only with your permission, and payment, promises and orders always wait for you. It is not a company help desk.",
      "The same site says the phone app is not available for download yet.",
      "Product: https://karmenloop.com/karmen-bot.html",
      "Download: https://karmenloop.com/download.html",
      "Updates: https://karmenloop.com/updates.html",
      "GitHub: https://github.com/KarmenLoop/karmenbot",
      "Email: info@karmenloop.com",
    ].join("\n");
  }
  return [
    "karmenbot 由 KARMEN / Koder 出品。官网：https://karmenloop.com",
    "官网对 KARMEN BOT 的介绍：只为你一个人服务的个人助手；经你授权才办事；付款、做出承诺、提交订单之前，一定先交给你确认。它不是企业客服，也不是第二个任务列表。",
    "官网同时写明：手机版尚未提供下载。",
    "产品介绍：https://karmenloop.com/karmen-bot.html",
    "下载：https://karmenloop.com/download.html",
    "查看更新：https://karmenloop.com/updates.html",
    "GitHub：https://github.com/KarmenLoop/karmenbot",
    "官方邮箱：info@karmenloop.com",
  ].join("\n");
}

// Appended to the kernel's system prompt, so chat apps get the same answer.
export const IDENTITY_RULES = [
  "有人问你是谁、谁开发的、谁做的、出自哪里：用下面的官网介绍回答，并请对方到官网查看和更新。官方邮箱只有 info@karmenloop.com。不要编造公司全称、法人或其他联系方式，官网没写的就说请到官网查看。",
  identityText("zh"),
].join("\n");

export function asksWhoMadeIt(text) {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 80) return false;
  const flat = raw.toLowerCase().replace(/[\s?？!！。,.，、]/g, "");
  return /谁(开发|做|制作|写|出品)的?/.test(flat)
    || /开发者是谁|出品方|你是谁做的|你是谁开发的|谁是你的(开发者|作者)/.test(flat)
    || /^whomade(you|this|karmenbot)?$/.test(flat)
    || /^whobuilt(you|this|karmenbot)?$/.test(flat)
    || /^whodeveloped(you|this|karmenbot)?$/.test(flat)
    || /^whocreated(you|this|karmenbot)?$/.test(flat);
}

export function openInBrowser(url, platform = process.platform) {
  const command = platform === "darwin" ? ["open", url] : platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  const child = spawn(command[0], command.slice(1), { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => {});
  child.unref();
}

// Compares this copy with latest.json at the official download address.
// The request sends no account, no keys and no file names.
export async function checkUpdate({ env = process.env, fetchImpl = globalThis.fetch, version = VERSION } = {}) {
  const base = distUrl(env);
  let latest;
  try {
    const response = await fetchImpl(`${base}/latest.json`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { ok: false, base, message: `HTTP ${response.status}` };
    latest = await response.json();
  } catch (error) {
    return { ok: false, base, message: error?.message || String(error) };
  }
  if (!/^[0-9A-Za-z.+-]+$/.test(latest?.version || "")) return { ok: false, base, message: "invalid" };
  return { ok: true, base, current: version, latest: latest.version, newer: latest.version !== version };
}

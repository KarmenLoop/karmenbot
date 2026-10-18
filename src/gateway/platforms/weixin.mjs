import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PlatformError, keepAlive, requestJson, sleep } from "../net.mjs";

// Personal WeChat (个人微信) via Tencent's iLink bot API: QR login, then a
// long-poll for messages. Protocol after the Hermes Weixin adapter (MIT).
export const ILINK = "https://ilinkai.weixin.qq.com";
const APP_HEADERS = { "iLink-App-Id": "bot", "iLink-App-ClientVersion": String((2 << 16) | (2 << 8) | 0) };
const BASE_INFO = { channel_version: "2.2.0" };
const CHUNK_GAP_MS = 1500;

function uin() {
  return Buffer.from(String(crypto.randomBytes(4).readUInt32BE(0))).toString("base64");
}

export function createWeixin({ settings = {}, secrets = {}, fetchImpl = globalThis.fetch, stateDir = null, now = Date.now }) {
  const base = (secrets.baseUrl || settings.apiBase || ILINK).replace(/\/+$/, "");
  const tokens = new Map();
  const seen = new Set();
  const lastSent = new Map();
  const cursorFile = stateDir ? path.join(stateDir, "weixin-cursor.json") : null;

  async function post(endpoint, body, { timeoutMs = 15000, signal } = {}) {
    const payload = JSON.stringify({ ...body, base_info: BASE_INFO });
    const json = await requestJson(fetchImpl, `${base}/ilink/bot/${endpoint}`, {
      method: "POST",
      headers: { ...APP_HEADERS, AuthorizationType: "ilink_bot_token", Authorization: `Bearer ${secrets.token}`, "X-WECHAT-UIN": uin(), "content-type": "application/json" },
      body: payload,
      timeoutMs,
      signal,
    });
    return json;
  }

  const failed = (json) => (json.ret !== undefined && json.ret !== 0) || (json.errcode !== undefined && json.errcode !== 0);
  const expired = (json) => json.ret === -14 || json.errcode === -14;

  return {
    name: "weixin",
    limit: 1800,
    async start({ signal, onMessage, log }) {
      if (!secrets.token || !secrets.accountId) throw new PlatformError("WeChat is not logged in; run karmenbot connect weixin", { fatal: true });
      let cursor = "";
      try {
        cursor = JSON.parse(fs.readFileSync(cursorFile, "utf8")).cursor || "";
      } catch {
        cursor = "";
      }
      let wait = 35_000;
      await keepAlive(async () => {
        while (!signal.aborted) {
          let json;
          try {
            json = await post("getupdates", { get_updates_buf: cursor }, { timeoutMs: wait + 5000, signal });
          } catch (error) {
            if (signal.aborted) return;
            if (error.name === "TimeoutError") continue;
            throw error;
          }
          if (expired(json)) {
            log("warn", "WeChat session expired; waiting 10 minutes (re-login with karmenbot connect weixin if it persists)");
            await sleep(600_000, signal);
            continue;
          }
          if (failed(json)) throw new PlatformError(`WeChat getupdates: ${json.errmsg || json.ret || json.errcode}`);
          if (json.longpolling_timeout_ms > 0) wait = json.longpolling_timeout_ms;
          if (json.get_updates_buf && json.get_updates_buf !== cursor) {
            cursor = json.get_updates_buf;
            if (cursorFile) {
              fs.mkdirSync(path.dirname(cursorFile), { recursive: true, mode: 0o700 });
              fs.writeFileSync(cursorFile, JSON.stringify({ cursor }), { mode: 0o600 });
            }
          }
          for (const message of json.msgs || []) {
            const from = message.from_user_id;
            if (!from || from === secrets.accountId) continue;
            if (message.message_id) {
              if (seen.has(message.message_id)) continue;
              seen.add(message.message_id);
              if (seen.size > 2000) seen.delete(seen.values().next().value);
            }
            if (message.context_token) tokens.set(from, message.context_token);
            const text = (message.item_list || []).filter((item) => item.type === 1).map((item) => item.text_item?.text || "").join("\n").trim();
            const room = message.room_id || message.chat_room_id;
            onMessage({ chatId: room || from, userId: from, userName: "", text, isGroup: Boolean(room), mentioned: true, messageId: message.message_id, reply: { peer: from } });
          }
        }
      }, { signal, log });
    },
    async send(chatId, text) {
      const gap = (lastSent.get(chatId) || 0) + CHUNK_GAP_MS - now();
      if (gap > 0) await sleep(gap);
      const message = (contextToken) => ({
        msg: {
          from_user_id: "",
          to_user_id: chatId,
          client_id: `karmenbot-${crypto.randomUUID()}`,
          message_type: 2,
          message_state: 2,
          ...(contextToken ? { context_token: contextToken } : {}),
          item_list: [{ type: 1, text_item: { text } }],
        },
      });
      let json = await post("sendmessage", message(tokens.get(chatId)));
      if (expired(json) && tokens.get(chatId)) json = await post("sendmessage", message(null));
      lastSent.set(chatId, now());
      if (failed(json)) throw new PlatformError(`WeChat send: ${json.errmsg || json.ret || json.errcode}`);
    },
    async stop() {},
  };
}

// QR login: show the code, wait for the phone to confirm, return credentials.
export async function loginWeixin({ fetchImpl = globalThis.fetch, onCode, onStatus = () => {}, signal, base = ILINK, pollMs = 1000 }) {
  let current = base.replace(/\/+$/, "");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const qr = await requestJson(fetchImpl, `${current}/ilink/bot/get_bot_qrcode?bot_type=3`, { headers: APP_HEADERS, timeoutMs: 35000, signal });
    if (!qr.qrcode) throw new PlatformError("WeChat did not return a login code");
    await onCode({ url: qr.qrcode_img_content || qr.qrcode });
    const deadline = Date.now() + 480_000;
    while (Date.now() < deadline && !signal?.aborted) {
      await sleep(pollMs, signal);
      const status = await requestJson(fetchImpl, `${current}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qr.qrcode)}`, { headers: APP_HEADERS, timeoutMs: 35000, signal }).catch(() => ({ status: "wait" }));
      if (status.status === "scaned") onStatus("scanned");
      else if (status.status === "scaned_but_redirect" && status.redirect_host) current = `https://${status.redirect_host}`;
      else if (status.status === "expired") break;
      else if (status.status === "confirmed") {
        if (!status.ilink_bot_id || !status.bot_token) throw new PlatformError("WeChat login confirmed without credentials");
        return { accountId: status.ilink_bot_id, token: status.bot_token, baseUrl: status.baseurl || current, ownerId: status.ilink_user_id || "" };
      }
    }
    onStatus("expired");
  }
  throw new PlatformError("WeChat login code expired");
}

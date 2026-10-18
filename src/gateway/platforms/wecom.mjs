import crypto from "node:crypto";
import { PlatformError, keepAlive, openSocket, requestJson, sleep } from "../net.mjs";

// WeCom (企业微信) smart bot over openws long connection. Protocol after the
// Hermes WeCom adapter (MIT).
const WS_URL = "wss://openws.work.weixin.qq.com";
const PING_MS = 30_000;
const ACK_MS = 15_000;
const reqId = (prefix) => `${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;

export function createWecom({ settings = {}, secrets = {}, WebSocketImpl = globalThis.WebSocket }) {
  const url = settings.wsUrl || WS_URL;
  const deviceId = settings.deviceId || crypto.randomUUID().replaceAll("-", "");
  const waiting = new Map();
  const unanswered = new Map();
  let conn = null;

  function request(cmd, id, body) {
    if (!conn) return Promise.reject(new PlatformError("WeCom is not connected"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new PlatformError(`WeCom ${cmd} timed out`));
      }, ACK_MS);
      waiting.set(id, (frame) => {
        clearTimeout(timer);
        if (frame.errcode && frame.errcode !== 0) reject(new PlatformError(`WeCom ${cmd}: ${frame.errmsg || frame.errcode}`, { code: frame.errcode }));
        else resolve(frame);
      });
      conn.send({ cmd, headers: { req_id: id }, body });
    });
  }

  return {
    name: "wecom",
    limit: 4000,
    async start({ signal, onMessage, log }) {
      if (!secrets.botId || !secrets.secret) throw new PlatformError("WeCom Bot ID and Secret are required", { fatal: true });
      await keepAlive(async () => {
        await new Promise((resolve, reject) => {
          let pinger = null;
          const subscribeId = reqId("subscribe");
          let subscribed = false;
          const handle = (raw) => {
            let frame;
            try {
              frame = JSON.parse(raw);
            } catch {
              return;
            }
            const id = frame.headers?.req_id;
            const cmd = frame.cmd || "";
            if (!subscribed) {
              if (id !== subscribeId) return;
              if (frame.errcode && frame.errcode !== 0) {
                conn.close();
                reject(new PlatformError(`WeCom subscribe: ${frame.errmsg || frame.errcode}`, { code: frame.errcode, fatal: frame.errcode === 40013 || frame.errcode === 40001 }));
                return;
              }
              subscribed = true;
              log("info", "subscribed");
              pinger = setInterval(() => conn.send({ cmd: "ping", headers: { req_id: reqId("ping") }, body: {} }), PING_MS);
              return;
            }
            if (cmd === "aibot_msg_callback" || cmd === "aibot_callback") {
              const body = frame.body || {};
              let text = body.msgtype === "text" ? body.text?.content || "" : body.msgtype === "mixed"
                ? (body.mixed?.msg_item || []).filter((item) => item.msgtype === "text").map((item) => item.text?.content || "").join("\n") : "";
              const isGroup = String(body.chattype || "").toLowerCase() === "group";
              if (isGroup) text = text.replace(/^@\S+\s*/, "");
              const chatId = body.chatid || body.from?.userid;
              if (chatId && id) unanswered.set(chatId, id);
              onMessage({ chatId, userId: body.from?.userid || "", userName: "", text: text.trim(), isGroup, mentioned: true, messageId: body.msgid, reply: { reqId: id } });
              return;
            }
            if (cmd === "aibot_event_callback") {
              if (frame.body?.event_type === "disconnected_event") {
                log("warn", "another connection took over this bot");
                conn.close();
              }
              return;
            }
            if (id && waiting.has(id)) {
              const done = waiting.get(id);
              waiting.delete(id);
              done(frame);
            }
          };
          openSocket(url, {
            WebSocketImpl,
            onMessage: handle, onError: (error) => log("warn", `handler failed: ${error.message}`),
            onClose() {
              clearInterval(pinger);
              conn = null;
              for (const done of waiting.values()) done({ errcode: -1, errmsg: "connection closed" });
              waiting.clear();
              resolve();
            },
          }).then((opened) => {
            conn = opened;
            conn.send({ cmd: "aibot_subscribe", headers: { req_id: subscribeId }, body: { bot_id: secrets.botId, secret: secrets.secret, device_id: deviceId } });
            signal.addEventListener("abort", () => conn?.close(), { once: true });
          }, reject);
        });
      }, { signal, log });
    },
    // The first answer to a message rides on its req_id (works in groups);
    // later ones are proactive sends.
    async send(chatId, text) {
      const markdown = { msgtype: "markdown", markdown: { content: text } };
      const passive = unanswered.get(chatId);
      if (passive) {
        unanswered.delete(chatId);
        await request("aibot_respond_msg", passive, markdown);
        return;
      }
      await request("aibot_send_msg", reqId("send"), { chatid: chatId, ...markdown });
    },
    async stop() {},
  };
}

// Scan-to-create: WeCom shows a code that creates a smart bot and returns its
// Bot ID / Secret. Admin-console endpoints, as Hermes uses them; they may change.
export async function registerWecomBot({ fetchImpl = globalThis.fetch, source = "karmenbot", onCode, signal, base = "https://work.weixin.qq.com", pollMs = 3000 }) {
  const generated = await requestJson(fetchImpl, `${base}/ai/qc/generate?source=${encodeURIComponent(source)}`, { headers: { "user-agent": "karmenbot/0.1" }, signal });
  const scode = generated.data?.scode;
  if (!scode) throw new PlatformError("WeCom did not return a QR code");
  await onCode({ url: generated.data.auth_url || `${base}/ai/qc/gen?source=${encodeURIComponent(source)}&scode=${encodeURIComponent(scode)}`, page: `${base}/ai/qc/gen?source=${encodeURIComponent(source)}&scode=${encodeURIComponent(scode)}` });
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline && !signal?.aborted) {
    await sleep(pollMs, signal);
    const result = await requestJson(fetchImpl, `${base}/ai/qc/query_result?scode=${encodeURIComponent(scode)}`, { signal }).catch(() => null);
    const data = result?.data;
    if (String(data?.status || "").toLowerCase() === "success") {
      const botId = data.bot_info?.botid || data.bot_info?.bot_id;
      const secret = data.bot_info?.secret;
      if (botId && secret) return { botId, secret };
    }
  }
  throw new PlatformError("WeCom QR login timed out");
}

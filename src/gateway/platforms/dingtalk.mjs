import os from "node:os";
import { PlatformError, keepAlive, openSocket, requestJson, sleep } from "../net.mjs";

// DingTalk (钉钉) Stream mode: register for a one-time ticket, then a WebSocket
// that pushes bot messages; replies go to each message's session webhook.
// Protocol per open.dingtalk.com "Stream模式协议接入说明".
const BOT_TOPIC = "/v1.0/im/bot/messages/get";
const WEBHOOK_HOST = /^https:\/\/(api|oapi)\.dingtalk\.com\//;

function localIp() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) if (item.family === "IPv4" && !item.internal) return item.address;
  }
  return "127.0.0.1";
}

export function createDingtalk({ settings = {}, secrets = {}, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket, now = Date.now }) {
  const api = (settings.apiBase || "https://api.dingtalk.com").replace(/\/+$/, "");
  const webhooks = new Map();
  const sameOrigin = (url) => {
    try {
      return new URL(url).origin === new URL(api).origin;
    } catch {
      return false;
    }
  };

  return {
    name: "dingtalk",
    limit: 18000,
    async start({ signal, onMessage, log }) {
      if (!secrets.clientId || !secrets.clientSecret) throw new PlatformError("DingTalk Client ID and Client Secret are required", { fatal: true });
      await keepAlive(async () => {
        let opened;
        try {
          opened = await requestJson(fetchImpl, `${api}/v1.0/gateway/connections/open`, {
            method: "POST",
            body: { clientId: secrets.clientId, clientSecret: secrets.clientSecret, subscriptions: [{ type: "CALLBACK", topic: BOT_TOPIC }], ua: "karmenbot/0.1.0", localIp: localIp() },
            signal,
          });
        } catch (error) {
          if (error.status === 400 || error.status === 401 || error.status === 403) throw new PlatformError("DingTalk rejected the Client ID / Secret", { fatal: true });
          throw error;
        }
        if (!opened.endpoint || !opened.ticket) throw new PlatformError("DingTalk did not return a stream endpoint");
        await new Promise((resolve, reject) => {
          let conn;
          const ack = (frame, data) => conn.send({ code: 200, headers: { contentType: "application/json", messageId: frame.headers?.messageId }, message: "OK", data });
          const handle = (raw) => {
            let frame;
            try {
              frame = JSON.parse(raw);
            } catch {
              return;
            }
            const topic = frame.headers?.topic;
            if (frame.type === "SYSTEM") {
              if (topic === "ping") ack(frame, frame.data);
              else if (topic === "disconnect") conn.close();
              return;
            }
            if (frame.type !== "CALLBACK" || topic !== BOT_TOPIC) {
              if (frame.type === "EVENT") ack(frame, JSON.stringify({ status: "SUCCESS", message: "success" }));
              return;
            }
            ack(frame, JSON.stringify({ response: null }));
            let data;
            try {
              data = typeof frame.data === "string" ? JSON.parse(frame.data) : frame.data;
            } catch {
              return;
            }
            if (data?.msgtype !== "text") return;
            const isGroup = String(data.conversationType) === "2";
            if (data.sessionWebhook && (WEBHOOK_HOST.test(data.sessionWebhook) || sameOrigin(data.sessionWebhook))) {
              webhooks.set(data.conversationId, { url: data.sessionWebhook, until: Number(data.sessionWebhookExpiredTime) || now() + 60 * 60 * 1000 });
            }
            onMessage({
              chatId: data.conversationId,
              userId: data.senderStaffId || data.senderId || "",
              userName: data.senderNick || "",
              text: String(data.text?.content || "").trim(),
              isGroup,
              mentioned: !isGroup || data.isInAtList !== false,
              messageId: data.msgId,
              reply: {},
            });
          };
          openSocket(`${opened.endpoint}?ticket=${encodeURIComponent(opened.ticket)}`, { WebSocketImpl, onMessage: handle, onError: (error) => log("warn", `handler failed: ${error.message}`), onClose: () => resolve() }).then((value) => {
            conn = value;
            log("info", "stream connected");
            signal.addEventListener("abort", () => conn.close(), { once: true });
          }, reject);
        });
      }, { signal, log });
    },
    async send(chatId, text) {
      const hook = webhooks.get(chatId);
      if (!hook || hook.until - 5 * 60 * 1000 <= now()) throw new PlatformError("DingTalk reply window closed; the user needs to message the bot again");
      const json = await requestJson(fetchImpl, hook.url, { method: "POST", body: { msgtype: "markdown", markdown: { title: "Karmen", text } } });
      if (json.errcode && json.errcode !== 0) throw new PlatformError(`DingTalk send: ${json.errmsg}`, { code: json.errcode });
    },
    async stop() {},
  };
}

// Scan-to-create: DingTalk's device-code app registration returns a Client ID / Secret.
export async function registerDingtalkApp({ fetchImpl = globalThis.fetch, source = "karmenbot", onCode, signal, base = "https://oapi.dingtalk.com", pollMs }) {
  const init = await requestJson(fetchImpl, `${base}/app/registration/init`, { method: "POST", body: { source }, signal });
  if (!init.nonce) throw new PlatformError(`DingTalk registration: ${init.errmsg || "no nonce"}`);
  const begin = await requestJson(fetchImpl, `${base}/app/registration/begin`, { method: "POST", body: { nonce: init.nonce }, signal });
  if (!begin.device_code || !begin.verification_uri_complete) throw new PlatformError(`DingTalk registration: ${begin.errmsg || "no device code"}`);
  await onCode({ url: begin.verification_uri_complete, expiresIn: begin.expires_in || 7200 });
  const deadline = Date.now() + (begin.expires_in || 7200) * 1000;
  const interval = pollMs ?? Math.max(2, begin.interval || 3) * 1000;
  while (Date.now() < deadline && !signal?.aborted) {
    await sleep(interval, signal);
    const poll = await requestJson(fetchImpl, `${base}/app/registration/poll`, { method: "POST", body: { device_code: begin.device_code }, signal }).catch(() => ({ status: "WAITING" }));
    if (poll.status === "SUCCESS" && poll.client_id && poll.client_secret) return { clientId: poll.client_id, clientSecret: poll.client_secret };
    if (poll.status === "FAIL" || poll.status === "EXPIRED") throw new PlatformError(`DingTalk registration ${poll.status.toLowerCase()}`);
  }
  throw new PlatformError("DingTalk registration timed out");
}

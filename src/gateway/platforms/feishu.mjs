import { FRAME_CONTROL, FRAME_DATA, decodeFrame, encodeFrame, headerOf } from "../proto.mjs";
import { PlatformError, keepAlive, openSocket, requestJson, sleep } from "../net.mjs";

// Feishu / Lark bot over the long connection (no public URL). Wire protocol
// after larksuite oapi-sdk (MIT) as used by Hermes and OpenClaw.
const DOMAINS = {
  feishu: { open: "https://open.feishu.cn", accounts: "https://accounts.feishu.cn" },
  lark: { open: "https://open.larksuite.com", accounts: "https://accounts.larksuite.com" },
};

export function createFeishu({ settings = {}, secrets = {}, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket, now = Date.now }) {
  const open = (settings.openBase || DOMAINS[settings.domain || "feishu"].open).replace(/\/+$/, "");
  let token = null;
  let botOpenId = "";

  async function tenantToken() {
    if (token && token.until > now()) return token.value;
    const json = await requestJson(fetchImpl, `${open}/open-apis/auth/v3/tenant_access_token/internal`, { method: "POST", body: { app_id: secrets.appId, app_secret: secrets.appSecret } });
    if (json.code !== 0) throw new PlatformError(`Feishu token: ${json.msg}`, { code: json.code, fatal: [10003, 10014].includes(json.code) });
    token = { value: json.tenant_access_token, until: now() + Math.max(60, (json.expire || 7200) - 120) * 1000 };
    return token.value;
  }

  async function api(path, body) {
    const json = await requestJson(fetchImpl, `${open}${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${await tenantToken()}` }, body });
    if (json.code !== 0) throw new PlatformError(`Feishu ${path}: ${json.msg}`, { code: json.code });
    return json;
  }

  function normalize(event) {
    const message = event.message || {};
    if (event.sender?.sender_type && event.sender.sender_type !== "user") return null;
    if (message.message_type !== "text") return null;
    let text = "";
    try {
      text = JSON.parse(message.content || "{}").text || "";
    } catch {
      return null;
    }
    let mentioned = false;
    for (const mention of message.mentions || []) {
      if (mention.id?.open_id && mention.id.open_id === botOpenId) {
        mentioned = true;
        text = text.replaceAll(mention.key, "");
      } else {
        text = text.replaceAll(mention.key, `@${mention.name || ""}`);
      }
    }
    const isGroup = message.chat_type !== "p2p";
    return {
      chatId: message.chat_id,
      userId: event.sender?.sender_id?.open_id || "",
      userName: "",
      text: text.trim(),
      isGroup,
      mentioned: !isGroup || mentioned,
      messageId: message.message_id,
      reply: { messageId: message.message_id },
    };
  }

  return {
    name: "feishu",
    limit: 4000,
    async start({ signal, onMessage, log }) {
      if (!secrets.appId || !secrets.appSecret) throw new PlatformError("Feishu App ID and App Secret are required", { fatal: true });
      botOpenId = (await api("/open-apis/bot/v3/info")).bot?.open_id || "";
      await keepAlive(async () => {
        const endpoint = await requestJson(fetchImpl, `${open}/callback/ws/endpoint`, { method: "POST", headers: { locale: "zh" }, body: { AppID: secrets.appId, AppSecret: secrets.appSecret } });
        if (endpoint.code !== 0) throw new PlatformError(`Feishu endpoint: ${endpoint.msg}`, { code: endpoint.code, fatal: [1000040343, 1000040344].includes(endpoint.code) });
        const url = endpoint.data.URL;
        const serviceId = Number(new URL(url).searchParams.get("service_id") || 0);
        let pingMs = (endpoint.data.ClientConfig?.PingInterval || 120) * 1000;
        const parts = new Map();
        await new Promise((resolve, reject) => {
          let conn;
          let pinger = null;
          const ping = () => conn.send(encodeFrame({ SeqID: 0n, LogID: 0n, service: serviceId, method: FRAME_CONTROL, headers: [{ key: "type", value: "ping" }] }));
          const schedule = () => {
            clearInterval(pinger);
            pinger = setInterval(ping, pingMs);
          };
          const handle = (data) => {
            if (typeof data === "string") return;
            const frame = decodeFrame(data);
            const type = headerOf(frame, "type");
            if (frame.method === FRAME_CONTROL) {
              if (type === "pong" && frame.payload?.length) {
                try {
                  const config = JSON.parse(new TextDecoder().decode(frame.payload));
                  if (config.PingInterval) {
                    pingMs = config.PingInterval * 1000;
                    schedule();
                  }
                } catch {
                  // Keep the current interval.
                }
              }
              return;
            }
            if (frame.method !== FRAME_DATA) return;
            const started = Date.now();
            const id = headerOf(frame, "message_id");
            const sum = Number(headerOf(frame, "sum") || 1);
            const seq = Number(headerOf(frame, "seq") || 0);
            let payload = frame.payload || new Uint8Array();
            if (sum > 1) {
              const entry = parts.get(id) || { chunks: new Array(sum).fill(null), at: Date.now() };
              entry.chunks[seq] = payload;
              parts.set(id, entry);
              for (const [key, value] of parts) if (Date.now() - value.at > 5000) parts.delete(key);
              if (entry.chunks.some((chunk) => !chunk)) return;
              parts.delete(id);
              const total = entry.chunks.reduce((sumBytes, chunk) => sumBytes + chunk.length, 0);
              payload = new Uint8Array(total);
              let offset = 0;
              for (const chunk of entry.chunks) {
                payload.set(chunk, offset);
                offset += chunk.length;
              }
            }
            if (type === "event") {
              try {
                const envelope = JSON.parse(new TextDecoder().decode(payload));
                if (envelope.header?.event_type === "im.message.receive_v1") {
                  const msg = normalize(envelope.event || {});
                  if (msg?.userId) onMessage(msg);
                }
              } catch (error) {
                log("warn", `bad event: ${error.message}`);
              }
            }
            conn.send(encodeFrame({ ...frame, headers: [...frame.headers, { key: "biz_rt", value: String(Date.now() - started) }], payload: JSON.stringify({ code: 200 }) }));
          };
          openSocket(url, {
            WebSocketImpl,
            onMessage: handle, onError: (error) => log("warn", `handler failed: ${error.message}`),
            onClose() {
              clearInterval(pinger);
              resolve();
            },
          }).then((opened) => {
            conn = opened;
            log("info", "long connection open");
            ping();
            schedule();
            signal.addEventListener("abort", () => conn.close(), { once: true });
          }, reject);
        });
      }, { signal, log });
    },
    async send(chatId, text) {
      await api("/open-apis/im/v1/messages?receive_id_type=chat_id", { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) });
    },
    async stop() {},
  };
}

// Scan-to-create: Feishu's device-code app registration makes a personal
// agent app and returns its App ID / Secret plus the scanner's open_id.
export async function registerFeishuApp({ domain = "feishu", fetchImpl = globalThis.fetch, source = "karmenbot", onCode, signal, accountsBase, pollMs }) {
  const base = `${(accountsBase || DOMAINS[domain].accounts).replace(/\/+$/, "")}/oauth/v1/app/registration`;
  const init = await requestJson(fetchImpl, base, { method: "POST", form: { action: "init" }, signal });
  if (init.supported_auth_methods && !init.supported_auth_methods.includes("client_secret")) throw new PlatformError("Feishu registration does not offer client_secret");
  const begin = await requestJson(fetchImpl, base, { method: "POST", form: { action: "begin", archetype: "PersonalAgent", auth_method: "client_secret", request_user_info: "open_id" }, signal });
  if (!begin.device_code || !begin.verification_uri_complete) throw new PlatformError(`Feishu registration: ${begin.error || "no device code"}`);
  const link = new URL(begin.verification_uri_complete);
  link.searchParams.set("from", source);
  link.searchParams.set("tp", source);
  await onCode({ url: link.toString(), userCode: begin.user_code, expiresIn: begin.expire_in || 600 });
  const deadline = Date.now() + (begin.expire_in || 600) * 1000;
  let interval = pollMs ?? Math.max(2, begin.interval || 5) * 1000;
  while (Date.now() < deadline && !signal?.aborted) {
    await sleep(interval, signal);
    const poll = await requestJson(fetchImpl, base, { method: "POST", form: { action: "poll", device_code: begin.device_code }, signal, anyStatus: true }).catch(() => ({ error: "authorization_pending" }));
    if (poll.client_id && poll.client_secret) return { appId: poll.client_id, appSecret: poll.client_secret, ownerOpenId: poll.user_info?.open_id || "", domain: poll.tenant_brand === "lark" ? "lark" : domain };
    if (poll.error === "slow_down") interval += 5000;
    else if (poll.error && !["authorization_pending", "slow_down"].includes(poll.error)) throw new PlatformError(`Feishu registration: ${poll.error}`);
  }
  throw new PlatformError("Feishu registration timed out");
}

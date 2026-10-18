import { PlatformError, keepAlive, openSocket, requestJson } from "../net.mjs";

// Slack Socket Mode: an app-level token (xapp-) opens a WebSocket, a bot
// token (xoxb-) posts replies. Every envelope must be acknowledged.
export function createSlack({ settings = {}, secrets = {}, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket }) {
  const api = (settings.apiBase || "https://slack.com/api").replace(/\/+$/, "");
  let botId = "";

  async function call(method, token, body) {
    const json = await requestJson(fetchImpl, `${api}/${method}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: body || {} });
    if (!json.ok) {
      const fatal = ["invalid_auth", "not_authed", "account_inactive", "token_revoked"].includes(json.error);
      throw new PlatformError(`Slack ${method}: ${json.error}`, { code: json.error, fatal });
    }
    return json;
  }

  return {
    name: "slack",
    limit: 39000,
    async start({ signal, onMessage, log }) {
      if (!secrets.appToken || !secrets.botToken) throw new PlatformError("Slack app token and bot token are both required", { fatal: true });
      botId = (await call("auth.test", secrets.botToken)).user_id;
      await keepAlive(async () => {
        const { url } = await call("apps.connections.open", secrets.appToken);
        await new Promise((resolve, reject) => {
          let conn;
          const handle = (raw) => {
            let frame;
            try {
              frame = JSON.parse(raw);
            } catch {
              return;
            }
            if (frame.envelope_id) conn.send({ envelope_id: frame.envelope_id });
            if (frame.type === "disconnect") return conn.close();
            if (frame.type !== "events_api") return;
            const event = frame.payload?.event;
            if (!event || event.bot_id || event.subtype || !event.user || event.user === botId || typeof event.text !== "string") return;
            const isGroup = event.channel_type !== "im";
            // Channel mentions arrive twice (message + app_mention); keep app_mention only.
            if (isGroup && event.type !== "app_mention") return;
            if (!isGroup && event.type !== "message") return;
            const tag = `<@${botId}>`;
            onMessage({
              chatId: event.channel,
              userId: event.user,
              userName: "",
              text: event.text.replaceAll(tag, "").trim(),
              isGroup,
              mentioned: !isGroup || event.type === "app_mention" || event.text.includes(tag),
              messageId: event.ts,
              reply: { threadTs: event.thread_ts || null },
            });
          };
          openSocket(url, { WebSocketImpl, onMessage: handle, onError: (error) => log("warn", `handler failed: ${error.message}`), onClose: () => resolve() }).then((opened) => {
            conn = opened;
            log("info", "socket mode connected");
            signal.addEventListener("abort", () => conn.close(), { once: true });
          }, reject);
        });
      }, { signal, log });
    },
    async send(chatId, text, reply) {
      await call("chat.postMessage", secrets.botToken, { channel: chatId, text, ...(reply?.threadTs ? { thread_ts: reply.threadTs } : {}) });
    },
    async stop() {},
  };
}

// Paste into api.slack.com/apps → Create New App → From a manifest.
export function slackManifest(name = "Karmen") {
  return {
    display_information: { name },
    features: { bot_user: { display_name: name, always_online: true } },
    oauth_config: {
      scopes: {
        bot: ["app_mentions:read", "channels:history", "chat:write", "groups:history", "im:history", "im:read", "im:write", "mpim:history", "users:read"],
      },
    },
    settings: {
      event_subscriptions: { bot_events: ["app_mention", "message.im"] },
      interactivity: { is_enabled: false },
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  };
}

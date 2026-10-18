import { PlatformError, keepAlive, openSocket, requestJson } from "../net.mjs";

// Discord Gateway v10. Intents: GUILDS | GUILD_MESSAGES | DIRECT_MESSAGES |
// MESSAGE_CONTENT (the last must be enabled under Bot → Privileged Gateway Intents).
export const DISCORD_INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15);
// View Channels, Send Messages, Read Message History, Send Messages in Threads.
export const DISCORD_PERMISSIONS = 1024 + 2048 + 65536 + 274877906944;

const FATAL_CLOSE = { 4004: "Discord rejected the bot token", 4013: "invalid intents", 4014: "enable MESSAGE CONTENT INTENT for this bot in the Discord developer portal" };

export function createDiscord({ settings = {}, secrets = {}, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket }) {
  const api = (settings.apiBase || "https://discord.com/api/v10").replace(/\/+$/, "");
  const auth = { authorization: `Bot ${secrets.token}` };
  let botId = "";

  return {
    name: "discord",
    limit: 2000,
    async start({ signal, onMessage, log }) {
      if (!secrets.token) throw new PlatformError("Discord bot token missing", { fatal: true });
      let gateway;
      try {
        gateway = await requestJson(fetchImpl, `${api}/gateway/bot`, { headers: auth, signal });
      } catch (error) {
        if (error.status === 401) throw new PlatformError(FATAL_CLOSE[4004], { fatal: true });
        throw error;
      }
      await keepAlive(async () => {
        await new Promise((resolve, reject) => {
          let conn;
          let seq = null;
          let heartbeat = null;
          const stop = () => clearInterval(heartbeat);
          const handle = (raw) => {
            const frame = JSON.parse(raw);
            if (frame.s !== null && frame.s !== undefined) seq = frame.s;
            if (frame.op === 10) {
              heartbeat = setInterval(() => conn.send({ op: 1, d: seq }), frame.d.heartbeat_interval);
              conn.send({ op: 2, d: { token: secrets.token, intents: DISCORD_INTENTS, properties: { os: process.platform, browser: "karmenbot", device: "karmenbot" } } });
            } else if (frame.op === 1) {
              conn.send({ op: 1, d: seq });
            } else if (frame.op === 7 || frame.op === 9) {
              conn.close(4000);
            } else if (frame.op === 0 && frame.t === "READY") {
              botId = frame.d.user.id;
              log("info", `connected as ${frame.d.user.username}`);
            } else if (frame.op === 0 && frame.t === "MESSAGE_CREATE") {
              const message = frame.d;
              if (!message.content || message.author?.bot || message.author?.id === botId) return;
              const isGroup = Boolean(message.guild_id);
              const mentioned = !isGroup || (message.mentions || []).some((user) => user.id === botId);
              onMessage({
                chatId: message.channel_id,
                userId: message.author.id,
                userName: message.author.username || "",
                text: message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim(),
                isGroup,
                mentioned,
                messageId: message.id,
                reply: { messageId: message.id },
              });
            }
          };
          openSocket(`${gateway.url}/?v=10&encoding=json`, {
            WebSocketImpl,
            onMessage: handle, onError: (error) => log("warn", `handler failed: ${error.message}`),
            onClose(code) {
              stop();
              if (FATAL_CLOSE[code]) reject(new PlatformError(FATAL_CLOSE[code], { fatal: true }));
              else resolve();
            },
          }).then((opened) => {
            conn = opened;
            signal.addEventListener("abort", () => conn.close(), { once: true });
          }, reject);
        });
      }, { signal, log });
    },
    async send(chatId, text) {
      await requestJson(fetchImpl, `${api}/channels/${chatId}/messages`, { method: "POST", headers: auth, body: { content: text } });
    },
    async stop() {},
    inviteUrl(applicationId) {
      return `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot&permissions=${DISCORD_PERMISSIONS}`;
    },
  };
}

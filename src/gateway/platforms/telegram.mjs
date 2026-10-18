import { PlatformError, keepAlive, requestJson } from "../net.mjs";

// Telegram Bot API, long polling (no public URL). Token from @BotFather.
export function createTelegram({ settings = {}, secrets = {}, fetchImpl = globalThis.fetch }) {
  const api = (settings.apiBase || "https://api.telegram.org").replace(/\/+$/, "");
  let me = null;

  async function call(method, body, { timeoutMs = 20000, signal } = {}) {
    let json;
    try {
      json = await requestJson(fetchImpl, `${api}/bot${secrets.token}/${method}`, { method: "POST", body: body || {}, timeoutMs, signal });
    } catch (error) {
      if (error.status === 401 || error.status === 404) throw new PlatformError("Telegram rejected the bot token", { status: error.status, fatal: true });
      throw error;
    }
    if (!json.ok) throw new PlatformError(`Telegram ${method}: ${json.description || "failed"}`, { code: json.error_code });
    return json.result;
  }

  return {
    name: "telegram",
    limit: 4096,
    async start({ signal, onMessage, log }) {
      if (!secrets.token) throw new PlatformError("Telegram token missing", { fatal: true });
      me = await call("getMe", {}, { signal });
      log("info", `connected as @${me.username}`);
      let offset = 0;
      await keepAlive(async () => {
        while (!signal.aborted) {
          const updates = await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] }, { timeoutMs: 45000, signal });
          for (const update of updates) {
            offset = update.update_id + 1;
            const message = update.message;
            if (!message?.text || message.from?.is_bot) continue;
            const isGroup = message.chat.type !== "private";
            const mention = `@${me.username}`;
            const mentioned = !isGroup || message.text.includes(mention) || message.reply_to_message?.from?.id === me.id;
            onMessage({
              chatId: String(message.chat.id),
              userId: String(message.from.id),
              userName: message.from.username || message.from.first_name || "",
              text: message.text.replaceAll(mention, "").trim(),
              isGroup,
              mentioned,
              messageId: String(message.message_id),
              reply: { messageId: message.message_id },
            });
          }
        }
      }, { signal, log });
    },
    async send(chatId, text) {
      await call("sendMessage", { chat_id: chatId, text });
    },
    async stop() {},
  };
}

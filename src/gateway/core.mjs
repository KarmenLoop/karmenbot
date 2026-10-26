import { asksWhoMadeIt, identityText } from "../official.mjs";
import { sanitize } from "../tui/text.mjs";
import { chunkText, readChoice, readVerdict, readDraftAction } from "./text.mjs";

// The gateway: every chat platform feeds normalized messages in here.
//   inbound: { chatId, userId, userName, text, isGroup, mentioned, messageId, reply }
// `reply` is whatever the adapter needs to answer that message (WeCom req_id,
// DingTalk session webhook, WeChat context token, ...).
// Each chat is one Karmen conversation; edits and commands wait for the same
// person to answer 批准 / 拒绝 in that chat, and time out to "no".
//
// When draftThenSend is on (default), assistant replies are held as one draft
// after the turn; the same user may edit (改/edit) or append (+/追加), then
// confirms with 发送/批准/y before the final send.
// Notices, pairing, help, and decide prompts always send immediately.

const COMMANDS = {
  "/new": "new", "/新会话": "new", "/reset": "new",
  "/stop": "stop", "/停止": "stop",
  "/help": "help", "/帮助": "help",
  "/status": "status", "/状态": "status",
};

function preview(diff, limit = 18) {
  const rows = diff.filter((row) => row.type !== "same").slice(0, limit).map((row) => (row.type === "add" ? `+ ${row.text}` : row.type === "del" ? `- ${row.text}` : `  ${row.text}`));
  return rows.join("\n");
}

export function createGateway({
  agent,
  adapters,
  pairing,
  t,
  log = () => {},
  approvalTimeoutMs = 300_000,
  groupPolicy = "mention",
  draftThenSend = true,
} = {}) {
  const chats = new Map();
  const controller = new AbortController();

  const chatOf = (platform, msg) => {
    const key = `${platform}:${msg.chatId}`;
    if (!chats.has(key)) chats.set(key, { key, platform, busy: false, queue: [], pending: null, last: msg });
    return chats.get(key);
  };

  async function send(platform, msg, text) {
    const adapter = adapters[platform];
    for (const part of chunkText(text, adapter.limit || 2000)) {
      try {
        await adapter.send(msg.chatId, part, msg.reply);
      } catch (error) {
        log("warn", `${platform} send failed: ${error?.message || error}`);
      }
    }
  }

  function ask(chat, msg, text, parse) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        chat.pending = null;
        send(chat.platform, msg, t("gw.timeout")).finally(() => resolve(null));
      }, approvalTimeoutMs);
      chat.pending = {
        userId: msg.userId,
        parse,
        resolve(value) {
          clearTimeout(timer);
          chat.pending = null;
          resolve(value);
        },
      };
      send(chat.platform, msg, text);
    });
  }

  /** Hold assistant text as a draft; user may edit/append, then confirm before final send. */
  async function releaseDraft(chat, msg, body) {
    let text = sanitize(body);
    if (!text) return { sent: false, drafted: false };
    if (!draftThenSend) {
      await send(chat.platform, msg, text);
      return { sent: true, drafted: false };
    }
    while (true) {
      const card = `${t("gw.draftHeader")}\n\n${text}\n\n${t("gw.draftHint")}`;
      const action = await ask(chat, msg, card, (reply) => readDraftAction(reply));
      if (!action || action.action === "deny") {
        await send(chat.platform, msg, t("gw.draftCancelled"));
        return { sent: false, drafted: true };
      }
      if (action.action === "send") {
        await send(chat.platform, msg, text);
        return { sent: true, drafted: true };
      }
      if (action.action === "replace") {
        const next = sanitize(action.body);
        if (next) text = next;
        continue;
      }
      if (action.action === "append") {
        const extra = sanitize(action.body);
        if (extra) text = sanitize(`${text}\n${extra}`);
        continue;
      }
      await send(chat.platform, msg, t("gw.draftCancelled"));
      return { sent: false, drafted: true };
    }
  }

  function decider(chat, msg) {
    return async (pause) => {
      if (pause.kind === "secret") {
        await send(chat.platform, msg, t("gw.secret", { service: pause.service || "" }));
        return { cancel: true };
      }
      if (pause.kind === "choice") {
        const body = `${pause.question}\n${pause.options.map((option, index) => `${index + 1}. ${option}`).join("\n")}\n${t("gw.choiceHint")}`;
        const index = await ask(chat, msg, body, (text) => readChoice(text, pause.options.length));
        return index === null ? { cancel: true } : { index };
      }
      let body;
      if (pause.kind === "change") {
        const diff = agent.diff(pause.before, pause.after);
        body = `${t("gw.changePrompt", { path: pause.path })}\n\`\`\`diff\n${preview(diff)}\n\`\`\`\n${t("gw.verdictHint")}`;
      } else if (pause.kind === "mcp") {
        body = `${t("gw.mcpPrompt", { name: pause.name || pause.tool, tier: pause.tier || "write" })}\n\`\`\`\n${JSON.stringify(pause.args || {}, null, 2)}\n\`\`\`\n${t("gw.verdictHint")}`;
      } else {
        body = `${t("gw.commandPrompt")}\n\`\`\`\n${pause.command}\n\`\`\`\n${t("gw.verdictHint")}`;
      }
      const verdict = await ask(chat, msg, body, (text) => readVerdict(text));
      return { accept: verdict === "approve" };
    };
  }

  async function runTurn(chat, msg) {
    chat.busy = true;
    chat.last = msg;
    const draftParts = [];
    try {
      const convo = await agent.conversation(chat.key);
      const outcome = await convo.turn(msg.text, {
        decide: decider(chat, msg),
        onEvent(event) {
          if (event.type === "message" && event.message.role === "assistant" && String(event.message.content || "").trim()) {
            const piece = sanitize(event.message.content);
            if (!piece) return;
            if (draftThenSend) draftParts.push(piece);
            else send(chat.platform, msg, piece);
          } else if (event.type === "message" && event.message.role === "notice") {
            send(chat.platform, msg, event.message.code === "API_UNREACHABLE" ? t("gw.unreachable") : sanitize(event.message.content));
          } else if (event.type === "decision" && !event.decision.cancel && event.pause.kind !== "choice") {
            send(chat.platform, msg, event.decision.accept ? t("gw.approved") : t("gw.denied"));
          } else if (event.type === "cancelled" && event.reason !== "turn.secretCancelled") {
            send(chat.platform, msg, t("gw.stopped"));
          }
        },
      });
      if (draftParts.length) await releaseDraft(chat, msg, draftParts.join("\n\n"));
      log("info", `${chat.key} turn done code=${outcome.code}`);
    } catch (error) {
      log("error", `${chat.key} turn failed: ${error?.stack || error}`);
      await send(chat.platform, msg, t("gw.failed"));
    } finally {
      chat.busy = false;
      const next = chat.queue.shift();
      if (next) runTurn(chat, next);
    }
  }

  async function command(chat, msg, name) {
    if (name === "help") return send(chat.platform, msg, t("gw.help"));
    if (name === "status") {
      const draft = draftThenSend ? t("gw.draftOn") : t("gw.draftOff");
      return send(chat.platform, msg, `${t("gw.status", { model: agent.current?.label || t("side.noModel"), busy: chat.busy ? t("gw.busyYes") : t("gw.busyNo") })} · ${draft}`);
    }
    if (name === "stop") {
      chat.queue.length = 0;
      if (chat.pending) chat.pending.resolve(null);
      if (chat.busy) await (await agent.conversation(chat.key)).cancel();
      return send(chat.platform, msg, t("gw.stopped"));
    }
    if (chat.busy) return send(chat.platform, msg, t("gw.busyQueued"));
    await (await agent.conversation(chat.key)).reset();
    return send(chat.platform, msg, t("gw.reset"));
  }

  async function handle(platform, msg) {
    const text = sanitize(msg.text).trim();
    if (!text || !msg.userId) return;
    if (msg.isGroup && groupPolicy === "mention" && !msg.mentioned) return;
    if (!pairing.isApproved(platform, msg.userId)) {
      const request = pairing.request(platform, msg.userId, msg.userName || "");
      log("info", `${platform} unpaired sender ${msg.userId}${request ? ` code=${request.code}` : " (rate limited)"}`);
      if (request?.fresh && !msg.isGroup) await send(platform, msg, t("gw.pairCode", { code: request.code }));
      return;
    }
    const chat = chatOf(platform, msg);
    if (chat.pending) {
      if (msg.userId !== chat.pending.userId) return;
      const value = chat.pending.parse(text);
      if (value === null) await send(platform, msg, t("gw.stillWaiting"));
      else chat.pending.resolve(value);
      return;
    }
    const name = COMMANDS[text.split(/\s+/)[0].toLowerCase()];
    if (name) return command(chat, msg, name);
    if (asksWhoMadeIt(text)) return send(platform, msg, identityText(t.lang === "en" ? "en" : "zh"));
    const job = { ...msg, text };
    if (chat.busy) {
      chat.queue.push(job);
      await send(platform, msg, t("gw.busyQueued"));
      return;
    }
    runTurn(chat, job);
  }

  return {
    handle,
    chats,
    get draftThenSend() {
      return draftThenSend;
    },
    async start() {
      const started = [];
      for (const [name, adapter] of Object.entries(adapters)) {
        started.push(Promise.resolve(adapter.start({
          signal: controller.signal,
          log: (level, message) => log(level, `${name}: ${message}`),
          onMessage: (msg) => handle(name, msg).catch((error) => log("error", `${name}: ${error?.stack || error}`)),
        })).catch((error) => log("error", `${name} stopped: ${error?.message || error}`)));
      }
      return Promise.all(started);
    },
    async stop() {
      controller.abort();
      for (const chat of chats.values()) chat.pending?.resolve(null);
      await Promise.all(Object.values(adapters).map((adapter) => adapter.stop?.().catch(() => {})));
    },
  };
}

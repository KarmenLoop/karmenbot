import crypto from "node:crypto";
import { KarmenError } from "../errors.mjs";
import { openMemory } from "../memory-store.mjs";

export async function run(ctx) {
  const [action = "show", ...args] = ctx.args;
  const memory = openMemory(ctx.workspace, ctx.env, ctx.opts.noMemory ? "none" : ctx.opts.session);
  const data = memory.read();
  const say = (line) => ctx.stdout.write(`${line}\n`);
  const en = ctx.t.lang === "en";
  if (action === "add") {
    const text = args.join(" ").trim();
    if (!text || text.length > 4096) throw new KarmenError("err.failed", { message: en ? "A note is 1–4096 characters." : "记忆内容应为 1–4096 个字符。" });
    if (data.notes.length >= 32) throw new KarmenError("err.failed", { message: en ? "32 notes already. Remove one first." : "最多 32 条记忆，请先删除一条。" });
    const id = crypto.randomUUID();
    memory.write({ ...data, notes: [...data.notes, { id, text, at: Date.now() }] });
    say(`${en ? "Saved" : "记忆已保存"}: ${id}`);
    return 0;
  }
  if (action === "remove") {
    const id = args[0];
    if (!data.notes.some((note) => note.id === id)) throw new KarmenError("err.failed", { message: en ? "No note with that id." : "找不到这条记忆。" });
    memory.write({ ...data, notes: data.notes.filter((note) => note.id !== id) });
    say(en ? "Removed." : "记忆已移除。");
    return 0;
  }
  if (action === "clear") {
    memory.write({ ...data, messages: [] });
    say(en ? "Conversation cleared. Notes kept." : "会话已清空，明确记忆仍保留。");
    return 0;
  }
  if (action === "forget") {
    memory.write({ messages: [], notes: [] });
    say(en ? "Session history and notes deleted." : "已删除此会话的历史和明确记忆。");
    return 0;
  }
  if (action === "search") {
    const query = args.join(" ").trim().toLowerCase();
    if (!query) throw new KarmenError("err.flagValue", { flag: "memory search <text>" });
    const matches = [...data.notes.map((note) => ({ role: "note", id: note.id, content: note.text })), ...data.messages]
      .filter((item) => String(item.content || "").toLowerCase().includes(query));
    say(ctx.opts.json ? JSON.stringify(matches) : matches.map((item) => `[${item.role}] ${item.content}`).join("\n") || (en ? "No matches." : "没有匹配记录。"));
    return 0;
  }
  if (action === "show") {
    const result = { session: memory.session, file: memory.file, messages: data.messages.length, notes: data.notes };
    say(ctx.opts.json ? JSON.stringify(result) : `${en ? "Session" : "会话"}: ${result.session}\n${en ? "Notes" : "明确记忆"}: ${result.notes.length}\n${result.notes.map((note) => `${note.id} ${note.text}`).join("\n")}\n${result.file}`);
    return 0;
  }
  throw new KarmenError("err.unknownCommand", { name: `memory ${action}` });
}

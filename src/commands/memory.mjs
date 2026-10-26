import crypto from "node:crypto";
import { KarmenError } from "../errors.mjs";
import { openMemory } from "../memory-store.mjs";
import { addFact, listFacts, removeFact, clearProfile, searchFacts } from "../memory/profile.mjs";
import { appendJournal, searchJournal, listJournalDays, readJournalDay, clearJournal } from "../memory/journal.mjs";
import { createMem0Client, memoryConfig } from "../memory/mem0-client.mjs";
import { memorySettings, saveMemorySettings } from "../home.mjs";
import { createPrompter } from "../prompt.mjs";
import { proposeProfileFact } from "../memory/inject.mjs";

function say(ctx, line) {
  ctx.stdout.write(`${line}\n`);
}

export async function run(ctx) {
  const [action = "show", ...args] = ctx.args;
  const en = ctx.t.lang === "en";
  const session = ctx.opts.noMemory ? "none" : ctx.opts.session;
  const memory = openMemory(ctx.workspace, ctx.env, session);
  const data = memory.read();

  // L1: profile / journal / status / config
  if (action === "profile") {
    const sub = args[0] || "show";
    if (sub === "show" || sub === "list") {
      const facts = listFacts(ctx.env);
      say(ctx, ctx.opts.json ? JSON.stringify(facts) : (facts.map((fact) => `${fact.id} ${fact.text}`).join("\n") || (en ? "No profile facts." : "还没有全局画像事实。")));
      return 0;
    }
    if (sub === "add") {
      const text = args.slice(1).join(" ").trim();
      if (!text) throw new KarmenError("err.failed", { message: en ? "Usage: memory profile add <text>" : "用法：memory profile add <内容>" });
      const fact = addFact(text, ctx.env);
      say(ctx, `${en ? "Profile saved" : "画像已保存"}: ${fact.id}`);
      return 0;
    }
    if (sub === "remove" || sub === "rm") {
      if (!removeFact(args[1], ctx.env)) throw new KarmenError("err.failed", { message: en ? "No profile fact with that id." : "找不到这条画像。" });
      say(ctx, en ? "Removed." : "已移除。");
      return 0;
    }
    if (sub === "clear") {
      clearProfile(ctx.env);
      say(ctx, en ? "Profile cleared." : "画像已清空。");
      return 0;
    }
    if (sub === "search") {
      const query = args.slice(1).join(" ").trim();
      const hits = searchFacts(query, ctx.env);
      say(ctx, ctx.opts.json ? JSON.stringify(hits) : (hits.map((fact) => `${fact.id} ${fact.text}`).join("\n") || (en ? "No matches." : "没有匹配。")));
      return 0;
    }
    throw new KarmenError("err.unknownCommand", { name: `memory profile ${sub}` });
  }

  if (action === "journal") {
    const sub = args[0] || "show";
    if (sub === "add") {
      const text = args.slice(1).join(" ").trim();
      if (!text) throw new KarmenError("err.failed", { message: en ? "Usage: memory journal add <text>" : "用法：memory journal add <内容>" });
      const entry = appendJournal(text, ctx.env);
      say(ctx, `${en ? "Journal saved" : "日记已写入"}: ${entry.id}`);
      return 0;
    }
    if (sub === "show" || sub === "list") {
      const day = args[1];
      if (day) {
        const rows = readJournalDay(day, ctx.env);
        say(ctx, ctx.opts.json ? JSON.stringify(rows) : (rows.map((row) => `${row.id} ${row.text}`).join("\n") || (en ? "Empty day." : "这一天没有记录。")));
        return 0;
      }
      const days = listJournalDays(ctx.env);
      say(ctx, ctx.opts.json ? JSON.stringify(days) : (days.join("\n") || (en ? "No journal days." : "还没有日记。")));
      return 0;
    }
    if (sub === "search") {
      const query = args.slice(1).join(" ").trim();
      const hits = searchJournal(query, ctx.env);
      say(ctx, ctx.opts.json ? JSON.stringify(hits) : (hits.map((row) => `${row.day} ${row.id} ${row.text}`).join("\n") || (en ? "No matches." : "没有匹配。")));
      return 0;
    }
    if (sub === "clear") {
      clearJournal(ctx.env);
      say(ctx, en ? "Journal cleared." : "日记已清空。");
      return 0;
    }
    throw new KarmenError("err.unknownCommand", { name: `memory journal ${sub}` });
  }

  if (action === "status" || action === "config") {
    const conf = memorySettings(ctx.env);
    const client = createMem0Client({ env: ctx.env });
    const facts = listFacts(ctx.env).length;
    const days = listJournalDays(ctx.env).length;
    const payload = { ...conf, profileFacts: facts, journalDays: days, workspaceSession: memory.session, workspaceFile: memory.file, workspaceId: memory.workspaceId };
    if (action === "config" && args[0] === "set") {
      const key = args[1];
      const value = args[2];
      if (!["backend", "remote", "enabled", "injectTopK", "remoteBaseUrl"].includes(key)) {
        throw new KarmenError("err.failed", { message: en ? "Keys: backend|remote|enabled|injectTopK|remoteBaseUrl" : "可设：backend|remote|enabled|injectTopK|remoteBaseUrl" });
      }
      let parsed = value;
      if (key === "remote" || key === "enabled") parsed = ["1", "true", "on", "yes"].includes(String(value).toLowerCase());
      if (key === "injectTopK") parsed = Number(value);
      const next = saveMemorySettings({ [key]: parsed }, ctx.env);
      say(ctx, ctx.opts.json ? JSON.stringify(next) : JSON.stringify(next, null, 2));
      return 0;
    }
    say(ctx, ctx.opts.json ? JSON.stringify(payload) : [
      `${en ? "Backend" : "后端"}: ${conf.backend} · remote=${conf.remote} · enabled=${conf.enabled}`,
      `${en ? "Profile facts" : "画像"}: ${facts}`,
      `${en ? "Journal days" : "日记天数"}: ${days}`,
      `${en ? "Workspace session" : "工作区会话"}: ${memory.session} (${memory.workspaceId})`,
      memory.file,
    ].join("\n"));
    return 0;
  }

  if (action === "search") {
    const query = args.join(" ").trim().toLowerCase();
    if (!query) throw new KarmenError("err.flagValue", { flag: "memory search <text>" });
    const local = [...data.notes.map((note) => ({ role: "note", id: note.id, content: note.text })), ...data.messages]
      .filter((item) => String(item.content || "").toLowerCase().includes(query));
    const client = createMem0Client({ env: ctx.env });
    const globalHits = await client.search(query);
    if (ctx.opts.json) {
      say(ctx, JSON.stringify({ workspace: local, global: globalHits }));
      return 0;
    }
    const lines = [
      ...local.map((item) => `[workspace:${item.role}] ${item.content}`),
      ...globalHits.map((item) => `[${item.layer}] ${item.text}`),
    ];
    say(ctx, lines.join("\n") || (en ? "No matches." : "没有匹配记录。"));
    return 0;
  }

  // L0 workspace notes (unchanged behaviour) + optional "add profile|journal" routing
  if (action === "add") {
    if (args[0] === "profile") {
      const text = args.slice(1).join(" ").trim();
      if (!text) throw new KarmenError("err.failed", { message: en ? "Usage: memory add profile <text>" : "用法：memory add profile <内容>" });
      const fact = addFact(text, ctx.env);
      say(ctx, `${en ? "Profile saved" : "画像已保存"}: ${fact.id}`);
      return 0;
    }
    if (args[0] === "journal") {
      const text = args.slice(1).join(" ").trim();
      if (!text) throw new KarmenError("err.failed", { message: en ? "Usage: memory add journal <text>" : "用法：memory add journal <内容>" });
      const entry = appendJournal(text, ctx.env);
      say(ctx, `${en ? "Journal saved" : "日记已写入"}: ${entry.id}`);
      return 0;
    }
    const text = args.join(" ").trim();
    if (!text || text.length > 4096) throw new KarmenError("err.failed", { message: en ? "A note is 1–4096 characters." : "记忆内容应为 1–4096 个字符。" });
    if (data.notes.length >= 32) throw new KarmenError("err.failed", { message: en ? "32 notes already. Remove one first." : "最多 32 条记忆，请先删除一条。" });
    const id = crypto.randomUUID();
    memory.write({ ...data, notes: [...data.notes, { id, text, at: Date.now() }] });
    say(ctx, `${en ? "Saved" : "记忆已保存"}: ${id}`);
    return 0;
  }

  if (action === "remove") {
    const id = args[0];
    if (!data.notes.some((note) => note.id === id)) throw new KarmenError("err.failed", { message: en ? "No note with that id." : "找不到这条记忆。" });
    memory.write({ ...data, notes: data.notes.filter((note) => note.id !== id) });
    say(ctx, en ? "Removed." : "记忆已移除。");
    return 0;
  }
  if (action === "clear") {
    memory.write({ ...data, messages: [] });
    say(ctx, en ? "Conversation cleared. Notes kept." : "会话已清空，明确记忆仍保留。");
    return 0;
  }
  if (action === "forget") {
    memory.write({ messages: [], notes: [] });
    say(ctx, en ? "Session history and notes deleted." : "已删除此会话的历史和明确记忆。");
    return 0;
  }
  if (action === "propose") {
    // Optional: propose saving a preference after the user confirms (no silent write).
    const text = args.join(" ").trim();
    const proposal = proposeProfileFact(text);
    if (!proposal) {
      say(ctx, en ? "Nothing safe to propose." : "没有可安全提议的内容。");
      return 1;
    }
    const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
    try {
      const ok = await prompter.confirm(en ? `Save to profile?\n${proposal}\n[y/N] ` : `写入全局画像？\n${proposal}\n[y/N] `, false);
      if (!ok) {
        say(ctx, en ? "Skipped." : "已跳过。");
        return 0;
      }
      const fact = addFact(proposal, ctx.env);
      say(ctx, `${en ? "Profile saved" : "画像已保存"}: ${fact.id}`);
      return 0;
    } finally {
      prompter.close();
    }
  }
  if (action === "show") {
    const facts = listFacts(ctx.env);
    const result = {
      session: memory.session,
      file: memory.file,
      workspaceId: memory.workspaceId,
      messages: data.messages.length,
      notes: data.notes,
      profile: facts,
      memory: memoryConfig(ctx.env),
    };
    if (ctx.opts.json) {
      say(ctx, JSON.stringify(result));
      return 0;
    }
    say(ctx, [
      `${en ? "Session" : "会话"}: ${result.session}`,
      `${en ? "Workspace notes" : "工作区记忆"}: ${result.notes.length}`,
      ...result.notes.map((note) => `  ${note.id} ${note.text}`),
      `${en ? "Profile" : "全局画像"}: ${facts.length}`,
      ...facts.slice(0, 20).map((fact) => `  ${fact.id} ${fact.text}`),
      result.file,
    ].join("\n"));
    return 0;
  }
  throw new KarmenError("err.unknownCommand", { name: `memory ${action}` });
}

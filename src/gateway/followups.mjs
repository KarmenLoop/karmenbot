import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { karmenHome, loadConfig } from "../home.mjs";

/** Durable proactive follow-up queue. File mode 600; dir 700. */

export function followupsDir(env = process.env) {
  const dir = path.join(karmenHome(env), "gateway");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* ignore */
  }
  return dir;
}

export function followupsFile(env = process.env) {
  return path.join(followupsDir(env), "followups.jsonl");
}

function readAll(env) {
  const file = followupsFile(env);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const items = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      /* skip bad line */
    }
  }
  return items;
}

function writeAll(items, env) {
  const file = followupsFile(env);
  const tmp = `${file}.${process.pid}.tmp`;
  const body = items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : "");
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore */
  }
}

export function listFollowups(env = process.env, { status = null } = {}) {
  const items = readAll(env).sort((a, b) => a.dueAt - b.dueAt);
  if (!status) return items;
  return items.filter((item) => item.status === status);
}

export function getFollowup(id, env = process.env) {
  return readAll(env).find((item) => item.id === id) || null;
}

/** Parse due time: ISO string, epoch ms, or +Nh / +Nd / +Nm relative to now. */
export function parseDueAt(value, now = Date.now()) {
  if (value == null || value === "") throw new Error("due time required");
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  const rel = /^\+(\d+)\s*(m|min|h|d)$/i.exec(text);
  if (rel) {
    const n = Number(rel[1]);
    const u = rel[2].toLowerCase()[0];
    const ms = u === "m" ? n * 60_000 : u === "h" ? n * 3_600_000 : n * 86_400_000;
    return now + ms;
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new Error(`bad due time: ${value}`);
  return ms;
}

/**
 * Enqueue a proactive follow-up.
 * requireConfirm defaults true (draft-safe while #8 may be absent).
 */
export function enqueueFollowup({
  platform,
  chatId,
  text,
  dueAt,
  session = null,
  userId = null,
  requireConfirm = true,
  id = null,
} = {}, env = process.env, now = Date.now()) {
  if (!platform || !/^[a-z][a-z0-9_-]*$/.test(platform)) throw new Error("platform required");
  if (!chatId) throw new Error("chatId required");
  const body = String(text || "").trim();
  if (!body) throw new Error("text required");
  const due = typeof dueAt === "number" ? dueAt : parseDueAt(dueAt, now);
  const item = {
    id: id || crypto.randomUUID(),
    platform: String(platform),
    chatId: String(chatId),
    userId: userId ? String(userId) : null,
    session: session ? String(session) : null,
    text: body,
    dueAt: due,
    requireConfirm: requireConfirm !== false,
    status: "pending",
    createdAt: now,
    sentAt: null,
    skipReason: null,
  };
  const items = readAll(env);
  items.push(item);
  writeAll(items, env);
  return item;
}

export function cancelFollowup(id, env = process.env, now = Date.now()) {
  const items = readAll(env);
  const target = items.find((item) => item.id === id);
  if (!target) return null;
  if (target.status !== "pending") return target;
  target.status = "cancelled";
  target.sentAt = now;
  writeAll(items, env);
  return target;
}

export function updateFollowup(id, patch, env = process.env) {
  const items = readAll(env);
  const target = items.find((item) => item.id === id);
  if (!target) return null;
  Object.assign(target, patch);
  writeAll(items, env);
  return target;
}

export function followupConfig(env = process.env) {
  const raw = loadConfig(env).gateway?.followups || {};
  return {
    maxPerDay: Number.isFinite(Number(raw.maxPerDay)) ? Number(raw.maxPerDay) : 10,
    quietHours: raw.quietHours && typeof raw.quietHours === "object"
      ? { start: String(raw.quietHours.start || ""), end: String(raw.quietHours.end || "") }
      : null,
    // Align with #8 when present: unset/true → prefer draft wrapping.
    draftThenSend: loadConfig(env).gateway?.draftThenSend !== false,
  };
}

/** Local HH:MM quiet-hours check. Window may wrap midnight (22:00–08:00). */
export function inQuietHours(quietHours, date = new Date()) {
  if (!quietHours?.start || !quietHours?.end) return false;
  const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const start = toMin(quietHours.start);
  const end = toMin(quietHours.end);
  if (start == null || end == null) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function countSentToday(items, now = Date.now()) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const start = day.getTime();
  return items.filter((item) => item.status === "sent" && item.sentAt >= start && item.sentAt <= now).length;
}

/**
 * Select pending items that are due, respecting quiet hours and daily cap.
 * Does not mutate; caller marks outcomes.
 */
export function selectDueFollowups(env = process.env, now = Date.now()) {
  const cfg = followupConfig(env);
  const all = readAll(env);
  if (inQuietHours(cfg.quietHours, new Date(now))) {
    return { due: [], skipped: all.filter((i) => i.status === "pending" && i.dueAt <= now).map((i) => ({ id: i.id, reason: "quiet hours" })), cfg };
  }
  const sentToday = countSentToday(all, now);
  const remaining = Math.max(0, cfg.maxPerDay - sentToday);
  const pendingDue = all
    .filter((item) => item.status === "pending" && item.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
  const due = pendingDue.slice(0, remaining);
  const skipped = pendingDue.slice(remaining).map((item) => ({ id: item.id, reason: `rate limit (max ${cfg.maxPerDay}/day)` }));
  return { due, skipped, cfg, sentToday };
}

/** Build outbound text: draft-safe by default. */
export function formatFollowupOutbound(item, cfg = {}) {
  const notice = "【主动跟进】";
  const draftOn = cfg.draftThenSend !== false;
  if (item.requireConfirm !== false || draftOn) {
    return `${notice}【待确认草稿】\n\n${item.text}\n\n回复「发送」/ send / 批准 确认发出（主动跟进默认需确认；gateway.draftThenSend / requireConfirm）。`;
  }
  return `${notice}\n\n${item.text}`;
}

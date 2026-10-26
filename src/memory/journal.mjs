import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { journalDir, journalPath, todayStamp } from "./paths.mjs";
import { assertSafeToStore, sanitizeMemoryText } from "./sanitize.mjs";

export function appendJournal(text, env = process.env, { day = todayStamp(), tags = [] } = {}) {
  const clean = sanitizeMemoryText(String(text || "").trim());
  if (!clean || clean.length > 4096) throw Object.assign(new Error("journal entry must be 1–4096 characters"), { code: "MEMORY_BAD_ENTRY" });
  assertSafeToStore(clean);
  const file = journalPath(day, env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const entry = { id: crypto.randomUUID(), text: clean, at: Date.now(), tags: Array.isArray(tags) ? tags.map(String) : [] };
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch { /* ignore */ }
  return entry;
}

export function readJournalDay(day = todayStamp(), env = process.env) {
  const file = journalPath(day, env);
  try {
    return fs.readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function listJournalDays(env = process.env) {
  const dir = journalDir(env);
  try {
    return fs.readdirSync(dir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .map((name) => name.replace(/\.jsonl$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export function searchJournal(query, env = process.env, { limit = 12, days = 30 } = {}) {
  const q = String(query || "").toLowerCase().trim();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const dayList = listJournalDays(env).slice(-Math.max(1, days));
  const hits = [];
  for (const day of dayList) {
    for (const entry of readJournalDay(day, env)) {
      const hay = String(entry.text || "").toLowerCase();
      const score = tokens.length ? tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0) : 1;
      if (!tokens.length || score > 0) hits.push({ ...entry, day, score });
    }
  }
  return hits
    .sort((a, b) => (b.score - a.score) || (b.at - a.at))
    .slice(0, limit);
}

export function clearJournal(env = process.env) {
  const dir = journalDir(env);
  for (const day of listJournalDays(env)) {
    try {
      fs.unlinkSync(journalPath(day, env));
    } catch { /* ignore */ }
  }
  try {
    fs.rmdirSync(dir);
  } catch { /* ignore */ }
}

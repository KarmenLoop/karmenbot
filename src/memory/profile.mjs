import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { profilePath } from "./paths.mjs";
import { assertSafeToStore, sanitizeMemoryText } from "./sanitize.mjs";

function empty() {
  return { version: 1, facts: [] };
}

function readRaw(env) {
  const file = profilePath(env);
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return empty();
    return { version: 1, facts: Array.isArray(value.facts) ? value.facts : [] };
  } catch {
    return empty();
  }
}

function writeRaw(data, env) {
  const file = profilePath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}


export function loadProfile(env = process.env) {
  return readRaw(env);
}

export function listFacts(env = process.env) {
  return loadProfile(env).facts;
}

export function addFact(text, env = process.env, { key = null } = {}) {
  const clean = sanitizeMemoryText(String(text || "").trim());
  if (!clean || clean.length > 4096) throw Object.assign(new Error("profile fact must be 1–4096 characters"), { code: "MEMORY_BAD_FACT" });
  assertSafeToStore(clean);
  const data = readRaw(env);
  if (data.facts.length >= 128) throw Object.assign(new Error("profile is full (128 facts)"), { code: "MEMORY_FULL" });
  const fact = { id: crypto.randomUUID(), key: key || null, text: clean, at: Date.now() };
  data.facts.push(fact);
  writeRaw(data, env);
  return fact;
}

export function removeFact(id, env = process.env) {
  const data = readRaw(env);
  const next = data.facts.filter((fact) => fact.id !== id);
  if (next.length === data.facts.length) return false;
  writeRaw({ ...data, facts: next }, env);
  return true;
}

export function clearProfile(env = process.env) {
  writeRaw(empty(), env);
}

export function searchFacts(query, env = process.env, { limit = 8 } = {}) {
  const q = String(query || "").toLowerCase().trim();
  const facts = listFacts(env);
  if (!q) return facts.slice(-limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  return facts
    .map((fact) => {
      const hay = `${fact.key || ""} ${fact.text}`.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0);
      return { fact, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.fact.at - a.fact.at)
    .slice(0, limit)
    .map((item) => item.fact);
}

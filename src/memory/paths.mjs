import path from "node:path";
import { karmenHome } from "../home.mjs";

/** Global L1 memory root: ~/.karmenbot/memory/ (shared across workspaces). */
export function globalMemoryRoot(env = process.env) {
  return path.join(karmenHome(env), "memory");
}

export function profilePath(env = process.env) {
  return path.join(globalMemoryRoot(env), "profile.json");
}

export function journalDir(env = process.env) {
  return path.join(globalMemoryRoot(env), "journal");
}

export function journalPath(day, env = process.env) {
  return path.join(journalDir(env), `${day}.jsonl`);
}

export function todayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

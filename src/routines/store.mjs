import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { karmenHome } from "../home.mjs";
import { normalizeSchedule, nextRunAfter } from "./cron.mjs";

export function routinesDir(env = process.env) {
  return path.join(karmenHome(env), "routines");
}

function ensureDir(env) {
  const dir = routinesDir(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* ignore on platforms that cannot chmod */
  }
  return dir;
}

function fileOf(id, env) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) {
    throw new Error("routine id must be 1–64 chars: letters, digits, ._-");
  }
  return path.join(ensureDir(env), `${id}.json`);
}

function readFile(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore */
  }
}

export function listRoutines(env = process.env) {
  const dir = ensureDir(env);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readFile(path.join(dir, name)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function getRoutine(id, env = process.env) {
  const file = fileOf(id, env);
  if (!fs.existsSync(file)) return null;
  return readFile(file);
}

export function saveRoutine(routine, env = process.env) {
  const file = fileOf(routine.id, env);
  writeFile(file, routine);
  return routine;
}

export function deleteRoutine(id, env = process.env) {
  const file = fileOf(id, env);
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}

/**
 * Create a routine. Safer defaults:
 *   allowUnattended: false  — tick will skip until the owner opts in
 *   allowShell: false       — shell steps in a linked flow are refused when unattended
 */
export function createRoutine({
  id,
  schedule,
  flowFile = null,
  prompt = null,
  steps = null,
  name = "",
  allowUnattended = false,
  allowShell = false,
  enabled = true,
  workspace = null,
} = {}, env = process.env, now = Date.now()) {
  if (!flowFile && !prompt && !steps) throw new Error("routine needs flowFile, prompt, or steps");
  if (getRoutine(id, env)) throw new Error(`routine already exists: ${id}`);
  const parsed = normalizeSchedule(schedule);
  const routine = {
    id: id || crypto.randomUUID(),
    name: name || id,
    schedule: parsed.label,
    enabled: enabled !== false,
    allowUnattended: allowUnattended === true,
    allowShell: allowShell === true,
    flowFile: flowFile || null,
    prompt: prompt || null,
    steps: Array.isArray(steps) ? steps : null,
    workspace: workspace || null,
    createdAt: now,
    lastRunAt: null,
    lastStatus: null,
    nextRunAt: nextRunAfter(parsed, now),
  };
  return saveRoutine(routine, env);
}

export function updateRoutine(id, patch, env = process.env, now = Date.now()) {
  const current = getRoutine(id, env);
  if (!current) throw new Error(`routine not found: ${id}`);
  const next = { ...current, ...patch, id: current.id };
  if (patch.schedule) {
    const parsed = normalizeSchedule(patch.schedule);
    next.schedule = parsed.label;
    next.nextRunAt = nextRunAfter(parsed, next.lastRunAt || now);
  }
  return saveRoutine(next, env);
}

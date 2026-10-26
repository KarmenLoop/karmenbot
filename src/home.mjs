import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Everything karmenbot keeps lives under one folder, separate from Koder:
//   config.json   preferences, models (no keys), MoA presets, gateway settings,
//                 mcp.servers[] (id, command, args, env, enabled, preset);
//                 memory: { backend: "local"|"mem0", remote: false, enabled, injectTopK }
//   secrets.json  API keys and platform credentials, mode 600;
//                 secrets.mcp.<serverId> may hold env keys for MCP servers
//   memory/       L0 workspace sessions + L1 profile.json / journal/*.jsonl
//   app/          installed releases (installer), runtime/ private Node
export function karmenHome(env = process.env) {
  return path.resolve(env.KARMENBOT_HOME || path.join(os.homedir(), ".karmenbot"));
}

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeJson(file, value, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.renameSync(temp, file);
  fs.chmodSync(file, mode);
}

export const configFile = (env) => path.join(karmenHome(env), "config.json");
export const secretsFile = (env) => path.join(karmenHome(env), "secrets.json");

export function loadConfig(env = process.env) {
  return readJson(configFile(env));
}

export function saveConfig(patch, env = process.env) {
  const next = { ...loadConfig(env), ...patch };
  writeJson(configFile(env), next, 0o600);
  return next;
}

export function loadSecrets(env = process.env) {
  return readJson(secretsFile(env));
}

// Secrets are grouped: { models: { <id>: { apiKey } }, platforms: { <name>: {...} } }.
export function saveSecret(group, id, value, env = process.env) {
  const all = loadSecrets(env);
  const bucket = { ...(all[group] || {}) };
  if (value === null) delete bucket[id];
  else bucket[id] = value;
  writeJson(secretsFile(env), { ...all, [group]: bucket }, 0o600);
}

/** Normalize memory settings. Remote mem0 stays off unless explicitly enabled. */
export function memorySettings(env = process.env) {
  const raw = loadConfig(env).memory || {};
  return {
    backend: raw.backend === "mem0" ? "mem0" : "local",
    remote: raw.remote === true,
    remoteBaseUrl: typeof raw.remoteBaseUrl === "string" ? raw.remoteBaseUrl : "",
    enabled: raw.enabled !== false,
    injectTopK: Number.isFinite(raw.injectTopK) ? raw.injectTopK : 6,
  };
}

export function saveMemorySettings(patch = {}, env = process.env) {
  const current = memorySettings(env);
  const next = {
    ...current,
    ...patch,
    remote: Object.prototype.hasOwnProperty.call(patch, "remote") ? patch.remote === true : current.remote,
  };
  if (next.backend !== "mem0") next.backend = "local";
  saveConfig({ memory: next }, env);
  return next;
}

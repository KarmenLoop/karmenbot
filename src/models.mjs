import fs from "node:fs";
import path from "node:path";
import { KarmenError } from "./errors.mjs";
import { loadConfig, loadSecrets, saveConfig, saveSecret } from "./home.mjs";

// config.json models: [{ id, preset, name, model, baseUrl, protocol, contextWindow, maxOutput, ... }]
// The key is in secrets.json models[id].apiKey, or read from the variable named by keyEnv.
const PASS = ["auth", "chatPath", "sendApiKeyHeader", "contextWindow", "maxOutput", "keyEnv"];

export function normalizeModel(raw) {
  if (!raw || typeof raw !== "object") throw new KarmenError("model.badField", { field: "model" });
  const model = String(raw.model || "").trim();
  const baseUrl = String(raw.baseUrl || "").trim().replace(/\/+$/, "");
  if (!model) throw new KarmenError("model.badField", { field: "model" });
  if (!/^https?:\/\/[^/\s]+/i.test(baseUrl)) throw new KarmenError("model.badUrl");
  const entry = {
    id: String(raw.id || raw.preset || model).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 40),
    name: String(raw.name || model).slice(0, 80),
    model,
    baseUrl,
    protocol: raw.protocol === "anthropic" ? "anthropic" : "openai",
  };
  if (raw.preset) entry.preset = String(raw.preset);
  for (const key of PASS) if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") entry[key] = raw[key];
  return entry;
}

export function listModels(env = process.env) {
  const models = loadConfig(env).models;
  return Array.isArray(models) ? models : [];
}

function withKey(entry, apiKey, env) {
  let key = apiKey || "";
  if (!key && entry.keyEnv) {
    key = env[entry.keyEnv] || "";
    if (!key && entry.auth !== "none") throw new KarmenError("model.keyEnvMissing", { name: entry.keyEnv });
  }
  if (!key && entry.auth !== "none") throw new KarmenError("model.keyMissing", { id: entry.id });
  return { ...entry, apiKey: key };
}

export function recordFor(id, env = process.env) {
  const entry = listModels(env).find((item) => item.id === id);
  if (!entry) throw new KarmenError("model.unknown", { id });
  return withKey(entry, loadSecrets(env).models?.[id]?.apiKey, env);
}

// --model-file, then KARMENBOT_* variables (CI, one-off), then config.json's default.
export function activeModel({ env = process.env, modelFile, id } = {}) {
  if (modelFile) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.resolve(modelFile), "utf8"));
    } catch {
      throw new KarmenError("model.badFile", { file: modelFile });
    }
    const entry = normalizeModel(raw);
    return { record: withKey(entry, raw.apiKey, env), source: modelFile };
  }
  if (env.KARMENBOT_MODEL && env.KARMENBOT_BASE_URL) {
    const entry = normalizeModel({ id: "env", model: env.KARMENBOT_MODEL, baseUrl: env.KARMENBOT_BASE_URL, protocol: env.KARMENBOT_PROTOCOL, auth: env.KARMENBOT_API_KEY ? undefined : "none" });
    if (entry.protocol === "anthropic" && env.KARMENBOT_API_KEY) entry.auth = "x-api-key";
    return { record: withKey(entry, env.KARMENBOT_API_KEY, env), source: "env" };
  }
  const chosen = id || loadConfig(env).model;
  if (!chosen) return null;
  return { record: recordFor(chosen, env), source: "config" };
}

export function addModel(raw, { apiKey = "", makeDefault = false } = {}, env = process.env) {
  const entry = normalizeModel(raw);
  const config = loadConfig(env);
  const models = (Array.isArray(config.models) ? config.models : []).filter((item) => item.id !== entry.id);
  models.push(entry);
  const patch = { models };
  if (makeDefault || !config.model) patch.model = entry.id;
  saveConfig(patch, env);
  if (apiKey) saveSecret("models", entry.id, { apiKey }, env);
  return entry;
}

export function useModel(id, env = process.env) {
  if (!listModels(env).some((item) => item.id === id)) throw new KarmenError("model.unknown", { id });
  saveConfig({ model: id }, env);
}

export function removeModel(id, env = process.env) {
  const config = loadConfig(env);
  const models = listModels(env).filter((item) => item.id !== id);
  saveConfig({ models, model: config.model === id ? models[0]?.id || null : config.model }, env);
  saveSecret("models", id, null, env);
}

export function publicModel(record) {
  const key = record?.apiKey || "";
  return {
    id: record?.id || "",
    name: record?.name || record?.model || "",
    model: record?.model || "",
    protocol: record?.protocol || "",
    baseUrl: record?.baseUrl || "",
    apiKey: key ? `…${key.slice(-4)}` : "",
  };
}

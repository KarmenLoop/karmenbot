import { loadConfig, loadSecrets, saveConfig, saveSecret } from "../home.mjs";

/** Same shape as Wave1 `src/mcp/registry.mjs` normalizeServer. */
export function normalizeServer(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = String(entry.id || "").trim();
  if (!id || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id)) return null;
  const command = String(entry.command || "").trim();
  if (!command) return null;
  return {
    id,
    enabled: entry.enabled !== false,
    preset: entry.preset || null,
    command,
    args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    env: entry.env && typeof entry.env === "object" && !Array.isArray(entry.env) ? { ...entry.env } : {},
    cwd: entry.cwd ? String(entry.cwd) : undefined,
  };
}

export function listConfiguredServers(env = process.env) {
  const raw = loadConfig(env).mcp?.servers;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeServer).filter(Boolean);
}

export function getConfiguredServer(id, env = process.env) {
  return listConfiguredServers(env).find((item) => item.id === id) || null;
}

export function saveServers(servers, env = process.env) {
  const config = loadConfig(env);
  const mcp = { ...(config.mcp || {}), servers: servers.map(normalizeServer).filter(Boolean) };
  saveConfig({ mcp }, env);
  return mcp.servers;
}

export function upsertServer(entry, env = process.env) {
  const next = normalizeServer(entry);
  if (!next) throw new Error("invalid MCP server entry");
  const servers = listConfiguredServers(env).filter((item) => item.id !== next.id);
  servers.push(next);
  return saveServers(servers, env);
}

export function removeServer(id, env = process.env) {
  const servers = listConfiguredServers(env).filter((item) => item.id !== id);
  saveServers(servers, env);
  saveSecret("mcp", id, null, env);
  return servers;
}

export function saveMcpSecret(id, secret, env = process.env) {
  if (!secret || typeof secret !== "object") return;
  const cleaned = {};
  for (const [key, value] of Object.entries(secret)) {
    if (value != null && String(value).trim() !== "") cleaned[key] = String(value);
  }
  if (Object.keys(cleaned).length) saveSecret("mcp", id, cleaned, env);
}

export function readMcpSecret(id, env = process.env) {
  return loadSecrets(env).mcp?.[id] || {};
}

/** Prefer Wave1 registry when present (after #5 merges); else local home-servers. */
export async function upsertViaRegistryOrHome(entry, secret, env = process.env) {
  try {
    const registry = await import("./registry.mjs");
    if (typeof registry.upsertServer === "function") {
      registry.upsertServer(entry, env);
      if (secret) saveMcpSecret(entry.id, secret, env);
      return { via: "registry", entry: normalizeServer(entry) };
    }
  } catch {
    /* Wave1 not on this checkout */
  }
  upsertServer(entry, env);
  if (secret) saveMcpSecret(entry.id, secret, env);
  return { via: "home", entry: normalizeServer(entry) };
}

export function mcpClientAvailable() {
  try {
    return Boolean(import.meta.resolve("./client.mjs"));
  } catch {
    return false;
  }
}

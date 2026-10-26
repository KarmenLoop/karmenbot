import { loadConfig, loadSecrets, saveConfig, saveSecret } from "../home.mjs";
import { McpClient } from "./client.mjs";
import { getPreset, listPresets, serverFromPreset } from "./presets.mjs";

function normalizeServer(entry) {
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
  if (!next) throw new Error(`invalid MCP server entry`);
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

export function enableServer(id, enabled, env = process.env) {
  const servers = listConfiguredServers(env);
  const target = servers.find((item) => item.id === id);
  if (!target) return null;
  target.enabled = Boolean(enabled);
  saveServers(servers, env);
  return target;
}

export function addPreset(presetId, overrides = {}, env = process.env) {
  const entry = serverFromPreset(presetId, overrides);
  if (!entry) throw new Error(`unknown MCP preset: ${presetId}`);
  if (overrides.secret && typeof overrides.secret === "object") {
    saveSecret("mcp", entry.id, overrides.secret, env);
  }
  upsertServer(entry, env);
  return entry;
}

function resolveEnv(server, env) {
  const secrets = loadSecrets(env).mcp?.[server.id] || {};
  const merged = { ...server.env };
  for (const [key, value] of Object.entries(secrets)) {
    if (value != null && value !== "") merged[key] = String(value);
  }
  return merged;
}

/**
 * Runtime registry: starts enabled servers, exposes tools as mcp.<id>.<tool>.
 */
export function createRegistry({ env = process.env, Client = McpClient, onEvent = () => {} } = {}) {
  const clients = new Map();
  let notice = null;

  async function start(id) {
    const server = getConfiguredServer(id, env);
    if (!server) throw new Error(`MCP server not configured: ${id}`);
    if (clients.has(id)) return clients.get(id);
    const client = new Client({
      id: server.id,
      command: server.command,
      args: server.args,
      env: resolveEnv(server, env),
      cwd: server.cwd,
    });
    onEvent({ type: "mcp.start", id });
    await client.start();
    clients.set(id, client);
    onEvent({ type: "mcp.ready", id, tools: client.tools.map((tool) => tool.name) });
    return client;
  }

  async function stop(id) {
    const client = clients.get(id);
    if (!client) return;
    clients.delete(id);
    await client.dispose();
    onEvent({ type: "mcp.stop", id });
  }

  async function startEnabled() {
    const errors = [];
    for (const server of listConfiguredServers(env).filter((item) => item.enabled)) {
      try {
        await start(server.id);
      } catch (error) {
        errors.push({ id: server.id, message: error?.message || String(error) });
        onEvent({ type: "mcp.error", id: server.id, message: error?.message || String(error) });
      }
    }
    if (errors.length) notice = `MCP: ${errors.map((item) => `${item.id} failed (${item.message})`).join("; ")}`;
    return { clients: [...clients.keys()], errors };
  }

  async function dispose() {
    const ids = [...clients.keys()];
    await Promise.all(ids.map((id) => stop(id)));
  }

  function parseName(qualified) {
    const text = String(qualified || "");
    const match = /^mcp\.([^.]+)\.(.+)$/.exec(text);
    if (!match) return null;
    return { serverId: match[1], toolName: match[2] };
  }

  function listTools() {
    const out = [];
    for (const [id, client] of clients) {
      for (const tool of client.tools) {
        out.push({
          ...tool,
          serverId: id,
          qualifiedName: `mcp.${id}.${tool.name}`,
        });
      }
    }
    return out;
  }

  async function callTool(qualifiedName, args = {}) {
    const parsed = parseName(qualifiedName) || (typeof qualifiedName === "object" ? qualifiedName : null);
    if (!parsed?.serverId || !parsed?.toolName) throw new Error(`MCP tool name must be mcp.<id>.<tool> (got ${qualifiedName})`);
    let client = clients.get(parsed.serverId);
    if (!client) client = await start(parsed.serverId);
    return client.callTool(parsed.toolName, args);
  }

  return {
    start,
    stop,
    startEnabled,
    dispose,
    listTools,
    callTool,
    parseName,
    getClient: (id) => clients.get(id) || null,
    get notice() {
      return notice;
    },
    get running() {
      return [...clients.keys()];
    },
  };
}

export { listPresets, getPreset, serverFromPreset };

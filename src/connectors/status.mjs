import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listConfiguredServers, readMcpSecret } from "../mcp/home-servers.mjs";
import { listConnectorPresets, getConnectorPreset } from "./presets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** True when Wave1 MCP client module is present in this install. */
export function hasMcpClient() {
  const candidate = path.resolve(here, "../mcp/client.mjs");
  return fs.existsSync(candidate);
}

export function connectorDoctor(env = process.env) {
  const client = hasMcpClient();
  const configured = listConfiguredServers(env);
  const presets = listConnectorPresets();
  const rows = presets.map((preset) => {
    const server = configured.find((item) => item.id === preset.id || item.preset === preset.id);
    const secrets = server ? readMcpSecret(server.id, env) : {};
    const hasSecrets = preset.secretKeys.some((key) => secrets[key]);
    return {
      id: preset.id,
      kind: preset.kind,
      configured: Boolean(server),
      enabled: server ? server.enabled !== false : false,
      hasSecrets,
      command: server?.command || preset.command,
      runtime: client ? "mcp-client-ready" : "config-only (needs MCP client — PR #5)",
    };
  });
  return { mcpClient: client, connectors: rows };
}

export function isConnectorName(name) {
  return Boolean(getConnectorPreset(name));
}

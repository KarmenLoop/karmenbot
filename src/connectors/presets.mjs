// Mail / calendar MCP connector presets.
// Official @modelcontextprotocol/server-gmail|google-calendar packages do NOT
// exist on npm (404 as of 2026-10). Google ships remote HTTP MCP endpoints;
// for stdio today we document the community google-services-mcp package and
// allow a fully custom command. Composio is optional (see docs/CONNECTORS.md).

export const CONNECTOR_PRESETS = {
  gmail: {
    id: "gmail",
    aliases: ["mail"],
    kind: "mail",
    name: "Gmail",
    description: "Gmail via community google-services-mcp (stdio) or Google remote MCP (docs)",
    command: "npx",
    args: ["-y", "google-services-mcp"],
    env: {},
    secretKeys: ["GOOGLE_MCP_CLIENT_ID", "GOOGLE_MCP_CLIENT_SECRET"],
    remoteUrl: "https://gmailmcp.googleapis.com/mcp/v1",
    packageDocs: "https://github.com/nabheet/google-services-mcp",
    googleDocs: "https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server",
    defaultEnabled: true,
  },
  "google-calendar": {
    id: "google-calendar",
    aliases: ["calendar"],
    kind: "calendar",
    name: "Google Calendar",
    description: "Google Calendar via community google-services-mcp (stdio) or Google remote MCP (docs)",
    command: "npx",
    args: ["-y", "google-services-mcp"],
    env: {},
    secretKeys: ["GOOGLE_MCP_CLIENT_ID", "GOOGLE_MCP_CLIENT_SECRET"],
    remoteUrl: "https://calendarmcp.googleapis.com/mcp/v1",
    packageDocs: "https://github.com/nabheet/google-services-mcp",
    googleDocs: "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server",
    defaultEnabled: true,
  },
};

const ALIAS = {};
for (const preset of Object.values(CONNECTOR_PRESETS)) {
  ALIAS[preset.id] = preset.id;
  for (const alias of preset.aliases || []) ALIAS[alias] = preset.id;
}

export function resolveConnectorId(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return ALIAS[key] || null;
}

export function listConnectorPresets() {
  return Object.values(CONNECTOR_PRESETS);
}

export function getConnectorPreset(idOrAlias) {
  const id = resolveConnectorId(idOrAlias) || idOrAlias;
  return CONNECTOR_PRESETS[id] || null;
}

export function serverFromConnectorPreset(idOrAlias, overrides = {}) {
  const preset = getConnectorPreset(idOrAlias);
  if (!preset) return null;
  const args = Array.isArray(overrides.args) ? overrides.args : [...preset.args, ...(overrides.extraArgs || [])];
  return {
    id: overrides.id || preset.id,
    enabled: overrides.enabled ?? preset.defaultEnabled,
    preset: preset.id,
    command: overrides.command || preset.command,
    args,
    env: { ...preset.env, ...(overrides.env || {}) },
    cwd: overrides.cwd || undefined,
  };
}

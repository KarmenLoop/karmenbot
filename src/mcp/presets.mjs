// Built-in MCP server presets. Playwright is Wave1 P0 (OSS: microsoft/playwright-mcp
// / @playwright/mcp, Apache-2.0). Fetch/brave-search cover Path B 网络检索;
// filesystem is optional. Mail/calendar live in src/connectors/presets.mjs.

export const PRESETS = {
  playwright: {
    id: "playwright",
    name: "Playwright",
    description: "Browser automation via @playwright/mcp (accessibility snapshots)",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    env: {},
    defaultEnabled: true,
    docs: "https://github.com/microsoft/playwright-mcp",
  },
  "brave-search": {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via @modelcontextprotocol/server-brave-search (needs BRAVE_API_KEY)",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: {},
    secretKeys: ["BRAVE_API_KEY"],
    defaultEnabled: false,
    docs: "https://github.com/modelcontextprotocol/servers",
  },
  fetch: {
    id: "fetch",
    name: "Fetch",
    description: "HTTP page fetch MCP (npx @modelcontextprotocol/server-fetch when published; override command if needed)",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    env: {},
    defaultEnabled: false,
    docs: "https://github.com/modelcontextprotocol/servers",
  },
  filesystem: {
    id: "filesystem",
    name: "Filesystem",
    description: "Optional MCP filesystem server (scoped roots)",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    env: {},
    defaultEnabled: false,
    docs: "https://github.com/modelcontextprotocol/servers",
  },
};

export function listPresets() {
  return Object.values(PRESETS);
}

export function getPreset(id) {
  return PRESETS[id] || null;
}

export function serverFromPreset(presetId, overrides = {}) {
  const preset = getPreset(presetId);
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

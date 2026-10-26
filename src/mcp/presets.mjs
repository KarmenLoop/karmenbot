// Built-in MCP server presets. Playwright is Wave1 P0 (OSS: microsoft/playwright-mcp
// / @playwright/mcp, Apache-2.0). filesystem and fetch are optional helpers.

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
  filesystem: {
    id: "filesystem",
    name: "Filesystem",
    description: "Optional MCP filesystem server (scoped roots)",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    // Caller must append allowed roots as trailing args.
    env: {},
    defaultEnabled: false,
    docs: "https://github.com/modelcontextprotocol/servers",
  },
  fetch: {
    id: "fetch",
    name: "Fetch",
    description: "Optional HTTP fetch MCP server",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
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

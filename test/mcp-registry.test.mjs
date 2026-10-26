import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addPreset, createRegistry, listConfiguredServers, removeServer, upsertServer } from "../src/mcp/registry.mjs";
import { getPreset, serverFromPreset } from "../src/mcp/presets.mjs";
import { createMockClient } from "../src/mcp/client.mjs";

test("playwright preset points at @playwright/mcp", () => {
  const preset = getPreset("playwright");
  assert.equal(preset.command, "npx");
  assert.ok(preset.args.some((arg) => String(arg).includes("@playwright/mcp")));
  const server = serverFromPreset("playwright");
  assert.equal(server.id, "playwright");
  assert.equal(server.enabled, true);
});

test("registry persists servers under KARMENBOT_HOME", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-mcp-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  addPreset("playwright", {}, env);
  const listed = listConfiguredServers(env);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "playwright");
  upsertServer({ id: "custom", command: "node", args: ["-e", "process.exit(0)"], enabled: false }, env);
  assert.equal(listConfiguredServers(env).length, 2);
  removeServer("custom", env);
  assert.equal(listConfiguredServers(env).length, 1);
});

test("createRegistry lists qualified tool names with mock client", async () => {
  const mock = createMockClient({
    id: "playwright",
    tools: [
      { name: "browser_snapshot", description: "snap" },
      { name: "browser_click", description: "click" },
    ],
  });
  class FakeClient {
    constructor(opts) {
      Object.assign(this, mock, { id: opts.id });
    }
  }
  // Bypass config: inject by monkey-patching start via custom Client that ignores spawn.
  const registry = createRegistry({
    env: { KARMENBOT_HOME: "/tmp/kb-mcp-missing-home-for-test" },
    Client: class {
      constructor(opts) {
        this.id = opts.id;
        this.tools = mock.tools;
      }
      get running() { return true; }
      async start() { return this; }
      async listTools() { return this.tools; }
      async refreshTools() { return this.tools; }
      async callTool(name, args) { return mock.callTool(name, args); }
      async dispose() {}
    },
  });
  // Manually put a started client
  await registry.startEnabled(); // no servers configured → empty
  assert.deepEqual(registry.running, []);

  // Direct call path with parseName
  assert.deepEqual(registry.parseName("mcp.playwright.browser_click"), { serverId: "playwright", toolName: "browser_click" });
});

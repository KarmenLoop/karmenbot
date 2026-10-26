import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getConnectorPreset,
  listConnectorPresets,
  resolveConnectorId,
  serverFromConnectorPreset,
} from "../src/connectors/presets.mjs";
import { connectorDoctor, hasMcpClient, isConnectorName } from "../src/connectors/status.mjs";
import {
  getConfiguredServer,
  listConfiguredServers,
  normalizeServer,
  removeServer,
  upsertServer,
  saveMcpSecret,
  readMcpSecret,
  upsertViaRegistryOrHome,
} from "../src/mcp/home-servers.mjs";
import { loadConfig } from "../src/home.mjs";

test("connector aliases resolve", () => {
  assert.equal(resolveConnectorId("mail"), "gmail");
  assert.equal(resolveConnectorId("Gmail"), "gmail");
  assert.equal(resolveConnectorId("calendar"), "google-calendar");
  assert.equal(resolveConnectorId("google-calendar"), "google-calendar");
  assert.equal(resolveConnectorId("feishu"), null);
  assert.ok(isConnectorName("gmail"));
  assert.equal(listConnectorPresets().length, 2);
});

test("serverFromConnectorPreset matches Wave1 mcp.servers shape", () => {
  const entry = serverFromConnectorPreset("gmail");
  assert.equal(entry.id, "gmail");
  assert.equal(entry.preset, "gmail");
  assert.equal(entry.command, "npx");
  assert.deepEqual(entry.args, ["-y", "google-services-mcp"]);
  assert.equal(entry.enabled, true);
  const normalized = normalizeServer(entry);
  assert.deepEqual(normalized.id, entry.id);
  assert.ok(getConnectorPreset("mail").remoteUrl.includes("gmailmcp.googleapis.com"));
  assert.ok(getConnectorPreset("calendar").remoteUrl.includes("calendarmcp.googleapis.com"));
});

test("upsert into home mcp.servers and secrets without live credentials", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-conn-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };

  const entry = serverFromConnectorPreset("google-calendar", { enabled: true });
  const result = await upsertViaRegistryOrHome(entry, {
    GOOGLE_MCP_CLIENT_ID: "cid",
    GOOGLE_MCP_CLIENT_SECRET: "csecret",
  }, env);
  assert.ok(["home", "registry"].includes(result.via), result.via);
  assert.equal(getConfiguredServer("google-calendar", env).command, "npx");
  assert.equal(listConfiguredServers(env).length, 1);
  assert.equal(loadConfig(env).mcp.servers[0].preset, "google-calendar");
  assert.deepEqual(readMcpSecret("google-calendar", env), {
    GOOGLE_MCP_CLIENT_ID: "cid",
    GOOGLE_MCP_CLIENT_SECRET: "csecret",
  });

  const stat = await fs.stat(path.join(home, "secrets.json"));
  assert.equal(stat.mode & 0o777, 0o600);

  removeServer("google-calendar", env);
  assert.equal(getConfiguredServer("google-calendar", env), null);
  assert.deepEqual(readMcpSecret("google-calendar", env), {});
});

test("connector doctor reports configured gmail with mcp client ready", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-conn-doc-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  upsertServer(serverFromConnectorPreset("gmail"), env);
  saveMcpSecret("gmail", { GOOGLE_MCP_CLIENT_ID: "x" }, env);

  const report = connectorDoctor(env);
  // After #5 lands, MCP client module is present.
  assert.equal(hasMcpClient(), true);
  assert.equal(report.mcpClient, true);
  const gmail = report.connectors.find((row) => row.id === "gmail");
  assert.equal(gmail.configured, true);
  assert.equal(gmail.hasSecrets, true);
  assert.match(gmail.runtime, /mcp-client-ready/);
  const cal = report.connectors.find((row) => row.id === "google-calendar");
  assert.equal(cal.configured, false);
});

test("connect gmail --dry-run does not write config", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-conn-dry-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const env = { KARMENBOT_HOME: home };
  const { run } = await import("../src/commands/connect.mjs");
  const chunks = [];
  const ctx = {
    args: ["gmail"],
    opts: { dryRun: true },
    env,
    t: { lang: "en" },
    stdin: { isTTY: false },
    stdout: { write(s) { chunks.push(s); } },
    stderr: { write() {} },
    io: { answers: [] },
  };
  const code = await run(ctx);
  assert.equal(code, 0);
  assert.equal(listConfiguredServers(env).length, 0);
  assert.ok(chunks.join("").includes("google-services-mcp") || chunks.join("").includes("dry-run"));
});

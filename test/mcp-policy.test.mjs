import assert from "node:assert/strict";
import test from "node:test";
import { classifyTool, mayAutoAccept, requiresDecide, pauseForTool } from "../src/mcp/policy.mjs";
import { invokeMcpTool, wrapDecide } from "../src/mcp/bridge.mjs";
import { createMockClient } from "../src/mcp/client.mjs";

test("classifyTool maps read / write / submit", () => {
  assert.equal(classifyTool("browser_snapshot"), "read");
  assert.equal(classifyTool("list_directory"), "read");
  assert.equal(classifyTool("browser_click"), "write");
  assert.equal(classifyTool("browser_type"), "write");
  assert.equal(classifyTool("browser_navigate"), "write");
  assert.equal(classifyTool("form_submit"), "submit");
  assert.equal(classifyTool("send_message"), "submit");
  assert.equal(classifyTool("checkout_pay"), "submit");
  assert.equal(classifyTool("delete_file"), "submit");
  assert.equal(classifyTool("user_login"), "submit");
  assert.equal(classifyTool("mystery_tool"), "write");
  assert.equal(classifyTool("x", { readOnlyHint: true }), "read");
  assert.equal(classifyTool("x", { destructiveHint: true }), "submit");
});

test("--yes never auto-accepts submit-class MCP", () => {
  assert.equal(mayAutoAccept("read", { yes: true }), true);
  assert.equal(mayAutoAccept("write", { yes: true }), true);
  assert.equal(mayAutoAccept("submit", { yes: true }), false);
  assert.equal(mayAutoAccept("submit", { yes: false }), false);
  assert.equal(requiresDecide("submit", { yes: true }), true);
  assert.equal(requiresDecide("write", { yes: true }), false);
  assert.equal(requiresDecide("write", { yes: false }), true);
});

test("pauseForTool uses kind mcp", () => {
  const pause = pauseForTool({ serverId: "playwright", toolName: "browser_click", args: { ref: "1" }, tier: "write" });
  assert.equal(pause.kind, "mcp");
  assert.equal(pause.name, "mcp.playwright.browser_click");
});

test("invokeMcpTool denies submit without decide accept", async () => {
  const mock = createMockClient({
    id: "playwright",
    tools: [{ name: "form_submit", description: "submit" }],
  });
  const registry = {
    parseName: (name) => {
      const m = /^mcp\.([^.]+)\.(.+)$/.exec(name);
      return m ? { serverId: m[1], toolName: m[2] } : null;
    },
    listTools: () => mock.tools.map((tool) => ({ ...tool, serverId: "playwright", qualifiedName: `mcp.playwright.${tool.name}` })),
    callTool: (name, args) => mock.callTool(name.replace(/^mcp\.playwright\./, ""), args),
  };
  const denied = await invokeMcpTool({
    registry,
    qualifiedName: "mcp.playwright.form_submit",
    args: { ok: true },
    decide: async () => ({ accept: false }),
    yes: true,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.denied, true);
  assert.equal(denied.tier, "submit");
  assert.equal(mock._state.calls.length, 0);

  const allowed = await invokeMcpTool({
    registry,
    qualifiedName: "mcp.playwright.form_submit",
    args: { ok: true },
    decide: async () => ({ accept: true }),
    yes: true,
  });
  assert.equal(allowed.ok, true);
  assert.equal(mock._state.calls.length, 1);
});

test("wrapDecide forwards mcp pauses and preserves others", async () => {
  const seen = [];
  const decide = wrapDecide(async (pause) => {
    seen.push(pause.kind);
    return { accept: pause.kind === "mcp" };
  }, { yes: false });
  assert.deepEqual(await decide({ kind: "change", path: "a" }), { accept: false });
  assert.deepEqual(await decide({ kind: "mcp", tier: "write", tool: "browser_click" }), { accept: true });
  assert.deepEqual(seen, ["change", "mcp"]);
  const auto = wrapDecide(async () => ({ accept: false }), { yes: true });
  assert.deepEqual(await auto({ kind: "mcp", tier: "read", tool: "browser_snapshot" }), { accept: true, auto: true });
  assert.deepEqual(await auto({ kind: "mcp", tier: "submit", tool: "pay_now" }), { accept: false });
});

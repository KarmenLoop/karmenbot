import assert from "node:assert/strict";
import test from "node:test";
import { createMockClient } from "../src/mcp/client.mjs";

test("createMockClient records calls", async () => {
  const client = createMockClient({
    id: "mock",
    tools: [{ name: "ping" }],
    callImpl: async (name, args) => ({ content: [{ type: "text", text: `pong:${args.n}` }] }),
  });
  await client.start();
  const tools = await client.listTools();
  assert.equal(tools.length, 1);
  const result = await client.callTool("ping", { n: 3 });
  assert.equal(result.content[0].text, "pong:3");
  assert.equal(client._state.calls[0].name, "ping");
  await client.dispose();
});

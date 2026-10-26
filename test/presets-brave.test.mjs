import assert from "node:assert/strict";
import test from "node:test";
import { listPresets, getPreset } from "../src/mcp/presets.mjs";

test("brave-search preset is first-class", () => {
  const ids = listPresets().map((p) => p.id);
  assert.ok(ids.includes("brave-search"), ids.join(","));
  const p = getPreset("brave-search");
  assert.equal(p.command, "npx");
  assert.ok(p.args.some((a) => String(a).includes("server-brave-search")));
  assert.ok(Array.isArray(p.secretKeys) && p.secretKeys.includes("BRAVE_API_KEY"));
});

test("fetch preset still listed", () => {
  assert.ok(listPresets().some((p) => p.id === "fetch"));
});

import assert from "node:assert/strict";
import test from "node:test";
import { looksLikeSecret, sanitizeMemoryText, assertSafeToStore } from "../src/memory/sanitize.mjs";

test("looksLikeSecret catches keys and tokens", () => {
  assert.equal(looksLikeSecret("sk-abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(looksLikeSecret("Authorization: Bearer abc.def.ghi"), true);
  assert.equal(looksLikeSecret("api_key=supersecretvalue"), true);
  assert.equal(looksLikeSecret("Prefers concise Chinese replies"), false);
});

test("sanitizeMemoryText drops secret lines", () => {
  const text = sanitizeMemoryText("Prefers tea\napiKey: sk-abcdefghijklmnopqrstuvwxyz\nLikes cats");
  assert.match(text, /Prefers tea/);
  assert.match(text, /Likes cats/);
  assert.doesNotMatch(text, /sk-/);
});

test("assertSafeToStore throws on secrets", () => {
  assert.throws(() => assertSafeToStore("ghp_abcdefghijklmnopqrstuvwxyzab"), /API|密钥|token/i);
});

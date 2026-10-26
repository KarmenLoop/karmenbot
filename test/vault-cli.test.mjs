import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { saveSecret } from "../src/home.mjs";
import { createT } from "../src/i18n.mjs";
import { hasVaultKey, listVaultKeys, unsetVaultKey, run } from "../src/commands/vault.mjs";

function tempEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-vault-"));
  return { dir, env: { KARMENBOT_HOME: path.join(dir, ".karmenbot"), HOME: dir } };
}

function ctxFor(env, args, opts = {}) {
  const chunks = [];
  return {
    ctx: {
      args,
      opts,
      env,
      t: createT("en"),
      stdin: { isTTY: false },
      stdout: { write: (s) => chunks.push(s), isTTY: false },
      stderr: { write: () => {}, isTTY: false },
      io: {},
    },
    out: () => chunks.join(""),
  };
}

test("listVaultKeys lists group.id without values", () => {
  const { dir, env } = tempEnv();
  try {
    saveSecret("models", "demo", { apiKey: "sk-secret-should-not-appear" }, env);
    saveSecret("platforms", "telegram", { token: "123:abc" }, env);
    saveSecret("mcp", "brave-search", { BRAVE_API_KEY: "brave" }, env);
    saveSecret("voice", "apiKey", "voice-secret", env);
    const keys = listVaultKeys(env);
    assert.deepEqual(keys, ["mcp.brave-search", "models.demo", "platforms.telegram", "voice.apiKey"]);
    assert.ok(hasVaultKey("models", "demo", env));
    assert.ok(!hasVaultKey("models", "missing", env));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("unsetVaultKey removes entry", () => {
  const { dir, env } = tempEnv();
  try {
    saveSecret("models", "x", { apiKey: "a" }, env);
    assert.equal(unsetVaultKey("models", "x", env), true);
    assert.equal(hasVaultKey("models", "x", env), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("vault command list / has / unset --yes / get refused", async () => {
  const { dir, env } = tempEnv();
  try {
    saveSecret("models", "demo", { apiKey: "sk-hidden" }, env);
    const list = ctxFor(env, ["list"]);
    assert.equal(await run(list.ctx), 0);
    assert.match(list.out(), /models\.demo/);
    assert.doesNotMatch(list.out(), /sk-hidden/);

    const has = ctxFor(env, ["has", "models", "demo"]);
    assert.equal(await run(has.ctx), 0);
    const missing = ctxFor(env, ["has", "models", "nope"]);
    assert.equal(await run(missing.ctx), 1);

    const unset = ctxFor(env, ["unset", "models", "demo"], { yes: true });
    assert.equal(await run(unset.ctx), 0);
    assert.equal(hasVaultKey("models", "demo", env), false);

    const get = ctxFor(env, ["get", "models", "demo"]);
    await assert.rejects(async () => run(get.ctx), (err) => {
      assert.equal(err.key, "err.failed");
      assert.match(err.vars.message, /vault get is disabled/);
      return true;
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

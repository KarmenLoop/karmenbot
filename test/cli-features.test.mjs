import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { runCli } from "../src/cli.mjs";

async function cli(argv, env) {
  let out = "";
  let err = "";
  const stdout = new Writable({ write(chunk, _e, cb) { out += chunk; cb(); } });
  const stderr = new Writable({ write(chunk, _e, cb) { err += chunk; cb(); } });
  const code = await runCli(argv, { stdin: { isTTY: false }, stdout, stderr, env });
  return { code, out, err };
}

test("version names the site, and editor, memory, and ci work without a model", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-feat-"));
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "kb-feat-work-"));
  t.after(() => Promise.all([fs.rm(home, { recursive: true, force: true }), fs.rm(work, { recursive: true, force: true })]));
  const env = { KARMENBOT_HOME: home };
  const version = await cli(["version"], env);
  assert.match(version.out, /karmenbot 0\.1\.1/);
  assert.match(version.out, /https:\/\/karmenloop\.com\/updates\.html/);
  assert.match(version.out, /info@karmenloop\.com/);

  const editor = await cli(["editor", "zed"], { ...env });
  assert.match(editor.out, /karmenbot/);
  assert.match(editor.out, /"acp"/);

  const added = await cli(["-w", work, "memory", "add", "ship the notes on Friday"], env);
  assert.equal(added.code, 0);
  const shown = await cli(["-w", work, "memory", "search", "Friday"], env);
  assert.match(shown.out, /ship the notes on Friday/);

  const ci = await cli(["-w", work, "ci", "init"], env);
  assert.equal(ci.code, 0);
  const yaml = await fs.readFile(path.join(work, ".github", "workflows", "karmenbot.yml"), "utf8");
  assert.match(yaml, /karmenbot review/);
});

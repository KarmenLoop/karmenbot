import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { runCli } from "../src/cli.mjs";
import { addModel } from "../src/models.mjs";
import { createMoaProvider } from "../src/moa.mjs";
import { openAiServer } from "./mock/servers.mjs";

function sink() {
  let text = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  return { stream, read: () => text };
}

async function home(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-cli-"));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "kb-cli-ws-"));
  t.after(() => Promise.all([fs.rm(dir, { recursive: true, force: true }), fs.rm(workspace, { recursive: true, force: true })]));
  return { env: { KARMENBOT_HOME: dir, PATH: process.env.PATH }, dir, workspace };
}

async function cli(argv, { env, cwd, answers, fetchImpl } = {}) {
  const out = sink();
  const err = sink();
  const code = await runCli(argv, { stdin: { isTTY: false, [Symbol.asyncIterator]: async function* () {} }, stdout: out.stream, stderr: err.stream, env, cwd, answers, fetchImpl });
  return { code, out: out.read(), err: err.read() };
}

test("MoA provider: advisors run without tools once per turn, failures are skipped, usage adds up", async () => {
  const seen = { a: [], b: [], agg: [] };
  const reference = (name, reply) => ({ name, provider: { async complete(request) { seen[name].push(request); return reply(request); } } });
  const progress = [];
  const moa = createMoaProvider({
    references: [reference("a", () => ({ text: "先读 README", usage: { prompt: 100, completion: 10 } })), reference("b", () => { throw new Error("rate limited"); })],
    aggregator: { name: "agg", provider: { model: "agg-model", async complete(request) { seen.agg.push(request); return { text: "done", toolCalls: [], usage: { prompt: 50, completion: 5 } }; } } },
    onProgress: (event) => progress.push(event.phase),
  });
  const messages = [{ role: "system", content: "你是 Karmen" }, { role: "user", content: "整理项目" }];
  const first = await moa.complete({ messages, tools: [{ name: "read_file" }] });
  assert.deepEqual(first.usage, { prompt: 150, completion: 15 }, "advisor tokens are counted");
  assert.deepEqual(seen.a[0].tools, [], "advisors get no tools");
  assert.match(seen.a[0].messages.at(-1).content, /参考顾问/);
  assert.match(seen.agg[0].messages[0].content, /参考意见[\s\S]*先读 README[\s\S]*rate limited/);
  assert.deepEqual(seen.agg[0].tools, [{ name: "read_file" }]);
  const more = [...messages, { role: "assistant", content: "", toolCalls: [{ id: "1", name: "read_file", arguments: { path: "README.md" } }] }, { role: "tool", name: "read_file", toolCallId: "1", content: "# demo" }];
  const second = await moa.complete({ messages: more, tools: [] });
  assert.equal(seen.a.length, 1, "same user turn: advisors are not asked again");
  assert.deepEqual(second.usage, { prompt: 50, completion: 5 });
  await moa.complete({ messages: [...more, { role: "assistant", content: "ok" }, { role: "user", content: "再看看测试" }], tools: [] });
  assert.equal(seen.a.length, 2, "a new user message asks again");
  assert.match(seen.a[1].messages.find((m) => m.content.includes("[工具 read_file 的结果]")).content, /# demo/, "tool traffic becomes plain text for advisors");
  assert.ok(progress.includes("consult") && progress.includes("aggregate"));

  const lonely = createMoaProvider({
    references: [reference("b", () => { throw new Error("down"); })],
    aggregator: { name: "agg", provider: { async complete(request) { return { text: request.messages[0].content.includes("参考意见") ? "saw advice" : "alone", toolCalls: [] }; } } },
  });
  assert.equal((await lonely.complete({ messages, tools: [] })).text, "alone", "when every advisor fails the aggregator works alone");
});

test("MoA end to end: three configured models behind an OpenAI-compatible server, through the real kernel", async (t) => {
  const { env, workspace } = await home(t);
  const calls = [];
  const server = await openAiServer((body, req) => {
    calls.push({ model: body.model, tools: body.tools?.length || 0, system: body.messages[0]?.content || "", auth: req.headers.authorization });
    if (body.model === "ref-1") return { text: "建议：写一个 notes.md，列三条要点。" };
    if (body.model === "ref-2") return { text: "建议：文件名用 notes.md。" };
    const step = calls.filter((call) => call.model === "agg").length;
    return step === 1 ? { text: "", toolCalls: [{ id: "w1", name: "write_file", arguments: { path: "notes.md", content: "- a\n- b\n- c\n" } }] } : { text: "已写好 notes.md。" };
  });
  t.after(() => server.close());
  for (const [id, model, key] of [["r1", "ref-1", "k1"], ["r2", "ref-2", "k2"], ["agg", "agg", "k3"]]) addModel({ id, name: id.toUpperCase(), model, baseUrl: `${server.url}/v1` }, { apiKey: key }, env);
  const moa = await cli(["moa", "setup"], { env, answers: ["1,2", "3", "1"] });
  assert.equal(moa.code, 0, moa.err);
  assert.match(moa.out, /MoA 已配置：R1、R2 → AGG，每回合一次/);
  const run = await cli(["--yes", "-w", workspace, "写一份笔记"], { env });
  assert.equal(run.code, 0, run.err);
  assert.match(run.out, /已写好 notes\.md/);
  assert.equal(await fs.readFile(path.join(workspace, "notes.md"), "utf8"), "- a\n- b\n- c\n");
  const refs = calls.filter((call) => call.model.startsWith("ref-"));
  assert.equal(refs.length, 2, "each advisor once for the single user turn");
  assert.ok(refs.every((call) => call.tools === 0));
  const agg = calls.filter((call) => call.model === "agg");
  assert.equal(agg.length, 2);
  assert.ok(agg[0].tools > 0 && /参考意见[\s\S]*notes\.md/.test(agg[0].system));
  assert.deepEqual(new Set(calls.map((call) => call.auth)), new Set(["Bearer k1", "Bearer k2", "Bearer k3"]), "each model uses its own key");
  const off = await cli(["moa", "off"], { env });
  assert.match(off.out, /MoA 已关闭/);
});

test("model add stores the key only in secrets.json (600) and model list masks nothing it should not show", async (t) => {
  const { env, dir } = await home(t);
  const added = await cli(["model", "add"], { env, answers: ["13", "", "sk-test-1234", "n"] });
  assert.equal(added.code, 0, added.err);
  assert.match(added.out, /已添加模型 DeepSeek/);
  const config = await fs.readFile(path.join(dir, "config.json"), "utf8");
  assert.ok(!config.includes("sk-test-1234"), "no key in config.json");
  const secrets = JSON.parse(await fs.readFile(path.join(dir, "secrets.json"), "utf8"));
  assert.equal(secrets.models.deepseek.apiKey, "sk-test-1234");
  assert.equal((await fs.stat(path.join(dir, "secrets.json"))).mode & 0o777, 0o600);
  assert.ok(!added.out.includes("sk-test-1234"), "the key is never echoed");
  const list = await cli(["model", "list"], { env });
  assert.match(list.out, /\* deepseek/);
  assert.ok(!list.out.includes("sk-test"));
});

test("connect telegram, then pair approve, then gateway status", async (t) => {
  const { env } = await home(t);
  const bad = await cli(["connect", "telegram"], { env, answers: ["not-a-token"] });
  assert.equal(bad.code, 1);
  const ok = await cli(["connect", "telegram"], { env, answers: ["123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"] });
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /Telegram 已接入/);
  const status = await cli(["gateway", "status"], { env });
  assert.match(status.out, /已接入: Telegram/);
  const { createPairing } = await import("../src/gateway/pairing.mjs");
  const { code } = createPairing({ env }).request("telegram", "42", "ann");
  const approved = await cli(["pair", "approve", code], { env });
  assert.equal(approved.code, 0);
  assert.match(approved.out, /已授权 Telegram 账号 42/);
  assert.match((await cli(["pair", "list"], { env })).out, /✓ 42 \(ann\)/);
  assert.equal((await cli(["pair", "approve", "ZZZZZZZZ"], { env })).code, 1);
});

test("help, version, unknown commands and doctor", async (t) => {
  const { env } = await home(t);
  assert.match((await cli(["--version"], { env })).out, /^karmenbot 0\.1\.1/);
  assert.match((await cli(["help"], { env })).out, /karmenbot connect/);
  assert.match((await cli(["help", "--lang", "en"], { env })).out, /karmenbot ask "question"/);
  const unknown = await cli(["frobnicate"], { env });
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /没有这个命令/);
  const doctor = await cli(["doctor"], { env });
  assert.match(doctor.out, /内核快照 (\d+)\/\1/);
  assert.match(doctor.out, /模型 未配置/);
});

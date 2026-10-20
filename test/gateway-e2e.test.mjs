import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { runCli } from "../src/cli.mjs";
import { createPairing } from "../src/gateway/pairing.mjs";
import { saveConfig, saveSecret } from "../src/home.mjs";
import { addModel } from "../src/models.mjs";
import { httpServer, openAiServer } from "./mock/servers.mjs";
import { until } from "./vt.mjs";

function sink() {
  let text = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        text += chunk.toString();
        callback();
      },
    }),
    read: () => text,
  };
}

// A real background `karmenbot gateway` process: the model and Telegram are
// local stand-ins, everything else (kernel, adapter, approvals) is the product.
test("gateway start → chat task → approval in chat → file written → gateway stop", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-e2e-home-"));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "kb-e2e-ws-"));
  const env = { ...process.env, KARMENBOT_HOME: home };
  delete env.KARMENBOT_MODEL;
  let step = 0;
  const model = await openAiServer(() => {
    step += 1;
    return step === 1
      ? { text: "", toolCalls: [{ id: "w1", name: "write_file", arguments: { path: "hello.txt", content: "来自手机的问候\n" } }] }
      : { text: "已写好 hello.txt。" };
  });
  const updates = [];
  const sent = [];
  let nextId = 1;
  const telegram = await httpServer(async (req) => {
    if (req.path.endsWith("/getMe")) return { ok: true, result: { id: 1, username: "karmen_bot" } };
    if (req.path.endsWith("/sendMessage")) {
      sent.push(req.body);
      return { ok: true, result: {} };
    }
    if (req.path.endsWith("/getUpdates")) {
      const offset = req.body.offset || 0;
      for (let i = 0; i < 20 && !updates.some((u) => u.update_id >= offset); i += 1) await new Promise((resolve) => setTimeout(resolve, 25));
      return { ok: true, result: updates.filter((u) => u.update_id >= offset) };
    }
    return { status: 404, json: { ok: false } };
  });
  const say = (from, text) => updates.push({ update_id: nextId++, message: { message_id: nextId, from: { id: from, username: `u${from}` }, chat: { id: from, type: "private" }, text } });
  const saw = (chat, fragment) => until(() => sent.some((m) => String(m.chat_id) === String(chat) && m.text.includes(fragment)), fragment, 15000);

  addModel({ id: "mock", name: "Mock", model: "mock-1", baseUrl: `${model.url}/v1` }, { apiKey: "k" }, env);
  saveConfig({ gateway: { workspace, platforms: { telegram: { enabled: true, apiBase: telegram.url } } } }, env);
  saveSecret("platforms", "telegram", { token: "123:abc" }, env);
  createPairing({ env }).approve("telegram", "7", "owner");

  const io = (out = sink()) => ({ stdin: { isTTY: false }, stdout: out.stream, stderr: out.stream, env, cwd: workspace, out });
  t.after(async () => {
    await runCli(["gateway", "stop"], io());
    await telegram.close();
    await model.close();
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const start = io();
  assert.equal(await runCli(["gateway", "start"], start), 0, start.out.read());
  assert.match(start.out.read(), /网关已在后台运行（进程 \d+）/);
  const status = io();
  await runCli(["gateway", "status"], status);
  assert.match(status.out.read(), /● 运行中/);

  say(99, "你好");
  await saw(99, "karmenbot pair approve");
  say(7, "写一个 hello.txt");
  await saw(7, "我想修改文件 hello.txt");
  await assert.rejects(fs.access(path.join(workspace, "hello.txt")), "nothing is written before approval");
  say(7, "批准");
  await saw(7, "已写好 hello.txt。");
  assert.equal(await fs.readFile(path.join(workspace, "hello.txt"), "utf8"), "来自手机的问候\n");
  assert.ok(sent.some((m) => m.text === "已执行。"));

  const stop = io();
  assert.equal(await runCli(["gateway", "stop"], stop), 0);
  assert.match(stop.out.read(), /网关已停止/);
  await assert.rejects(fs.access(path.join(home, "gateway.pid")));
  const log = await fs.readFile(path.join(home, "logs", "gateway.log"), "utf8");
  assert.match(log, /karmenbot gateway 0\.1\.1 · telegram · Mock/);
  assert.match(log, /unpaired sender 99 code=[A-Z0-9]{8}/);
  assert.match(log, /gateway stopped/);
  assert.ok(!log.includes("123:abc"), "the bot token never reaches the log");
});

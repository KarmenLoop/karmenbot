import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openAgent } from "../src/agent.mjs";
import { createGateway } from "../src/gateway/core.mjs";
import { createPairing } from "../src/gateway/pairing.mjs";
import { decodeFrame, encodeFrame, headerOf } from "../src/gateway/proto.mjs";
import { chunkText, readChoice, readVerdict, readSendVerdict } from "../src/gateway/text.mjs";
import { createT } from "../src/i18n.mjs";
import { until } from "./vt.mjs";

test("long replies split under the limit, keep code fences balanced and number the parts", () => {
  const text = `开头\n\`\`\`js\n${"const a = 1;\n".repeat(80)}\`\`\`\n结尾 ${"字".repeat(300)}`;
  const parts = chunkText(text, 400);
  assert.ok(parts.length > 2);
  for (const part of parts) {
    assert.ok(part.length <= 400, `part too long: ${part.length}`);
    assert.equal((part.match(/^\s*```/gm) || []).length % 2, 0, `unbalanced fence in:\n${part}`);
  }
  assert.match(parts[0], /\(1\/\d+\)$/);
  assert.deepEqual(chunkText("短消息", 400), ["短消息"]);
  assert.deepEqual(chunkText("   ", 400), []);
});

test("only exact approve / deny words count as a verdict", () => {
  for (const word of ["批准", "是", "y", "YES", "ok", "/approve", "同意。", "👍"]) assert.equal(readVerdict(word), "approve", word);
  for (const word of ["拒绝", "否", "n", "no", "/deny", "取消"]) assert.equal(readVerdict(word), "deny", word);
  for (const word of ["好的我看看再说", "ok but change the name", "", "批准吧但是先等等"]) assert.equal(readVerdict(word), null, word);
  assert.equal(readChoice("2", 3), 1);
  assert.equal(readChoice("4", 3), null);
  for (const word of ["发送", "send", "/send", "发吧", "批准"]) assert.equal(readSendVerdict(word), "approve", word);
  assert.equal(readSendVerdict("拒绝"), "deny");
  assert.equal(readSendVerdict("发一下看看"), null);
});

test("Feishu frames survive an encode/decode round trip, including 64-bit log ids", () => {
  const frame = { SeqID: 7n, LogID: 18446744073709551615n, service: 3, method: 1, headers: [{ key: "type", value: "event" }, { key: "message_id", value: "m-1" }], payload: new TextEncoder().encode('{"code":200}'), LogIDNew: "abc" };
  const back = decodeFrame(encodeFrame(frame));
  assert.equal(back.SeqID, 7n);
  assert.equal(back.LogID, 18446744073709551615n);
  assert.equal(back.service, 3);
  assert.equal(back.method, 1);
  assert.equal(headerOf(back, "message_id"), "m-1");
  assert.equal(new TextDecoder().decode(back.payload), '{"code":200}');
  assert.equal(back.LogIDNew, "abc");
});

test("pairing codes expire, are rate limited, and approve exactly one account", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-pair-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  let clock = 1_000_000;
  const pairing = createPairing({ env: { KARMENBOT_HOME: home }, now: () => clock });
  const first = pairing.request("telegram", "u1", "Ann");
  assert.match(first.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(first.fresh, true);
  assert.equal(pairing.request("telegram", "u1").fresh, false, "no second notice within 10 minutes");
  pairing.request("telegram", "u2");
  pairing.request("telegram", "u3");
  assert.equal(pairing.request("telegram", "u4"), null, "at most three pending codes");
  assert.equal(pairing.approveCode("WRONG123", ["telegram"]), null);
  assert.deepEqual(pairing.approveCode(first.code.toLowerCase(), ["telegram"]), { platform: "telegram", userId: "u1", name: "Ann" });
  assert.equal(pairing.isApproved("telegram", "u1"), true);
  assert.equal(pairing.isApproved("telegram", "u2"), false);
  clock += 61 * 60 * 1000;
  assert.equal(pairing.list(["telegram"])[0].pending.length, 0, "codes expire after an hour");
  const stat = await fs.stat(path.join(home, "pairing", "telegram.json"));
  assert.equal(stat.mode & 0o777, 0o600);
});

function fakeAdapter(limit = 4000) {
  const sent = [];
  let push = null;
  return {
    name: "fake",
    limit,
    sent,
    start({ onMessage, signal }) {
      push = onMessage;
      return new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
    },
    async send(chatId, text) {
      sent.push({ chatId, text });
    },
    async stop() {},
    deliver(msg) {
      push({ chatId: "c1", userId: "owner", isGroup: false, mentioned: true, messageId: String(Math.random()), ...msg });
    },
    texts: () => sent.map((item) => item.text),
  };
}

function scripted(...steps) {
  let step = 0;
  return {
    name: "scripted",
    async complete(request) {
      const next = steps[Math.min(step, steps.length - 1)];
      step += 1;
      return typeof next === "function" ? next(request) : next;
    },
  };
}

async function gatewayFor(t, provider, { approvalTimeoutMs = 2000, approved = ["owner"], draftThenSend = false } = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-gw-home-"));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "kb-gw-ws-"));
  const env = { KARMENBOT_HOME: home };
  const pairing = createPairing({ env });
  for (const id of approved) pairing.approve("fake", id);
  const adapter = fakeAdapter();
  const agent = await openAgent({ workspace, env, providerOverride: provider });
  // Existing e2e keep immediate send; draft-then-send covered in gateway-draft.test.mjs.
  const gateway = createGateway({ agent, adapters: { fake: adapter }, pairing, t: createT("zh"), approvalTimeoutMs, draftThenSend });
  const running = gateway.start();
  t.after(async () => {
    await gateway.stop();
    await running;
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  });
  return { adapter, pairing, workspace, gateway, saw: (text) => until(() => adapter.texts().some((item) => item.includes(text)), text) };
}

const writeCall = { text: "", toolCalls: [{ id: "w1", name: "write_file", arguments: { path: "hello.txt", content: "hello" } }] };

test("an unknown sender only gets a pairing code until the owner approves it", async (t) => {
  const g = await gatewayFor(t, scripted({ text: "你好呀", toolCalls: [] }), { approved: [] });
  g.adapter.deliver({ userId: "stranger", text: "帮我删掉所有文件" });
  await g.saw("karmenbot pair approve");
  const code = /approve ([A-Z0-9]{8})/.exec(g.adapter.texts()[0])[1];
  assert.equal(g.adapter.sent.length, 1, "nothing else was done for the stranger");
  assert.ok(g.pairing.approveCode(code, ["fake"]));
  g.adapter.deliver({ userId: "stranger", text: "你好" });
  await g.saw("你好呀");
});

test("an edit asked for in chat waits for 批准, then writes", async (t) => {
  const g = await gatewayFor(t, scripted(writeCall, { text: "写好了。", toolCalls: [] }));
  g.adapter.deliver({ text: "写一个 hello.txt" });
  await g.saw("我想修改文件 hello.txt");
  assert.ok(g.adapter.texts().some((text) => text.includes("+ hello")), "the diff preview is in the prompt");
  await assert.rejects(fs.access(path.join(g.workspace, "hello.txt")));
  g.adapter.deliver({ text: "批准" });
  await g.saw("写好了。");
  assert.equal(await fs.readFile(path.join(g.workspace, "hello.txt"), "utf8"), "hello");
  assert.ok(g.adapter.texts().includes("已执行。"));
});

test("拒绝 and silence both leave the file unwritten; other people cannot answer for the owner", async (t) => {
  const g = await gatewayFor(t, scripted(writeCall, { text: "那就不写了。", toolCalls: [] }), { approved: ["owner", "friend"] });
  g.adapter.deliver({ text: "写一个 hello.txt" });
  await g.saw("我想修改文件 hello.txt");
  g.adapter.deliver({ userId: "friend", text: "批准" });
  g.adapter.deliver({ text: "随便聊聊" });
  await g.saw("我还在等你确认上一步");
  g.adapter.deliver({ text: "拒绝" });
  await g.saw("好的，没有执行。");
  await g.saw("那就不写了。");
  await assert.rejects(fs.access(path.join(g.workspace, "hello.txt")));

  const quiet = await gatewayFor(t, scripted(writeCall, { text: "超时了。", toolCalls: [] }), { approvalTimeoutMs: 150 });
  quiet.adapter.deliver({ text: "写一个 hello.txt" });
  await quiet.saw("5 分钟没有收到确认");
  await quiet.saw("好的，没有执行。");
  await assert.rejects(fs.access(path.join(quiet.workspace, "hello.txt")));
});

test("commands wait for approval in chat and never run when denied", async (t) => {
  const marker = path.join(os.tmpdir(), `kb-gw-ran-${process.pid}-${Date.now()}`);
  const g = await gatewayFor(t, scripted({ text: "", toolCalls: [{ id: "s1", name: "shell", arguments: { command: `printf ran > ${JSON.stringify(marker)}` } }] }, { text: "好。", toolCalls: [] }));
  g.adapter.deliver({ text: "跑个命令" });
  await g.saw("我想运行这条命令");
  assert.ok(g.adapter.texts().some((text) => text.includes("printf ran")));
  g.adapter.deliver({ text: "no" });
  await g.saw("好。");
  await assert.rejects(fs.access(marker));
});

test("groups need a mention; a busy chat queues the next message; /stop and /new work", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const g = await gatewayFor(t, scripted(async () => {
    calls += 1;
    if (calls === 1) await gate;
    return { text: `第${calls}个回答`, toolCalls: [] };
  }));
  g.adapter.deliver({ chatId: "group", isGroup: true, mentioned: false, text: "大家好" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(g.adapter.sent.length, 0, "unmentioned group chatter is ignored");
  g.adapter.deliver({ text: "第一件事" });
  await until(() => calls === 1, "first turn running");
  g.adapter.deliver({ text: "第二件事" });
  await g.saw("收到，处理完上一件事就接着做。");
  release();
  await g.saw("第1个回答");
  await g.saw("第2个回答");
  g.adapter.deliver({ text: "/new" });
  await g.saw("已开始新的对话。");
  g.adapter.deliver({ text: "/help" });
  await g.saw("/new 新对话");
});

test("in groups only messages that mention Karmen reach the model", async (t) => {
  let calls = 0;
  const g = await gatewayFor(t, scripted(() => {
    calls += 1;
    return { text: "收到", toolCalls: [] };
  }));
  g.adapter.deliver({ chatId: "group", isGroup: true, mentioned: false, text: "今天谁值班" });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(calls, 0, "the model was not called");
  assert.equal(g.adapter.sent.length, 0);
  g.adapter.deliver({ chatId: "group", isGroup: true, mentioned: true, text: "Karmen 今天谁值班" });
  await g.saw("收到");
  assert.equal(calls, 1);
});

test("login requests are refused in chat without asking for a password", async (t) => {
  const g = await gatewayFor(t, scripted({ text: "", toolCalls: [{ id: "p1", name: "request_login", arguments: { service: "邮箱" } }] }));
  g.adapter.deliver({ text: "帮我登录邮箱" });
  await g.saw("不会在聊天里收集账号密码");
  assert.ok(!g.adapter.texts().some((text) => /密码[:：]\s*$/.test(text)));
});

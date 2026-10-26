import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGateway } from "../src/gateway/core.mjs";
import { readDraftAction, readSendVerdict } from "../src/gateway/text.mjs";
import { createPairing } from "../src/gateway/pairing.mjs";
import { createT } from "../src/i18n.mjs";
import { until } from "./vt.mjs";

function fakeAdapter() {
  const sent = [];
  let push = null;
  return {
    name: "fake",
    limit: 4000,
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

/** Minimal agent: one assistant reply, no vendor kernel. */
function mockAgent(replyText = "你好，这是草稿内容。") {
  return {
    current: { label: "mock" },
    diff: () => [],
    conversation: async () => ({
      turn: async (_text, { onEvent }) => {
        onEvent({ type: "message", message: { role: "assistant", content: replyText } });
        return { code: 0 };
      },
      cancel: async () => {},
      reset: async () => {},
    }),
  };
}

async function draftGateway(t, { draftThenSend = true, replyText } = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-draft-"));
  const env = { KARMENBOT_HOME: home };
  const pairing = createPairing({ env });
  pairing.approve("fake", "owner");
  const adapter = fakeAdapter();
  const gateway = createGateway({
    agent: mockAgent(replyText),
    adapters: { fake: adapter },
    pairing,
    t: createT("zh"),
    approvalTimeoutMs: 2000,
    draftThenSend,
  });
  const running = gateway.start();
  t.after(async () => {
    await gateway.stop();
    await running;
    await fs.rm(home, { recursive: true, force: true });
  });
  const saw = (text) => until(() => adapter.texts().some((item) => item.includes(text)), text);
  return { adapter, gateway, saw };
}

test("draft-then-send holds assistant reply until confirm", async (t) => {
  const g = await draftGateway(t);
  g.adapter.deliver({ text: "打招呼" });
  await g.saw("【待发送草稿】");
  await g.saw("你好，这是草稿内容。");
  await g.saw("回复「发送」");
  const before = g.adapter.sent.length;
  // Body must not have been sent as a standalone final message yet (only inside the draft card).
  assert.equal(g.adapter.texts().filter((x) => x === "你好，这是草稿内容。").length, 0);
  g.adapter.deliver({ text: "发送" });
  await until(() => g.adapter.texts().filter((x) => x === "你好，这是草稿内容。").length === 1, "final send");
  assert.ok(g.adapter.sent.length > before);
});

test("draft-then-send reject cancels without delivering the body alone", async (t) => {
  const g = await draftGateway(t, { replyText: "不该发出去的话" });
  g.adapter.deliver({ text: "写一句" });
  await g.saw("【待发送草稿】");
  await g.saw("不该发出去的话");
  g.adapter.deliver({ text: "拒绝" });
  await g.saw("已取消发送");
  assert.equal(g.adapter.texts().filter((x) => x === "不该发出去的话").length, 0);
});

test("draftThenSend false keeps legacy immediate send", async (t) => {
  const g = await draftGateway(t, { draftThenSend: false, replyText: "立刻发出" });
  g.adapter.deliver({ text: "hi" });
  await g.saw("立刻发出");
  assert.ok(!g.adapter.texts().some((x) => x.includes("【待发送草稿】")));
  assert.equal(g.adapter.texts().filter((x) => x === "立刻发出").length, 1);
});

test("approve word y also confirms a draft", async (t) => {
  const g = await draftGateway(t, { replyText: "用 y 确认" });
  g.adapter.deliver({ text: "请回复" });
  await g.saw("【待发送草稿】");
  g.adapter.deliver({ text: "y" });
  await until(() => g.adapter.texts().filter((x) => x === "用 y 确认").length === 1, "y send");
});

test("createGateway defaults draftThenSend to on", () => {
  const gateway = createGateway({
    agent: mockAgent(),
    adapters: {},
    pairing: { isApproved: () => false, request: () => null },
    t: createT("zh"),
  });
  assert.equal(gateway.draftThenSend, true);
});

test("readDraftAction parses send deny replace append", () => {
  assert.deepEqual(readDraftAction("发送"), { action: "send" });
  assert.deepEqual(readDraftAction("y"), { action: "send" });
  assert.deepEqual(readDraftAction("拒绝"), { action: "deny" });
  assert.deepEqual(readDraftAction("改 新正文"), { action: "replace", body: "新正文" });
  assert.deepEqual(readDraftAction("修改：替换稿"), { action: "replace", body: "替换稿" });
  assert.deepEqual(readDraftAction("edit: hello"), { action: "replace", body: "hello" });
  assert.deepEqual(readDraftAction("/edit  world"), { action: "replace", body: "world" });
  assert.deepEqual(readDraftAction("+ 尾巴"), { action: "append", body: "尾巴" });
  assert.deepEqual(readDraftAction("追加 more"), { action: "append", body: "more" });
  assert.equal(readDraftAction("editor says hi"), null);
  assert.equal(readDraftAction("改"), null);
  assert.equal(readSendVerdict("发送"), "approve");
});

test("draft replace then send delivers edited body only", async (t) => {
  const g = await draftGateway(t, { replyText: "原稿" });
  g.adapter.deliver({ text: "写一句" });
  await g.saw("【待发送草稿】");
  await g.saw("原稿");
  g.adapter.deliver({ text: "改 编辑后的稿" });
  await g.saw("编辑后的稿");
  // Edit alone must not final-send.
  assert.equal(g.adapter.texts().filter((x) => x === "编辑后的稿").length, 0);
  assert.equal(g.adapter.texts().filter((x) => x === "原稿").length, 0);
  g.adapter.deliver({ text: "发送" });
  await until(() => g.adapter.texts().filter((x) => x === "编辑后的稿").length === 1, "edited send");
  assert.equal(g.adapter.texts().filter((x) => x === "原稿").length, 0);
});

test("draft append then deny never delivers body alone", async (t) => {
  const g = await draftGateway(t, { replyText: "开头" });
  g.adapter.deliver({ text: "写" });
  await g.saw("【待发送草稿】");
  g.adapter.deliver({ text: "+ 续写" });
  await until(() => g.adapter.texts().some((x) => x.includes("开头") && x.includes("续写")), "appended card");
  g.adapter.deliver({ text: "拒绝" });
  await g.saw("已取消发送");
  assert.equal(g.adapter.texts().filter((x) => x === "开头").length, 0);
  assert.equal(g.adapter.texts().filter((x) => x === "开头\n续写").length, 0);
});

test("draft edit alone does not final-send", async (t) => {
  const g = await draftGateway(t, { replyText: "勿发" });
  g.adapter.deliver({ text: "请写" });
  await g.saw("【待发送草稿】");
  g.adapter.deliver({ text: "edit: still draft" });
  await g.saw("still draft");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(g.adapter.texts().filter((x) => x === "still draft").length, 0);
  assert.equal(g.adapter.texts().filter((x) => x === "勿发").length, 0);
});

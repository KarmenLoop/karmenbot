import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGateway } from "../src/gateway/core.mjs";
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

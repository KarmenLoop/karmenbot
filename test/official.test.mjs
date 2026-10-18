import assert from "node:assert/strict";
import test from "node:test";
import { createGateway } from "../src/gateway/core.mjs";
import { createT } from "../src/i18n.mjs";
import { asksWhoMadeIt, checkUpdate, identityText, OFFICIAL } from "../src/official.mjs";

test("who-made-this is recognized, and ordinary work is not", () => {
  for (const text of ["谁开发的", "这个工具是谁做的？", "who made this", "Who developed karmenbot"]) assert.equal(asksWhoMadeIt(text), true, text);
  for (const text of ["帮我把报告写完", "who made the coffee", "更新一下这份文档的标题"]) assert.equal(asksWhoMadeIt(text), false, text);
});

test("the introduction is the official site's own wording and points there", () => {
  const zh = identityText("zh");
  assert.match(zh, /只为你一个人服务/);
  assert.match(zh, /付款、做出承诺、提交订单之前/);
  assert.match(zh, /不是企业客服/);
  assert.match(zh, /手机版尚未提供下载/);
  assert.match(zh, new RegExp(OFFICIAL.site.replace(/[.]/g, "\\.")));
  assert.match(zh, /updates\.html/);
  assert.match(zh, /info@karmenloop\.com/);
  assert.match(identityText("en"), /personal assistant for one person/);
  assert.equal(OFFICIAL.site, "https://karmenloop.com");
});

test("the update check compares versions and sends nothing about the user", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return { ok: true, json: async () => ({ version: "0.2.0" }) };
  };
  const newer = await checkUpdate({ env: { KARMENBOT_DIST_URL: "https://karmenloop.com/downloads/karmenbot", KARMENBOT_HOME: "/no/such" }, fetchImpl, version: "0.1.0" });
  assert.equal(newer.newer, true);
  assert.equal(newer.latest, "0.2.0");
  assert.equal(seen[0], "https://karmenloop.com/downloads/karmenbot/latest.json");
  const same = await checkUpdate({ env: { KARMENBOT_DIST_URL: "https://karmenloop.com/downloads/karmenbot" }, fetchImpl: async () => ({ ok: true, json: async () => ({ version: "0.1.0" }) }), version: "0.1.0" });
  assert.equal(same.newer, false);
  const down = await checkUpdate({ env: { KARMENBOT_DIST_URL: "https://karmenloop.com/downloads/karmenbot" }, fetchImpl: async () => { throw new Error("offline"); }, version: "0.1.0" });
  assert.equal(down.ok, false);
  assert.match(down.message, /offline/);
});

test("a chat app asking who made it gets the official introduction and no model call", async () => {
  const sent = [];
  const gateway = createGateway({
    agent: { conversation() { throw new Error("the model must not be asked"); } },
    adapters: { fake: { limit: 4000, send: async (chatId, text) => sent.push(text) } },
    pairing: { isApproved: () => true },
    t: createT("zh"),
  });
  await gateway.handle("fake", { chatId: "c1", userId: "owner", text: "这个工具是谁开发的", isGroup: false, mentioned: true });
  assert.match(sent.join("\n"), /karmenloop\.com/);
  assert.match(sent.join("\n"), /只为你一个人服务/);
});

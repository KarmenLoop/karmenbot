import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDingtalk, registerDingtalkApp } from "../src/gateway/platforms/dingtalk.mjs";
import { DISCORD_INTENTS, createDiscord } from "../src/gateway/platforms/discord.mjs";
import { createFeishu, registerFeishuApp } from "../src/gateway/platforms/feishu.mjs";
import { createSlack } from "../src/gateway/platforms/slack.mjs";
import { createTelegram } from "../src/gateway/platforms/telegram.mjs";
import { createWecom, registerWecomBot } from "../src/gateway/platforms/wecom.mjs";
import { createWeixin, loginWeixin } from "../src/gateway/platforms/weixin.mjs";
import { createWhatsapp } from "../src/gateway/platforms/whatsapp.mjs";
import { FRAME_CONTROL, FRAME_DATA, decodeFrame, encodeFrame, headerOf } from "../src/gateway/proto.mjs";
import { acceptWebSocket, httpServer } from "./mock/servers.mjs";
import { until } from "./vt.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Starts an adapter, collects its messages, and stops it after the test.
function run(t, adapter) {
  const controller = new AbortController();
  const messages = [];
  const logs = [];
  const done = Promise.resolve(adapter.start({ signal: controller.signal, onMessage: (msg) => messages.push(msg), log: (level, text) => logs.push(`${level} ${text}`) }));
  t.after(async () => {
    controller.abort();
    await done.catch(() => {});
  });
  return { messages, logs, done, stop: () => controller.abort() };
}

test("Telegram: long polling, mention handling in groups, sendMessage, and a fatal bad token", async (t) => {
  let served = false;
  const api = await httpServer(async (req) => {
    if (req.path.endsWith("/getMe")) return { ok: true, result: { id: 99, username: "karmen_bot" } };
    if (req.path.endsWith("/getUpdates")) {
      if (served) {
        await sleep(100);
        return { ok: true, result: [] };
      }
      served = true;
      return {
        ok: true,
        result: [
          { update_id: 5, message: { message_id: 1, from: { id: 7, username: "ann" }, chat: { id: 7, type: "private" }, text: "你好" } },
          { update_id: 6, message: { message_id: 2, from: { id: 7 }, chat: { id: -100, type: "supergroup" }, text: "@karmen_bot 总结一下" } },
          { update_id: 7, message: { message_id: 3, from: { id: 8 }, chat: { id: -100, type: "supergroup" }, text: "闲聊" } },
        ],
      };
    }
    if (req.path.endsWith("/sendMessage")) return { ok: true, result: {} };
    return { status: 404, json: { ok: false } };
  });
  t.after(() => api.close());
  const adapter = createTelegram({ settings: { apiBase: api.url }, secrets: { token: "123:secret" } });
  const live = run(t, adapter);
  await until(() => live.messages.length === 3, "three updates");
  assert.deepEqual(live.messages.map((m) => [m.chatId, m.text, m.isGroup, m.mentioned]), [["7", "你好", false, true], ["-100", "总结一下", true, true], ["-100", "闲聊", true, false]]);
  await until(() => api.requests.filter((r) => r.path.endsWith("/getUpdates")).length >= 2, "second poll");
  assert.equal(api.requests.filter((r) => r.path.endsWith("/getUpdates"))[1].body.offset, 8);
  assert.ok(api.requests.every((r) => r.path.startsWith("/bot123:secret/")));
  await adapter.send("7", "收到");
  assert.deepEqual(api.requests.at(-1).body, { chat_id: "7", text: "收到" });

  const denied = await httpServer(() => ({ status: 401, json: { ok: false, description: "Unauthorized" } }));
  t.after(() => denied.close());
  await assert.rejects(createTelegram({ settings: { apiBase: denied.url }, secrets: { token: "1:bad" } }).start({ signal: new AbortController().signal, onMessage() {}, log() {} }), (error) => error.fatal === true);
});

test("Slack: socket mode acknowledges every envelope and keeps one copy of each mention", async (t) => {
  const api = await httpServer((req) => {
    if (req.path === "/auth.test") return { ok: true, user_id: "UBOT" };
    if (req.path === "/apps.connections.open") return { ok: true, url: `${api.wsUrl}/socket` };
    if (req.path === "/chat.postMessage") return { ok: true };
    return { ok: false, error: "unknown_method" };
  });
  t.after(() => api.close());
  let socket;
  acceptWebSocket(api, (conn) => {
    socket = conn;
    conn.sendText({ type: "hello" });
    const event = (id, payload) => conn.sendText({ envelope_id: id, type: "events_api", payload: { event: payload } });
    event("e1", { type: "app_mention", user: "U1", channel: "C1", channel_type: "channel", text: "<@UBOT> 帮我查", ts: "1.1" });
    event("e2", { type: "message", user: "U1", channel: "C1", channel_type: "channel", text: "<@UBOT> 帮我查", ts: "1.1" });
    event("e3", { type: "message", user: "U1", channel: "D1", channel_type: "im", text: "私信", ts: "1.2" });
    event("e4", { type: "message", user: "UBOT", channel: "D1", channel_type: "im", text: "我自己", ts: "1.3", bot_id: "B1" });
  });
  const adapter = createSlack({ settings: { apiBase: api.url }, secrets: { appToken: "xapp-1", botToken: "xoxb-1" } });
  const live = run(t, adapter);
  await until(() => live.messages.length === 2 && socket?.received.length === 4, "two messages and four acks");
  assert.deepEqual(live.messages.map((m) => [m.chatId, m.text, m.isGroup, m.mentioned]), [["C1", "帮我查", true, true], ["D1", "私信", false, true]]);
  assert.deepEqual(socket.received.map((m) => m.json.envelope_id), ["e1", "e2", "e3", "e4"]);
  await adapter.send("C1", "好的");
  const post = api.requests.find((r) => r.path === "/chat.postMessage");
  assert.equal(post.headers.authorization, "Bearer xoxb-1");
  assert.deepEqual(post.body, { channel: "C1", text: "好的" });
  assert.equal(api.requests.find((r) => r.path === "/apps.connections.open").headers.authorization, "Bearer xapp-1");
});

test("Discord: identifies with the right intents, heartbeats, filters mentions, and stops on a fatal close", async (t) => {
  const api = await httpServer((req) => {
    if (req.path === "/gateway/bot") return { url: api.wsUrl };
    if (req.path === "/channels/C9/messages") return { id: "m" };
    return { status: 404, json: {} };
  });
  t.after(() => api.close());
  let identify;
  acceptWebSocket(api, async (conn) => {
    conn.sendText({ op: 10, d: { heartbeat_interval: 60 } });
    identify = await conn.next((m) => m.json?.op === 2);
    await conn.next((m) => m.json?.op === 1);
    conn.sendText({ op: 0, s: 1, t: "READY", d: { user: { id: "BOT", username: "karmen" } } });
    conn.sendText({ op: 0, s: 2, t: "MESSAGE_CREATE", d: { id: "1", channel_id: "C9", guild_id: "G", author: { id: "U1", username: "ann" }, content: "<@BOT> 你好", mentions: [{ id: "BOT" }] } });
    conn.sendText({ op: 0, s: 3, t: "MESSAGE_CREATE", d: { id: "2", channel_id: "C9", guild_id: "G", author: { id: "U2" }, content: "路过", mentions: [] } });
    conn.sendText({ op: 0, s: 4, t: "MESSAGE_CREATE", d: { id: "3", channel_id: "DM", author: { id: "U1" }, content: "私聊", mentions: [] } });
  });
  const adapter = createDiscord({ settings: { apiBase: api.url }, secrets: { token: "tok" } });
  const live = run(t, adapter);
  await until(() => live.messages.length === 3, "three messages");
  assert.equal(identify.json.d.token, "tok");
  assert.equal(identify.json.d.intents, DISCORD_INTENTS);
  assert.equal(DISCORD_INTENTS, 37377);
  assert.deepEqual(live.messages.map((m) => [m.text, m.isGroup, m.mentioned]), [["你好", true, true], ["路过", true, false], ["私聊", false, true]]);
  await adapter.send("C9", "嗨");
  const post = api.requests.find((r) => r.path === "/channels/C9/messages");
  assert.equal(post.headers.authorization, "Bot tok");
  assert.deepEqual(post.body, { content: "嗨" });

  const strict = await httpServer(() => ({ url: strict.wsUrl }));
  t.after(() => strict.close());
  acceptWebSocket(strict, (conn) => conn.close(4014));
  await assert.rejects(createDiscord({ settings: { apiBase: strict.url }, secrets: { token: "tok" } }).start({ signal: new AbortController().signal, onMessage() {}, log() {} }), /MESSAGE CONTENT/);
});

test("Feishu: protobuf long connection pings, reassembles split events, acks them, and replies by chat id", async (t) => {
  const api = await httpServer((req) => {
    if (req.path === "/open-apis/auth/v3/tenant_access_token/internal") return { code: 0, tenant_access_token: "t-1", expire: 7200 };
    if (req.path === "/open-apis/bot/v3/info") return { code: 0, bot: { open_id: "ou_bot" } };
    if (req.path === "/callback/ws/endpoint") return { code: 0, data: { URL: `${api.wsUrl}/ws?device_id=d1&service_id=33`, ClientConfig: { PingInterval: 120 } } };
    if (req.path === "/open-apis/im/v1/messages") return { code: 0, data: {} };
    return { status: 404, json: { code: 404 } };
  });
  t.after(() => api.close());
  let socket;
  const event = {
    schema: "2.0",
    header: { event_id: "ev1", event_type: "im.message.receive_v1" },
    event: {
      sender: { sender_id: { open_id: "ou_ann" }, sender_type: "user" },
      message: { message_id: "om_1", chat_id: "oc_group", chat_type: "group", message_type: "text", content: JSON.stringify({ text: "@_user_1 帮我写周报 @_user_2" }), mentions: [{ key: "@_user_1", id: { open_id: "ou_bot" }, name: "Karmen" }, { key: "@_user_2", id: { open_id: "ou_bob" }, name: "Bob" }] },
    },
  };
  acceptWebSocket(api, (conn) => {
    socket = conn;
    const bytes = new TextEncoder().encode(JSON.stringify(event));
    const half = Math.floor(bytes.length / 2);
    const part = (seq, payload) => encodeFrame({ SeqID: 11n, LogID: 9007199254740993n, service: 33, method: FRAME_DATA, headers: [{ key: "type", value: "event" }, { key: "message_id", value: "msg-1" }, { key: "sum", value: "2" }, { key: "seq", value: String(seq) }, { key: "trace_id", value: "tr" }], payload });
    conn.sendBinary(part(1, bytes.subarray(half)));
    conn.sendBinary(part(0, bytes.subarray(0, half)));
  });
  const adapter = createFeishu({ settings: { openBase: api.url }, secrets: { appId: "cli_1", appSecret: "sec" } });
  const live = run(t, adapter);
  await until(() => live.messages.length === 1, "event delivered");
  assert.deepEqual(live.messages[0], { chatId: "oc_group", userId: "ou_ann", userName: "", text: "帮我写周报 @Bob", isGroup: true, mentioned: true, messageId: "om_1", reply: { messageId: "om_1" } });
  const frames = () => socket.received.filter((m) => m.binary).map((m) => decodeFrame(m.binary));
  await until(() => frames().some((f) => f.method === FRAME_CONTROL), "ping frame");
  const ping = frames().find((f) => f.method === FRAME_CONTROL);
  assert.equal(headerOf(ping, "type"), "ping");
  assert.equal(ping.service, 33);
  await until(() => frames().some((f) => f.method === FRAME_DATA), "ack frame");
  const ack = frames().find((f) => f.method === FRAME_DATA);
  assert.equal(ack.LogID, 9007199254740993n);
  assert.match(headerOf(ack, "biz_rt"), /^\d+$/);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(ack.payload)), { code: 200 });
  const endpoint = api.requests.find((r) => r.path === "/callback/ws/endpoint");
  assert.deepEqual(endpoint.body, { AppID: "cli_1", AppSecret: "sec" });
  assert.equal(endpoint.headers.locale, "zh");
  await adapter.send("oc_group", "周报写好了");
  const sent = api.requests.find((r) => r.path === "/open-apis/im/v1/messages");
  assert.equal(sent.query.receive_id_type, "chat_id");
  assert.equal(sent.headers.authorization, "Bearer t-1");
  assert.deepEqual(sent.body, { receive_id: "oc_group", msg_type: "text", content: JSON.stringify({ text: "周报写好了" }) });
});

test("WeCom: subscribes, answers the first reply on the message's req_id, then sends proactively", async (t) => {
  const api = await httpServer(() => ({}));
  t.after(() => api.close());
  let socket;
  let subscribe;
  acceptWebSocket(api, async (conn) => {
    socket = conn;
    subscribe = await conn.next((m) => m.json?.cmd === "aibot_subscribe");
    conn.sendText({ headers: { req_id: subscribe.json.headers.req_id }, errcode: 0, errmsg: "ok" });
    conn.sendText({ cmd: "aibot_msg_callback", headers: { req_id: "in-1" }, body: { msgid: "m1", chatid: "g1", chattype: "group", from: { userid: "zhang" }, msgtype: "text", text: { content: "@Karmen 今天的会议纪要" } } });
  });
  const adapter = createWecom({ settings: { wsUrl: `${api.wsUrl}/ws` }, secrets: { botId: "bot-1", secret: "s3" } });
  const live = run(t, adapter);
  await until(() => live.messages.length === 1, "callback");
  assert.deepEqual(subscribe.json.body.bot_id, "bot-1");
  assert.deepEqual(subscribe.json.body.secret, "s3");
  assert.match(subscribe.json.body.device_id, /^[0-9a-f]{32}$/);
  assert.deepEqual([live.messages[0].chatId, live.messages[0].userId, live.messages[0].text, live.messages[0].isGroup], ["g1", "zhang", "今天的会议纪要", true]);
  const answer = (cmd) => socket.next((m) => m.json?.cmd === cmd).then((m) => {
    socket.sendText({ headers: { req_id: m.json.headers.req_id }, errcode: 0 });
    return m.json;
  });
  const [first] = await Promise.all([answer("aibot_respond_msg"), adapter.send("g1", "纪要如下")]);
  assert.equal(first.headers.req_id, "in-1");
  assert.deepEqual(first.body, { msgtype: "markdown", markdown: { content: "纪要如下" } });
  const [second] = await Promise.all([answer("aibot_send_msg"), adapter.send("g1", "还有补充")]);
  assert.deepEqual(second.body, { chatid: "g1", msgtype: "markdown", markdown: { content: "还有补充" } });

  const bad = await httpServer(() => ({}));
  t.after(() => bad.close());
  acceptWebSocket(bad, async (conn) => {
    const sub = await conn.next((m) => m.json?.cmd === "aibot_subscribe");
    conn.sendText({ headers: { req_id: sub.json.headers.req_id }, errcode: 40013, errmsg: "invalid secret" });
  });
  await assert.rejects(createWecom({ settings: { wsUrl: bad.wsUrl }, secrets: { botId: "b", secret: "x" } }).start({ signal: new AbortController().signal, onMessage() {}, log() {} }), (error) => error.fatal === true);
});

test("DingTalk: stream registration, ping echo, callback ack, and replies through the session webhook", async (t) => {
  const api = await httpServer((req) => {
    if (req.path === "/v1.0/gateway/connections/open") return { endpoint: `${api.wsUrl}/connect`, ticket: "tk-1" };
    if (req.path === "/robot/send") return { errcode: 0 };
    return { status: 404, json: {} };
  });
  t.after(() => api.close());
  let socket;
  let ticket;
  acceptWebSocket(api, (conn, req) => {
    socket = conn;
    ticket = new URL(req.url, "http://x").searchParams.get("ticket");
    conn.sendText({ specVersion: "1.0", type: "SYSTEM", headers: { topic: "ping", messageId: "p1", contentType: "application/json" }, data: '{"opaque":"o1"}' });
    conn.sendText({
      specVersion: "1.0",
      type: "CALLBACK",
      headers: { topic: "/v1.0/im/bot/messages/get", messageId: "cb1", contentType: "application/json" },
      data: JSON.stringify({ conversationId: "cid1", conversationType: "2", senderStaffId: "staff1", senderNick: "李雷", msgtype: "text", text: { content: " 查一下库存 " }, isInAtList: true, sessionWebhook: `${api.url}/robot/send?session=1`, sessionWebhookExpiredTime: Date.now() + 3600_000, msgId: "m1" }),
    });
  });
  const adapter = createDingtalk({ settings: { apiBase: api.url }, secrets: { clientId: "ding1", clientSecret: "sec" } });
  const live = run(t, adapter);
  await until(() => live.messages.length === 1 && socket.received.length === 2, "message and two acks");
  const open = api.requests.find((r) => r.path === "/v1.0/gateway/connections/open").body;
  assert.equal(open.clientId, "ding1");
  assert.deepEqual(open.subscriptions, [{ type: "CALLBACK", topic: "/v1.0/im/bot/messages/get" }]);
  assert.equal(ticket, "tk-1");
  const [pong, ack] = socket.received.map((m) => m.json);
  assert.deepEqual(pong, { code: 200, headers: { contentType: "application/json", messageId: "p1" }, message: "OK", data: '{"opaque":"o1"}' });
  assert.equal(ack.headers.messageId, "cb1");
  assert.deepEqual(JSON.parse(ack.data), { response: null });
  assert.deepEqual([live.messages[0].chatId, live.messages[0].userId, live.messages[0].text, live.messages[0].isGroup], ["cid1", "staff1", "查一下库存", true]);
  await adapter.send("cid1", "库存充足");
  assert.deepEqual(api.requests.find((r) => r.path === "/robot/send").body, { msgtype: "markdown", markdown: { title: "Karmen", text: "库存充足" } });
  await assert.rejects(adapter.send("unknown", "x"), /reply window/);
});

test("WeChat: iLink long poll with the right headers, cursor persistence, and context-token replies", async (t) => {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "kb-wx-"));
  t.after(() => fs.rm(state, { recursive: true, force: true }));
  let polls = 0;
  const api = await httpServer(async (req) => {
    if (req.path === "/ilink/bot/getupdates") {
      polls += 1;
      if (polls === 1) return { ret: 0, msgs: [{ from_user_id: "wxid_a", to_user_id: "bot1", message_id: "m1", context_token: "ctx-1", item_list: [{ type: 1, text_item: { text: "帮我订明天的会议室" } }] }, { from_user_id: "bot1", message_id: "m0", item_list: [{ type: 1, text_item: { text: "echo" } }] }], get_updates_buf: "cur-1" };
      await sleep(80);
      return { ret: 0, msgs: [], get_updates_buf: "cur-1" };
    }
    if (req.path === "/ilink/bot/sendmessage") return { ret: 0 };
    return { status: 404, json: {} };
  });
  t.after(() => api.close());
  const adapter = createWeixin({ secrets: { token: "tok", accountId: "bot1", baseUrl: api.url }, stateDir: state });
  const live = run(t, adapter);
  await until(() => live.messages.length === 1 && polls >= 2, "message then second poll");
  const first = api.requests.find((r) => r.path === "/ilink/bot/getupdates");
  assert.equal(first.headers.authorizationtype, "ilink_bot_token");
  assert.equal(first.headers.authorization, "Bearer tok");
  assert.equal(first.headers["ilink-app-id"], "bot");
  assert.match(Buffer.from(first.headers["x-wechat-uin"], "base64").toString(), /^\d+$/);
  assert.deepEqual(first.body.base_info, { channel_version: "2.2.0" });
  assert.equal(api.requests.filter((r) => r.path === "/ilink/bot/getupdates")[1].body.get_updates_buf, "cur-1");
  assert.equal(JSON.parse(await fs.readFile(path.join(state, "weixin-cursor.json"), "utf8")).cursor, "cur-1");
  assert.deepEqual([live.messages[0].chatId, live.messages[0].text], ["wxid_a", "帮我订明天的会议室"]);
  await adapter.send("wxid_a", "已订好");
  const sent = api.requests.find((r) => r.path === "/ilink/bot/sendmessage").body.msg;
  assert.equal(sent.to_user_id, "wxid_a");
  assert.equal(sent.context_token, "ctx-1");
  assert.equal(sent.message_type, 2);
  assert.deepEqual(sent.item_list, [{ type: 1, text_item: { text: "已订好" } }]);
});

test("WhatsApp Cloud API: webhook verification, signature check, inbound text, outbound send", async (t) => {
  const graph = await httpServer(() => ({ messages: [{ id: "wamid" }] }));
  t.after(() => graph.close());
  const adapter = createWhatsapp({ settings: { graphBase: graph.url, port: 0 }, secrets: { accessToken: "EAA", phoneNumberId: "555", verifyToken: "v-tok", appSecret: "app-sec" } });
  const live = run(t, adapter);
  await until(() => live.logs.some((line) => line.includes("listening")), "webhook up");
  const base = `http://127.0.0.1:${adapter.port}/whatsapp/webhook`;
  const ok = await fetch(`${base}?hub.mode=subscribe&hub.verify_token=v-tok&hub.challenge=42`);
  assert.equal(await ok.text(), "42");
  assert.equal((await fetch(`${base}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`)).status, 403);
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: "8613800000000", profile: { name: "Wei" } }], messages: [{ from: "8613800000000", id: "wa1", type: "text", text: { body: "Hi Karmen" } }] } }] }] });
  const signature = `sha256=${crypto.createHmac("sha256", "app-sec").update(body).digest("hex")}`;
  assert.equal((await fetch(base, { method: "POST", body, headers: { "x-hub-signature-256": "sha256=forged" } })).status, 401);
  assert.equal((await fetch(base, { method: "POST", body, headers: { "x-hub-signature-256": signature } })).status, 200);
  await until(() => live.messages.length === 1, "inbound text");
  assert.deepEqual([live.messages[0].chatId, live.messages[0].userName, live.messages[0].text], ["8613800000000", "Wei", "Hi Karmen"]);
  await adapter.send("8613800000000", "Hello!");
  const sent = graph.requests[0];
  assert.equal(sent.path, "/v20.0/555/messages");
  assert.equal(sent.headers.authorization, "Bearer EAA");
  assert.deepEqual(sent.body.text, { body: "Hello!", preview_url: false });
});

test("scan-to-connect flows: Feishu device code, WeCom QR, DingTalk registration, WeChat login", async (t) => {
  let feishuPolls = 0;
  let wecomPolls = 0;
  let dingPolls = 0;
  let wxPolls = 0;
  const api = await httpServer((req) => {
    if (req.path === "/oauth/v1/app/registration") {
      if (req.body.action === "init") return { supported_auth_methods: ["client_secret"] };
      if (req.body.action === "begin") return { device_code: "dc", user_code: "UC-1", verification_uri_complete: "https://accounts.feishu.cn/verify?user_code=UC-1", interval: 5, expire_in: 60 };
      feishuPolls += 1;
      return feishuPolls < 2 ? { status: 400, json: { error: "authorization_pending" } } : { client_id: "cli_new", client_secret: "sec_new", user_info: { open_id: "ou_owner" }, tenant_brand: "feishu" };
    }
    if (req.path === "/ai/qc/generate") return { data: { scode: "S1", auth_url: "https://work.weixin.qq.com/ai/qc/x?scode=S1" } };
    if (req.path === "/ai/qc/query_result") {
      wecomPolls += 1;
      return wecomPolls < 2 ? { data: { status: "waiting" } } : { data: { status: "success", bot_info: { botid: "bot-9", secret: "sec-9" } } };
    }
    if (req.path === "/app/registration/init") return { nonce: "n1" };
    if (req.path === "/app/registration/begin") return { device_code: "dd", verification_uri_complete: "https://open-dev.dingtalk.com/openapp/registration/x?user_code=1", interval: 3, expires_in: 60 };
    if (req.path === "/app/registration/poll") {
      dingPolls += 1;
      return dingPolls < 2 ? { status: "WAITING" } : { status: "SUCCESS", client_id: "ding-new", client_secret: "ding-sec" };
    }
    if (req.path === "/ilink/bot/get_bot_qrcode") return { qrcode: "q1", qrcode_img_content: "https://liteapp.weixin.qq.com/q/1" };
    if (req.path === "/ilink/bot/get_qrcode_status") {
      wxPolls += 1;
      return wxPolls === 1 ? { status: "wait" } : wxPolls === 2 ? { status: "scaned" } : { status: "confirmed", ilink_bot_id: "bot-wx", bot_token: "tok-wx", baseurl: api.url, ilink_user_id: "owner-wx" };
    }
    return { status: 404, json: {} };
  });
  t.after(() => api.close());
  const codes = [];
  const onCode = (code) => codes.push(code.url);
  assert.deepEqual(await registerFeishuApp({ accountsBase: api.url, onCode, pollMs: 10 }), { appId: "cli_new", appSecret: "sec_new", ownerOpenId: "ou_owner", domain: "feishu" });
  const feishuBegin = api.requests.find((r) => r.body?.action === "begin");
  assert.deepEqual(feishuBegin.body, { action: "begin", archetype: "PersonalAgent", auth_method: "client_secret", request_user_info: "open_id" });
  assert.match(codes[0], /from=karmenbot&tp=karmenbot/);
  assert.deepEqual(await registerWecomBot({ base: api.url, onCode, pollMs: 10 }), { botId: "bot-9", secret: "sec-9" });
  assert.equal(api.requests.find((r) => r.path === "/ai/qc/generate").query.source, "karmenbot");
  assert.deepEqual(await registerDingtalkApp({ base: api.url, onCode, pollMs: 10 }), { clientId: "ding-new", clientSecret: "ding-sec" });
  assert.deepEqual(api.requests.find((r) => r.path === "/app/registration/init").body, { source: "karmenbot" });
  const statuses = [];
  assert.deepEqual(await loginWeixin({ base: api.url, onCode, onStatus: (s) => statuses.push(s), pollMs: 10 }), { accountId: "bot-wx", token: "tok-wx", baseUrl: api.url, ownerId: "owner-wx" });
  assert.deepEqual(statuses, ["scanned"]);
  assert.equal(api.requests.find((r) => r.path === "/ilink/bot/get_bot_qrcode").query.bot_type, "3");
  assert.equal(codes.length, 4);
});

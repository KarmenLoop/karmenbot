import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPairing } from "../src/gateway/pairing.mjs";
import { savePlatform } from "../src/gateway/platforms/forms.mjs";
import { loadConfig, loadSecrets } from "../src/home.mjs";
import { addModel } from "../src/models.mjs";
import { runTui } from "../src/tui/app.mjs";
import { fakeTerminal, until } from "./vt.mjs";

// The settings centre driven like a person would: arrows and Enter, or the
// mouse (SGR 1006 clicks on the words on screen). Services that would touch
// the network, launchd/systemd/registry or start processes are stand-ins.
const ESC_WAIT = 60;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const paste = (text) => `\x1b[200~${text}\x1b[201~`;
const TOKEN = `123456:${"A".repeat(35)}`;

async function open(t, { settings = "only", services = {}, provider, before, cols, rows, platform } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "karmenbot-ws-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "karmenbot-home-"));
  t.after(() => Promise.all([fs.rm(dir, { recursive: true, force: true }), fs.rm(home, { recursive: true, force: true })]));
  const env = { KARMENBOT_HOME: home };
  await before?.(env);
  const calls = [];
  const term = fakeTerminal({ cols, rows });
  const done = runTui({
    stdin: term.stdin,
    stdout: term.stdout,
    env,
    cwd: dir,
    home: "",
    splash: false,
    depth: "truecolor",
    settings,
    platform,
    providerOverride: provider,
    settingsServices: {
      probe: async (record) => {
        calls.push(["probe", record.model, record.apiKey]);
        return { ok: true, ms: 12 };
      },
      gatewayPid: () => 0,
      autostart: () => false,
      setAutostart: async (on) => calls.push(["autostart", on]),
      startGateway: async () => 0,
      stopGateway: async () => true,
      ...services,
    },
  });
  const screen = () => term.vt.text();
  return { env, home, dir, term, done, calls, screen, see: (text, label = text) => until(() => screen().includes(text), label) };
}

async function esc(app) {
  app.term.type("\x1b");
  await sleep(ESC_WAIT);
}

test("first run opens the settings centre; a model is added with the keyboard alone and used at once", async (t) => {
  const app = await open(t, { settings: "first" });
  await app.see("设置中心", "settings opened on first run");
  assert.match(app.screen(), /还没配置 · 从这里开始/);
  assert.ok(app.term.vt.modes.has("1000") && app.term.vt.modes.has("1006"), "mouse reporting is on in the settings centre");
  app.term.type("\r");
  await app.see("+ 添加模型");
  app.term.type("\r");
  await app.see("直接打字筛选");
  await until(() => !app.screen().includes("正在读取厂商列表"), "vendors loaded");
  app.term.type("deep");
  await app.see("筛选：deep");
  assert.doesNotMatch(app.screen(), /阿里云百炼/, "filtering hides other vendors");
  app.term.type("\r");
  await app.see("添加 DeepSeek");
  assert.match(app.screen(), /去这里拿密钥/);
  app.term.type("\r");
  app.term.type(paste("sk-test-secret-9876"));
  await app.see("•••••");
  assert.ok(!app.screen().includes("sk-test-secret-9876"), "the key is never drawn");
  app.term.type("\x1b[B\x1b[B\r");
  await app.see("连接正常", "saved and tested");
  const config = loadConfig(app.env);
  assert.equal(config.models[0].id, "deepseek");
  assert.equal(config.model, "deepseek");
  assert.equal(loadSecrets(app.env).models.deepseek.apiKey, "sk-test-secret-9876");
  assert.deepEqual(app.calls[0].slice(2), ["sk-test-secret-9876"]);
  assert.match(app.screen(), /★ DeepSeek/);
  await esc(app);
  await app.see("完成，开始使用");
  app.term.click("完成，开始使用");
  await app.see("告诉 Karmen 要做什么", "back in the chat screen");
  await until(() => /◆ KARMEN.*DeepSeek/.test(app.screen()), "the running kernel switched to the new model");
  assert.ok(!app.term.vt.modes.has("1000"), "mouse reporting is off again in the chat screen");
  for (let i = 0; i < 3; i += 1) app.term.type("\x03");
  assert.equal(await app.done, 0);
});

test("everything clicks with the mouse: Telegram by hand, bad token caught, done closes", async (t) => {
  const app = await open(t);
  await app.see("未接入（可选）");
  app.term.click("未接入（可选）");
  await app.see("Telegram");
  app.term.click("Telegram");
  await app.see("@BotFather");
  app.term.click("手动填写");
  await app.see("Bot 令牌");
  app.term.type(paste("not-a-token"));
  app.term.click("保存");
  await app.see("令牌格式不对");
  assert.equal(loadConfig(app.env).gateway, undefined, "nothing saved");
  app.term.click("Bot 令牌");
  app.term.type(`\x15${paste(TOKEN)}`);
  app.term.click("保存");
  await app.see("Telegram 已接入", "saved");
  assert.equal(loadSecrets(app.env).platforms.telegram.token, TOKEN);
  assert.match(app.screen(), /✓ 已接入/);
  app.term.click("‹ 返回");
  await app.see("✕ 关闭");
  assert.match(app.screen(), /聊天平台\s+Telegram/);
  app.term.click("✕ 关闭");
  assert.equal(await app.done, 0);
  assert.ok(!app.term.vt.modes.has("1000") && !app.term.vt.modes.has("1006"), "mouse reporting is switched off on exit");
  assert.ok(!app.term.vt.modes.has("1049"), "terminal restored");
});

test("scan to connect shows a scannable code, saves the platform and its owner", async (t) => {
  let finish;
  const app = await open(t, {
    rows: 50,
    services: {
      scan: (name, { onCode }) => {
        assert.equal(name, "feishu");
        onCode({ url: "https://open.feishu.cn/page/launcher?user_code=SYNTH-0001" });
        return new Promise((resolve) => {
          finish = () => resolve({ settings: { domain: "feishu" }, secrets: { appId: "cli_synthetic", appSecret: "s3cret" }, owner: "ou_owner" });
        });
      },
    },
  });
  await app.see("聊天平台");
  app.term.type("\x1b[B\x1b[B\r");
  await app.see("飞书");
  app.term.type("\r");
  await app.see("扫码一键接入");
  app.term.type("\r");
  await app.see("用飞书扫码");
  assert.match(app.screen(), /█{4}/, "the QR code is drawn");
  assert.match(app.screen(), /扫不了就用手机打开：https:\/\/open\.feishu\.cn/);
  finish();
  await app.see("飞书 / Lark 已接入", "connected");
  assert.equal(loadSecrets(app.env).platforms.feishu.appId, "cli_synthetic");
  assert.ok(createPairing({ env: app.env }).isApproved("feishu", "ou_owner"), "the scanner became the owner");
  app.term.type("\x03");
  assert.equal(await app.done, 0);
});

test("gateway page: start, start at login, approve a pairing request by click", async (t) => {
  let pid = 0;
  const app = await open(t, {
    before(env) {
      savePlatform(env, "telegram", {}, { token: TOKEN });
      createPairing({ env }).request("telegram", "u-42", "Alice");
    },
    services: {
      gatewayPid: () => pid,
      startGateway: async () => {
        pid = 4242;
        return pid;
      },
    },
  });
  await app.see("没有运行（可选）");
  app.term.click("没有运行（可选）");
  await app.see("○ 没有运行");
  app.term.click("启动网关");
  await app.see("运行中（进程 4242）");
  app.term.click("开机自动运行");
  await app.see("已设为开机自动运行");
  assert.deepEqual(app.calls.filter((call) => call[0] === "autostart"), [["autostart", true]]);
  app.term.click("批准 Alice");
  await app.see("已批准 Alice");
  assert.ok(createPairing({ env: app.env }).isApproved("telegram", "u-42"));
  app.term.click("撤销 Alice");
  await app.see("再按一次确认撤销");
  assert.ok(createPairing({ env: app.env }).isApproved("telegram", "u-42"), "one press only arms the revoke");
  app.term.click("再按一次确认撤销");
  await app.see("已撤销 Alice");
  assert.ok(!createPairing({ env: app.env }).isApproved("telegram", "u-42"));
  app.term.type("\x03");
  assert.equal(await app.done, 0);
});

test("MoA set up with Space and arrows; tutorial pages per system; language switch", async (t) => {
  const app = await open(t, {
    platform: "darwin",
    before(env) {
      addModel({ id: "a", name: "Alpha", model: "alpha-1", baseUrl: "http://127.0.0.1:9/v1" }, { apiKey: "k1", makeDefault: true }, env);
      addModel({ id: "b", name: "Beta", model: "beta-1", baseUrl: "http://127.0.0.1:9/v1" }, { apiKey: "k2" }, env);
    },
  });
  await app.see("多模型会商 MoA");
  app.term.click("多模型会商 MoA");
  await app.see("参考模型（可多选）");
  app.term.type("\x1b[B ");
  await app.see("[✓] Alpha · alpha-1");
  app.term.type("\x1b[B ");
  await app.see("[✓] Beta · beta-1");
  app.term.type(" ");
  await until(() => app.screen().includes("[ ] Beta · beta-1"), "Space unticks again");
  app.term.type(" ");
  app.term.click("保存");
  await app.see("MoA 已开启：2 个参考模型");
  const moa = loadConfig(app.env).moa;
  assert.equal(moa.enabled, true);
  assert.deepEqual(moa.presets.default.references.sort(), ["a", "b"]);
  assert.equal(moa.presets.default.aggregator, "a");

  app.term.click("教程");
  await app.see("按哪个系统讲");
  assert.match(app.screen(), /◉ macOS/, "the tutorial starts on this computer's system");
  app.term.click("Windows");
  await app.see("安装（Windows）");
  app.term.click("2. 安装（Windows）");
  await app.see("方法一：PowerShell");
  assert.match(app.screen(), /irm https:\/\/github\.com\/KarmenLoop\/karmenbot\/releases\/latest\/download\/install\.ps1 \| iex/);
  app.term.type("\x1b[C");
  await app.see("第 3 章 · 设置中心");
  await esc(app);
  await app.see("◉ Windows");
  app.term.click("macOS");
  await app.see("2. 安装（macOS）");
  app.term.click("2. 安装（macOS）");
  await app.see("⌘ 空格");
  assert.doesNotMatch(app.screen(), /irm https/);
  await esc(app);
  await esc(app);

  app.term.click("语言与显示");
  await app.see("English");
  app.term.click("English");
  await app.see("Language & display");
  assert.equal(loadConfig(app.env).lang, "en");
  await esc(app);
  await app.see("Settings");
  assert.match(app.screen(), /Chat apps/);
  app.term.type("\x03");
  assert.equal(await app.done, 0);
});

test("confirm dialogs have clickable Accept and Reject buttons", async (t) => {
  let step = 0;
  const provider = {
    name: "scripted",
    model: "model-only",
    async complete() {
      step += 1;
      return step === 1
        ? { text: "准备写。", toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "out.txt", content: "hello" } }] }
        : { text: "已写入。", toolCalls: [] };
    },
  };
  const app = await open(t, { settings: null, provider });
  await app.see("就绪");
  app.term.type("写文件\r");
  await app.see("接受 y");
  assert.ok(app.term.vt.modes.has("1000"), "mouse reporting is on while the dialog is open");
  app.term.click("接受 y");
  await app.see("已写入。");
  assert.equal(await fs.readFile(path.join(app.dir, "out.txt"), "utf8"), "hello");
  assert.ok(!app.term.vt.modes.has("1000"), "and off again afterwards");
  for (let i = 0; i < 3; i += 1) app.term.type("\x03");
  assert.equal(await app.done, 0);
});

test("/设置 opens the settings centre from the chat screen and Esc returns", async (t) => {
  const app = await open(t, { settings: null, provider: { name: "p", model: "m", complete: async () => ({ text: "", toolCalls: [] }) } });
  await app.see("就绪");
  app.term.type("/设置\r");
  await app.see("设置中心");
  assert.match(app.screen(), /完成，开始使用/);
  await esc(app);
  await app.see("告诉 Karmen 要做什么");
  for (let i = 0; i < 3; i += 1) app.term.type("\x03");
  assert.equal(await app.done, 0);
});

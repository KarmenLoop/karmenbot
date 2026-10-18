import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { runTui } from "../src/tui/app.mjs";
import { runCli } from "../src/cli.mjs";
import { fakeTerminal, until } from "./vt.mjs";

const ESC_WAIT = 60;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(t, { provider, cols, rows, env = {}, ...rest } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "karmenbot-ws-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "karmenbot-home-"));
  t.after(() => Promise.all([fs.rm(dir, { recursive: true, force: true }), fs.rm(home, { recursive: true, force: true })]));
  const term = fakeTerminal({ cols, rows });
  const done = runTui({
    stdin: term.stdin,
    stdout: term.stdout,
    env: { KARMENBOT_HOME: home, ...env },
    cwd: dir,
    home: "",
    splash: false,
    depth: "truecolor",
    providerOverride: provider,
    ...rest,
  });
  const screen = () => term.vt.text();
  await until(() => screen().includes("就绪") || screen().includes("Ready"), "kernel ready");
  return { dir, home, term, done, screen, see: (text, label = text) => until(() => screen().includes(text), label) };
}

// Ctrl+C clears a draft first, then needs two presses to quit.
async function quit(app) {
  for (let i = 0; i < 3; i += 1) app.term.type("\x03");
  return app.done;
}

function scripted(...steps) {
  let step = 0;
  return {
    name: "scripted",
    model: "model-only",
    async complete(request) {
      const next = steps[Math.min(step, steps.length - 1)];
      step += 1;
      return typeof next === "function" ? next(request) : next;
    },
  };
}

const writeCall = { text: "准备写。", toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "out.txt", content: "hello" } }] };

test("the first frame shows the glass-ring banner, header and composer, and quitting restores the terminal", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "", toolCalls: [] }) });
  const screen = app.screen();
  assert.match(screen, /KARMENBOT v0\.1\.0/);
  assert.match(screen, /◆ KARMEN/);
  assert.match(screen, /[▀▄]{4}/, "the glass ring logo is drawn");
  assert.doesNotMatch(screen, /[╱╲]/, "no triangle prism (no mountains, no trees)");
  assert.match(screen, /一句话进来，一件事办妥/);
  assert.match(screen, /告诉 Karmen 要做什么/);
  assert.match(screen, /◇ 会话/);
  assert.ok(app.term.vt.modes.has("1049"), "alternate screen is on while running");
  assert.equal(await quit(app), 0);
  assert.deepEqual(app.term.raw, [true, false]);
  assert.ok(!app.term.vt.modes.has("1049"), "alternate screen is left");
  assert.ok(!app.term.vt.modes.has("2004"), "bracketed paste is off");
  assert.ok(app.term.vt.modes.has("25"), "cursor is visible again");
});

test("the way in: the splash lists real loading steps, ends on its own, and a key typed during it still counts", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "karmenbot-ws-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "karmenbot-home-"));
  t.after(() => Promise.all([fs.rm(dir, { recursive: true, force: true }), fs.rm(home, { recursive: true, force: true })]));
  const open = (term) => runTui({ stdin: term.stdin, stdout: term.stdout, env: { KARMENBOT_HOME: home }, cwd: dir, home: "", splash: true, depth: "truecolor", providerOverride: scripted({ text: "", toolCalls: [] }) });
  const first = fakeTerminal();
  const done = open(first);
  await until(() => first.vt.text().includes("KARMEN · 正在点亮 v0.1.0"), "splash frame");
  for (const step of ["唤醒内核", "读取配置", "连接模型", "聊天平台", "点亮界面"]) assert.match(first.vt.text(), new RegExp(step));
  await until(() => first.vt.text().includes("告诉 Karmen 要做什么"), "splash ends by itself", 5000);
  for (let i = 0; i < 3; i += 1) first.type("\x03");
  assert.equal(await done, 0);

  const second = fakeTerminal();
  const again = open(second);
  await until(() => second.vt.text().includes("唤醒内核"), "splash frame");
  second.type("/help\r");
  await until(() => second.vt.text().includes("命令与按键"), "the /help typed during the splash opened help");
  second.type("\x1b");
  await sleep(ESC_WAIT);
  for (let i = 0; i < 3; i += 1) second.type("\x03");
  assert.equal(await again, 0);
});

test("a rejected edit stays off disk; the dialog shows the diff first", async (t) => {
  const app = await setup(t, { provider: scripted(writeCall, { text: "没有写入。", toolCalls: [] }) });
  app.term.type("写文件\r");
  await app.see("准备修改 out.txt");
  await app.see("+ hello", "diff line");
  await app.see("y 接受", "dialog keys");
  app.term.type("n");
  await app.see("✗ 没有写入 out.txt");
  await app.see("就绪");
  await assert.rejects(fs.access(path.join(app.dir, "out.txt")));
  assert.equal(await quit(app), 0);
});

test("y writes the accepted file and the sidebar lists it", async (t) => {
  const app = await setup(t, { provider: scripted(writeCall, { text: "已写入。", toolCalls: [] }) });
  app.term.type("写文件\r");
  await app.see("准备修改 out.txt");
  app.term.type("y");
  await app.see("✓ 已写入 out.txt");
  await app.see("✓ out.txt", "sidebar written list");
  assert.equal(await fs.readFile(path.join(app.dir, "out.txt"), "utf8"), "hello");
  assert.equal(await quit(app), 0);
});

test("Esc on a command denies it and the command never runs", async (t) => {
  let marker = "";
  const app = await setup(t, {
    provider: scripted(
      () => ({ text: "", toolCalls: [{ id: "s1", name: "shell", arguments: { command: `printf ran > ${JSON.stringify(marker)}` } }] }),
      { text: "命令没跑。", toolCalls: [] },
    ),
  });
  marker = path.join(app.dir, "ran.txt");
  app.term.type("跑命令\r");
  await app.see("准备运行命令");
  await app.see("$ printf ran", "command preview");
  app.term.type("\x1b");
  await sleep(ESC_WAIT);
  await app.see("✗ 没有运行命令");
  await app.see("就绪");
  await assert.rejects(fs.access(marker));
  assert.equal(await quit(app), 0);
});

test("--yes auto-accepts edits but still stops for choices", async (t) => {
  const app = await setup(t, {
    yes: true,
    provider: scripted(
      writeCall,
      { text: "", toolCalls: [{ id: "q1", name: "ask_user", arguments: { question: "用哪种风格？", options: ["简洁", "详细", "表格"] } }] },
      (request) => ({ text: `收到：${request.messages.at(-1).content}`, toolCalls: [] }),
    ),
  });
  assert.match(app.screen(), /自动确认 开/);
  app.term.type("写并问\r");
  await app.see("✓ 已写入 out.txt");
  await app.see("用哪种风格？");
  await app.see("1. 简洁", "options");
  app.term.type("\x1b[B");
  await sleep(20);
  app.term.type("\r");
  await app.see("→ 已选择 详细");
  await app.see("收到：");
  assert.equal(await fs.readFile(path.join(app.dir, "out.txt"), "utf8"), "hello");
  assert.equal(await quit(app), 0);
});

test("login requests stop without ever asking for a password", async (t) => {
  const app = await setup(t, {
    yes: true,
    provider: scripted({ text: "", toolCalls: [{ id: "p1", name: "request_login", arguments: { service: "邮箱", reason: "收信" } }] }),
  });
  app.term.type("登录\r");
  await app.see("Karmen 不收集账号密码");
  await app.see("就绪");
  assert.doesNotMatch(app.screen(), /密码：|password:/i);
  assert.equal(await quit(app), 0);
});

test("Esc interrupts a running turn", async (t) => {
  const app = await setup(t, {
    provider: {
      complete({ signal }) {
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      },
    },
  });
  app.term.type("一个很长的任务\r");
  await app.see("思考中");
  app.term.type("\x1b");
  await sleep(ESC_WAIT);
  await app.see("已中断这一轮");
  await app.see("就绪");
  assert.equal(await quit(app), 0);
});

test("streamed text appears live and hostile escape sequences never reach the terminal", async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const app = await setup(t, {
    provider: {
      async complete({ onDelta }) {
        onDelta("第一段\x1b]0;PWNED\x07");
        await gate;
        onDelta("，第二段\x1b[2J");
        return { text: "第一段\x1b]0;PWNED\x07，第二段\x1b[2J**完成**", toolCalls: [] };
      },
    },
  });
  app.term.type("讲讲\r");
  await app.see("◆ 第一段", "first delta");
  release();
  await app.see("第一段，第二段完成", "final text with bold markers removed");
  assert.ok(!app.term.vt.log.includes("PWNED"), "OSC title sequence was stripped");
  assert.ok(!app.term.vt.log.includes("第二段\x1b[2J"), "clear-screen from the model was stripped");
  assert.equal(await quit(app), 0);
});

test("without a model the welcome says so and a turn reports the API as unreachable", async (t) => {
  const app = await setup(t, {});
  assert.match(app.screen(), /还没有配置模型/);
  assert.match(app.screen(), /未配置/);
  app.term.type("你好\r");
  await app.see("目前无法连接到 API");
  await app.see("就绪");
  assert.equal(await quit(app), 0);
});

test("/lang en switches every label and saves the choice", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "", toolCalls: [] }) });
  app.term.type("/lang en\r");
  await app.see("Switched to English.");
  await app.see("Tell Karmen what to do", "English placeholder");
  await app.see("◇ Session", "English sidebar");
  const saved = JSON.parse(await fs.readFile(path.join(app.home, "config.json"), "utf8"));
  assert.equal(saved.lang, "en");
  assert.equal(await quit(app), 0);
});

test("the slash palette filters, completes with Tab, and /mode opens a picker", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "", toolCalls: [] }) });
  app.term.type("/mo");
  await app.see("/mode", "palette entry");
  await app.see("/model", "second palette entry");
  assert.doesNotMatch(app.screen(), /│ \/learn/, "palette rows only list matches");
  app.term.type("\t");
  await sleep(20);
  app.term.type("\r");
  await app.see("选择工作模式");
  app.term.type("2");
  await app.see("模式已切换为 code");
  assert.match(app.screen(), /│  code/);
  assert.equal(await quit(app), 0);
});

test("the palette scrolls to commands past the first eight", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "", toolCalls: [] }) });
  app.term.type("/");
  await app.see("│ /help", "palette open");
  assert.doesNotMatch(app.screen(), /│ \/exit/);
  app.term.type("\x1b[A");
  await app.see("│ /exit", "wrapped to the last command");
  app.term.type("\r");
  assert.equal(await app.done, 0);
});

test("a path that starts with a slash is sent as a task, not a command", async (t) => {
  const seen = [];
  const app = await setup(t, {
    provider: scripted((request) => {
      seen.push(request.messages.at(-1).content);
      return { text: "看过了。", toolCalls: [] };
    }),
  });
  app.term.type("/tmp/app.js 有什么问题\r");
  await app.see("看过了。");
  assert.match(seen[0], /\/tmp\/app\.js 有什么问题/);
  assert.doesNotMatch(app.screen(), /没有这个命令/);
  assert.equal(await quit(app), 0);
});

test("pasted lines stay in the composer until Enter, and history brings them back", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "好的。", toolCalls: [] }) });
  app.term.type("\x1b[200~第一行\n第二行\x1b[201~");
  await app.see("│ 第二行", "second composer row");
  assert.doesNotMatch(app.screen(), /❯ 第一行/);
  app.term.type("\r");
  await app.see("好的。");
  app.term.type("\x1b[A");
  await app.see("│ 第二行", "history restored the paste");
  assert.equal(await quit(app), 0);
});

test("narrow windows drop the sidebar; tiny ones ask for more room", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "", toolCalls: [] }) });
  assert.match(app.screen(), /◇ 会话/);
  app.term.resize(80, 30);
  await until(() => !app.screen().includes("◇ 会话") && app.screen().includes("告诉 Karmen"), "sidebar hidden at 80 columns");
  app.term.resize(30, 10);
  await app.see("窗口太小");
  app.term.resize(100, 30);
  await app.see("告诉 Karmen");
  assert.equal(await quit(app), 0);
});

test("Ctrl+C clears a draft first and needs a second press to quit", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "", toolCalls: [] }) });
  app.term.type("草稿");
  await app.see("│ 草稿");
  app.term.type("\x03");
  await app.see("告诉 Karmen 要做什么", "draft cleared");
  app.term.type("\x03");
  await app.see("再按一次 Ctrl+C 退出");
  app.term.type("\x03");
  assert.equal(await app.done, 0);
});

test("the help and tutorial overlays open and close", async (t) => {
  const app = await setup(t, { provider: scripted({ text: "", toolCalls: [] }) });
  app.term.type("/help\r");
  await app.see("命令与按键");
  await app.see("/lang zh|en");
  app.term.type("\x1b");
  await sleep(ESC_WAIT);
  await until(() => !app.screen().includes("命令与按键"), "help closed");
  app.term.type("/learn\r");
  await app.see("教程 1/5");
  app.term.type("\x1b[C");
  await app.see("教程 2/5");
  app.term.type("\x1b");
  await sleep(ESC_WAIT);
  await until(() => !app.screen().includes("教程 2/5"), "tutorial closed");
  assert.equal(await quit(app), 0);
});

test("the tui command refuses pipes, and bad options fail before the terminal is touched", async () => {
  let err = "";
  const stderr = new Writable({
    write(chunk, _encoding, callback) {
      err += chunk.toString();
      callback();
    },
  });
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "karmenbot-home-"));
  const io = { stdin: { isTTY: false }, stdout: { isTTY: false, write() {} }, stderr, env: { KARMENBOT_HOME: home } };
  assert.equal(await runCli(["tui"], io), 2);
  assert.match(err, /需要在真实终端里运行/);
  err = "";
  assert.equal(await runCli(["--pack"], io), 2);
  assert.match(err, /不认识的参数：--pack/);
  err = "";
  assert.equal(await runCli(["--lang", "fr"], io), 2);
  assert.match(err, /只支持 zh 或 en/);
  await fs.rm(home, { recursive: true, force: true });
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/cli.mjs";
import { serviceFile } from "../src/gateway/service.mjs";
import { userPathRemoval } from "../src/commands/uninstall.mjs";
import { SYSTEMS, chaptersFor, fullMarkdown, indexMarkdown } from "../src/tutorial/chapters.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function cli(argv, answers, platform) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-tut-"));
  let out = "";
  const stdout = new Writable({ write(chunk, _e, cb) { out += chunk.toString(); cb(); } });
  const code = await runCli(argv, { stdin: { isTTY: false }, stdout, stderr: stdout, env: { KARMENBOT_HOME: home }, answers, platform });
  await fs.rm(home, { recursive: true, force: true });
  return { code, out };
}

test("karmenbot 教程 prints every chapter in Chinese when piped, and one chapter by number", async () => {
  const all = await cli(["教程"], [], "win32");
  assert.equal(all.code, 0);
  chaptersFor("win").forEach((chapter, i) => assert.match(all.out, new RegExp(`第 ${i + 1} 章 · ${chapter.title.replace(/[()]/g, "\\$&")}`)));
  const one = await cli(["learn", "6"]);
  assert.match(one.out, /第 6 章 · 多模型会商/);
  assert.doesNotMatch(one.out, /第 7 章/);
});

test("each system gets its own tutorial: its commands, keys and paths, none of the others'", async () => {
  const win = (await cli(["教程", "2"], [], "win32")).out;
  assert.match(win, /安装（Windows）/);
  assert.match(win, /irm https:\/\/karmenloop\.com\/downloads\/karmenbot\/install\.ps1 \| iex/);
  assert.match(win, /install\.cmd/);
  assert.match(win, /Windows 7 \/ 8 \/ XP/);
  assert.doesNotMatch(win, /curl -fsSL https:\/\/karmenloop\.com\/downloads\/karmenbot\/install\.sh/);
  const mac = (await cli(["教程", "2"], [], "darwin")).out;
  assert.match(mac, /安装（macOS）/);
  assert.match(mac, /⌘ 空格/);
  assert.match(mac, /curl -fsSL https:\/\/karmenloop\.com\/downloads\/karmenbot\/install\.sh \| sh/);
  assert.doesNotMatch(mac, /irm |PowerShell|apt install/);
  const linux = (await cli(["教程", "2"], [], "linux")).out;
  assert.match(linux, /Ctrl\+Alt\+T/);
  assert.match(linux, /Ctrl\+Shift\+V/);
  assert.match(linux, /sudo apt install curl/);
  assert.doesNotMatch(linux, /irm |⌘/);
  const forced = await cli(["教程", "--os", "windows", "9"], [], "darwin");
  assert.match(forced.out, /%USERPROFILE%\\\.karmenbot/, "--os overrides the detected system");
  const autostart = (os) => fullMarkdown(os).split("让它一直在线")[2];
  assert.match(autostart("mac"), /launchd/);
  assert.match(autostart("linux"), /loginctl enable-linger/);
  assert.match(autostart("win"), /启动项/);
  const bad = await cli(["教程", "--os", "beos"]);
  assert.equal(bad.code, 2);
  assert.match(bad.out, /不认识的系统：beos/);
});

test("docs hold one tutorial per system, the same text the terminal shows", async () => {
  for (const [os, system] of Object.entries(SYSTEMS)) {
    assert.equal(await fs.readFile(path.join(pkg, "docs", system.file), "utf8"), `${fullMarkdown(os).trim()}\n`, "run node scripts/build-tutorial.mjs");
  }
  assert.equal(await fs.readFile(path.join(pkg, "docs", "教程.md"), "utf8"), `${indexMarkdown().trim()}\n`);
  assert.notEqual(fullMarkdown("mac"), fullMarkdown("win"));
  assert.notEqual(fullMarkdown("win"), fullMarkdown("linux"));
});

test("uninstall on Windows drops exactly its own folder from the user PATH", () => {
  const script = userPathRemoval("C:\\Users\\O'Neil\\.karmenbot\\bin");
  assert.match(script, /\$d='C:\\Users\\O''Neil\\\.karmenbot\\bin'/, "single quotes are doubled for PowerShell");
  assert.match(script, /GetEnvironmentVariable\('Path','User'\)/);
  assert.match(script, /Where-Object\{\$_ -and \$_ -ne \$d\}/);
  assert.match(script, /SetEnvironmentVariable\('Path',.*,'User'\)/);
});

test("setup explains every step before asking, with progress", async () => {
  const run = await cli(["setup"], ["", "13", "", "sk-demo-1234", "n", "n"]);
  assert.equal(run.code, 0);
  for (const step of ["第 1 步 / 共 4 步 · 选语言", "第 2 步 / 共 4 步", "第 3 步 / 共 4 步", "第 4 步 / 共 4 步"]) assert.match(run.out, new RegExp(step));
  assert.match(run.out, /不是卡了，是我在帮你保密/);
  assert.match(run.out, /karmenbot 教程/);
  assert.ok(!run.out.includes("sk-demo-1234"), "the key is never echoed");
});

test("start-at-login entries for macOS, Linux and Windows", () => {
  const env = { KARMENBOT_HOME: "/h/.karmenbot", PATH: "/usr/bin" };
  const mac = serviceFile({ platform: "darwin", node: "/usr/bin/node", home: "/h", env });
  assert.match(mac.path, /LaunchAgents\/com\.karmenbot\.gateway\.plist$/);
  assert.match(mac.content, /<string>gateway<\/string><string>run<\/string>/);
  const linux = serviceFile({ platform: "linux", node: "/usr/bin/node", home: "/h", env });
  assert.match(linux.content, /ExecStart=\/usr\/bin\/node .*karmenbot\.mjs gateway run/);
  const win = serviceFile({ platform: "win32", node: "C:\\kb\\node.exe", home: "C:\\Users\\a", env });
  assert.equal(win.registry, "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run");
  assert.match(win.content, /^"C:\\kb\\node\.exe" ".*karmenbot\.mjs" gateway start$/);
  assert.equal(serviceFile({ platform: "aix", env }), null);
});

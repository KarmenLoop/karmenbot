#!/usr/bin/env node
// Runs the karmenbot interface inside a real pseudo-terminal (Python's pty module, sized
// 120×36), types a few keys, and reports first-frame latency and whether the
// terminal was restored. No model is configured, so nothing leaves the machine.
//   node scripts/pty-smoke.mjs            chat screen: /help, /lang, quit
//   node scripts/pty-smoke.mjs settings   settings centre: arrows, a mouse click, Esc, close
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVt } from "../test/vt.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "..", "bin", "karmenbot.mjs");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "karmenbot-pty-home-"));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "karmenbot-pty-ws-"));
const COLS = 120;
const ROWS = 36;
const settings = process.argv[2] === "settings";
const command = [process.execPath, bin, "-w", workspace, ...process.argv.slice(2)];

const PTY = `
import fcntl, os, pty, select, struct, sys, termios
cmd = sys.argv[1:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ${ROWS}, ${COLS}, 0, 0))
while True:
    try:
        ready, _, _ = select.select([fd, 0], [], [], 0.05)
    except InterruptedError:
        continue
    if 0 in ready:
        data = os.read(0, 4096)
        if data:
            os.write(fd, data)
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else status >> 8)
`;

const env = { ...process.env, KARMENBOT_HOME: home, TERM: "xterm-256color", KARMENBOT_SKIP_SETUP: "1" };
for (const key of ["KARMENBOT_MODEL", "KARMENBOT_BASE_URL", "KARMENBOT_API_KEY", "CI", "KARMENBOT_NO_ANIM", "NO_COLOR", "FORCE_COLOR"]) delete env[key];

const started = performance.now();
const child = spawn("python3", ["-c", PTY, ...command], { env, stdio: ["pipe", "pipe", "inherit"] });
let output = "";
let firstFrame = null;
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
  if (firstFrame === null && output.includes(settings ? "设置中心" : "╭─")) firstFrame = performance.now() - started;
});

// The settings centre lists 模型 on body row 7 (1-based): a click there opens it.
const steps = settings
  ? [[900, "\x1b[B\x1b[B\r"], [500, "\x1b"], [400, "\x1b[<0;20;7M\x1b[<0;20;7m"], [500, "\x1b"], [400, "\x1b"]]
  : [[900, "/help\r"], [500, "\x1b"], [300, "/lang en\r"], [400, "/lang zh\r"], [400, "\x03"], [200, "\x03"]];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (const [delay, keys] of steps) {
  await wait(delay);
  child.stdin.write(keys);
}
const code = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    resolve("timeout");
  }, 5000);
  child.on("exit", (exit) => {
    clearTimeout(timer);
    resolve(exit);
  });
});

const vt = createVt(COLS, ROWS);
vt.write(output);
if (process.env.SMOKE_SCREEN) console.log(vt.text());
const checks = settings
  ? { arrowsOpenedChatApps: output.includes("点一个平台接入"), clickOpenedModels: output.includes("还没有模型") }
  : { sawHelp: output.includes("命令与按键"), sawEnglish: output.includes("Switched to English.") };
const tail = output.slice(-200);
const report = {
  exitCode: code,
  firstFrameMs: firstFrame === null ? null : Math.round(firstFrame),
  ...checks,
  leftAltScreen: tail.includes("\x1b[?1049l"),
  cursorShown: tail.includes("\x1b[?25h"),
  pasteModeOff: tail.includes("\x1b[?2004l"),
  mouseOff: tail.includes("\x1b[?1000l"),
  ringDrawn: /[▀▄]{3}/.test(vt.text()),
  bytes: output.length,
};
console.log(JSON.stringify(report, null, 2));
fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(workspace, { recursive: true, force: true });
process.exit(code === 0 && Object.values(checks).every(Boolean) && report.leftAltScreen && report.cursorShown && report.mouseOff ? 0 : 1);

#!/usr/bin/env node
// Renders real karmenbot frames (fake terminal, local stand-in model, no network)
// into an HTML page with full colors, for visual review.
//   node scripts/preview-html.mjs [out-dir]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { runCli } from "../src/cli.mjs";
import { createPairing } from "../src/gateway/pairing.mjs";
import { savePlatform } from "../src/gateway/platforms/forms.mjs";
import { saveConfig } from "../src/home.mjs";
import { addModel } from "../src/models.mjs";
import { runTui } from "../src/tui/app.mjs";
import { charWidth } from "../src/tui/text.mjs";
import { openAiServer } from "../test/mock/servers.mjs";

const COLS = 132;
const ROWS = 40;
const outDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), "karmenbot-preview"));

function colorVt(cols, rows) {
  const blank = () => ({ ch: " ", fg: null, bg: null, bold: false, dim: false, italic: false, under: false });
  let grid = Array.from({ length: rows }, () => Array.from({ length: cols }, blank));
  let x = 0;
  let y = 0;
  let pen = blank();
  const sgr = (params) => {
    const list = params ? params.split(";").map(Number) : [0];
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      if (p === 0) pen = blank();
      else if (p === 1) pen.bold = true;
      else if (p === 2) pen.dim = true;
      else if (p === 3) pen.italic = true;
      else if (p === 4) pen.under = true;
      else if (p === 7) [pen.fg, pen.bg] = [pen.bg || [12, 13, 20], pen.fg || [226, 230, 242]];
      else if ((p === 38 || p === 48) && list[i + 1] === 5) {
        const n = list[i + 2];
        const rgb = n === 16 ? [0, 0, 0] : n === 231 ? [255, 255, 255] : n >= 232 ? Array(3).fill(8 + (n - 232) * 10) : [128, 128, 128];
        if (p === 38) pen.fg = rgb;
        else pen.bg = rgb;
        i += 2;
      } else if ((p === 38 || p === 48) && list[i + 1] === 2) {
        const rgb = list.slice(i + 2, i + 5);
        if (p === 38) pen.fg = rgb;
        else pen.bg = rgb;
        i += 4;
      }
    }
  };
  return {
    write(data) {
      let i = 0;
      while (i < data.length) {
        if (data[i] === "\x1b") {
          const m = /^\x1b\[(\??)([0-9;]*)([A-Za-z~])/.exec(data.slice(i, i + 64));
          if (m) {
            const [, priv, params, final] = m;
            if (!priv && final === "m") sgr(params);
            else if (!priv && final === "H") {
              const [r, c] = params.split(";").map(Number);
              y = (r || 1) - 1;
              x = (c || 1) - 1;
            } else if (!priv && final === "J") grid = Array.from({ length: rows }, () => Array.from({ length: cols }, blank));
            else if (!priv && final === "K" && y < rows) for (let k = params === "2" ? 0 : x; k < cols; k += 1) grid[y][k] = blank();
            i += m[0].length;
            continue;
          }
          i += 1;
          continue;
        }
        if (data[i] === "\n") {
          y += 1;
          x = 0;
          i += 1;
          continue;
        }
        if (data[i] === "\r") {
          x = 0;
          i += 1;
          continue;
        }
        const ch = String.fromCodePoint(data.codePointAt(i));
        const w = charWidth(ch);
        if (y < rows && x < cols && w > 0) {
          grid[y][x] = { ...pen, ch, wide: w === 2 };
          if (w === 2 && x + 1 < cols) grid[y][x + 1] = { ...pen, ch: "" };
        }
        x += w;
        i += ch.length;
      }
    },
    html() {
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      return grid.map((row) => row.map((cell) => {
        if (cell.ch === "") return "";
        const css = [];
        if (cell.fg) css.push(`color:rgb(${cell.fg.join(",")})`);
        if (cell.bg) css.push(`background:rgb(${cell.bg.join(",")})`);
        if (cell.bold) css.push("font-weight:700");
        if (cell.dim) css.push("opacity:.6");
        if (cell.italic) css.push("font-style:italic");
        if (cell.under) css.push("text-decoration:underline");
        return `<i class="${cell.wide ? "w" : "c"}" style="${css.join(";")}">${esc(cell.ch)}</i>`;
      }).join("")).join("\n");
    },
  };
}

function terminal(cols = COLS, rows = ROWS) {
  const vt = colorVt(cols, rows);
  let log = "";
  const stdout = new Writable({
    write(chunk, _e, cb) {
      log += chunk.toString();
      vt.write(chunk.toString());
      cb();
    },
  });
  Object.assign(stdout, { isTTY: true, columns: cols, rows });
  const stdin = new PassThrough();
  Object.assign(stdin, { isTTY: true, setRawMode: () => stdin });
  return { stdin, stdout, vt, text: () => log };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let i = 0; i < 400 && !check(); i += 1) await wait(10);
}

const ANSWER = `## 计划

先读 \`src/utils.js\`，再为 **formatPrice** 和 **slugify** 补单元测试：

1. 覆盖正常输入与边界值
2. 中文标题的 slug 保留拼音前的原文
3. 用内置 \`node:test\`，不引入依赖

\`\`\`js
test("formatPrice keeps two decimals", () => {
  assert.equal(formatPrice(3), "¥3.00");
});
\`\`\``;



function homeDir() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "karmenbot-preview-home-"));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "karmenbot-preview-ws-"));
  fs.mkdirSync(path.join(ws, "合同"));
  fs.writeFileSync(path.join(ws, "合同", "租赁合同.md"), "# 办公室租赁合同\n第五条 付款：每季度首月 5 日前支付租金。\n");
  return { home, ws, env: { KARMENBOT_HOME: home } };
}

async function tuiScene(name, { env, ws, providerOverride, splash = false, drive, cols, rows, ...rest }) {
  const term = terminal(cols, rows);
  const done = runTui({ stdin: term.stdin, stdout: term.stdout, env, cwd: ws, home: os.tmpdir(), splash, depth: "truecolor", providerOverride, ...rest });
  await drive(term);
  const html = term.vt.html();
  term.stdin.write("\x03\x03\x03");
  await Promise.race([done, wait(1500)]);
  return { name, html };
}

const parts = [];

// 1. MoA through real model configuration: two advisors are still thinking.
{
  const { env, ws } = homeDir();
  const model = await openAiServer(async (body) => {
    if (body.model.startsWith("ref")) return { text: "建议先读合同第五条。", delay: 6000 };
    return { text: "好的。" };
  });
  addModel({ id: "deepseek", name: "DeepSeek", model: "ref-deepseek", baseUrl: `${model.url}/v1` }, { apiKey: "k" }, env);
  addModel({ id: "qwen", name: "通义千问", model: "ref-qwen", baseUrl: `${model.url}/v1` }, { apiKey: "k" }, env);
  addModel({ id: "claude", name: "Claude", model: "agg", baseUrl: `${model.url}/v1` }, { apiKey: "k", makeDefault: true }, env);
  saveConfig({ moa: { enabled: true, preset: "default", presets: { default: { references: ["deepseek", "qwen"], aggregator: "claude", fanout: "user_turn", timeoutSec: 120 } } } }, env);
  parts.push(await tuiScene("MoA 多模型协作：两个参考模型出主意，Claude 汇总执行", {
    env, ws,
    async drive(term) {
      await until(() => term.text().includes("就绪"));
      term.stdin.write("帮我看一下租赁合同的付款条款，整理成待办\r");
      await until(() => term.text().replace(/\x1b\[[0-9;]*m/g, "").includes("MoA 参考"));
      await wait(600);
    },
  }));
  await model.close();
}

// 2. An edit waiting for approval.
{
  const { env, ws } = homeDir();
  let step = 0;
  const providerOverride = {
    name: "DeepSeek",
    async complete({ onDelta }) {
      step += 1;
      if (step === 1) {
        const text = "## 付款条款\n\n- **每季度首月 5 日前**支付租金\n- 逾期需按日支付滞纳金\n\n我把待办写进 `待办.md`：";
        for (const piece of text.match(/[\s\S]{1,10}/g)) {
          onDelta(piece);
          await wait(3);
        }
        return { text, toolCalls: [{ id: "w1", name: "write_file", arguments: { path: "待办.md", content: "# 待办\n- [ ] 1 月 5 日前支付第一季度租金\n- [ ] 4 月 5 日前支付第二季度租金\n- [ ] 7 月 5 日前支付第三季度租金\n- [ ] 10 月 5 日前支付第四季度租金\n" } }], usage: { prompt: 3120, completion: 260 } };
      }
      return { text: "已写好。", toolCalls: [] };
    },
  };
  parts.push(await tuiScene("修改前先确认：差异窗口里按 y 才写入", {
    env, ws, providerOverride,
    async drive(term) {
      await until(() => term.text().includes("就绪"));
      term.stdin.write("把合同里的付款时间整理成待办清单\r");
      await until(() => term.text().includes("y 接受"));
      await wait(150);
    },
  }));
}

// 3. The KARMEN prism intro.
{
  const { env, ws } = homeDir();
  parts.push(await tuiScene("开屏：KARMEN 折光体", { env, ws, splash: true, providerOverride: { name: "DeepSeek", complete: async () => ({ text: "", toolCalls: [] }) }, async drive() { await wait(900); } }));
}

// 4. `karmenbot connect weixin`: the login code drawn in the terminal.
{
  const { env } = homeDir();
  const vt = colorVt(COLS, ROWS);
  const stdout = new Writable({ write(chunk, _e, cb) { vt.write(chunk.toString()); cb(); } });
  let polls = 0;
  const fetchImpl = async (url) => {
    const target = new URL(url);
    let body = {};
    if (target.pathname.endsWith("get_bot_qrcode")) body = { qrcode: "preview", qrcode_img_content: "https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=preview-karmenbot&bot_type=3" };
    else if (target.pathname.endsWith("get_qrcode_status")) {
      polls += 1;
      await wait(400);
      body = { status: "wait" };
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  const running = runCli(["connect", "weixin"], { stdin: { isTTY: false }, stdout, stderr: stdout, env: { ...env }, fetchImpl, answers: [] });
  await until(() => polls >= 1);
  parts.push({ name: "karmenbot connect weixin：终端里直接扫码登录", html: vt.html() });
  running.catch(() => {});
}

// 5–9. The settings centre: everything with arrows + Enter or the mouse.
const plain = (term) => term.text().replace(/\x1b\[[0-9;]*m/g, "");
const fakeServices = { probe: async () => ({ ok: true, ms: 418 }), gatewayPid: () => 0, autostart: () => false, setAutostart: async () => {}, startGateway: async () => 0, stopGateway: async () => true };
{
  const { env, ws } = homeDir();
  parts.push(await tuiScene("设置中心（第一次运行自动打开）：方向键或鼠标点选", {
    env, ws, settings: "first", settingsServices: fakeServices, cols: 110, rows: 30,
    async drive(term) {
      await until(() => plain(term).includes("从这里开始"));
    },
  }));
}
{
  const { env, ws } = homeDir();
  parts.push(await tuiScene("添加模型：选厂商、粘贴密钥（只显示圆点）、保存并测试", {
    env, ws, settings: "only", settingsServices: fakeServices, cols: 110, rows: 30,
    async drive(term) {
      await until(() => plain(term).includes("从这里开始"));
      term.stdin.write("\r\r");
      await until(() => plain(term).includes("DeepSeek"));
      term.stdin.write("deepseek\r");
      await until(() => plain(term).includes("添加 DeepSeek"));
      term.stdin.write("\r\x1b[200~sk-preview-0000000000000000\x1b[201~");
      await wait(150);
    },
  }));
}
{
  const { env, ws } = homeDir();
  parts.push(await tuiScene("个人微信：设置中心里扫码一键接入", {
    env, ws, settings: "only", cols: 110, rows: 40,
    settingsServices: { ...fakeServices, scan: (_name, { onCode }) => { onCode({ url: "https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=preview-karmenbot&bot_type=3" }); return new Promise(() => {}); } },
    async drive(term) {
      await until(() => plain(term).includes("从这里开始"));
      term.stdin.write("\x1b[B\x1b[B\r");
      await until(() => plain(term).includes("个人微信"));
      term.stdin.write("\x1b[B\x1b[B\r\r");
      await until(() => plain(term).includes("微信扫一扫"));
      await wait(150);
    },
  }));
}
{
  const { env, ws } = homeDir();
  savePlatform(env, "feishu", { domain: "feishu" }, { appId: "cli_preview", appSecret: "s" });
  createPairing({ env }).request("feishu", "ou_preview", "张三");
  parts.push(await tuiScene("后台网关：启动、开机自启、点一下批准配对", {
    env, ws, settings: "only", cols: 110, rows: 30,
    settingsServices: { ...fakeServices, gatewayPid: () => 52731, autostart: () => true },
    async drive(term) {
      await until(() => plain(term).includes("运行中"));
      term.stdin.write("\x1b[B\x1b[B\x1b[B\r");
      await until(() => plain(term).includes("配对请求"));
      term.stdin.write("\x1b[B\x1b[B");
      await wait(150);
    },
  }));
}
{
  const { env, ws } = homeDir();
  parts.push(await tuiScene("小窗口（80×24，macOS 终端默认大小）", {
    env, ws, settings: "only", settingsServices: fakeServices, cols: 80, rows: 24,
    async drive(term) {
      await until(() => plain(term).includes("从这里开始"));
    },
  }));
}

// Every cell is pinned to one (or two) character widths so box and block
// glyphs from fallback fonts cannot shift the grid the way a browser would.
fs.mkdirSync(outDir, { recursive: true });
const style = `<style>
body{background:#0b0c12;color:#e2e6f2;margin:12px;font-family:-apple-system,sans-serif}
h2{font-weight:500;font-size:13px;color:#9aa0b8;margin:0 0 6px}
pre{font-family:Menlo,"SF Mono","PingFang SC",monospace;font-size:11.5px;line-height:1.25;background:#0e0f16;padding:8px 10px;border-radius:8px;display:inline-block;margin:0}
pre i{font-style:normal;display:inline-block;width:1ch;overflow:visible;text-align:center}
pre i.w{width:2ch}
</style>`;
parts.forEach((part, index) => {
  const file = path.join(outDir, `scene${index + 1}.html`);
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>${part.name}</title>${style}<h2>${part.name}</h2><pre>${part.html}</pre>`);
  console.log(file);
});
process.exit(0);

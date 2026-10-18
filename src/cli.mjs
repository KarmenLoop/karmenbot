import fs from "node:fs";
import path from "node:path";
import { KarmenError } from "./errors.mjs";
import { loadConfig } from "./home.mjs";
import { createT, normalizeLang, resolveLang } from "./i18n.mjs";
import { MODES } from "./kernel.mjs";
import { VERSION } from "./version.mjs";

const COMMANDS = {
  tui: () => import("./commands/tui.mjs"),
  ask: () => import("./commands/ask.mjs"),
  setup: () => import("./commands/setup.mjs"),
  settings: () => import("./commands/settings.mjs"),
  model: () => import("./commands/model.mjs"),
  moa: () => import("./commands/moa.mjs"),
  connect: () => import("./commands/connect.mjs"),
  gateway: () => import("./commands/gateway.mjs"),
  pair: () => import("./commands/pair.mjs"),
  doctor: () => import("./commands/doctor.mjs"),
  update: () => import("./commands/update.mjs"),
  uninstall: () => import("./commands/uninstall.mjs"),
  help: () => import("./commands/help.mjs"),
  learn: () => import("./commands/learn.mjs"),
};

const ALIASES = {
  run: "ask", 问: "ask", 做: "ask", 设置: "settings", 设置中心: "settings", 向导: "setup", 初始化: "setup", 模型: "model", 多模型: "moa", 接入: "connect",
  网关: "gateway", 配对: "pair", 体检: "doctor", 卸载: "uninstall", 帮助: "help", 界面: "tui",
  教程: "learn", 教学: "learn", tutorial: "learn", 官网: "update", 关于: "update", 更新: "update",
};

const VALUE = { "-w": "workspace", "--workspace": "workspace", "--lang": "lang", "-m": "mode", "--mode": "mode", "--model-file": "modelFile", "--os": "os" };
const BOOL = {
  "-y": ["yes", true], "--yes": ["yes", true], "--moa": ["moa", true], "--no-moa": ["moa", false], "--no-splash": ["splash", false],
  "--no-color": ["color", false], "--json": ["json", true], "-h": ["help", true], "--help": ["help", true], "--all": ["all", true],
  "--check": ["check", true], "--foreground": ["foreground", true],
};

export function parseArgs(argv) {
  const opts = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    let flag = argv[i];
    if (flag === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!flag.startsWith("-") || flag === "-") {
      positionals.push(flag);
      continue;
    }
    let value;
    const eq = flag.indexOf("=");
    if (flag.startsWith("--") && eq > 0) {
      value = flag.slice(eq + 1);
      flag = flag.slice(0, eq);
    }
    if (VALUE[flag]) {
      value ??= argv[++i];
      if (!value) throw new KarmenError("err.flagValue", { flag });
      opts[VALUE[flag]] = value;
    } else if (BOOL[flag] && value === undefined) {
      opts[BOOL[flag][0]] = BOOL[flag][1];
    } else {
      throw new KarmenError("err.unknownFlag", { flag: argv[i] });
    }
  }
  if (opts.mode && !MODES.includes(opts.mode)) throw new KarmenError("err.badMode", { mode: opts.mode, modes: MODES.join(", ") });
  if (opts.lang) {
    opts.lang = normalizeLang(opts.lang);
    if (!opts.lang) throw new KarmenError("err.badLang");
  }
  return { opts, positionals };
}

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const stdin = io.stdin || process.stdin;
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const env = io.env || process.env;
  const cwd = io.cwd || process.cwd();
  if (argv[0] === "-v" || argv[0] === "--version" || argv[0] === "version") {
    stdout.write(`karmenbot ${VERSION}\n`);
    return 0;
  }
  let t = createT(resolveLang({ env }));
  try {
    const { opts, positionals } = parseArgs(argv);
    t = createT(resolveLang({ flag: opts.lang, env, config: loadConfig(env) }));
    let name = positionals[0] ? COMMANDS[positionals[0]] ? positionals[0] : ALIASES[positionals[0]] : null;
    let rest = name ? positionals.slice(1) : positionals;
    if (!name && positionals.length) {
      if (/^[a-z][a-z-]*$/.test(positionals[0]) && positionals.length === 1) throw new KarmenError("err.unknownCommand", { name: positionals[0] });
      name = "ask";
      rest = positionals;
    }
    if (!name) name = opts.help ? "help" : stdin.isTTY && stdout.isTTY ? "tui" : "help";
    if (opts.help && name !== "help") {
      rest = [name];
      name = "help";
    }
    const workspace = path.resolve(cwd, opts.workspace || ".");
    if (!fs.statSync(workspace, { throwIfNoEntry: false })?.isDirectory()) throw new KarmenError("err.workspace", { path: workspace });
    const ctx = { opts, args: rest, t, env, cwd, workspace, stdin, stdout, stderr, io, version: VERSION };
    const module = await COMMANDS[name]();
    return (await module.run(ctx)) ?? 0;
  } catch (error) {
    if (error instanceof KarmenError) {
      stderr.write(`${t(error.key, error.vars)}\n`);
      return error.exitCode;
    }
    stderr.write(`${t("err.failed", { message: error?.message || String(error) })}\n`);
    if (env.KARMENBOT_DEBUG) stderr.write(`${error?.stack || ""}\n`);
    return 1;
  }
}

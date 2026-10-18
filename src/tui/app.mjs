import os from "node:os";
import path from "node:path";
import { openAgent } from "../agent.mjs";
import { KarmenError } from "../errors.mjs";
import { karmenHome, loadConfig, saveConfig } from "../home.mjs";
import { PLATFORM_LABELS as PLATFORMS } from "../gateway/platforms/labels.mjs";
import { MODES } from "../kernel.mjs";
import { depthOf } from "../term.mjs";
import { activeModel, listModels, publicModel, recordFor, useModel } from "../models.mjs";
import { resolveMoa } from "../moa.mjs";
import { asksWhoMadeIt, checkUpdate, identityText, OFFICIAL } from "../official.mjs";
import { VERSION } from "../version.mjs";
import { createEditor } from "./editor.mjs";
import { LEARN_PAGES, createT as createTuiT, normalizeLang, resolveLang } from "../i18n.mjs";
import { createKeyParser } from "./keys.mjs";
import { createScreen, fitSpans, overlaySpans, sp, spansWidth, toAnsi, wrapSpans } from "./paint.mjs";
import { createSettings } from "./settings.mjs";
import { matchSlash, parseSlash } from "./slash.mjs";
import { C } from "./theme.mjs";
import { createTranscript } from "./transcript.mjs";
import {
  SIDEBAR_MIN_COLS, SIDEBAR_WIDTH, bannerLines, composerView, dialogView, headerView, helpView, learnView,
  listView, modeItems, paletteView, sidebarView, splashView, statusView, welcomeLines,
} from "./views.mjs";

const ESC_DELAY = 30;
const TICK = 80;
const STEP_MS = 260;
const SPLASH_HOLD = 380;
const FLASH_MS = 2200;
const EXIT_WINDOW = 1500;
const MIN_COLS = 40;
const MIN_ROWS = 12;

const message = (error, t) => (error instanceof KarmenError ? t(error.key, error.vars) : error?.message || String(error));

// Full-screen karmenbot: one conversation on the Koder kernel, every edit and
// command confirmed in a dialog. Resolves with the exit code once the terminal is restored.
// options.settings: "first" opens the settings centre on arrival; "only" shows
// nothing else and quits when it closes (karmenbot settings).
export function runTui(options = {}) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const env = options.env || process.env;
  const workspace = path.resolve(options.cwd || process.cwd(), options.workspace || ".");
  const home = options.home ?? os.homedir();
  const depth = options.depth || depthOf(stdout, env, options.color);
  const version = `v${VERSION}`;

  const config = loadConfig(env);
  const moa = resolveMoa(config);
  if (options.moa !== undefined) moa.enabled = Boolean(options.moa);
  const state = {
    lang: resolveLang({ flag: options.lang, env, config }),
    mode: options.mode || "standard",
    autoYes: Boolean(options.yes),
    sidebar: true,
    status: options.settings === "only" ? "idle" : "loading",
    startedAt: Date.now(),
    turnStarted: 0,
    scroll: 0,
    lastTotal: 0,
    overlay: null,
    palette: { text: "", index: 0 },
    flash: null,
    exitArmed: 0,
    interrupting: false,
    kernel: {},
    splash: null,
    progress: null,
    moa,
    current: null,
    settings: null,
    overlayBox: null,
  };
  let t = createTuiT(state.lang);
  const editor = createEditor();
  const transcript = createTranscript();
  const parser = createKeyParser();
  const screen = createScreen(stdout, { depth });
  let agent = null;
  let engine = null;
  let model = null;
  let modelError = "";
  try {
    model = options.providerOverride ? null : activeModel({ env, modelFile: options.modelFile });
  } catch (error) {
    modelError = message(error, t);
  }
  const modelLabel = () => {
    if (state.current) return { name: state.current.moa ? `${state.current.label} · ${state.current.aggregator}` : state.current.label };
    if (options.providerOverride) return { name: options.providerOverride.name || "override" };
    return model ? publicModel(model.record) : null;
  };

  const size = () => ({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  const phase = () => ((Date.now() - state.startedAt) / 1000) * 0.6;
  const busy = () => state.status === "running" || state.status === "waiting";

  transcript.custom((width) => bannerLines({ width, depth, t, version }), { keep: true });
  const welcome = transcript.custom((width) => welcomeLines({ t, model: model && { public: publicModel(model.record), source: model.source }, modelError, moa: state.current }).flatMap((line) => wrapSpans(line, width, { hang: [sp("  ")] })), { keep: true, animated: false });

  // ── rendering ──────────────────────────────────────────────────────────
  let closed = false;
  let scheduled = false;
  let ticker = null;
  let escTimer = null;
  let flashTimer = null;

  const animating = () => Boolean(state.splash) || state.status === "running" || state.status === "loading";

  function ensureTicker() {
    if (ticker || closed || !animating()) return;
    ticker = setInterval(() => {
      if (state.splash) maybeEndSplash();
      if (!animating()) {
        clearInterval(ticker);
        ticker = null;
      }
      schedule();
    }, TICK);
  }

  function schedule() {
    if (closed) return;
    ensureTicker();
    if (scheduled) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      if (!closed) paint();
    });
  }

  function paint() {
    const { cols } = size();
    screen.mouse(Boolean(state.settings || state.overlay?.kind === "pause"));
    const { rows, cursor } = frame();
    screen.paint(rows.map((row) => toAnsi(fitSpans(row, cols), depth)), cursor);
  }

  function flash(text, tone = "info") {
    state.flash = { text, tone };
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      state.flash = null;
      schedule();
    }, FLASH_MS);
  }

  function info(text, color = C.soft) {
    transcript.info([[sp(text, { fg: color })]]);
  }

  // Each step is shown as running until both its turn has come and the thing
  // it names is really done; the kernel step waits for the kernel.
  function splashSteps() {
    const elapsed = Date.now() - state.splash.started;
    const { cols, rows } = size();
    const kernelDone = !state.splash.waitKernel || state.kernel.ms !== undefined || Boolean(state.kernel.error);
    const platforms = Object.keys(config.gateway?.platforms || {}).filter((name) => PLATFORMS[name]).map((name) => PLATFORMS[name][state.lang === "en" ? "en" : "zh"]);
    const label = modelLabel();
    const defs = [
      { label: t("splash.kernel"), ready: kernelDone, bad: Boolean(state.kernel.error), detail: state.kernel.error || t("splash.kernelDetail", { ms: state.kernel.ms ?? "…" }) },
      { label: t("splash.config"), ready: true, detail: home && karmenHome(env).startsWith(home) ? `~${karmenHome(env).slice(home.length)}` : karmenHome(env) },
      { label: t("splash.model"), ready: true, warn: !label, detail: label ? label.name || label.model : t("splash.noModel") },
      { label: t("splash.platforms"), ready: true, detail: platforms.length ? platforms.join("、") : t("splash.noPlatforms") },
      { label: t("splash.ui"), ready: true, detail: t("splash.uiDetail", { cols, rows }) },
    ];
    let blocked = false;
    return defs.map((def, i) => {
      if (blocked || elapsed < i * STEP_MS) return { ...def, state: "wait", detail: "" };
      if (elapsed < (i + 1) * STEP_MS || !def.ready) {
        blocked = true;
        return { ...def, state: "run", detail: "" };
      }
      return { ...def, state: def.bad ? "bad" : def.warn ? "warn" : "ok" };
    });
  }

  function startSplash(waitKernel) {
    const quips = t("splash.quips").split("|");
    state.splash = { started: Date.now(), waitKernel, quip: quips[Math.floor(Math.random() * quips.length)] };
    schedule();
  }

  function maybeEndSplash(force = false) {
    if (!state.splash) return;
    if (!force) {
      const steps = splashSteps();
      if (steps.some((step) => step.state === "wait" || step.state === "run")) return;
      if (Date.now() - state.splash.started < steps.length * STEP_MS + SPLASH_HOLD) return;
    }
    state.splash = null;
    schedule();
  }

  function paletteItems() {
    if (state.overlay) return [];
    const items = matchSlash(editor.value);
    if (state.palette.text !== editor.value) state.palette = { text: editor.value, index: 0 };
    return items;
  }

  function overlayRows(cols, height) {
    const overlay = state.overlay;
    if (overlay.kind === "pause") return dialogView({ overlay, width: cols, height, t, cwd: workspace });
    if (overlay.kind === "help") {
      const view = helpView({ width: cols, height, t, scroll: overlay.scroll });
      overlay.scroll = view.scroll;
      return view.rows;
    }
    if (overlay.kind === "learn") return learnView({ width: cols, height, t, page: overlay.page });
    return listView({ width: cols, height, heading: t("mode.title"), items: modeItems(t), index: overlay.index, footer: t("dialog.choiceKeys") });
  }

  function frame() {
    const { cols, rows } = size();
    const now = phase();
    if (state.splash) {
      return { rows: splashView({ cols, rows, depth, t, version, phase: now, steps: splashSteps(), quip: state.splash.quip }), cursor: null };
    }
    if (state.settings) return { rows: state.settings.view({ cols, rows }), cursor: null };
    if (cols < MIN_COLS || rows < MIN_ROWS) {
      const out = Array.from({ length: rows }, () => []);
      out[Math.floor(rows / 2)] = wrapSpans([sp(t("tui.tooSmall"), { fg: C.warn })], cols)[0];
      return { rows: out, cursor: null };
    }
    const active = state.status === "running";
    const thread = engine?.thread;
    const header = headerView({ width: cols, t, phase: now, active, version, workspace, home, model: modelLabel(), mode: state.mode, autoYes: state.autoYes });
    const composer = composerView({
      editor, width: cols, t, status: state.status, phase: now, mode: state.mode, autoYes: state.autoYes,
      maxRows: Math.max(1, Math.min(8, Math.floor(rows / 4))),
    });
    const status = statusView({
      width: cols, t, status: state.status, phase: now, elapsed: Date.now() - state.turnStarted,
      tool: thread?.lastTool || null, usage: thread?.usage, flash: state.flash, kernel: state.kernel, progress: state.progress,
    });
    const bodyHeight = Math.max(1, rows - header.length - composer.rows.length - 1);
    const side = state.sidebar && cols >= SIDEBAR_MIN_COLS;
    const mainWidth = side ? cols - SIDEBAR_WIDTH : cols;
    const textWidth = mainWidth - 2;
    const lines = transcript.lines(textWidth, t, now);
    if (state.scroll > 0 && lines.length > state.lastTotal) state.scroll += lines.length - state.lastTotal;
    state.lastTotal = lines.length;
    state.scroll = Math.max(0, Math.min(state.scroll, lines.length - bodyHeight));
    const start = Math.max(0, lines.length - bodyHeight - state.scroll);
    const visible = lines.slice(start, start + bodyHeight);
    const sideRows = side
      ? sidebarView({
        width: SIDEBAR_WIDTH, height: bodyHeight, t, phase: now, active, depth, workspace, home, model: modelLabel(),
        moa: state.current?.moa ? state.current.references.join("、") : null,
        mode: state.mode, autoYes: state.autoYes, usage: thread?.usage,
        files: (thread?.artifacts || []).map((item) => item.path),
        tools: transcript.blocks.filter((block) => block.type === "tool").map((block) => block.name),
      })
      : null;
    const body = [];
    for (let y = 0; y < bodyHeight; y += 1) {
      const left = [sp(" "), ...fitSpans(visible[y] || [], textWidth), sp(" ")];
      body.push(side ? [...left, ...sideRows[y]] : left);
    }
    if (state.scroll > 0) {
      const tag = [sp(` ${t("tui.more", { n: state.scroll })} `, { fg: C.headerBg, bg: C.accent, bold: true })];
      body[bodyHeight - 1] = overlaySpans(body[bodyHeight - 1], Math.max(0, mainWidth - spansWidth(tag) - 1), tag, cols);
    }
    const items = paletteItems();
    if (items.length) {
      state.palette.index = Math.min(state.palette.index, items.length - 1);
      const panel = paletteView({ width: mainWidth, t, items, index: state.palette.index });
      const top = Math.max(0, bodyHeight - panel.length);
      panel.forEach((row, i) => {
        if (top + i < bodyHeight) body[top + i] = overlaySpans(body[top + i], 1, row, cols);
      });
    }
    let cursor = { x: composer.cursor.x, y: header.length + bodyHeight + composer.cursor.y };
    if (state.overlay) {
      const panel = overlayRows(cols, bodyHeight);
      const x = Math.max(0, Math.floor((cols - spansWidth(panel[0])) / 2));
      const top = Math.max(0, Math.floor((bodyHeight - panel.length) / 2));
      panel.forEach((row, i) => {
        if (top + i < bodyHeight) body[top + i] = overlaySpans(body[top + i], x, row, cols);
      });
      state.overlayBox = { x, y: header.length + top, hits: panel.hits || [] };
      cursor = null;
    }
    return { rows: [...header, ...body, ...composer.rows, status], cursor };
  }

  // ── engine ─────────────────────────────────────────────────────────────
  const kernel = options.settings === "only" ? Promise.resolve(null) : (async () => {
    await new Promise((resolve) => setImmediate(resolve));
    try {
      agent = await openAgent({
        workspace, env, model, moa: state.moa, providerOverride: options.providerOverride, fetchImpl: options.fetchImpl,
        onProgress(progress) {
          state.progress = progress.phase === "done" ? null : progress;
          schedule();
        },
      }).catch(async (error) => {
        if (!state.moa.enabled) throw error;
        modelError = message(error, t);
        state.moa.enabled = false;
        return openAgent({ workspace, env, model, providerOverride: options.providerOverride, fetchImpl: options.fetchImpl });
      });
      const convo = await agent.conversation("tui", { mode: state.mode });
      state.current = agent.current;
      transcript.touch(welcome);
      engine = {
        diff: agent.diff,
        get thread() {
          return convo.thread;
        },
        get busy() {
          return convo.busy;
        },
        turn: (text, opts) => convo.turn(text, opts),
        cancel: () => convo.cancel(),
        reset: (mode) => convo.reset(mode),
      };
      state.kernel = { ms: agent.loadMs };
    } catch (error) {
      state.kernel = { error: message(error, t) };
    }
    if (state.status === "loading") state.status = "idle";
    maybeEndSplash();
    schedule();
    return engine;
  })();

  async function readyAgent() {
    await kernel;
    return agent;
  }

  function decide(pause) {
    if (pause.kind === "secret") return { cancel: true };
    if (state.autoYes && (pause.kind === "change" || pause.kind === "approval")) return { accept: true };
    return new Promise((resolve) => {
      state.status = "waiting";
      state.overlay = {
        kind: "pause",
        pause,
        scroll: 0,
        index: 0,
        diff: pause.kind === "change" ? engine.diff(pause.before, pause.after) : null,
        resolve(decision) {
          state.overlay = null;
          if (state.status === "waiting") state.status = "running";
          resolve(decision);
          schedule();
        },
      };
      schedule();
    });
  }

  async function submit(text) {
    if (busy()) {
      flash(t("tui.busy"), "warn");
      return;
    }
    editor.remember(text);
    editor.clear();
    state.scroll = 0;
    transcript.user(text);
    state.status = "running";
    state.turnStarted = Date.now();
    state.interrupting = false;
    schedule();
    const ready = engine || (await kernel);
    if (!ready) {
      transcript.notice(state.kernel.error || "kernel", { tone: "error" });
      state.status = "idle";
      schedule();
      return;
    }
    try {
      const outcome = await ready.turn(text, {
        mode: state.mode,
        decide,
        onEvent(event) {
          transcript.apply(event, t);
          schedule();
        },
      });
      transcript.settle();
      if (outcome.detail) {
        const notice = transcript.lastNotice("API_UNREACHABLE");
        if (notice) {
          notice.detail = outcome.detail;
          transcript.touch(notice);
        }
      }
      if (state.interrupting && !outcome.cancelled) transcript.notice(t("tui.cancelled"));
    } catch (error) {
      transcript.settle();
      transcript.notice(t("err.failed", { message: message(error, t) }), { tone: "error" });
    } finally {
      state.status = "idle";
      state.progress = null;
      state.interrupting = false;
      if (state.overlay?.kind === "pause") state.overlay = null;
      schedule();
    }
  }

  function interrupt() {
    if (state.interrupting || !engine) return;
    state.interrupting = true;
    flash(t("tui.interrupting"), "warn");
    engine.cancel().catch(() => {});
  }

  // ── slash commands ─────────────────────────────────────────────────────
  function modelInfo() {
    if (!model) {
      transcript.info([[sp(modelError || t("model.none"), { fg: C.warn })], [sp(t("model.howto"), { fg: C.dim })]]);
      return;
    }
    const pub = publicModel(model.record);
    const lines = [[sp("◆ ", { fg: C.cyan }), sp(t("model.line", { name: pub.name, model: pub.model, protocol: pub.protocol }), { fg: C.text, bold: true })]];
    if (pub.baseUrl) lines.push([sp(`  ${t("model.url", { url: pub.baseUrl })}`, { fg: C.dim })]);
    if (pub.apiKey) lines.push([sp(`  ${t("model.key", { key: pub.apiKey })}`, { fg: C.dim })]);
    lines.push([sp(`  ${t("model.source", { source: model.source })}`, { fg: C.dim })]);
    const all = listModels(env);
    if (all.length > 1) {
      lines.push([sp(t("model.list"), { fg: C.soft })]);
      all.forEach((item, index) => lines.push([sp(`  ${index + 1}. `, { fg: C.accent }), sp(`${item.name} · ${item.model}`, { fg: item.id === model.record.id ? C.ok : C.soft })]));
    }
    transcript.info(lines);
  }

  async function switchModel(arg) {
    const all = listModels(env);
    const pick = /^\d+$/.test(arg) ? all[Number(arg) - 1] : all.find((item) => item.id === arg);
    if (!pick) {
      info(t("model.unknown", { id: arg }), C.warn);
      return;
    }
    const next = { record: recordFor(pick.id, env), source: "config" };
    await (await readyAgent())?.switchTo(next, state.moa);
    model = next;
    useModel(pick.id, env);
    state.current = agent?.current || null;
    info(t("model.switched", { name: pick.name }), C.accent);
  }

  async function setMoa(arg) {
    const want = arg === "on" || arg === "开" ? true : arg === "off" || arg === "关" ? false : arg ? null : !state.moa.enabled;
    if (want === null) {
      info(t("moa.status", { state: state.moa.enabled ? t("side.on") : t("side.off"), preset: state.moa.name }), C.soft);
      return;
    }
    if (want && !state.moa.preset) {
      info(t("moa.notSet"), C.warn);
      return;
    }
    const next = { ...state.moa, enabled: want };
    await (await readyAgent())?.switchTo(model, next);
    state.moa = next;
    state.current = agent?.current || null;
    saveConfig({ moa: { ...(loadConfig(env).moa || {}), enabled: want } }, env);
    if (want) info(t("moa.on", { references: state.current?.references.join("、") || "", aggregator: state.current?.aggregator || "" }), C.cyan);
    else info(t("moa.off"), C.soft);
  }

  function setLang(next) {
    state.lang = next;
    t = createTuiT(next);
    try {
      saveConfig({ lang: next }, env);
    } catch {
      // The choice still applies to this session.
    }
  }

  // After the settings centre saved a model or MoA: the running kernel
  // switches to it, so the next message already uses the new setup.
  async function reloadModel() {
    if (options.providerOverride || options.modelFile) return;
    state.moa = resolveMoa(loadConfig(env));
    try {
      model = activeModel({ env });
      modelError = "";
    } catch (error) {
      model = null;
      modelError = message(error, t);
    }
    const ready = await readyAgent();
    if (ready) {
      try {
        await ready.switchTo(model, state.moa);
      } catch (error) {
        modelError = message(error, t);
        state.moa = { ...state.moa, enabled: false };
        await ready.switchTo(model, state.moa);
      }
      state.current = ready.current;
    }
    transcript.touch(welcome);
  }

  function openSettings() {
    state.overlay = null;
    state.settings = createSettings({
      env,
      t: (...args) => t(...args),
      depth,
      workspace,
      platform: options.platform,
      fetchImpl: options.fetchImpl,
      services: options.settingsServices,
      standalone: options.settings === "only",
      schedule,
      prefs: {
        lang: () => state.lang,
        setLang,
        session: options.settings !== "only",
        autoYes: () => state.autoYes,
        setAutoYes: (on) => {
          state.autoYes = on;
        },
        sidebar: () => state.sidebar,
        setSidebar: (on) => {
          state.sidebar = on;
        },
      },
      onChange(kind) {
        if (kind === "model" || kind === "moa") reloadModel().catch((error) => transcript.notice(message(error, t), { tone: "error" })).finally(schedule);
      },
      onClose() {
        state.settings = null;
        if (options.settings === "only") finish(0);
        else schedule();
      },
    });
    state.settings.open("home");
  }

  function setMode(mode) {
    state.mode = mode;
    info(t("mode.set", { mode }), C.violet);
  }

  async function runSlash(command) {
    switch (command.name) {
      case "settings":
        openSettings();
        return;
      case "about":
        transcript.info(identityText(state.lang).split("\n").map((line) => [sp(line, { fg: C.text })]));
        checkUpdate({ env, fetchImpl: options.fetchImpl }).then((result) => {
          const line = !result.ok ? t("about.checkFail")
            : result.newer ? t("about.newer", { latest: result.latest, url: OFFICIAL.updates })
              : t("about.current", { version: result.current });
          info(line, result.newer ? C.accent : C.dim);
        }).catch(() => info(t("about.checkFail"), C.warn));
        return;
      case "help":
        state.overlay = { kind: "help", scroll: 0 };
        return;
      case "learn":
        state.overlay = { kind: "learn", page: 0 };
        return;
      case "lang": {
        const next = normalizeLang(command.arg);
        if (!next) {
          info(t("slash.badLang"), C.warn);
          return;
        }
        setLang(next);
        info(t("lang.set"), C.accent);
        return;
      }
      case "mode":
        if (!command.arg) state.overlay = { kind: "modes", index: Math.max(0, MODES.indexOf(state.mode)) };
        else if (MODES.includes(command.arg)) setMode(command.arg);
        else info(t("err.badMode", { mode: command.arg, modes: MODES.join(", ") }), C.warn);
        return;
      case "yes":
        state.autoYes = !state.autoYes;
        info(t(state.autoYes ? "auto.on" : "auto.off"), state.autoYes ? C.warn : C.soft);
        return;
      case "new":
        if (busy()) {
          flash(t("tui.busy"), "warn");
          return;
        }
        await (engine || (await kernel))?.reset(state.mode);
        transcript.clear((block) => block.keep);
        state.scroll = 0;
        info(t("new.done"), C.accent);
        return;
      case "clear":
        transcript.clear();
        state.scroll = 0;
        info(t("clear.done"), C.dim);
        return;
      case "model":
        if (command.arg) await switchModel(command.arg);
        else modelInfo();
        return;
      case "moa":
        await setMoa(command.arg.toLowerCase());
        return;
      case "sidebar":
        state.sidebar = !state.sidebar;
        if (state.sidebar && size().cols < SIDEBAR_MIN_COLS) flash(t("sidebar.narrow", { cols: SIDEBAR_MIN_COLS }), "warn");
        else flash(t(state.sidebar ? "sidebar.on" : "sidebar.off"));
        return;
      case "banner":
        startSplash(false);
        return;
      case "exit":
        finish(0);
        return;
      default:
        info(t("slash.unknown", { name: `/${command.word}` }), C.warn);
    }
  }

  // A leading slash is a command only when the first word looks like one;
  // "/Users/me/app.js 有什么问题" is a prompt.
  function asCommand(text) {
    if (!text.startsWith("/")) return null;
    const parsed = parseSlash(text);
    if (!parsed || !/^[\p{L}?]*$/u.test(parsed.word)) return null;
    return parsed;
  }

  function send() {
    const text = editor.value;
    if (!text.trim()) return;
    if (asksWhoMadeIt(text)) {
      editor.remember(text);
      editor.clear();
      transcript.info(identityText(state.lang).split("\n").map((line) => [sp(line, { fg: C.text })]));
      return;
    }
    const command = asCommand(text.trim());
    if (command) {
      editor.remember(text);
      editor.clear();
      runSlash(command).catch((error) => transcript.notice(message(error, t), { tone: "error" })).finally(schedule);
      return;
    }
    submit(text).catch((error) => transcript.notice(message(error, t), { tone: "error" }));
  }

  // ── keys ───────────────────────────────────────────────────────────────
  function pauseKey(key, overlay) {
    const pause = overlay.pause;
    const ch = key.name === "text" ? key.text[0].toLowerCase() : "";
    if (pause.kind === "choice") {
      const count = pause.options.length;
      if (key.name === "up") overlay.index = (overlay.index - 1 + count) % count;
      else if (key.name === "down") overlay.index = (overlay.index + 1) % count;
      else if (key.name === "enter") overlay.resolve({ index: overlay.index });
      else if (key.name === "escape") overlay.resolve({ cancel: true });
      else if (/^[1-9]$/.test(ch) && Number(ch) <= count) overlay.resolve({ index: Number(ch) - 1 });
      return;
    }
    if (ch === "y" || ch === "是") overlay.resolve({ accept: true });
    else if (ch === "n" || ch === "否" || key.name === "escape") overlay.resolve({ accept: false });
    else if (pause.kind === "change") {
      const page = Math.max(1, size().rows - 12);
      if (key.name === "up") overlay.scroll -= 1;
      else if (key.name === "down") overlay.scroll += 1;
      else if (key.name === "pageup") overlay.scroll -= page;
      else if (key.name === "pagedown") overlay.scroll += page;
      overlay.scroll = Math.max(0, overlay.scroll);
    }
  }

  function overlayKey(key) {
    const overlay = state.overlay;
    if (overlay.kind === "pause") {
      pauseKey(key, overlay);
      return;
    }
    if (overlay.kind === "help") {
      if (key.name === "up") overlay.scroll = Math.max(0, overlay.scroll - 1);
      else if (key.name === "down") overlay.scroll += 1;
      else if (key.name === "pageup") overlay.scroll = Math.max(0, overlay.scroll - 8);
      else if (key.name === "pagedown") overlay.scroll += 8;
      else if (key.name === "escape" || key.name === "enter" || (key.name === "text" && key.text === "q")) state.overlay = null;
      return;
    }
    if (overlay.kind === "learn") {
      if (key.name === "right" || key.name === "pagedown" || key.name === "enter" || key.name === "down") {
        if (overlay.page >= LEARN_PAGES - 1 && key.name === "enter") state.overlay = null;
        else overlay.page = Math.min(LEARN_PAGES - 1, overlay.page + 1);
      } else if (key.name === "left" || key.name === "pageup" || key.name === "up") overlay.page = Math.max(0, overlay.page - 1);
      else if (key.name === "escape" || (key.name === "text" && key.text === "q")) state.overlay = null;
      return;
    }
    const count = MODES.length;
    if (key.name === "up") overlay.index = (overlay.index - 1 + count) % count;
    else if (key.name === "down") overlay.index = (overlay.index + 1) % count;
    else if (key.name === "escape") state.overlay = null;
    else if (key.name === "enter" || (key.name === "text" && /^[1-9]$/.test(key.text) && Number(key.text) <= count)) {
      const index = key.name === "enter" ? overlay.index : Number(key.text) - 1;
      state.overlay = null;
      setMode(MODES[index]);
    }
  }

  function paletteKey(key, items) {
    const count = items.length;
    const pick = items[state.palette.index] || items[0];
    const complete = (command) => editor.set(`/${command.name}${command.args ? " " : ""}`);
    if (key.name === "up") state.palette.index = (state.palette.index - 1 + count) % count;
    else if (key.name === "down") state.palette.index = (state.palette.index + 1) % count;
    else if (key.name === "tab") complete(pick);
    else if (key.name === "escape") editor.clear();
    else if (key.name === "enter") {
      const typed = editor.value.slice(1);
      const exact = items.find((item) => item.name === typed.toLowerCase() || item.aliases.includes(typed));
      const chosen = exact || pick;
      if (chosen.name === "lang") complete(chosen);
      else {
        editor.set(`/${chosen.name}`);
        send();
      }
    } else return false;
    return true;
  }

  // The mouse is only reported while a dialog or the settings centre is open.
  function mouseKey(key) {
    const overlay = state.overlay;
    if (overlay?.kind !== "pause") return;
    if (key.action === "wheel") {
      overlay.scroll = Math.max(0, overlay.scroll + (key.button === "down" ? 3 : -3));
      if (overlay.pause.kind === "choice") overlay.index = Math.max(0, Math.min(overlay.pause.options.length - 1, overlay.index + (key.button === "down" ? 1 : -1)));
      return;
    }
    if (key.action !== "press" || key.button !== "left" || !state.overlayBox) return;
    const box = state.overlayBox;
    const hit = box.hits.find((item) => item.y === key.y - box.y && key.x - box.x >= item.x0 && key.x - box.x < item.x1);
    if (hit) overlay.resolve(hit.decision);
  }

  function ctrlC() {
    if (state.overlay?.kind === "pause") {
      state.overlay.resolve({ cancel: true });
      return;
    }
    if (state.overlay) {
      state.overlay = null;
      return;
    }
    if (busy()) {
      interrupt();
      return;
    }
    if (!editor.empty) {
      editor.clear();
      return;
    }
    if (Date.now() - state.exitArmed < EXIT_WINDOW) {
      finish(0);
      return;
    }
    state.exitArmed = Date.now();
    flash(t("tui.exitAgain"), "warn");
  }

  function handleKey(key) {
    // A key ends the intro and still counts, so typing straight away loses nothing.
    if (state.splash) maybeEndSplash(true);
    if (state.settings) {
      if (key.ctrl && key.name === "c") state.settings.close();
      else if (key.ctrl && key.name === "l") screen.invalidate();
      else state.settings.key(key);
      return;
    }
    if (key.name === "mouse") {
      mouseKey(key);
      return;
    }
    if (key.ctrl && key.name === "c") {
      ctrlC();
      return;
    }
    if (key.ctrl && key.name === "l") {
      screen.invalidate();
      return;
    }
    if (state.overlay) {
      overlayKey(key);
      return;
    }
    const items = paletteItems();
    if (items.length && paletteKey(key, items)) return;
    const page = Math.max(1, size().rows - 10);
    switch (key.name) {
      case "enter":
        send();
        return;
      case "newline":
        editor.insert("\n");
        return;
      case "text":
      case "paste":
        editor.insert(key.text);
        return;
      case "backspace":
        if (key.alt) editor.deleteWordBack();
        else editor.backspace();
        return;
      case "delete":
        editor.deleteForward();
        return;
      case "left":
        if (key.ctrl || key.alt) editor.wordLeft();
        else editor.left();
        return;
      case "right":
        if (key.ctrl || key.alt) editor.wordRight();
        else editor.right();
        return;
      case "up":
        if (key.ctrl || key.alt || key.shift) state.scroll += 1;
        else if (!editor.up()) editor.historyPrev();
        return;
      case "down":
        if (key.ctrl || key.alt || key.shift) state.scroll = Math.max(0, state.scroll - 1);
        else if (!editor.down()) editor.historyNext();
        return;
      case "home":
        editor.home();
        return;
      case "end":
        editor.end();
        return;
      case "pageup":
        state.scroll += page;
        return;
      case "pagedown":
        state.scroll = Math.max(0, state.scroll - page);
        return;
      case "escape":
        if (busy()) interrupt();
        return;
      default:
    }
    if (key.ctrl) {
      const actions = {
        a: () => editor.home(), e: () => editor.end(), u: () => editor.killToStart(), k: () => editor.killToEnd(),
        w: () => editor.deleteWordBack(), p: () => editor.historyPrev(), n: () => editor.historyNext(),
        b: () => editor.left(), f: () => editor.right(),
        d: () => {
          if (editor.empty && !busy()) finish(0);
          else editor.deleteForward();
        },
      };
      actions[key.name]?.();
      return;
    }
    if (key.alt) {
      if (key.name === "b") editor.wordLeft();
      else if (key.name === "f") editor.wordRight();
    }
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  let done;
  const finished = new Promise((resolve) => {
    done = resolve;
  });

  function onData(chunk) {
    if (closed) return;
    try {
      clearTimeout(escTimer);
      for (const key of parser.feed(chunk)) handleKey(key);
      if (parser.waiting) {
        escTimer = setTimeout(() => {
          for (const key of parser.flush()) handleKey(key);
          schedule();
        }, ESC_DELAY);
      }
      schedule();
    } catch (error) {
      fail(error);
    }
  }

  function onResize() {
    screen.invalidate();
    schedule();
  }

  function finish(code) {
    if (closed) return;
    closed = true;
    clearInterval(ticker);
    clearTimeout(escTimer);
    clearTimeout(flashTimer);
    stdin.off("data", onData);
    stdout.off("resize", onResize);
    if (state.overlay?.kind === "pause") state.overlay.resolve({ cancel: true });
    if (engine?.busy) engine.cancel().catch(() => {});
    try {
      stdin.setRawMode?.(false);
    } catch {
      // Not a TTY any more; nothing to restore.
    }
    stdin.pause?.();
    screen.leave();
    done(code);
  }

  function fail(error) {
    finish(1);
    (options.stderr || process.stderr).write(`${t("err.failed", { message: message(error, t) })}\n`);
  }

  options.signal?.addEventListener("abort", () => finish(130), { once: true });
  stdin.setRawMode?.(true);
  stdin.on("data", onData);
  stdin.resume?.();
  stdout.on("resize", onResize);
  screen.enter();
  if (options.settings) openSettings();
  if (options.splash !== false && options.settings !== "only") startSplash(true);
  paint();
  ensureTicker();
  return finished;
}

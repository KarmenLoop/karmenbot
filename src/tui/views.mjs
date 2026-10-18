import { MODES } from "../kernel.mjs";
import { WORD_WIDTH, logoSpans, wordmarkSpans } from "./banner.mjs";
import { LEARN_PAGES } from "../i18n.mjs";
import { fitSpans, sp, spansWidth, wrapSpans } from "./paint.mjs";
import { COMMANDS } from "./slash.mjs";
import { formatCount, formatElapsed, shortenPath, textWidth, truncate } from "./text.mjs";
import { C, drift, gradient, mix, scale, spectrum } from "./theme.mjs";

export const SIDEBAR_WIDTH = 32;
export const SIDEBAR_MIN_COLS = 110;

const SPIN = ["◢", "◣", "◤", "◥"];

// ── Header: gradient wordmark on a dark band, then a line of light that
//    pulses across while Karmen works.
export function headerView({ width, t, phase, active, version, workspace, home, model, mode, autoYes }) {
  const band = { bg: C.headerBg };
  const sep = sp("  │  ", { fg: C.faint, bg: C.headerBg });
  const left = [
    sp(" ", band),
    ...gradient("◆ KARMEN", { bold: true, phase: active ? phase : 0 }).map((item) => ({ ...item, style: { ...item.style, bg: C.headerBg } })),
    sp(` ${version}`, { fg: C.dim, bg: C.headerBg }),
  ];
  const right = [
    sp(autoYes ? ` ${t("side.auto")} ${t("side.on")} ` : "", { fg: C.headerBg, bg: C.warn, bold: true }),
    sp(` ${t("lang.name")} `, { fg: C.soft, bg: C.headerBg }),
  ];
  const modelText = model ? model.name || model.model : t("side.noModel");
  const room = width - spansWidth(left) - spansWidth(right) - 12;
  const pathRoom = Math.max(8, Math.floor(room * 0.5));
  const middle = [
    sep,
    sp(shortenPath(workspace, pathRoom, home), { fg: C.soft, bg: C.headerBg }),
    sep,
    sp(truncate(modelText, Math.max(6, room - pathRoom - textWidth(mode) - 4)), { fg: model ? C.accent : C.warn, bg: C.headerBg }),
    sep,
    sp(mode, { fg: C.violet, bg: C.headerBg }),
  ];
  const head = fitSpans([...left, ...middle], width - spansWidth(right), band);
  const bar = [];
  const center = ((phase * 26) % (width + 30)) - 15;
  for (let x = 0; x < width; x += 1) {
    const base = spectrum(x / Math.max(1, width - 1));
    const glow = active ? Math.exp(-((x - center) ** 2) / 60) : 0;
    bar.push(sp("━", { fg: scale(mix(base, [255, 255, 255], glow * 0.6), (active ? 0.42 : 0.5) + glow * 0.58) }));
  }
  return [[...head, ...right], bar];
}

// ── Status line: what Karmen is doing, token use, and key hints or a flash.
export function statusView({ width, t, status, phase, elapsed, tool, usage, flash, kernel, progress = null }) {
  const left = [];
  if (status === "loading") {
    left.push(sp(` ${SPIN[Math.floor(phase * 8) % 4]} `, { fg: C.accent }), sp(t("tui.loading"), { fg: C.dim }));
  } else if (status === "running") {
    left.push(sp(` ${SPIN[Math.floor(phase * 8) % 4]} `, { fg: drift(0, phase), bold: true }));
    const doing = tool ? t("tui.tool", { name: tool })
      : progress?.phase === "consult" ? t("tui.consult", { done: progress.done, total: progress.total })
        : progress?.phase === "aggregate" ? t("tui.aggregate", { ok: progress.ok, total: progress.total })
          : t("tui.thinking");
    left.push(...gradient(doing, { phase, bold: true }));
    left.push(sp(`  ${formatElapsed(elapsed)}`, { fg: C.dim }));
  } else if (status === "waiting") {
    left.push(sp(" ⏸ ", { fg: C.warn, bold: true }), sp(t("tui.waiting"), { fg: C.warn, bold: true }));
  } else if (kernel?.error) {
    left.push(sp(" ✗ ", { fg: C.bad, bold: true }), sp(truncate(t("tui.kernelFailed", { message: kernel.error }), Math.floor(width * 0.6)), { fg: C.bad }));
  } else {
    left.push(sp(" ● ", { fg: C.ok }), sp(t("tui.ready"), { fg: C.ok }));
    if (kernel?.ms !== undefined) left.push(sp(`  ${t("tui.kernelReady", { ms: kernel.ms })}`, { fg: C.faint }));
  }
  if (usage && (usage.prompt || usage.completion)) {
    left.push(sp(`   ↑${formatCount(usage.prompt)} ↓${formatCount(usage.completion)}`, { fg: C.dim }));
  }
  const message = flash ? sp(flash.text, { fg: flash.tone === "warn" ? C.warn : flash.tone === "bad" ? C.bad : C.accent, bold: true })
    : sp(status === "running" || status === "waiting" ? t("tui.hintsBusy") : t("tui.hints"), { fg: C.faint });
  const room = width - spansWidth(left) - 2;
  const right = [sp(truncate(message.text, Math.max(0, room)), message.style), sp(" ")];
  const gap = Math.max(1, width - spansWidth(left) - spansWidth(right));
  return fitSpans([...left, sp(" ".repeat(gap)), ...right], width);
}

// ── Composer: a rounded box whose border shimmers while Karmen works.
export function composerView({ editor, width, t, status, phase, maxRows, mode, autoYes }) {
  const inner = Math.max(4, width - 4);
  const layout = editor.layout(inner);
  const visible = Math.max(1, Math.min(layout.rows.length, maxRows));
  const top = Math.max(0, Math.min(layout.cursor.row - visible + 1, layout.rows.length - visible));
  const busy = status === "running" || status === "loading";
  const edge = (x) => (busy ? scale(drift(x / Math.max(1, width), phase), 0.85) : status === "waiting" ? C.warn : C.border);
  const line = (from, count) => {
    const out = [];
    for (let x = from; x < from + count; x += 1) out.push(sp("─", { fg: edge(x) }));
    return out;
  };
  const label = ` ${mode}${autoYes ? ` · ${t("side.auto")} ${t("side.on")}` : ""} `;
  const head = [sp("╭─", { fg: edge(0) }), sp(" ❯ ", { fg: C.violet, bold: true })];
  const fill = width - spansWidth(head) - textWidth(label) - 2;
  const rows = [[...head, ...line(5, Math.max(0, fill)), sp(label, { fg: C.dim }), sp("─╮", { fg: edge(width - 1) })]];
  for (let i = 0; i < visible; i += 1) {
    const text = layout.rows[top + i] ?? "";
    let body;
    if (editor.empty && i === 0) body = [sp(truncate(busy ? t("tui.placeholderBusy") : t("tui.placeholder"), inner), { fg: C.faint })];
    else body = [sp(text, { fg: C.text })];
    rows.push([sp("│ ", { fg: edge(0) }), ...fitSpans(body, inner), sp(" │", { fg: edge(width - 1) })]);
  }
  rows.push([sp("╰", { fg: edge(0) }), ...line(1, width - 2), sp("╯", { fg: edge(width - 1) })]);
  return { rows, cursor: { x: 2 + layout.cursor.col, y: 1 + layout.cursor.row - top } };
}

// ── Sidebar: session facts, usage with a spectrum context bar, written
//    files, recent tools, and a small prism at the bottom.
function title(text, phase, active) {
  return [sp("◇ ", { fg: active ? drift(0.3, phase) : C.violet }), ...gradient(text, { bold: true, to: 0.85 })];
}

function meter(fraction, width) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  const out = [];
  for (let x = 0; x < width; x += 1) {
    out.push(x < filled ? sp("█", { fg: spectrum(x / Math.max(1, width - 1)) }) : sp("░", { fg: C.faint }));
  }
  return out;
}

// The glass ring, breathing while Karmen works.
function miniLogo(width, phase, active, depth) {
  if (depth === "none") return [];
  const size = Math.min(18, width);
  const pad = sp(" ".repeat(Math.floor((width - size) / 2)));
  return logoSpans({ size, depth, time: active ? phase * 2 : 0 }).map((line) => [pad, ...line]);
}

export function sidebarView({ width, height, t, phase, active, depth = "truecolor", workspace, home, model, moa = null, mode, autoYes, usage, files, tools }) {
  const inner = width - 2;
  const lines = [];
  const kv = (key, value, color = C.text) => {
    const label = `${key} `;
    lines.push([sp(label, { fg: C.dim }), sp(truncate(value, Math.max(2, inner - textWidth(label))), { fg: color })]);
  };
  lines.push(title(t("side.session"), phase, active));
  kv(t("side.workspace"), shortenPath(workspace, inner, home), C.soft);
  kv(t("side.model"), model ? model.name || model.model : t("side.noModel"), model ? C.accent : C.warn);
  kv(t("side.moa"), moa || t("side.off"), moa ? C.cyan : C.soft);
  kv(t("side.mode"), mode, C.violet);
  kv(t("side.auto"), autoYes ? t("side.on") : t("side.off"), autoYes ? C.warn : C.soft);
  kv(t("side.lang"), t("lang.name"), C.soft);
  lines.push([]);
  lines.push(title(t("side.usage"), phase, active));
  if (usage?.source === "provider") {
    lines.push([sp(t("side.tokens", { prompt: formatCount(usage.prompt), completion: formatCount(usage.completion) }), { fg: C.soft })]);
  }
  const used = usage?.lastPrompt || usage?.estimated || 0;
  const total = usage?.budget || 0;
  if (total) {
    const label = t("side.context", { used: formatCount(used), total: formatCount(total) });
    lines.push([sp(label, { fg: C.dim }), sp(usage.source === "provider" ? "" : ` ${t("side.estimated")}`, { fg: C.faint })]);
    lines.push(meter(used / total, inner));
  } else if (usage?.source !== "provider") {
    lines.push([sp(t("side.none"), { fg: C.faint })]);
  }
  lines.push([]);
  lines.push(title(t("side.changes"), phase, active));
  if (files.length) for (const file of files.slice(-5)) lines.push([sp("✓ ", { fg: C.ok }), sp(shortenPath(file, inner - 2), { fg: C.soft })]);
  else lines.push([sp(t("side.none"), { fg: C.faint })]);
  lines.push([]);
  lines.push(title(t("side.activity"), phase, active));
  if (tools.length) for (const name of tools.slice(-5)) lines.push([sp("↳ ", { fg: C.faint }), sp(truncate(name, inner - 2), { fg: C.accent })]);
  else lines.push([sp(t("side.none"), { fg: C.faint })]);
  const logo = miniLogo(inner, phase, active, depth);
  const out = lines.slice(0, height);
  if (logo.length && height - out.length >= logo.length + 1) {
    while (out.length < height - logo.length) out.push([]);
    out.push(...logo);
  }
  while (out.length < height) out.push([]);
  return out.map((line) => [sp("│ ", { fg: C.faint }), ...fitSpans(line, inner)]);
}

// ── Boxes for dialogs, help, the tutorial and the slash palette.
export function box({ width, title: heading, color = C.accent, lines, footer = "" }) {
  const inner = width - 4;
  const bg = { bg: C.panelBg };
  const titleText = heading ? ` ${truncate(heading, inner - 2)} ` : "";
  const top = [sp("╭─", { fg: color, bg: C.panelBg }), sp(titleText, { fg: color, bg: C.panelBg, bold: true }), sp(`${"─".repeat(Math.max(0, width - 3 - textWidth(titleText)))}╮`, { fg: color, bg: C.panelBg })];
  const footText = footer ? ` ${truncate(footer, inner - 2)} ` : "";
  const bottom = [sp(`╰${"─".repeat(Math.max(0, width - 3 - textWidth(footText)))}`, { fg: color, bg: C.panelBg }), sp(footText, { fg: C.dim, bg: C.panelBg }), sp("─╯", { fg: color, bg: C.panelBg })];
  const body = lines.map((line) => [
    sp("│ ", { fg: color, bg: C.panelBg }),
    ...fitSpans(line.map((item) => (item.raw !== undefined || item.style?.bg ? item : { ...item, style: { ...item.style, bg: C.panelBg } })), inner, bg),
    sp(" │", { fg: color, bg: C.panelBg }),
  ]);
  return [top, ...body, bottom];
}

function scrollWindow(all, height, offset) {
  const max = Math.max(0, all.length - height);
  const start = Math.max(0, Math.min(offset, max));
  return { lines: all.slice(start, start + height), start, max };
}

export function dialogView({ overlay, width, height, t, cwd }) {
  const w = Math.min(width - 4, 100);
  const inner = w - 4;
  const room = Math.max(3, height - 2);
  const pause = overlay.pause;
  if (pause.kind === "change") {
    const adds = overlay.diff.filter((row) => row.type === "add").length;
    const dels = overlay.diff.filter((row) => row.type === "del").length;
    const created = !pause.before;
    const head = [
      sp(created ? t("dialog.newFile", { lines: adds }) : "", { fg: C.ok }),
      sp(created ? "" : `+${adds} `, { fg: C.ok, bold: true }),
      sp(created ? "" : `−${dels}`, { fg: C.bad, bold: true }),
    ];
    const rows = overlay.diff.map((row) => {
      if (row.type === "add") return [sp(`+ ${row.text}`, { fg: [150, 240, 180], bg: [22, 52, 36] })];
      if (row.type === "del") return [sp(`- ${row.text}`, { fg: [255, 160, 170], bg: [60, 24, 32] })];
      if (row.type === "note") return [sp(`  ${row.text}`, { fg: C.faint, italic: true })];
      return [sp(`  ${row.text}`, { fg: C.soft })];
    }).map((line) => fitSpans(line, inner, line[0].style?.bg ? { bg: line[0].style.bg } : null));
    const view = scrollWindow(rows, Math.max(1, room - 4), overlay.scroll);
    overlay.scroll = view.start;
    const more = view.max ? [sp(`${view.start + 1}-${view.start + view.lines.length}/${rows.length}`, { fg: C.faint })] : [];
    return withButtons(box({ width: w, title: t("dialog.change", { path: pause.path }), color: C.warn, lines: [[...head, sp("  "), ...more], [], ...view.lines, [], buttons(t("dialog.btnAccept"), t)], footer: t("dialog.changeKeys") }), t("dialog.btnAccept"), t);
  }
  if (pause.kind === "approval") {
    const cmd = wrapSpans([sp("$ ", { fg: C.violet, bold: true }), sp(pause.command, { fg: C.text, bold: true })], inner, { hang: [sp("  ")], hard: true });
    const lines = [...cmd.slice(0, Math.max(1, room - 5)), [], [sp(t("dialog.where", { path: shortenPath(cwd, inner - 8) }), { fg: C.dim })], [], buttons(t("dialog.btnAllow"), t)];
    return withButtons(box({ width: w, title: t("dialog.command"), color: C.warn, lines, footer: t("dialog.commandKeys") }), t("dialog.btnAllow"), t);
  }
  const question = wrapSpans([sp(pause.question, { fg: C.text, bold: true })], inner);
  const first = question.length + 2;
  const hits = pause.options.map((_, index) => ({ y: first + index, x0: 2, x1: 2 + inner, decision: { index } })).filter((hit) => hit.y <= room);
  const options = pause.options.map((option, index) => {
    const picked = index === overlay.index;
    const style = picked ? { fg: C.text, bg: C.selectBg, bold: true } : { fg: C.soft };
    return fitSpans([sp(picked ? "❯ " : "  ", { ...style, fg: C.violet }), sp(`${index + 1}. `, { ...style, fg: C.accent }), sp(option, style)], inner, picked ? { bg: C.selectBg } : null);
  });
  return Object.assign(box({ width: w, title: t("dialog.choice"), color: C.accent, lines: [...question, [], ...options].slice(0, room), footer: t("dialog.choiceKeys") }), { hits });
}

// Clickable buttons on the last line of a confirm dialog; `hits` are relative
// to the panel: { y, x0, x1, decision }.
function buttons(yes, t) {
  return [sp(` ${yes} `, { fg: C.headerBg, bg: C.ok, bold: true }), sp("   "), sp(` ${t("dialog.btnReject")} `, { fg: C.headerBg, bg: C.bad, bold: true })];
}

function withButtons(rows, yes, t) {
  const y = rows.length - 2;
  const yesWidth = textWidth(yes) + 2;
  const noWidth = textWidth(t("dialog.btnReject")) + 2;
  return Object.assign(rows, {
    hits: [
      { y, x0: 2, x1: 2 + yesWidth, decision: { accept: true } },
      { y, x0: 2 + yesWidth + 3, x1: 2 + yesWidth + 3 + noWidth, decision: { accept: false } },
    ],
  });
}

export function listView({ width, height, heading, items, index, footer }) {
  const w = Math.min(width - 4, 72);
  const inner = w - 4;
  const lines = items.map((item, i) => {
    const picked = i === index;
    const style = picked ? { fg: C.text, bg: C.selectBg, bold: true } : { fg: C.soft };
    return fitSpans([sp(picked ? "❯ " : "  ", { ...style, fg: C.violet }), sp(item.label, { ...style, fg: picked ? C.text : C.accent }), sp(item.detail ? `  ${item.detail}` : "", { ...style, fg: picked ? C.soft : C.dim, bold: false })], inner, picked ? { bg: C.selectBg } : null);
  });
  return box({ width: w, title: heading, color: C.violet, lines: lines.slice(0, Math.max(1, height - 2)), footer });
}

export function helpView({ width, height, t, scroll }) {
  const w = Math.min(width - 4, 84);
  const inner = w - 4;
  const lines = [title(t("help.commands"), 0, false)];
  for (const command of COMMANDS) {
    const name = `/${command.name}${command.args ? ` ${command.args}` : ""}`;
    const alias = command.aliases.filter((a) => /[^\x00-\x7f]/.test(a)).map((a) => `/${a}`).join(" ");
    lines.push([sp(name.padEnd(18), { fg: C.accent, bold: true }), sp(t(`cmd.${command.name}`), { fg: C.text }), sp(alias ? `  ${alias}` : "", { fg: C.faint })]);
  }
  lines.push([]);
  lines.push(title(t("help.keys"), 0, false));
  const keys = [
    ["Enter", "key.enter"], ["Ctrl+J · Alt+Enter", "key.newline"], ["↑ ↓", "key.history"], ["Ctrl+A · Ctrl+E", "key.lineEdit"],
    ["Ctrl+U · Ctrl+K · Ctrl+W", "key.kill"], ["PgUp · PgDn", "key.scroll"], ["Esc", "key.escape"], ["Ctrl+C", "key.ctrlc"],
    ["Ctrl+D", "key.ctrld"], ["Ctrl+L", "key.redraw"], ["Tab", "key.tab"],
  ];
  for (const [key, label] of keys) lines.push([sp(key.padEnd(26), { fg: C.violet }), sp(t(label), { fg: C.text })]);
  const fitted = lines.flatMap((line) => wrapSpans(line, inner, { hang: [sp(" ".repeat(18))] }));
  const view = scrollWindow(fitted, Math.max(3, height - 2), scroll);
  return { rows: box({ width: w, title: t("help.title"), color: C.violet, lines: view.lines, footer: t("help.close") }), scroll: view.start };
}

export function learnView({ width, height, t, page }) {
  const w = Math.min(width - 4, 76);
  const inner = w - 4;
  const n = page + 1;
  const dots = [];
  for (let i = 0; i < LEARN_PAGES; i += 1) dots.push(sp(i === page ? "● " : "○ ", { fg: i === page ? spectrum(i / (LEARN_PAGES - 1)) : C.faint }));
  const lines = [
    gradient(t(`learn.${n}.title`), { bold: true }),
    [],
    ...wrapSpans([sp(t(`learn.${n}.body`), { fg: C.text })], inner),
    [],
    dots,
  ];
  return box({ width: w, title: t("learn.title", { page: n, total: LEARN_PAGES, title: t(`learn.${n}.title`) }), color: C.violet, lines: lines.slice(0, Math.max(3, height - 2)), footer: t("learn.keys") });
}

export const PALETTE_ROWS = 8;

export function paletteView({ width, t, items, index }) {
  const w = Math.min(width - 2, 64);
  const inner = w - 4;
  const first = Math.max(0, Math.min(index - PALETTE_ROWS + 1, items.length - PALETTE_ROWS));
  const lines = items.slice(first, first + PALETTE_ROWS).map((command, offset) => {
    const picked = first + offset === index;
    const style = picked ? { fg: C.text, bg: C.selectBg, bold: true } : { fg: C.soft };
    const name = `/${command.name}${command.args ? ` ${command.args}` : ""}`;
    return fitSpans([sp(name.padEnd(16), { ...style, fg: picked ? C.text : C.accent }), sp(t(`cmd.${command.name}`), { ...style, bold: false })], inner, picked ? { bg: C.selectBg } : null);
  });
  return box({ width: w, title: "", color: C.border, lines, footer: "Tab · Enter · Esc" });
}

export function modeItems(t) {
  return MODES.map((mode) => ({ label: mode, detail: t(`mode.${mode}`), value: mode }));
}

// ── The KARMEN mark at the top of the log: glass ring beside the wordmark
//    when there is room, stacked or ring-only when there is not.
const LOGO_SIZE = 24;

function titleLines(t, version) {
  return [
    [...gradient(`KARMENBOT ${version}`, { bold: true, from: 0.55 }), sp(`  ·  ${t("app.kind")}`, { fg: C.dim })],
    gradient(t("app.tagline"), { from: 0.45, to: 1, bold: true }),
    [sp(t("app.subline"), { fg: C.dim })],
  ];
}

export function bannerLines({ width, depth, t, version }) {
  const words = wordmarkSpans();
  const text = titleLines(t, version);
  if (depth !== "none" && width >= LOGO_SIZE + 3 + WORD_WIDTH) {
    const logo = logoSpans({ size: LOGO_SIZE, depth });
    const right = [[], ...words, [], ...text];
    return logo.map((line, i) => [...line, sp("   "), ...(right[i] || [])]);
  }
  const lines = [];
  if (depth !== "none" && width >= LOGO_SIZE) lines.push(...logoSpans({ size: Math.min(LOGO_SIZE, width), depth }));
  if (width >= WORD_WIDTH) lines.push(...words);
  return [...lines, ...text];
}

export function welcomeLines({ t, model, modelError, moa = null }) {
  const lines = [
    [sp(t("welcome.title"), { fg: C.text, bold: true })],
    [sp(t("welcome.body"), { fg: C.soft })],
    [sp(t("welcome.tips"), { fg: C.dim })],
  ];
  if (modelError) lines.push([sp("! ", { fg: C.bad, bold: true }), sp(modelError, { fg: C.bad })]);
  else if (moa?.moa) lines.push([sp("◆ ", { fg: C.cyan }), sp(t("welcome.moa", { references: moa.references.join("、"), aggregator: moa.aggregator }), { fg: C.dim })]);
  else if (model) lines.push([sp("● ", { fg: C.ok }), sp(t("welcome.model", { name: model.public.name || model.public.model, source: model.source }), { fg: C.dim })]);
  else lines.push([sp("! ", { fg: C.warn, bold: true }), sp(t("welcome.noModel"), { fg: C.warn })]);
  return lines;
}

// ── The way in: a large breathing ring, the wordmark, and a framed list of
//    what is really being loaded, each line ticking off as it happens.
const STEP_MARK = { wait: "○", run: null, ok: "✓", warn: "!", bad: "✗" };
const STEP_COLOR = { wait: C.faint, run: C.accent, ok: C.ok, warn: C.warn, bad: C.bad };

function bar(fraction, width, phase) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  const glint = (phase * 40) % (width + 16) - 8;
  const out = [];
  for (let x = 0; x < width; x += 1) {
    if (x >= filled) out.push(sp("─", { fg: C.border }));
    else out.push(sp("━", { fg: mix(spectrum(0.3 + 0.7 * (x / Math.max(1, width - 1))), [255, 255, 255], Math.exp(-((x - glint) ** 2) / 10) * 0.7), bold: true }));
  }
  return out;
}

export function splashView({ cols, rows, depth, t, version, phase = 0, steps = [], quip = "" }) {
  const done = steps.filter((step) => step.state === "ok" || step.state === "warn").length;
  const boxWidth = Math.min(66, cols - 4);
  const inner = boxWidth - 4;
  const stepLines = steps.map((step, i) => {
    const mark = step.state === "run" ? SPIN[Math.floor(phase * 10) % 4] : STEP_MARK[step.state];
    const label = `${String(i + 1)}  ${step.label}`;
    return [sp(`${mark} `, { fg: STEP_COLOR[step.state], bold: true }), sp(label + " ".repeat(Math.max(0, 12 - textWidth(label))), { fg: step.state === "wait" ? C.faint : C.text }), sp("  "), sp(truncate(step.detail || "", Math.max(0, inner - 16)), { fg: step.state === "warn" ? C.warn : C.dim })];
  });
  const frame = box({
    width: boxWidth,
    title: t("splash.title", { version }),
    color: C.border,
    lines: [...stepLines, [], [...bar(steps.length ? done / steps.length : 0, inner - 6, phase), sp(` ${String(Math.round((steps.length ? done / steps.length : 0) * 100)).padStart(3)}%`, { fg: C.soft })]],
    footer: quip,
  });
  const free = rows - frame.length - 6;
  const size = depth === "none" ? 0 : Math.max(0, Math.min(56, cols - WORD_WIDTH - 8 > 30 ? Math.min(free * 2, 40) : Math.min(free * 2 - 14, cols - 4)));
  const ring = size >= 12 ? logoSpans({ size: size - (size % 2), depth, time: phase * 1.5 }) : [];
  const words = wordmarkSpans({ phase, glint: true });
  const text = titleLines(t, version);
  let hero;
  if (ring.length && cols >= size + 4 + WORD_WIDTH) {
    const right = [...words, [], ...text];
    const offset = Math.max(0, Math.floor((ring.length - right.length) / 2));
    hero = ring.map((line, i) => [...line, sp("    "), ...(right[i - offset] || [])]);
  } else {
    hero = [...ring, [], ...(cols >= WORD_WIDTH + 2 ? words : []), [], ...text];
  }
  const block = [...hero, [], ...frame];
  const top = Math.max(0, Math.floor((rows - block.length) / 2));
  const widest = Math.max(...hero.map(spansWidth), boxWidth);
  const left = Math.max(0, Math.floor((cols - widest) / 2));
  const frameLeft = Math.max(0, Math.floor((cols - boxWidth) / 2));
  const out = [];
  for (let y = 0; y < rows; y += 1) {
    const index = y - top;
    const line = block[index];
    const indent = index >= hero.length + 1 ? frameLeft : left;
    out.push(fitSpans(line ? [sp(" ".repeat(indent)), ...line] : [], cols));
  }
  return out;
}

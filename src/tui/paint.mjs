import { to16, to256 } from "../kernel.mjs";
import { breakable, charWidth, textWidth } from "./text.mjs";

// A line is an array of spans: { text, style } or { raw, width } for
// pre-rendered ANSI art that is placed as-is and never wrapped.
// style: { fg, bg, bold, dim, italic, underline, inverse } with [r, g, b] colors.

export const sp = (text, style = null) => ({ text: String(text), style });

export function spansWidth(spans) {
  let width = 0;
  for (const item of spans) width += item.raw !== undefined ? item.width : textWidth(item.text);
  return width;
}

function colorCode(rgb, depth, layer) {
  if (!rgb || depth === "none") return "";
  if (depth === "truecolor") return `;${layer === "fg" ? 38 : 48};2;${rgb[0]};${rgb[1]};${rgb[2]}`;
  if (depth === "256") return `;${layer === "fg" ? 38 : 48};5;${to256(rgb)}`;
  return `;${to16(rgb) + (layer === "fg" ? 0 : 10)}`;
}

export function sgr(style, depth) {
  if (!style || depth === "none") {
    if (style?.inverse && depth === "none") return "\x1b[0;7m";
    return "\x1b[0m";
  }
  let code = "\x1b[0";
  if (style.bold) code += ";1";
  if (style.dim) code += ";2";
  if (style.italic) code += ";3";
  if (style.underline) code += ";4";
  if (style.inverse) code += ";7";
  code += colorCode(style.fg, depth, "fg");
  code += colorCode(style.bg, depth, "bg");
  return `${code}m`;
}

export function toAnsi(spans, depth) {
  let out = "";
  let active = null;
  for (const item of spans) {
    if (item.raw !== undefined) {
      out += `\x1b[0m${item.raw}\x1b[0m`;
      active = null;
      continue;
    }
    if (!item.text) continue;
    const code = sgr(item.style, depth);
    if (code !== active) {
      out += code;
      active = code;
    }
    out += item.text;
  }
  return `${out}\x1b[0m`;
}

function stripRaw(item) {
  return item.raw.replace(/\x1b\[[0-9;]*m/g, "");
}

// Columns [start, end) of a line. A wide character cut by either edge becomes a space.
export function sliceSpans(spans, start, end) {
  const out = [];
  let col = 0;
  for (const item of spans) {
    if (col >= end) break;
    if (item.raw !== undefined) {
      if (col >= start && col + item.width <= end) {
        out.push(item);
        col += item.width;
        continue;
      }
      const plain = sliceSpans([sp(stripRaw(item))], Math.max(0, start - col), end - col);
      out.push(...plain);
      col += item.width;
      continue;
    }
    let text = "";
    for (const ch of item.text) {
      const w = charWidth(ch);
      if (col >= start && col + w <= end) text += ch;
      else if (col < end && col + w > start && w > 0) text += " ".repeat(Math.min(col + w, end) - Math.max(col, start));
      col += w;
      if (col >= end) break;
    }
    if (text) out.push(sp(text, item.style));
  }
  return out;
}

// Exactly `width` columns: truncated, then padded with `fill` style.
export function fitSpans(spans, width, fill = null) {
  const cut = spansWidth(spans) > width ? sliceSpans(spans, 0, width) : spans;
  const gap = width - spansWidth(cut);
  return gap > 0 ? [...cut, sp(" ".repeat(gap), fill)] : cut;
}

// Place `over` at column x on top of `base`, keeping what lies on either side.
export function overlaySpans(base, x, over, width) {
  const w = spansWidth(over);
  const left = fitSpans(sliceSpans(base, 0, x), x);
  const right = sliceSpans(base, x + w, width);
  return [...left, ...over, ...right];
}

// Closing CJK punctuation never starts a line; it pulls the previous character along.
const NO_LINE_START = new Set([..."。，、；：！？）」』】》〉…"]);

function regroup(cells) {
  const out = [];
  for (const cell of cells) {
    if (cell.raw) {
      out.push(cell.raw);
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.raw === undefined && last.style === cell.style) last.text += cell.ch;
    else out.push(sp(cell.ch, cell.style));
  }
  return out;
}

// Word-aware wrap. `hang` spans prefix continuation lines (list indents).
// With `hard`, every line breaks exactly at the width (code blocks).
export function wrapSpans(spans, width, { hang = [], hard = false } = {}) {
  const cells = [];
  for (const item of spans) {
    if (item.raw !== undefined) {
      cells.push({ raw: item, w: item.width });
      continue;
    }
    for (const ch of item.text) {
      if (ch === "\n") cells.push({ nl: true });
      else cells.push({ ch, w: charWidth(ch), style: item.style });
    }
  }
  const hangWidth = spansWidth(hang);
  const lines = [];
  let line = [];
  let used = 0;
  let breakAt = -1;
  let first = true;
  const room = () => Math.max(1, first ? width : width - hangWidth);
  const finish = () => {
    while (!hard && line.length && line[line.length - 1].ch === " ") line.pop();
    lines.push(first ? regroup(line) : [...hang, ...regroup(line)]);
    line = [];
    used = 0;
    breakAt = -1;
    first = false;
  };
  for (const cell of cells) {
    if (cell.nl) {
      finish();
      continue;
    }
    if (used + cell.w > room() && line.length) {
      if (!hard && cell.ch === " ") {
        finish();
        continue;
      }
      if (!hard && !breakable(cell.ch || "x") && breakAt > 0 && breakAt < line.length) {
        const tail = line.slice(breakAt);
        line = line.slice(0, breakAt);
        finish();
        line = tail;
        used = tail.reduce((sum, item) => sum + item.w, 0);
      } else if (!hard && NO_LINE_START.has(cell.ch) && line.length > 1 && line[line.length - 1].ch?.trim()) {
        const carry = line.pop();
        finish();
        line = [carry];
        used = carry.w;
      } else {
        finish();
      }
    }
    if (!hard && !line.length && !first && cell.ch === " ") continue;
    line.push(cell);
    used += cell.w;
    if (!hard && cell.ch && breakable(cell.ch)) breakAt = line.length;
  }
  if (line.length || !lines.length) finish();
  return lines;
}

// Full-screen painter: only rows that changed since the last frame are written,
// inside a synchronized-update block so terminals that support it never tear.
export function createScreen(out, { depth = "truecolor" } = {}) {
  let previous = [];
  let entered = false;
  let mouse = false;
  return {
    depth,
    enter() {
      entered = true;
      previous = [];
      out.write("\x1b[?1049h\x1b[?25l\x1b[?2004h\x1b[2J\x1b[H");
    },
    leave() {
      if (!entered) return;
      entered = false;
      mouse = false;
      out.write("\x1b[0m\x1b[?1006l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l");
    },
    // Mouse reporting only while menus are open, so ordinary text selection
    // in the terminal keeps working the rest of the time.
    mouse(on) {
      if (!entered || on === mouse) return;
      mouse = on;
      out.write(on ? "\x1b[?1000h\x1b[?1006h" : "\x1b[?1006l\x1b[?1000l");
    },
    invalidate() {
      previous = [];
      out.write("\x1b[0m\x1b[2J");
    },
    paint(rows, cursor = null) {
      let buffer = "\x1b[?2026h\x1b[?25l";
      rows.forEach((row, y) => {
        if (previous[y] === row) return;
        buffer += `\x1b[${y + 1};1H${row}`;
      });
      for (let y = rows.length; y < previous.length; y += 1) buffer += `\x1b[${y + 1};1H\x1b[0m\x1b[2K`;
      previous = rows.slice();
      if (cursor) buffer += `\x1b[${cursor.y + 1};${cursor.x + 1}H\x1b[?25h`;
      buffer += "\x1b[?2026l";
      out.write(buffer);
    },
  };
}

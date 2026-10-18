import { fitSpans, sp, wrapSpans } from "./paint.mjs";
import { C, gradient } from "./theme.mjs";
import { textWidth } from "./text.mjs";

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

export function inlineSpans(text, base = null) {
  const out = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(sp(text.slice(last, match.index), base));
    const token = match[0];
    if (token.startsWith("**")) out.push(sp(token.slice(2, -2), { ...base, bold: true, fg: base?.fg || C.text }));
    else if (token.startsWith("`")) out.push(sp(token.slice(1, -1), { fg: C.cyan, bg: C.codeBg }));
    else out.push(sp(/^\[([^\]]+)\]/.exec(token)[1], { ...base, fg: C.accent, underline: true }));
    last = match.index + token.length;
  }
  if (last < text.length) out.push(sp(text.slice(last), base));
  return out;
}

const codeStyle = { fg: C.soft, bg: C.codeBg };

// A small Markdown subset that reads well in a terminal: headings, lists,
// quotes, rules, fenced code and inline bold/code/links. Unclosed fences
// (while streaming) render as code.
// Pipe tables: columns aligned by display width, header in accent; when the
// table cannot fit, each row becomes "header: value" lines instead.
function renderTable(rows, width) {
  const cells = rows
    .filter((row) => !/^\s*\|?\s*:?-{2,}/.test(row))
    .map((row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  if (!cells.length) return [];
  const [head, ...body] = cells;
  const columns = head.length;
  const widths = head.map((_, i) => Math.max(...cells.map((row) => textWidth(row[i] || ""))));
  const total = widths.reduce((sum, w) => sum + w, 0) + (columns - 1) * 3;
  const cell = (text, w, style) => [sp(text, style), sp(" ".repeat(Math.max(0, w - textWidth(text))))];
  if (total <= width) {
    const line = (row, style) => row.flatMap((text, i) => [...cell(text || "", widths[i], style(i)), ...(i < columns - 1 ? [sp(" │ ", { fg: C.faint })] : [])]);
    return [
      line(head, () => ({ fg: C.accent, bold: true })),
      [sp("─".repeat(total), { fg: C.faint })],
      ...body.map((row) => line(row, (i) => ({ fg: i === 0 ? C.text : C.soft }))),
    ];
  }
  const out = [];
  for (const row of body) {
    out.push(...wrapSpans([sp("• ", { fg: C.accent, bold: true }), sp(row[0] || "", { fg: C.text, bold: true })], width, { hang: [sp("  ")] }));
    for (let i = 1; i < columns; i += 1) out.push(...wrapSpans([sp(`  ${head[i]}：`, { fg: C.dim }), sp(row[i] || "", { fg: C.soft })], width, { hang: [sp("    ")] }));
  }
  return out;
}

export function renderMarkdown(text, width) {
  const lines = [];
  let fence = null;
  let blank = false;
  let table = [];
  const push = (line) => {
    lines.push(line);
    blank = false;
  };
  const flushTable = () => {
    if (!table.length) return;
    for (const row of renderTable(table, width)) push(row);
    table = [];
  };
  for (const raw of String(text).split("\n")) {
    if (table.length && !/^\s*\|/.test(raw)) flushTable();
    const fenceMatch = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(raw);
    if (fenceMatch) {
      if (fence) {
        fence = null;
        continue;
      }
      fence = fenceMatch[2] || "code";
      push(fitSpans([sp(` ${fence}`, { fg: C.faint, bg: C.codeBg })], width, { bg: C.codeBg }));
      continue;
    }
    if (fence) {
      for (const row of wrapSpans([sp(raw || " ", codeStyle)], Math.max(4, width - 2), { hard: true })) {
        push(fitSpans([sp(" ", codeStyle), ...row], width, { bg: C.codeBg }));
      }
      continue;
    }
    if (!raw.trim()) {
      if (!blank && lines.length) {
        lines.push([]);
        blank = true;
      }
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (heading) {
      const level = heading[1].length;
      const body = heading[2].replace(/\s+#+\s*$/, "");
      const spans = level === 1 ? gradient(body, { bold: true }) : inlineSpans(body, { fg: level === 2 ? C.accent : C.text, bold: true });
      for (const row of wrapSpans(spans, width)) push(row);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
      push([sp("─".repeat(Math.max(1, width)), { fg: C.faint })]);
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(raw);
    if (quote) {
      const bar = sp("▎ ", { fg: C.violet });
      for (const row of wrapSpans([bar, ...inlineSpans(quote[1], { fg: C.soft })], width, { hang: [bar] })) push(row);
      continue;
    }
    const item = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(raw);
    if (item) {
      const indent = " ".repeat(Math.min(8, Math.floor(item[1].replace(/\t/g, "  ").length / 2) * 2));
      const marker = /\d/.test(item[2]) ? item[2] : "•";
      const head = [sp(indent), sp(`${marker} `, { fg: C.accent, bold: true })];
      const hang = [sp(" ".repeat(textWidth(indent) + textWidth(marker) + 1))];
      for (const row of wrapSpans([...head, ...inlineSpans(item[3], { fg: C.text })], width, { hang })) push(row);
      continue;
    }
    if (/^\s*\|/.test(raw)) {
      table.push(raw);
      continue;
    }
    for (const row of wrapSpans(inlineSpans(raw, { fg: C.text }), width)) push(row);
  }
  flushTable();
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  return lines;
}

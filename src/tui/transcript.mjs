import { renderMarkdown } from "./markdown.mjs";
import { fitSpans, sp, wrapSpans } from "./paint.mjs";
import { sanitize, truncate } from "./text.mjs";
import { C, drift } from "./theme.mjs";

const COMPACT = new Set(["tool", "pause", "decision"]);
const REASON = { "turn.cancelled": "tui.cancelled" };

function firstLine(text) {
  return String(text || "").split("\n").find((line) => line.trim()) || "";
}

function pauseText(pause, t) {
  if (pause.kind === "change") return t("dialog.change", { path: pause.path });
  if (pause.kind === "approval") return `${t("dialog.command")}  $ ${firstLine(pause.command)}`;
  if (pause.kind === "choice") return `${t("dialog.choice")}：${pause.question}`;
  return t("dialog.secret", { service: pause.service || "" });
}

function decisionLine(pause, decision, t) {
  if (pause.kind === "change") return decision.accept ? ["✓", t("dialog.accepted", { path: pause.path }), C.ok] : ["✗", t("dialog.rejected", { path: pause.path }), C.bad];
  if (pause.kind === "approval") return decision.accept ? ["✓", t("dialog.allowed"), C.ok] : ["✗", t("dialog.denied"), C.bad];
  return ["→", t("dialog.picked", { option: pause.options?.[decision.index] || "" }), C.accent];
}

export function createTranscript() {
  const blocks = [];
  const cache = new Map();
  let streaming = null;
  let seq = 0;

  function add(block) {
    block.id = ++seq;
    block.version = 0;
    blocks.push(block);
    return block;
  }

  function render(block, width, t, phase) {
    const body = Math.max(8, width - 2);
    switch (block.type) {
      case "custom":
        return block.render(width, phase);
      case "user": {
        const style = { fg: C.text, bg: C.panelBg };
        const rows = wrapSpans([sp(block.text, style)], body);
        return rows.map((row, i) => fitSpans([sp(i ? "  " : "❯ ", { fg: C.violet, bg: C.panelBg, bold: true }), ...row], width, { bg: C.panelBg }));
      }
      case "assistant": {
        const rows = block.text.trim() ? renderMarkdown(block.text, body) : [];
        const mark = block.streaming ? drift(0, phase) : C.cyan;
        const out = rows.map((row, i) => [sp(i ? "  " : "◆ ", { fg: mark, bold: true }), ...row]);
        if (block.streaming) {
          const caret = sp("▍", { fg: drift(0.5, phase) });
          if (out.length) out[out.length - 1].push(caret);
          else out.push([sp("◆ ", { fg: mark, bold: true }), caret]);
        }
        if (block.calls?.length) {
          out.push([sp("  → ", { fg: C.accent }), sp(truncate(t("tui.calls", { names: block.calls.join(" · ") }), body - 2), { fg: C.accent })]);
        }
        return out;
      }
      case "tool": {
        const name = block.name || "tool";
        const room = Math.max(4, width - 6 - name.length);
        return [[sp("  ↳ ", { fg: C.faint }), sp(name, { fg: C.accent }), sp("  "), sp(truncate(block.summary, room), { fg: C.dim })]];
      }
      case "pause":
        return wrapSpans([sp("  ⏸ ", { fg: C.warn }), sp(pauseText(block.pause, t), { fg: C.warn, bold: true })], width, { hang: [sp("    ")] });
      case "decision": {
        const [icon, text, color] = decisionLine(block.pause, block.decision, t);
        return wrapSpans([sp(`  ${icon} `, { fg: color, bold: true }), sp(text, { fg: color })], width, { hang: [sp("    ")] });
      }
      case "notice": {
        const color = block.tone === "error" ? C.bad : block.tone === "info" ? C.accent : C.warn;
        const text = block.code === "API_UNREACHABLE" ? t("tui.unreachable", { detail: block.detail ? `（${block.detail}）` : "" }) : block.text;
        const out = wrapSpans([sp("  ! ", { fg: color, bold: true }), sp(text, { fg: color })], width, { hang: [sp("    ")] });
        const hint = block.code === "API_UNREACHABLE" ? t("tui.unreachableHint") : block.hint;
        if (hint) out.push(...wrapSpans([sp("    "), sp(hint, { fg: C.dim })], width, { hang: [sp("    ")] }));
        return out;
      }
      case "info":
        return block.lines.flatMap((line) => wrapSpans(line, width, { hang: [sp("  ")] }));
      default:
        return [];
    }
  }

  return {
    blocks,
    add,
    custom(renderFn, extra = {}) {
      return add({ type: "custom", render: renderFn, ...extra });
    },
    user(text) {
      return add({ type: "user", text: sanitize(text) });
    },
    notice(text, { tone = "warn", hint = "", code = "" } = {}) {
      return add({ type: "notice", text: sanitize(text), tone, hint, code });
    },
    info(lines) {
      return add({ type: "info", lines });
    },
    touch(block) {
      block.version += 1;
    },
    clear(keep = () => false) {
      const kept = blocks.filter(keep);
      blocks.length = 0;
      blocks.push(...kept);
      streaming = null;
      cache.clear();
    },
    get streaming() {
      return streaming;
    },
    // Engine events from runPrompt → blocks.
    apply(event, t) {
      if (event.type === "delta") {
        if (!streaming) streaming = add({ type: "assistant", text: "", streaming: true, calls: [] });
        streaming.text += sanitize(event.text);
        streaming.version += 1;
        return;
      }
      if (event.type === "message") {
        const message = event.message;
        if (message.role === "assistant") {
          const text = sanitize(message.content);
          const calls = (message.toolCalls || []).map((call) => sanitize(call.name)).filter(Boolean);
          if (streaming) {
            Object.assign(streaming, { text, calls, streaming: false });
            streaming.version += 1;
            streaming = null;
          } else if (text.trim() || calls.length) {
            add({ type: "assistant", text, calls, streaming: false });
          }
        } else if (message.role === "tool") {
          add({ type: "tool", name: sanitize(message.name), summary: firstLine(sanitize(message.content)) });
        } else if (message.role === "notice") {
          add({ type: "notice", code: message.code || "", text: sanitize(message.content), tone: "warn" });
        }
        return;
      }
      if (event.type === "pause") {
        add({ type: "pause", pause: event.pause });
        return;
      }
      if (event.type === "decision") {
        if (!event.decision.cancel) add({ type: "decision", pause: event.pause, decision: event.decision });
        return;
      }
      if (event.type === "cancelled" && event.reason !== "turn.secretCancelled") {
        add({ type: "notice", text: t(REASON[event.reason] || event.reason), tone: "warn" });
      }
    },
    // Finish a stream that ended without its final message (cancel, error).
    settle() {
      if (!streaming) return;
      streaming.streaming = false;
      streaming.version += 1;
      if (!streaming.text.trim()) blocks.splice(blocks.indexOf(streaming), 1);
      streaming = null;
    },
    lastNotice(code) {
      for (let i = blocks.length - 1; i >= 0; i -= 1) {
        if (blocks[i].type === "user") return null;
        if (blocks[i].type === "notice" && blocks[i].code === code) return blocks[i];
      }
      return null;
    },
    lines(width, t, phase = 0) {
      const out = [];
      let previous = null;
      for (const block of blocks) {
        const animated = block.type === "assistant" ? block.streaming : block.animated;
        const key = `${width}:${t.lang}`;
        let entry = cache.get(block.id);
        if (animated || !entry || entry.version !== block.version || entry.key !== key) {
          entry = { version: block.version, key, lines: render(block, width, t, phase) };
          cache.set(block.id, entry);
        }
        if (!entry.lines.length) continue;
        const tight = COMPACT.has(block.type) && previous && (previous.type === "assistant" || COMPACT.has(previous.type));
        if (previous && !tight) out.push([]);
        out.push(...entry.lines);
        previous = block;
      }
      return out;
    },
  };
}

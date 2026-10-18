import { StringDecoder } from "node:string_decoder";

// Raw terminal input → key events.
//   { name: "text", text }       printable characters (an IME commit can carry several)
//   { name: "paste", text }      bracketed paste
//   { name: "enter" | "newline" | "backspace" | "delete" | "tab" | "backtab" | "escape" }
//   { name: "up" | "down" | "left" | "right" | "home" | "end" | "pageup" | "pagedown", ctrl, alt, shift }
//   { name: "<letter>", ctrl: true } / { name: "<letter>", alt: true }
//   { name: "mouse", action: "press" | "release" | "wheel", button, x, y }   (SGR 1006, 0-based cells)

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

const FINAL = { A: "up", B: "down", C: "right", D: "left", H: "home", F: "end", Z: "backtab" };
const TILDE = { 1: "home", 2: "insert", 3: "delete", 4: "end", 5: "pageup", 6: "pagedown", 7: "home", 8: "end" };

function modifiers(param) {
  const bits = Math.max(0, Number(param || 1) - 1);
  return { shift: Boolean(bits & 1), alt: Boolean(bits & 2), ctrl: Boolean(bits & 4) };
}

function mouseEvent(params, final) {
  const [code, x, y] = params.slice(1).split(";").map(Number);
  if (![code, x, y].every(Number.isFinite)) return null;
  if (code & 64) return { name: "mouse", action: "wheel", button: code & 1 ? "down" : "up", x: x - 1, y: y - 1 };
  if (code & 32) return null;
  return { name: "mouse", action: final === "M" ? "press" : "release", button: ["left", "middle", "right"][code & 3] || "left", x: x - 1, y: y - 1 };
}

function csiEvent(params, final) {
  if (params.startsWith("<") && (final === "M" || final === "m")) return mouseEvent(params, final);
  const parts = params.split(";");
  if (final === "~") {
    if (parts[0] === "27" && parts[2] === "13") return { name: "newline" };
    const name = TILDE[parts[0]];
    return name ? { name, ...modifiers(parts[1]) } : null;
  }
  if (final === "u") {
    if (parts[0] === "13") return { name: Number(parts[1] || 1) > 1 ? "newline" : "enter" };
    return null;
  }
  const name = FINAL[final];
  if (!name) return null;
  if (name === "backtab") return { name };
  return { name, ...modifiers(parts[1]) };
}

function controlEvent(ch) {
  const code = ch.charCodeAt(0);
  if (ch === "\r") return { name: "enter" };
  if (ch === "\n") return { name: "newline" };
  if (ch === "\t") return { name: "tab" };
  if (ch === "\x7f" || ch === "\b") return { name: "backspace" };
  if (code >= 1 && code <= 26) return { name: String.fromCharCode(code + 96), ctrl: true };
  return null;
}

export function createKeyParser() {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let paste = null;

  function parse(final) {
    const events = [];
    let text = "";
    const flushText = () => {
      if (text) events.push({ name: "text", text });
      text = "";
    };
    let i = 0;
    while (i < pending.length) {
      if (paste !== null) {
        const end = pending.indexOf(PASTE_END, i);
        if (end < 0) {
          // Keep a possible partial end marker for the next chunk.
          const keep = final ? 0 : Math.min(PASTE_END.length - 1, pending.length - i);
          paste += pending.slice(i, pending.length - keep);
          i = pending.length - keep;
          break;
        }
        paste += pending.slice(i, end);
        events.push({ name: "paste", text: paste });
        paste = null;
        i = end + PASTE_END.length;
        continue;
      }
      const ch = pending[i];
      if (ch !== "\x1b") {
        const control = ch.charCodeAt(0) < 0x20 || ch === "\x7f" ? controlEvent(ch) : null;
        if (control) {
          flushText();
          events.push(control);
        } else if (ch.charCodeAt(0) >= 0x20) {
          text += ch;
        }
        i += 1;
        continue;
      }
      flushText();
      const rest = pending.slice(i);
      if (rest.startsWith(PASTE_START)) {
        paste = "";
        i += PASTE_START.length;
        continue;
      }
      if (rest.length === 1) {
        if (!final) break;
        events.push({ name: "escape" });
        i += 1;
        continue;
      }
      const next = rest[1];
      if (next === "[") {
        const match = /^\x1b\[([0-?]*)([ -/]*)([@-~])/.exec(rest);
        if (!match) {
          if (!final && rest.length < 16) break;
          events.push({ name: "escape" });
          i += 1;
          continue;
        }
        const event = match[2] ? null : csiEvent(match[1], match[3]);
        if (event) events.push(event);
        i += match[0].length;
        continue;
      }
      if (next === "O") {
        if (rest.length < 3) {
          if (!final) break;
          events.push({ name: "o", alt: true });
          i += 2;
          continue;
        }
        const event = csiEvent("", rest[2]);
        if (event) events.push(event);
        i += 3;
        continue;
      }
      if (next === "\r" || next === "\n") {
        events.push({ name: "newline" });
        i += 2;
        continue;
      }
      if (next === "\x7f" || next === "\b") {
        events.push({ name: "backspace", alt: true });
        i += 2;
        continue;
      }
      if (next === "\x1b") {
        events.push({ name: "escape" });
        i += 1;
        continue;
      }
      if (next >= " " && next <= "~") {
        events.push({ name: next.toLowerCase(), alt: true, shift: next !== next.toLowerCase() });
        i += 2;
        continue;
      }
      events.push({ name: "escape" });
      i += 1;
    }
    flushText();
    pending = pending.slice(i);
    return events;
  }

  return {
    // Returns the events that are certain; an incomplete escape waits for more bytes.
    feed(chunk) {
      pending += typeof chunk === "string" ? chunk : decoder.write(chunk);
      return parse(false);
    },
    // Called after a short quiet period: a lone ESC really was the Escape key.
    flush() {
      return parse(true);
    },
    get waiting() {
      return pending.length > 0;
    },
  };
}

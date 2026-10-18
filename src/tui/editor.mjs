import { charWidth } from "./text.mjs";

const isWordChar = (ch) => /[\p{L}\p{N}_]/u.test(ch);

// Composer state: an array of characters and a cursor index into it.
export function createEditor({ historyLimit = 200 } = {}) {
  let chars = [];
  let cursor = 0;
  const history = [];
  let browsing = -1;
  let stash = null;

  const lineStart = (at = cursor) => {
    let i = at;
    while (i > 0 && chars[i - 1] !== "\n") i -= 1;
    return i;
  };
  const lineEnd = (at = cursor) => {
    let i = at;
    while (i < chars.length && chars[i] !== "\n") i += 1;
    return i;
  };
  const edited = () => {
    browsing = -1;
    stash = null;
  };
  const load = (text) => {
    chars = [...String(text)];
    cursor = chars.length;
  };

  const api = {
    get value() {
      return chars.join("");
    },
    get cursor() {
      return cursor;
    },
    get empty() {
      return chars.length === 0;
    },
    set(text) {
      load(text);
      edited();
    },
    clear() {
      chars = [];
      cursor = 0;
      edited();
    },
    insert(text) {
      const add = [...String(text).replace(/\r\n?/g, "\n").replace(/\t/g, "  ")].filter((ch) => ch === "\n" || ch.codePointAt(0) >= 0x20);
      chars.splice(cursor, 0, ...add);
      cursor += add.length;
      edited();
    },
    backspace() {
      if (cursor === 0) return;
      chars.splice(cursor - 1, 1);
      cursor -= 1;
      edited();
    },
    deleteForward() {
      if (cursor >= chars.length) return;
      chars.splice(cursor, 1);
      edited();
    },
    left() {
      cursor = Math.max(0, cursor - 1);
    },
    right() {
      cursor = Math.min(chars.length, cursor + 1);
    },
    home() {
      cursor = lineStart();
    },
    end() {
      cursor = lineEnd();
    },
    wordLeft() {
      while (cursor > 0 && !isWordChar(chars[cursor - 1])) cursor -= 1;
      while (cursor > 0 && isWordChar(chars[cursor - 1])) cursor -= 1;
    },
    wordRight() {
      while (cursor < chars.length && !isWordChar(chars[cursor])) cursor += 1;
      while (cursor < chars.length && isWordChar(chars[cursor])) cursor += 1;
    },
    deleteWordBack() {
      const end = cursor;
      api.wordLeft();
      chars.splice(cursor, end - cursor);
      edited();
    },
    killToStart() {
      const start = lineStart();
      chars.splice(start, cursor - start);
      cursor = start;
      edited();
    },
    killToEnd() {
      const end = lineEnd();
      chars.splice(cursor, end - cursor);
      edited();
    },
    // Moves between logical lines; returns false at the top/bottom so the
    // caller can fall through to history.
    up() {
      const start = lineStart();
      if (start === 0) return false;
      const column = cursor - start;
      const prevStart = lineStart(start - 1);
      cursor = Math.min(prevStart + column, start - 1);
      return true;
    },
    down() {
      const end = lineEnd();
      if (end >= chars.length) return false;
      const column = cursor - lineStart();
      const nextEnd = lineEnd(end + 1);
      cursor = Math.min(end + 1 + column, nextEnd);
      return true;
    },
    remember(text) {
      const value = String(text);
      if (value.trim() && history[history.length - 1] !== value) history.push(value);
      if (history.length > historyLimit) history.shift();
      edited();
    },
    historyPrev() {
      if (!history.length) return false;
      if (browsing === -1) {
        stash = chars.join("");
        browsing = history.length;
      }
      if (browsing === 0) return false;
      browsing -= 1;
      load(history[browsing]);
      return true;
    },
    historyNext() {
      if (browsing === -1) return false;
      browsing += 1;
      if (browsing < history.length) {
        load(history[browsing]);
        return true;
      }
      load(stash ?? "");
      edited();
      return true;
    },
    // Visual rows at the given width and where the cursor lands among them.
    layout(width) {
      const room = Math.max(2, width);
      const rows = [""];
      let col = 0;
      let at = { row: 0, col: 0 };
      chars.forEach((ch, index) => {
        if (index === cursor) at = { row: rows.length - 1, col };
        if (ch === "\n") {
          rows.push("");
          col = 0;
          return;
        }
        const w = charWidth(ch);
        if (col + w > room) {
          rows.push("");
          col = 0;
          if (index === cursor) at = { row: rows.length - 1, col: 0 };
        }
        rows[rows.length - 1] += ch;
        col += w;
      });
      if (cursor === chars.length) {
        if (col >= room) {
          rows.push("");
          col = 0;
        }
        at = { row: rows.length - 1, col };
      }
      return { rows, cursor: at };
    },
  };
  return api;
}

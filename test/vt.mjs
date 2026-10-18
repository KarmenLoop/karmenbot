import { PassThrough, Writable } from "node:stream";
import { charWidth } from "../src/tui/text.mjs";

// Just enough of a terminal to replay the TUI's output: absolute cursor
// moves, screen/line clears and private mode switches. Colors are ignored.
export function createVt(cols, rows) {
  let grid;
  let x = 0;
  let y = 0;
  let log = "";
  const modes = new Set();
  const blank = () => Array.from({ length: rows }, () => Array(cols).fill(" "));
  grid = blank();

  function write(data) {
    log += data;
    let i = 0;
    while (i < data.length) {
      if (data[i] === "\x1b") {
        const match = /^\x1b\[(\??)([0-9;]*)([A-Za-z~])/.exec(data.slice(i, i + 40));
        if (match) {
          const [, priv, params, final] = match;
          if (priv) {
            for (const mode of params.split(";")) {
              if (final === "h") modes.add(mode);
              if (final === "l") modes.delete(mode);
            }
          } else if (final === "H") {
            const [r, c] = params.split(";").map(Number);
            y = (r || 1) - 1;
            x = (c || 1) - 1;
          } else if (final === "J" && params === "2") {
            grid = blank();
          } else if (final === "K" && y < rows) {
            for (let k = params === "2" ? 0 : x; k < cols; k += 1) grid[y][k] = " ";
          }
          i += match[0].length;
          continue;
        }
        i += 1;
        continue;
      }
      const ch = String.fromCodePoint(data.codePointAt(i));
      const w = charWidth(ch);
      if (y < rows && x < cols && w > 0) {
        grid[y][x] = ch;
        if (w === 2 && x + 1 < cols) grid[y][x + 1] = "";
      }
      x += w;
      i += ch.length;
    }
  }

  return {
    write,
    resize(c, r) {
      cols = c;
      rows = r;
      grid = blank();
    },
    text: () => grid.map((row) => row.join("").replace(/\s+$/, "")).join("\n"),
    // Screen cell { x, y } where `text` starts, for clicking on it.
    find(text) {
      for (let r = 0; r < grid.length; r += 1) {
        let line = "";
        const at = [];
        grid[r].forEach((ch, c) => {
          line += ch;
          for (let k = 0; k < ch.length; k += 1) at.push(c);
        });
        const index = line.indexOf(text);
        if (index >= 0) return { x: at[index], y: r };
      }
      return null;
    },
    get log() {
      return log;
    },
    modes,
  };
}

export function fakeTerminal({ cols = 120, rows = 36 } = {}) {
  const vt = createVt(cols, rows);
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      vt.write(chunk.toString());
      callback();
    },
  });
  Object.assign(stdout, { isTTY: true, columns: cols, rows });
  const stdin = new PassThrough();
  const raw = [];
  Object.assign(stdin, {
    isTTY: true,
    setRawMode(value) {
      raw.push(value);
      return stdin;
    },
  });
  return {
    stdin,
    stdout,
    vt,
    raw,
    type(text) {
      stdin.write(text);
    },
    // A left click (SGR 1006 press + release) on the first cell showing `text`.
    click(text) {
      const cell = vt.find(text);
      if (!cell) throw new Error(`not on screen: ${text}\n${vt.text()}`);
      stdin.write(`\x1b[<0;${cell.x + 1};${cell.y + 1}M\x1b[<0;${cell.x + 1};${cell.y + 1}m`);
    },
    wheel(direction, x = 1, y = 1) {
      stdin.write(`\x1b[<${direction === "down" ? 65 : 64};${x};${y}M`);
    },
    resize(c, r) {
      stdout.columns = c;
      stdout.rows = r;
      vt.resize(c, r);
      stdout.emit("resize");
    },
  };
}

export async function until(check, label, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

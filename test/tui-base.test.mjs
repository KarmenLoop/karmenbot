import assert from "node:assert/strict";
import test from "node:test";
import { createEditor } from "../src/tui/editor.mjs";
import { createKeyParser } from "../src/tui/keys.mjs";
import { fitSpans, overlaySpans, sliceSpans, sp, spansWidth, toAnsi, wrapSpans } from "../src/tui/paint.mjs";
import { sanitize, shortenPath, textWidth, truncate } from "../src/tui/text.mjs";

const plain = (line) => line.map((item) => item.text ?? "").join("");

test("CJK and full-width characters take two columns, marks take none", () => {
  assert.equal(textWidth("abc"), 3);
  assert.equal(textWidth("中文"), 4);
  assert.equal(textWidth("ｆｕｌｌ"), 8);
  assert.equal(textWidth("e\u0301"), 1);
  assert.equal(truncate("修复登录页面的问题", 9), "修复登录…");
  assert.equal(textWidth(truncate("修复登录页面的问题", 9)), 9);
});

test("untrusted output loses every escape sequence and control character", () => {
  const hostile = "ok\x1b[2J\x1b[H\x1b]0;pwned\x07\x1b]8;;http://x\x1b\\link\x07bell\r\nnext\ttab\x9b";
  const clean = sanitize(hostile);
  assert.equal(clean.includes("\x1b"), false);
  assert.equal(clean.includes("\x07"), false);
  assert.equal(clean.includes("\x9b"), false);
  assert.equal(clean, "oklinkbell\nnext    tab");
});

test("paths keep their tail when shortened", () => {
  assert.equal(shortenPath("/Users/me/work/koder/src", 40, "/Users/me"), "~/work/koder/src");
  const short = shortenPath("/Users/me/work/very/long/path/to/project", 22, "/Users/me");
  assert.ok(textWidth(short) <= 22, short);
  assert.ok(short.endsWith("project"), short);
});

test("wrapping breaks latin at spaces and CJK anywhere, never past the width", () => {
  const latin = wrapSpans([sp("the quick brown fox jumps over")], 10).map(plain);
  assert.deepEqual(latin, ["the quick", "brown fox", "jumps over"]);
  const cjk = wrapSpans([sp("中文可以在任意两个字之间换行")], 9).map(plain);
  for (const line of cjk) assert.ok(textWidth(line) <= 9, line);
  assert.equal(cjk.join(""), "中文可以在任意两个字之间换行");
  const mixed = wrapSpans([sp("修改 src/utils.js 里的函数")], 12).map(plain);
  assert.ok(mixed.includes("src/utils.js"), JSON.stringify(mixed));
  const hung = wrapSpans([sp("one two three four")], 9, { hang: [sp("  ")] }).map(plain);
  assert.deepEqual(hung, ["one two", "  three", "  four"]);
  const code = wrapSpans([sp("abcdefghij")], 4, { hard: true }).map(plain);
  assert.deepEqual(code, ["abcd", "efgh", "ij"]);
  assert.deepEqual(wrapSpans([sp("a\n\nb")], 10).map(plain), ["a", "", "b"]);
  const punct = wrapSpans([sp("等你按好才生效。")], 14).map(plain);
  assert.deepEqual(punct, ["等你按好才生", "效。"], "a full stop never starts a line");
});

test("slicing a wide character in half leaves a space, so columns stay aligned", () => {
  const line = [sp("ab中文cd")];
  assert.equal(plain(sliceSpans(line, 0, 3)), "ab ");
  assert.equal(plain(sliceSpans(line, 3, 8)), " 文cd");
  assert.equal(spansWidth(fitSpans(line, 12)), 12);
  assert.equal(spansWidth(fitSpans(line, 5)), 5);
  const over = overlaySpans([sp("0123456789")], 3, [sp("XY")], 10);
  assert.equal(plain(over), "012XY56789");
});

test("toAnsi resets at the end and drops colors when depth is none", () => {
  const ansi = toAnsi([sp("hi", { fg: [255, 0, 0], bold: true })], "truecolor");
  assert.match(ansi, /\x1b\[0;1;38;2;255;0;0mhi\x1b\[0m$/);
  assert.equal(toAnsi([sp("hi", { fg: [255, 0, 0] })], "none"), "\x1b[0mhi\x1b[0m");
});

test("key parser understands arrows, modifiers, paste, IME commits and a lone escape", () => {
  const parser = createKeyParser();
  assert.deepEqual(parser.feed("\x1b[A\x1b[1;5C\x1bb\r"), [
    { name: "up", shift: false, alt: false, ctrl: false },
    { name: "right", shift: false, alt: false, ctrl: true },
    { name: "b", alt: true, shift: false },
    { name: "enter" },
  ]);
  assert.deepEqual(parser.feed("你好世界"), [{ name: "text", text: "你好世界" }]);
  assert.deepEqual(parser.feed("\x1b[200~line1\nline2\x1b[201~"), [{ name: "paste", text: "line1\nline2" }]);
  assert.deepEqual(parser.feed("\x1b[200~split"), []);
  assert.deepEqual(parser.feed(" paste\x1b[20"), []);
  assert.deepEqual(parser.feed("1~"), [{ name: "paste", text: "split paste" }]);
  assert.deepEqual(parser.feed("\x1b"), []);
  assert.equal(parser.waiting, true);
  assert.deepEqual(parser.flush(), [{ name: "escape" }]);
  assert.deepEqual(parser.feed("\x03\x7f\n\x1b\r\x1b[5~\x1b[3~\x1b[Z"), [
    { name: "c", ctrl: true },
    { name: "backspace" },
    { name: "newline" },
    { name: "newline" },
    { name: "pageup", shift: false, alt: false, ctrl: false },
    { name: "delete", shift: false, alt: false, ctrl: false },
    { name: "backtab" },
  ]);
  assert.deepEqual(parser.feed(Buffer.from("中", "utf8").subarray(0, 2)), []);
  assert.deepEqual(parser.feed(Buffer.from("中", "utf8").subarray(2)), [{ name: "text", text: "中" }]);
  assert.deepEqual(parser.feed("\x1b[I\x1b[O"), []);
});

test("editor moves by characters, words and lines, and keeps CJK cursor columns", () => {
  const editor = createEditor();
  editor.insert("修复 bug");
  assert.equal(editor.value, "修复 bug");
  editor.wordLeft();
  assert.equal(editor.cursor, 3);
  editor.home();
  editor.insert("请");
  assert.equal(editor.value, "请修复 bug");
  editor.end();
  editor.deleteWordBack();
  assert.equal(editor.value, "请修复 ");
  editor.insert("\n第二行");
  assert.equal(editor.up(), true);
  assert.equal(editor.up(), false);
  assert.equal(editor.down(), true);
  editor.killToStart();
  assert.equal(editor.value, "请修复 \n");
  const layout = createEditor();
  layout.insert("一二三四五");
  assert.deepEqual(layout.layout(6), { rows: ["一二三", "四五"], cursor: { row: 1, col: 4 } });
  layout.home();
  assert.deepEqual(layout.layout(6).cursor, { row: 0, col: 0 });
  const full = createEditor();
  full.insert("abcd");
  assert.deepEqual(full.layout(4), { rows: ["abcd", ""], cursor: { row: 1, col: 0 } });
});

test("history walks back and restores the unsent draft", () => {
  const editor = createEditor();
  editor.remember("first");
  editor.remember("second");
  editor.insert("draft");
  assert.equal(editor.historyPrev(), true);
  assert.equal(editor.value, "second");
  assert.equal(editor.historyPrev(), true);
  assert.equal(editor.value, "first");
  assert.equal(editor.historyPrev(), false);
  assert.equal(editor.historyNext(), true);
  assert.equal(editor.value, "second");
  assert.equal(editor.historyNext(), true);
  assert.equal(editor.value, "draft");
  assert.equal(editor.historyNext(), false);
});

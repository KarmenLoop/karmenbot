import { WORD_WIDTH, logoLines, wordmarkSpans } from "./tui/banner.mjs";
import { sp, toAnsi } from "./tui/paint.mjs";
import { C, gradient } from "./tui/theme.mjs";

const LOGO = 28;

// The installer's banner, rendered ahead of time (a shell script cannot draw
// the glass ring itself). `wide` puts the wordmark beside the ring.
export function bannerAnsi({ depth = "truecolor", wide = true, version = "", tagline = "一句话进来，一件事办妥" } = {}) {
  const paint = (spans) => (depth === "none" ? spans.map((item) => item.text ?? "").join("") : toAnsi(spans, depth));
  const words = wordmarkSpans().map(paint);
  const title = paint([...gradient(`KARMENBOT ${version}`.trim(), { bold: true, from: 0.55 }), sp("  ·  karmenloop.com", { fg: C.dim })]);
  const slogan = paint(gradient(tagline, { from: 0.45, bold: true }));
  const ring = logoLines({ size: wide ? LOGO : 22, depth });
  if (wide) {
    const right = ["", ...words, "", title, slogan];
    return ring.map((line, i) => `  ${line}   ${right[i] || ""}`.replace(/\s+$/, ""));
  }
  return [...ring.map((line) => `  ${line}`), "", `  ${title}`, `  ${slogan}`];
}

export const BANNER_WIDE_COLUMNS = LOGO + 5 + WORD_WIDTH;

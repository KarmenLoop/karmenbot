// The KARMEN mark: the website's glass ring (ported in koder-cli/src/mascot.mjs
// from the site's own surface and glass shader) beside the KARMEN wordmark.
import { bg, fg, mascotLines, renderMascot } from "../kernel.mjs";
import { sp } from "./paint.mjs";
import { mix, scale, spectrum } from "./theme.mjs";

const LETTERS = {
  K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"],
  A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  R: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██║  ██║", "╚═╝  ╚═╝"],
  M: ["███╗   ███╗", "████╗ ████║", "██╔████╔██║", "██║╚██╔╝██║", "██║ ╚═╝ ██║", "╚═╝     ╚═╝"],
  E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
  N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
};
export const WORDMARK = LETTERS.K.map((_, row) => [..."KARMEN"].map((ch) => LETTERS[ch][row]).join(""));
export const WORD_WIDTH = WORDMARK[0].length;

// Ice on the face of each letter, steel on its shadow; a slow glint crosses
// the word while `phase` moves.
export function wordmarkSpans({ phase = 0, glint = false } = {}) {
  const centre = glint ? ((phase * 30) % (WORD_WIDTH + 24)) - 12 : -100;
  return WORDMARK.map((line, row) => [...line].map((ch, col) => {
    if (ch === " ") return sp(" ");
    const shine = Math.exp(-((col - centre) ** 2) / 18);
    const face = mix(spectrum(0.62 + 0.38 * (col / (WORD_WIDTH - 1))), [255, 255, 255], 0.18 * (1 - row / 5) + shine * 0.5);
    return sp(ch, { fg: ch === "█" ? face : scale(mix(spectrum(0.25), face, 0.35), 0.9), bold: ch === "█" });
  }));
}

const cache = new Map();

// `size` pixels square → `size` columns × size/2 rows of half blocks.
export function logoLines({ size, depth = "truecolor", time = 0 }) {
  const key = `${size}:${depth}:${Math.round(time * 8)}`;
  if (cache.has(key)) return cache.get(key);
  const image = renderMascot({ width: size, height: size % 2 ? size + 1 : size, time: Math.round(time * 8) / 8 });
  const lines = mascotLines(image, { depth, fg, bg });
  cache.set(key, lines);
  if (cache.size > 96) cache.delete(cache.keys().next().value);
  return lines;
}

export function logoSpans(options) {
  return logoLines(options).map((line) => [{ raw: line, width: options.size }]);
}

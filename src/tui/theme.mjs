import { mix, scale } from "../kernel.mjs";

// Colours from the website's dark theme (koder-website/site/assets/site.css):
// stage #12141c, surface #1a1c24, text #ededeb, accent #7ca6ff, and the hero
// glass ramp #3d4d6c → #c9d8e8. No rainbow: light is ice, steel and blue.
export const C = {
  text: [237, 237, 235],
  soft: [201, 216, 232],
  dim: [143, 160, 190],
  faint: [88, 100, 128],
  accent: [124, 166, 255],
  cyan: [164, 194, 255],
  violet: [178, 192, 232],
  ok: [76, 194, 131],
  warn: [224, 164, 64],
  bad: [242, 148, 140],
  add: [127, 217, 166],
  addBg: [24, 46, 38],
  delBg: [56, 30, 34],
  headerBg: [18, 20, 28],
  panelBg: [26, 28, 36],
  codeBg: [32, 35, 46],
  selectBg: [44, 56, 86],
  border: [61, 77, 108],
};

const RAMP = [[61, 77, 108], [124, 166, 255], [201, 216, 232], [237, 237, 235]];

// The brand light ramp: t = 0 steel, 0.45 accent blue, 0.8 ice, 1 white.
export function spectrum(t) {
  const k = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(k));
  return mix(RAMP[i], RAMP[i + 1], k - i);
}

export { mix, scale };

// A glint that slides along the ramp and back as time passes.
export function drift(offset, phase) {
  const t = (offset + phase) % 2;
  return spectrum(0.35 + 0.65 * (t <= 1 ? t : 2 - t));
}

export function gradient(text, { from = 0.35, to = 1, bold = false, bright = 1, phase = 0 } = {}) {
  const chars = [...text];
  const span = Math.max(1, chars.length - 1);
  return chars.map((ch, i) => ({
    text: ch,
    style: { fg: scale(phase ? drift(from + (to - from) * (i / span), phase) : spectrum(from + (to - from) * (i / span)), bright), bold },
  }));
}

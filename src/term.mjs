import { colorDepth } from "./kernel.mjs";

const DEPTH = { 1: "none", 4: "16", 8: "256", 24: "truecolor" };

// Environment hints first (NO_COLOR, FORCE_COLOR, COLORTERM, TERM_PROGRAM);
// then ask Node, which knows Windows 10+ consoles and Windows Terminal speak
// 24-bit colour even though they set no TERM variable.
export function depthOf(stream, env = process.env, flag) {
  const hinted = colorDepth({ env, stream, flag });
  if (hinted === "none" || hinted === "truecolor" || flag !== undefined) return hinted;
  if (env.FORCE_COLOR) return hinted;
  if (env.WT_SESSION || env.TERM_PROGRAM === "vscode") return "truecolor";
  const reported = DEPTH[stream?.getColorDepth?.(env)];
  if (!reported) return hinted;
  const rank = { none: 0, 16: 1, 256: 2, truecolor: 3 };
  return rank[reported] > rank[hinted] ? reported : hinted;
}

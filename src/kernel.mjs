// The only file that reaches into vendor/, the Koder kernel (closed source,
// installed from the official site; see KERNEL-LICENSE.md). The heavy harness
// loads lazily so the first frame of the TUI is not waiting on it.
export { RESET, bg, colorDepth, fg, gradientText, mix, scale, to16, to256 } from "../vendor/koder-cli/src/color.mjs";
export { diagnosticFetch, exitCode, runPrompt, unreachable } from "../vendor/koder-cli/src/turn.mjs";
export { normalizeDecision } from "../vendor/koder-cli/src/policy.mjs";
export { mascotLines, renderMascot } from "../vendor/koder-cli/src/mascot.mjs";

export const MODES = ["standard", "code", "minimal", "plan", "execute", "report", "enhance"];

export async function loadKernel() {
  const [{ createHarness }, { unifiedDiff }, { createProvider }, { MODEL_PRESETS }] = await Promise.all([
    import("../vendor/koder-desktop/harness/create.mjs"),
    import("../vendor/koder-desktop/harness/diff.mjs"),
    import("../vendor/koder-desktop/harness/providers.mjs"),
    import("../vendor/koder-desktop/fusion/catalog.mjs"),
  ]);
  return { createHarness, unifiedDiff, createProvider, MODEL_PRESETS };
}

export async function modelPresets() {
  const { MODEL_PRESETS } = await import("../vendor/koder-desktop/fusion/catalog.mjs");
  return MODEL_PRESETS;
}

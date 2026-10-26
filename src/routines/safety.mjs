import { flowHasShell } from "../flow-format.mjs";

/**
 * Safety gate for headless scheduled runs (safer default):
 *   - refuse unless allowUnattended === true
 *   - refuse shell steps unless allowShell === true
 * Interactive `karmenbot routine run <id>` can pass { force: true } to bypass
 * the unattended gate (decide prompts still apply when a TTY is present).
 */
export function safetyCheck(routine, steps, { force = false } = {}) {
  if (!force && routine.allowUnattended !== true) {
    return { ok: false, reason: "allowUnattended is not true — scheduled tick skipped (safer default)" };
  }
  if (flowHasShell(steps) && routine.allowShell !== true) {
    return { ok: false, reason: "flow has shell steps but allowShell is not true" };
  }
  return { ok: true };
}

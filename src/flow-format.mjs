import fs from "node:fs";

/** Load a flow JSON file: array of steps, or `{ steps: [...] }` object. */
export function loadFlowSteps(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray(raw.steps)) return raw.steps;
  throw new Error("flow file must be a JSON array or { steps: [...] }");
}

export function flowHasShell(steps) {
  return (steps || []).some((step) => step?.shell);
}

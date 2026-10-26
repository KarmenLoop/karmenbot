// Risk tiers for MCP tools. High-risk (submit / mutate / pay) always needs an
// explicit decide; --yes must never auto-accept those.
//
// Tiers:
//   read   — inspect / list / snapshot; may auto-accept with --yes
//   write  — mutate files or browser form state; still decide unless --yes
//   submit — click submit, send, purchase, delete, auth; decide always

const SUBMIT_RE = /(^|[_-])(submit|send|post|purchase|pay|checkout|order|delete|remove|drop|destroy|auth|login|sign[_-]?in|oauth|token|password|credential|transfer|wire|confirm_order)([_-]|$)/i;
const WRITE_RE = /(^|[_-])(write|create|update|put|patch|edit|fill|type|click|press|select|upload|download|move|rename|mkdir|rm|unlink|insert|set|navigate|goto|open|close|evaluate|run|exec|shell|call)([_-]|$)/i;
const READ_RE = /(^|[_-])(read|get|list|search|find|query|snapshot|screenshot|inspect|describe|status|info|fetch|browse|content|schema|resource)([_-]|$)/i;

export function classifyTool(name = "", annotations = {}) {
  const raw = String(name);
  const short = raw.includes(".") ? raw.slice(raw.lastIndexOf(".") + 1) : raw;
  if (annotations?.destructiveHint === true || annotations?.openWorldHint === true && annotations?.readOnlyHint !== true) {
    if (SUBMIT_RE.test(short) || annotations?.destructiveHint) return "submit";
  }
  if (annotations?.readOnlyHint === true) return "read";
  if (SUBMIT_RE.test(short)) return "submit";
  if (WRITE_RE.test(short)) return "write";
  if (READ_RE.test(short)) return "read";
  // Unknown tools default to write (need decide; --yes may accept).
  return "write";
}

export function requiresDecide(tier, { yes = false } = {}) {
  if (tier === "submit") return true;
  if (tier === "write") return !yes;
  if (tier === "read") return false;
  return !yes;
}

/** --yes must never bypass submit-class MCP calls. */
export function mayAutoAccept(tier, { yes = false } = {}) {
  if (tier === "submit") return false;
  if (!yes) return false;
  return tier === "read" || tier === "write";
}

export function pauseForTool({ serverId, toolName, args, tier, description }) {
  return {
    kind: "mcp",
    serverId,
    tool: toolName,
    name: `mcp.${serverId}.${toolName}`,
    args: args || {},
    tier,
    description: description || "",
    command: `mcp.${serverId}.${toolName}`,
  };
}

export function summarizeArgs(args, limit = 240) {
  try {
    const text = JSON.stringify(args ?? {});
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  } catch {
    return String(args);
  }
}

import { classifyTool, mayAutoAccept, pauseForTool, requiresDecide, summarizeArgs } from "./policy.mjs";

/**
 * Path B sidecar: gate every MCP tool call through the same decide() used for
 * shell/edits. Submit-class tools ignore --yes.
 *
 * Kernel harness tools API is not public; callers (CLI/tests/future Path A)
 * invoke invokeMcpTool with the live decide from a turn.
 */
export async function invokeMcpTool({
  registry,
  qualifiedName,
  args = {},
  decide,
  yes = false,
  onEvent = () => {},
}) {
  const parsed = registry.parseName(qualifiedName);
  if (!parsed) throw new Error(`invalid MCP tool name: ${qualifiedName}`);
  const tools = registry.listTools();
  const meta = tools.find((tool) => tool.qualifiedName === qualifiedName || (tool.serverId === parsed.serverId && tool.name === parsed.toolName));
  const tier = classifyTool(parsed.toolName, meta?.annotations || {});
  const pause = pauseForTool({
    serverId: parsed.serverId,
    toolName: parsed.toolName,
    args,
    tier,
    description: meta?.description || "",
  });

  let decision = { accept: false };
  if (mayAutoAccept(tier, { yes })) {
    decision = { accept: true, auto: true };
  } else if (requiresDecide(tier, { yes }) || tier === "submit") {
    if (typeof decide !== "function") {
      decision = { accept: false, reason: "no-decide" };
    } else {
      decision = (await decide(pause)) || { accept: false };
    }
  } else {
    decision = { accept: true };
  }

  onEvent({ type: "decision", pause, decision });

  if (decision.cancel || decision.accept === false) {
    return {
      ok: false,
      denied: true,
      tier,
      pause,
      decision,
      result: {
        content: [{ type: "text", text: `MCP tool ${qualifiedName} denied (${tier}).` }],
        isError: true,
      },
    };
  }

  onEvent({ type: "mcp.call", name: qualifiedName, args: summarizeArgs(args), tier });
  const result = await registry.callTool(qualifiedName, args);
  onEvent({ type: "mcp.result", name: qualifiedName, ok: !result?.isError });
  return { ok: true, tier, pause, decision, result };
}

/**
 * Wrap a turn-level decide so MCP pauses render like approvals.
 * Existing change/approval/choice/secret behaviour is unchanged.
 */
export function wrapDecide(innerDecide, { yes = false } = {}) {
  return async (pause) => {
    if (pause?.kind === "mcp") {
      const tier = pause.tier || classifyTool(pause.tool || pause.name);
      if (mayAutoAccept(tier, { yes })) return { accept: true, auto: true };
      if (typeof innerDecide === "function") return innerDecide({ ...pause, kind: "mcp" });
      return { accept: false };
    }
    return typeof innerDecide === "function" ? innerDecide(pause) : { accept: false };
  };
}

export function formatMcpPrompt(pause, t) {
  const name = pause.name || `mcp.${pause.serverId}.${pause.tool}`;
  const args = summarizeArgs(pause.args);
  if (typeof t === "function") {
    return t("dialog.mcp", { name, tier: pause.tier || "write", args });
  }
  return `MCP ${pause.tier || "write"} · ${name}\n${args}`;
}

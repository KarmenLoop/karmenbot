import readline from "node:readline";
import { openAgent } from "../agent.mjs";
import { loadConfig } from "../home.mjs";
import { activeModel } from "../models.mjs";
import { resolveMoa } from "../moa.mjs";
import { MODES } from "../kernel.mjs";
import { VERSION } from "../version.mjs";

// Editor protocol used by Zed, CodeCompanion, and agent-shell. Frames are
// JSON-RPC lines on stdout. Diagnostics stay on stderr.
export async function run(ctx) {
  const sessions = new Map();
  let next = 1;
  const send = (message) => ctx.stdout.write(`${JSON.stringify(message)}\n`);
  const rl = readline.createInterface({ input: ctx.stdin, crlfDelay: Infinity });
  const done = new Promise((resolve) => rl.on("close", resolve));

  async function prompt(entry, text) {
    const model = ctx.io.providerOverride ? null : activeModel({ env: ctx.env, modelFile: ctx.opts.modelFile });
    const moa = resolveMoa(loadConfig(ctx.env));
    const agent = entry.agent || await openAgent({ workspace: entry.cwd, env: ctx.env, model, moa, providerOverride: ctx.io.providerOverride, fetchImpl: ctx.io.fetchImpl });
    entry.agent = agent;
    const convo = await agent.conversation(entry.id, { mode: entry.mode });
    await convo.turn(text, {
      mode: entry.mode,
      decide: async (pause) => {
        if (pause.kind !== "change" && pause.kind !== "approval") return { accept: false };
        send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: entry.id, update: { sessionUpdate: "tool_call", toolCallId: pause.id || "edit", title: pause.path || pause.command || "confirm", status: "pending" } } });
        return { accept: Boolean(ctx.opts.yes) };
      },
      onEvent(event) {
        if (event.type === "delta") {
          send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: entry.id, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: event.text } } } });
        }
      },
    });
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    const reply = (result) => send({ jsonrpc: "2.0", id: message.id, result });
    const fail = (code, text) => send({ jsonrpc: "2.0", id: message.id, error: { code, message: text } });
    try {
      if (message.method === "initialize") {
        reply({ protocolVersion: 1, agentCapabilities: { loadSession: false }, agentInfo: { name: "karmenbot", title: "Karmen", version: VERSION } });
      } else if (message.method === "authenticate") {
        reply({});
      } else if (message.method === "session/new") {
        const id = `karmen-session-${next++}`;
        const cwd = message.params?.cwd || ctx.workspace;
        sessions.set(id, { id, cwd, mode: ctx.opts.mode || "standard" });
        reply({ sessionId: id, modes: { currentModeId: ctx.opts.mode || "standard", availableModes: MODES.map((item) => ({ id: item, name: item })) } });
      } else if (message.method === "session/set_mode") {
        const entry = sessions.get(message.params?.sessionId);
        if (!entry || !MODES.includes(message.params?.modeId)) fail(-32602, "unknown session or mode");
        else {
          entry.mode = message.params.modeId;
          reply({});
        }
      } else if (message.method === "session/prompt") {
        const entry = sessions.get(message.params?.sessionId);
        const text = (message.params?.prompt || []).map((part) => part.text || part).join("\n");
        if (!entry || !text) fail(-32602, "unknown session or empty prompt");
        else {
          await prompt(entry, text);
          reply({ stopReason: "end_turn" });
        }
      } else if (message.method === "session/cancel") {
        sessions.get(message.params?.sessionId)?.agent?.conversation && null;
        if (message.id !== undefined) reply({});
      } else if (message.id !== undefined) {
        fail(-32601, `Method not found: ${message.method}`);
      }
    } catch (error) {
      if (message.id !== undefined) fail(-32000, error?.message || String(error));
    }
  }
  await done;
  return 0;
}

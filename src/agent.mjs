import { KarmenError } from "./errors.mjs";
import { diagnosticFetch, exitCode, loadKernel, runPrompt, unreachable } from "./kernel.mjs";
import { recordFor } from "./models.mjs";
import { createMoaProvider } from "./moa.mjs";
import { IDENTITY_RULES } from "./official.mjs";
import { createRegistry } from "./mcp/registry.mjs";
import { wrapDecide } from "./mcp/bridge.mjs";
import { buildInjection } from "./memory/inject.mjs";
import { loadConfig } from "./home.mjs";

// One kernel per workspace; conversations are keyed ("tui", "feishu:oc_123", ...).
// The kernel gets a stable provider that delegates to whatever is current, so
// /moa and /model switch without rebuilding anything.
export async function openAgent({ workspace, env = process.env, model = null, moa = null, providerOverride = null, fetchImpl, onProgress = () => {}, noMemory = false, lang = null } = {}) {
  const started = performance.now();
  const kernel = await loadKernel();
  const diag = diagnosticFetch(fetchImpl || globalThis.fetch);
  let current = null;
  let pendingMemory = "";
  const uiLang = lang || (loadConfig(env).lang === "en" ? "en" : "zh");

  function build(nextModel, nextMoa) {
    if (providerOverride) return { provider: providerOverride, record: null, label: providerOverride.name || "override", moa: false };
    if (nextMoa?.enabled && nextMoa.preset) {
      const make = (id) => {
        const record = recordFor(id, env);
        return { name: record.name || record.model, record, provider: kernel.createProvider({ provider: record, fetchImpl: diag.fetch }) };
      };
      const aggregatorId = nextMoa.preset.aggregator || nextModel?.record?.id;
      if (!aggregatorId) throw new KarmenError("moa.noAggregator");
      const aggregator = make(aggregatorId);
      const references = nextMoa.preset.references.map(make);
      const provider = createMoaProvider({ references, aggregator, fanout: nextMoa.preset.fanout, timeoutSec: nextMoa.preset.timeoutSec, onProgress });
      return { provider, record: aggregator.record, label: `MoA ${references.length}+1`, moa: true, references: references.map((item) => item.name), aggregator: aggregator.name };
    }
    if (!nextModel?.record) return null;
    return { provider: kernel.createProvider({ provider: nextModel.record, fetchImpl: diag.fetch }), record: nextModel.record, label: nextModel.record.name, moa: false };
  }

  const delegate = {
    name: "karmenbot",
    get model() {
      return current?.record?.model || current?.provider?.model || "";
    },
    complete(request) {
      if (!current) return Promise.reject(Object.assign(new Error("no model configured"), { code: "NO_MODEL" }));
      const messages = Array.isArray(request?.messages) ? request.messages.map((message) => ({ ...message })) : request?.messages;
      const system = Array.isArray(messages) ? messages.find((message) => message.role === "system") : null;
      if (system) {
        if (!String(system.content).includes("karmenloop.com")) system.content = `${system.content}\n${IDENTITY_RULES}`;
        if (pendingMemory) system.content = `${system.content}\n\n${pendingMemory}`;
      }
      return current.provider.complete(system ? { ...request, messages } : request);
    },
  };

  const harness = await kernel.createHarness({ workspace, providerOverride: delegate, fetchImpl: diag.fetch });

  async function apply(nextModel, nextMoa) {
    current = build(nextModel, nextMoa);
    if (current?.record) {
      await harness.store.saveProviders([{ ...current.record, id: "karmenbot" }]);
      await harness.store.saveSettings({ providerId: "karmenbot", contextRatio: 0.75 });
    } else {
      await harness.store.saveSettings({ providerId: null, contextRatio: 0.75 });
    }
  }
  await apply(model, moa);

  // Path B: public MCP sidecar. Kernel tools API is not exposed; we start
  // configured servers and hand a registry + decide wrapper to callers.
  // If a server fails to spawn, degrade with a notice — do not block the agent.
  let mcp = null;
  let mcpNotice = null;
  try {
    mcp = createRegistry({ env, onEvent: (event) => {
      if (event.type === "mcp.error") mcpNotice = `MCP ${event.id}: ${event.message}`;
    } });
    const started = await mcp.startEnabled();
    if (started.errors?.length) {
      mcpNotice = started.errors.map((item) => `${item.id}: ${item.message}`).join("; ");
    }
  } catch (error) {
    mcpNotice = error?.message || String(error);
    mcp = null;
  }

  const listeners = new Map();
  harness.setUpdateListener((thread) => listeners.get(thread.id)?.(thread));
  const watch = {
    on(id, handler) {
      listeners.set(id, handler);
      return () => listeners.delete(id);
    },
  };

  async function newThread(mode) {
    const thread = harness.createThread();
    thread.mode = mode;
    thread.interaction = "agent";
    await harness.addThread(thread);
    return thread;
  }

  const conversations = new Map();
  async function conversation(key = "default", { mode = "standard" } = {}) {
    if (conversations.has(key)) return conversations.get(key);
    let thread = await newThread(mode);
    let busy = false;
    const handle = {
      key,
      get thread() {
        return harness.store.getThread(thread.id) || thread;
      },
      get busy() {
        return busy;
      },
      async turn(text, { mode: turnMode, interaction = "agent", decide, onEvent, yes = false, noMemory: turnNoMemory } = {}) {
        busy = true;
        diag.state.last = null;
        try {
          const skip = turnNoMemory !== undefined ? turnNoMemory : noMemory;
          const injection = await buildInjection({ query: text, env, lang: uiLang, noMemory: skip, session: key === "none" ? "none" : key });
          pendingMemory = injection.block || "";
          if (pendingMemory && typeof onEvent === "function") {
            onEvent({ type: "message", message: { role: "notice", content: uiLang === "en" ? `Memory: ${injection.hits.length} fact(s) loaded` : `记忆：已载入 ${injection.hits.length} 条` } });
          }
          const gated = wrapDecide(decide, { yes });
          const outcome = await runPrompt({ harness, watch, thread, text, mode: turnMode, interaction, decide: gated, onEvent });
          let detail = "";
          const last = diag.state.last;
          if (unreachable(outcome.thread) && last) detail = `${last.status ? `HTTP ${last.status}` : last.error}${last.host ? ` · ${last.host}` : ""}`;
          return { ...outcome, code: exitCode(outcome), detail };
        } finally {
          pendingMemory = "";
          busy = false;
        }
      },
      cancel() {
        return harness.cancel(thread.id);
      },
      async reset(nextMode = mode) {
        thread = await newThread(nextMode);
      },
    };
    conversations.set(key, handle);
    return handle;
  }

  return {
    loadMs: Math.round(performance.now() - started),
    diff: kernel.unifiedDiff,
    conversation,
    mcp,
    get mcpNotice() {
      return mcpNotice || mcp?.notice || null;
    },
    async dispose() {
      await mcp?.dispose?.();
    },
    get current() {
      return current ? { label: current.label, moa: current.moa, references: current.references || [], aggregator: current.aggregator || current.label } : null;
    },
    switchTo: apply,
  };
}

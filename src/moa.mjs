import { KarmenError } from "./errors.mjs";

// Mixture of Agents, after Hermes' MoA loop (MIT, Nous Research): reference
// models answer the latest request independently and without tools; the
// aggregator receives their advice and does the real work with tools.
// It is a provider like any other, so the kernel needs no changes.
//
// config.json moa: { enabled, preset, presets: { <name>: { references: [modelId], aggregator: modelId,
//                    fanout: "user_turn" | "per_iteration", timeoutSec } } }

const ADVISOR = [
  "你是参考顾问，和其他几位顾问一起为同一个请求出主意，最后由主执行者综合采纳。",
  "独立给出你对上面最新请求的最佳回答或行动方案：要做哪些步骤、读改哪些文件、跑什么命令、有哪些风险和边界情况。",
  "你没有工具，不要假装已经执行过任何操作。简洁、具体，有把握的地方直接给结论。",
].join("\n");

const BRIEF = (count) => [
  "",
  `【参考意见】下面是 ${count} 位参考模型对用户最新请求的独立意见。它们可能有错、互相矛盾或已经过时。`,
  "批判地综合：取其中正确、具体的部分，纠正错误，然后由你亲自完成任务（需要时调用工具）。",
  "回答用户时不要提到参考意见的存在，除非用户问起。",
].join("\n");

export const FANOUTS = ["user_turn", "per_iteration"];
export const DEFAULT_PRESET = "default";

export function resolveMoa(config) {
  const moa = config?.moa || {};
  const name = moa.preset || DEFAULT_PRESET;
  const preset = moa.presets?.[name];
  if (!preset) return { enabled: Boolean(moa.enabled), name, preset: null };
  return {
    enabled: Boolean(moa.enabled),
    name,
    preset: {
      references: (preset.references || []).filter(Boolean),
      aggregator: preset.aggregator || null,
      fanout: FANOUTS.includes(preset.fanout) ? preset.fanout : "user_turn",
      timeoutSec: Number(preset.timeoutSec) > 0 ? Number(preset.timeoutSec) : 120,
    },
  };
}

function clip(text, limit) {
  const value = String(text ?? "");
  return value.length > limit ? `${value.slice(0, limit)}\n…（已截断）` : value;
}

// Tool traffic becomes plain text so models without tool schemas accept it.
export function advisorMessages(messages, { toolLimit = 2000 } = {}) {
  const out = [];
  for (const message of messages) {
    if (message.role === "system") out.push({ role: "system", content: message.content });
    else if (message.role === "user") out.push({ role: "user", content: message.content });
    else if (message.role === "assistant") {
      const calls = (message.toolCalls || []).map((call) => `[调用 ${call.name} ${clip(JSON.stringify(call.arguments ?? {}), 300)}]`).join("\n");
      const text = [message.content || "", calls].filter(Boolean).join("\n");
      if (text) out.push({ role: "assistant", content: text });
    } else if (message.role === "tool") {
      out.push({ role: "user", content: `[工具 ${message.name || ""} 的结果]\n${clip(message.content, toolLimit)}` });
    }
  }
  out.push({ role: "user", content: ADVISOR });
  return out;
}

export function injectAdvice(messages, advice) {
  if (!advice.length) return messages;
  const body = advice.map((item, index) => `### 参考 ${index + 1}（${item.name}）\n${item.ok ? item.text : `（这位参考没有给出意见：${item.error}）`}`).join("\n\n");
  const note = `${BRIEF(advice.length)}\n\n${body}`;
  const copy = messages.map((message) => ({ ...message }));
  const system = copy.find((message) => message.role === "system");
  if (system) system.content = `${system.content}\n${note}`;
  else copy.unshift({ role: "system", content: note.trim() });
  return copy;
}

function turnKey(messages) {
  let index = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      index = i;
      break;
    }
  }
  return index < 0 ? "" : `${index}:${String(messages[index].content).length}:${String(messages[index].content).slice(0, 200)}`;
}

export function createMoaProvider({ references, aggregator, fanout = "user_turn", timeoutSec = 120, adviceLimit = 6000, onProgress = () => {} }) {
  if (!aggregator?.provider) throw new KarmenError("moa.noAggregator");
  if (!references?.length) throw new KarmenError("moa.noReferences");
  let cached = null;

  async function consult(messages, signal) {
    const prompt = advisorMessages(messages);
    let done = 0;
    onProgress({ phase: "consult", done, total: references.length });
    const results = await Promise.all(references.map(async (reference) => {
      const limit = AbortSignal.timeout(timeoutSec * 1000);
      const combined = signal ? AbortSignal.any([signal, limit]) : limit;
      try {
        const response = await reference.provider.complete({ messages: prompt, tools: [], signal: combined });
        const text = clip(String(response?.text || "").trim(), adviceLimit);
        return text ? { name: reference.name, ok: true, text, usage: response?.usage || null } : { name: reference.name, ok: false, error: "空回答" };
      } catch (error) {
        if (signal?.aborted) throw error;
        return { name: reference.name, ok: false, error: limit.aborted ? `超过 ${timeoutSec} 秒` : error?.message || String(error) };
      } finally {
        done += 1;
        onProgress({ phase: "consult", done, total: references.length, name: reference.name });
      }
    }));
    onProgress({ phase: "aggregate", ok: results.filter((item) => item.ok).length, total: references.length });
    return results;
  }

  return {
    name: `MoA ${references.length}+1`,
    model: aggregator.provider.model || aggregator.name,
    moa: true,
    async complete({ messages, tools, signal, onDelta }) {
      const key = turnKey(messages);
      let advice;
      let spent = null;
      if (fanout === "user_turn" && cached?.key === key) advice = cached.advice;
      else {
        advice = await consult(messages, signal);
        cached = { key, advice };
        spent = advice.reduce((sum, item) => ({ prompt: sum.prompt + (item.usage?.prompt || 0), completion: sum.completion + (item.usage?.completion || 0) }), { prompt: 0, completion: 0 });
      }
      const useful = advice.some((item) => item.ok) ? advice : [];
      const response = await aggregator.provider.complete({ messages: injectAdvice(messages, useful), tools, signal, onDelta });
      onProgress({ phase: "done" });
      if (!spent || !(spent.prompt || spent.completion)) return response;
      const own = response.usage || { prompt: 0, completion: 0 };
      return { ...response, usage: { prompt: own.prompt + spent.prompt, completion: own.completion + spent.completion } };
    },
  };
}

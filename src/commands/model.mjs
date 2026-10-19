import { createCoach } from "../coach.mjs";
import { KarmenError } from "../errors.mjs";
import { loadConfig, saveConfig, secretsFile } from "../home.mjs";
import { loadKernel, modelPresets } from "../kernel.mjs";
import { addModel, listModels, recordFor, removeModel, useModel } from "../models.mjs";
import { createPrompter } from "../prompt.mjs";

// One tiny request to the model; resolves { ok, ms } or { ok: false, message }.
export async function probeModel(record, fetchImpl = globalThis.fetch) {
  const { createProvider } = await loadKernel();
  const started = Date.now();
  try {
    const provider = createProvider({ provider: { ...record, maxOutput: 16 }, fetchImpl });
    await provider.complete({ messages: [{ role: "user", content: "Reply with the single word: ok" }], tools: [], signal: AbortSignal.timeout(30_000) });
    return { ok: true, ms: Date.now() - started };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
}

export async function testModel(ctx, record, prompter) {
  const { t } = ctx;
  prompter.print(t("cli.testing", { url: record.baseUrl }));
  const result = await probeModel(record, ctx.io.fetchImpl || globalThis.fetch);
  prompter.print(result.ok ? t("cli.testOk", { ms: result.ms }) : t("cli.testFail", { message: result.message }));
  return result.ok;
}

// Saves a model picked from the vendor catalog; a second model of the same
// vendor gets its own id. Shared with the settings centre.
export function addFromPreset(env, preset, { model, baseUrl = preset.baseUrl, protocol = preset.protocol, apiKey = "", makeDefault = false, keyEnv = "" }) {
  const local = preset.id === "local" || preset.auth === "none";
  const models = listModels(env);
  const taken = models.find((item) => item.id === preset.id && item.model !== model);
  return addModel({
    id: taken ? `${preset.id}-${models.filter((item) => item.id.startsWith(preset.id)).length + 1}` : preset.id,
    preset: preset.id,
    name: preset.name,
    model,
    baseUrl,
    protocol,
    auth: local && !apiKey ? "none" : preset.auth,
    chatPath: preset.chatPath,
    sendApiKeyHeader: preset.sendApiKeyHeader,
    contextWindow: preset.contextWindow,
    maxOutput: preset.maxOutput,
    keyEnv,
  }, { apiKey, makeDefault }, env);
}

// Vendor list from the Koder kernel's catalog, key hidden while typing.
export async function addModelWizard(ctx, prompter, { makeDefault = false, coach = createCoach(ctx, prompter) } = {}) {
  const { t, env } = ctx;
  const presets = (await modelPresets()).filter((item) => !item.stopped);
  prompter.print(t("cli.presets"));
  const index = await prompter.choose(t("cli.pick"), presets.map((item) => `${item.name}${item.vendor && item.vendor !== item.name ? ` · ${item.vendor}` : ""}${item.model ? ` · ${item.model}` : ""}`));
  if (index < 0) return null;
  const preset = presets[index];
  const custom = preset.id === "custom";
  const model = preset.model
    ? await prompter.ask(t("cli.modelName", { model: preset.model }), { fallback: preset.model })
    : await prompter.ask(t("cli.modelNameRequired"));
  if (!model) return null;
  const baseUrl = custom ? await prompter.ask(t("cli.baseUrl")) : preset.baseUrl;
  const protocol = custom ? ((await prompter.ask(t("cli.protocol"))) === "anthropic" ? "anthropic" : "openai") : preset.protocol;
  const local = preset.id === "local" || preset.auth === "none";
  coach.tip(t(local ? "coach.key.local" : "coach.key.tip", { name: preset.name }));
  const apiKey = local ? await prompter.secret(t("cli.keyOptional")) : await prompter.secret(t("cli.apiKey", { name: preset.name }));
  if (!apiKey && !local) {
    prompter.print(t("cli.noKey"));
    return null;
  }
  const entry = addFromPreset(env, preset, { model, baseUrl, protocol, apiKey, makeDefault });
  prompter.print(t("cli.saved", { name: entry.name, model: entry.model, file: secretsFile(env) }));
  coach.tip(t("coach.test.tip"));
  if (ctx.opts.check || (await prompter.confirm(t("cli.testAsk"), true))) await testModel(ctx, recordFor(entry.id, env), prompter);
  return entry;
}

export async function run(ctx) {
  const { t, env, args } = ctx;
  const action = args[0] || "list";
  const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
  try {
    if (action === "list" || action === "ls") {
      const models = listModels(env);
      if (!models.length) {
        prompter.print(t("cli.modelsEmpty"));
        return 0;
      }
      const chosen = loadConfig(env).model;
      prompter.print(t("cli.modelsTitle"));
      for (const item of models) prompter.print(`  ${item.id === chosen ? "*" : " "} ${item.id.padEnd(14)} ${item.name} · ${item.model} · ${item.baseUrl}`);
      return 0;
    }
    if (action === "add") return (await addModelWizard(ctx, prompter, { makeDefault: true })) ? 0 : 1;
    if (action === "use" || action === "default") {
      if (!args[1]) throw new KarmenError("err.flagValue", { flag: "model use <id>" });
      useModel(args[1], env);
      prompter.print(t("cli.default", { name: args[1] }));
      return 0;
    }
    if (action === "remove" || action === "rm") {
      if (!args[1]) throw new KarmenError("err.flagValue", { flag: "model remove <id>" });
      recordFor(args[1], env);
      removeModel(args[1], env);
      prompter.print(t("cli.removed", { id: args[1] }));
      return 0;
    }
    if (action === "presets") {
      for (const item of (await modelPresets()).filter((preset) => !preset.stopped)) prompter.print(`${item.id.padEnd(16)} ${item.name}${item.model ? ` · ${item.model}` : ""}`);
      return 0;
    }
    if (action === "set") {
      if (!ctx.opts.preset && !ctx.opts.baseUrl) throw new KarmenError("err.flagValue", { flag: "--preset or --base-url" });
      const presets = await modelPresets();
      const preset = presets.find((item) => item.id === ctx.opts.preset) || { id: "custom", name: ctx.opts.modelId || "custom", model: ctx.opts.modelId, baseUrl: ctx.opts.baseUrl, protocol: ctx.opts.protocol || "openai", auth: ctx.opts.keyEnv ? "bearer" : "none" };
      if (!preset.model && !ctx.opts.modelId) throw new KarmenError("err.flagValue", { flag: "--model" });
      const entry = addFromPreset(env, preset, { model: ctx.opts.modelId || preset.model, baseUrl: ctx.opts.baseUrl || preset.baseUrl, protocol: ctx.opts.protocol || preset.protocol, makeDefault: true, keyEnv: ctx.opts.keyEnv || "" });
      prompter.print(t("cli.saved", { name: entry.name, model: entry.model, file: secretsFile(env) }));
      return 0;
    }
    if (action === "context") {
      const id = loadConfig(env).model;
      if (!id) throw new KarmenError("model.notConfigured");
      const models = listModels(env).map((item) => item.id === id ? { ...item, contextWindow: Number(ctx.opts.contextWindow || item.contextWindow), maxOutput: Number(ctx.opts.maxOutput || item.maxOutput) } : item);
      saveConfig({ models }, env);
      prompter.print(`${id} context ${ctx.opts.contextWindow || ""} output ${ctx.opts.maxOutput || ""}`);
      return 0;
    }
    if (action === "test") {
      const id = args[1] || loadConfig(env).model;
      if (!id) throw new KarmenError("model.notConfigured");
      return (await testModel(ctx, recordFor(id, env), prompter)) ? 0 : 1;
    }
    throw new KarmenError("err.unknownCommand", { name: `model ${action}` });
  } finally {
    prompter.close();
  }
}

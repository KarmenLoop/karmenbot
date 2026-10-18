import { KarmenError } from "../errors.mjs";
import { loadConfig, saveConfig } from "../home.mjs";
import { listModels } from "../models.mjs";
import { DEFAULT_PRESET, resolveMoa } from "../moa.mjs";
import { createPrompter } from "../prompt.mjs";

function describe(ctx, moa) {
  const names = (ids) => ids.map((id) => listModels(ctx.env).find((item) => item.id === id)?.name || id).join("、");
  return {
    references: names(moa.preset.references),
    aggregator: names([moa.preset.aggregator]),
    fanout: ctx.t(`cli.fanout.${moa.preset.fanout}`),
  };
}

export function saveMoaPreset(env, { references, aggregator, fanout, enabled }) {
  const current = loadConfig(env).moa || {};
  const presets = { ...(current.presets || {}), [DEFAULT_PRESET]: { references, aggregator, fanout, timeoutSec: 120 } };
  saveConfig({ moa: { ...current, enabled, preset: DEFAULT_PRESET, presets } }, env);
}

export async function moaWizard(ctx, prompter) {
  const { t, env } = ctx;
  const models = listModels(env);
  if (models.length < 2) {
    prompter.print(t("cli.moaNeedTwo"));
    return false;
  }
  const labels = models.map((item) => `${item.name} · ${item.model}`);
  const refs = await prompter.chooseMany(t("cli.moaRefs"), labels);
  if (!refs.length) return false;
  prompter.print("");
  const agg = await prompter.choose(t("cli.moaAgg"), labels, { fallback: models.findIndex((item) => item.id === loadConfig(env).model) });
  if (agg < 0) return false;
  const fanout = (await prompter.ask(t("cli.moaFanout"))) === "2" ? "per_iteration" : "user_turn";
  saveMoaPreset(env, { references: refs.map((i) => models[i].id), aggregator: models[agg].id, fanout, enabled: true });
  prompter.print(t("cli.moaSaved", describe(ctx, resolveMoa(loadConfig(env)))));
  return true;
}

export async function run(ctx) {
  const { t, env, args } = ctx;
  const action = args[0] || "status";
  const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
  try {
    if (action === "setup") return (await moaWizard(ctx, prompter)) ? 0 : 1;
    const moa = resolveMoa(loadConfig(env));
    if (action === "status") {
      if (!moa.preset) prompter.print(t("cli.moaNone"));
      else prompter.print(t("cli.moaStatus", { state: moa.enabled ? t("side.on") : t("side.off"), ...describe(ctx, moa) }));
      return 0;
    }
    if (action === "on" || action === "off") {
      if (!moa.preset) throw new KarmenError("moa.notSet");
      saveConfig({ moa: { ...(loadConfig(env).moa || {}), enabled: action === "on" } }, env);
      prompter.print(t(action === "on" ? "cli.moaEnabled" : "cli.moaDisabled"));
      return 0;
    }
    throw new KarmenError("err.unknownCommand", { name: `moa ${action}` });
  } finally {
    prompter.close();
  }
}

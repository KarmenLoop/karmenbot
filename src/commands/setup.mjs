import { createCoach } from "../coach.mjs";
import { loadConfig, saveConfig } from "../home.mjs";
import { createT } from "../i18n.mjs";
import { listModels } from "../models.mjs";
import { createPrompter } from "../prompt.mjs";
import { addModelWizard } from "./model.mjs";
import { moaWizard } from "./moa.mjs";

const TOTAL = 4;

// First-run wizard: language → model → MoA (optional) → chat platforms (optional),
// each step explained before it asks.
export async function setupWizard(ctx, prompter) {
  const { env } = ctx;
  let coach = createCoach(ctx, prompter);
  prompter.print(ctx.t("cli.setupTitle"));
  coach.step({ step: 1, total: TOTAL, title: ctx.t("coach.lang.title"), tips: [ctx.t("coach.lang.tip")], quip: ctx.t("coach.lang.quip") });
  const lang = (await prompter.ask(ctx.t("cli.setupLang"))) === "2" ? "en" : "zh";
  saveConfig({ lang }, env);
  ctx.t = createT(lang);
  coach = createCoach(ctx, prompter);
  const { t } = ctx;

  coach.step({ step: 2, total: TOTAL, title: t("coach.model.title"), tips: [t("coach.model.tip1"), t("coach.model.tip2"), t("coach.model.tip3")], quip: t("coach.model.quip") });
  const models = listModels(env);
  const chosen = models.find((item) => item.id === loadConfig(env).model);
  if (!models.length || (await prompter.confirm(t("cli.setupHasModel", { count: models.length, name: chosen?.name || models[0].name }), false))) {
    await addModelWizard(ctx, prompter, { makeDefault: !models.length, coach });
  }

  coach.step({ step: 3, total: TOTAL, title: t("coach.moa.title"), tips: [t("coach.moa.tip1"), t("coach.moa.tip2")], quip: t("coach.moa.quip") });
  if (listModels(env).length >= 2) {
    if (await prompter.confirm(t("cli.setupMoa"), false)) await moaWizard(ctx, prompter);
  } else {
    coach.tip(t("coach.moa.later"));
  }

  coach.step({ step: 4, total: TOTAL, title: t("coach.connect.title"), tips: [t("coach.connect.tip1"), t("coach.connect.tip2")], quip: t("coach.connect.quip") });
  if (await prompter.confirm(t("cli.setupPlatforms"), false)) {
    const { connectWizard } = await import("./connect.mjs");
    await connectWizard(ctx, prompter);
  }
  coach.done(t("cli.setupDone"), [t("coach.done.tip1"), t("coach.done.tip2")]);
  return true;
}

export async function run(ctx) {
  const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
  try {
    await setupWizard(ctx, prompter);
    return 0;
  } finally {
    prompter.close();
  }
}

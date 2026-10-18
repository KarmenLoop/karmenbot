import { activeModel } from "../models.mjs";
import { runTui } from "../tui/app.mjs";

const RESTORE = "\x1b[0m\x1b[?1006l\x1b[?1000l\x1b[?2004l\x1b[?25h\x1b[?1049l";

export async function run(ctx) {
  // First visit with no model: open the settings centre straight away, rather
  // than leaving the user in front of an assistant that cannot think.
  let configured = true;
  try {
    configured = Boolean(ctx.io.providerOverride || activeModel({ env: ctx.env, modelFile: ctx.opts.modelFile }));
  } catch {
    configured = true;
  }
  return fullScreen(ctx, { settings: !configured && ctx.env.KARMENBOT_SKIP_SETUP !== "1" ? "first" : undefined });
}

export async function fullScreen(ctx, extra = {}) {
  const { stdin, stdout, stderr, env, opts, t } = ctx;
  if (!stdin.isTTY || !stdout.isTTY) {
    stderr.write(`${t("tui.needTty")}\n`);
    return 2;
  }

  // If something throws outside the TUI's own handlers, the user's shell
  // must not be left in raw mode on the alternate screen.
  const controller = new AbortController();
  const stop = () => controller.abort();
  let running = true;
  const restore = () => {
    if (!running) return;
    running = false;
    try {
      stdin.setRawMode?.(false);
    } catch {
      // Already detached.
    }
    stdout.write(RESTORE);
  };
  const crash = (error) => {
    restore();
    stderr.write(`${t("err.failed", { message: error?.message || String(error) })}\n`);
    if (env.KARMENBOT_DEBUG) stderr.write(`${error?.stack || ""}\n`);
    process.exit(1);
  };
  process.once("SIGTERM", stop);
  process.once("SIGHUP", stop);
  process.once("exit", restore);
  process.on("uncaughtException", crash);
  process.on("unhandledRejection", crash);
  try {
    const code = await runTui({
      stdin, stdout, stderr, env,
      cwd: ctx.cwd,
      workspace: ctx.workspace,
      lang: opts.lang,
      mode: opts.mode,
      yes: opts.yes,
      moa: opts.moa,
      modelFile: opts.modelFile,
      color: opts.color,
      signal: controller.signal,
      splash: opts.splash !== false && !env.KARMENBOT_NO_ANIM && !env.CI,
      ...extra,
    });
    running = false;
    return code;
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGHUP", stop);
    process.off("exit", restore);
    process.off("uncaughtException", crash);
    process.off("unhandledRejection", crash);
  }
}

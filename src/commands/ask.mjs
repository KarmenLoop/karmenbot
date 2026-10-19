import fs from "node:fs";
import { openAgent } from "../agent.mjs";
import { KarmenError } from "../errors.mjs";
import { loadConfig } from "../home.mjs";
import { activeModel } from "../models.mjs";
import { resolveMoa } from "../moa.mjs";
import { asksWhoMadeIt, identityText } from "../official.mjs";
import { createPrompter } from "../prompt.mjs";

// Only a shell pipe or a redirected file counts as input. A socket handed over
// by a parent process (cron, services, spawn) may never close, and reading it
// would hang forever.
function pipedInput(stdin) {
  if (stdin.isTTY) return false;
  if (stdin !== process.stdin) return true;
  try {
    const stat = fs.fstatSync(0);
    return stat.isFIFO() || stat.isFile();
  } catch {
    return false;
  }
}

async function readStdin(stdin, limit = 400_000) {
  if (!pipedInput(stdin)) return "";
  let text = "";
  for await (const chunk of stdin) {
    text += chunk.toString();
    if (text.length > limit) break;
  }
  return text.slice(0, limit).trim();
}

// One task without the full-screen interface: for scripts, pipes and CI.
// Edits and commands are refused unless --yes, or confirmed on a terminal.
export async function run(ctx) {
  const { opts, t, env, stdin, stdout, stderr } = ctx;
  let prompt = ctx.args.join(" ").trim();
  const piped = await readStdin(stdin);
  if (piped) prompt = prompt ? `${prompt}\n\n<stdin>\n${piped}\n</stdin>` : piped;
  if (!prompt) throw new KarmenError("err.noPrompt");
  if (asksWhoMadeIt(prompt)) {
    stdout.write(`${identityText(t.lang === "en" ? "en" : "zh")}\n`);
    return 0;
  }
  const model = ctx.io.providerOverride ? null : activeModel({ env, modelFile: opts.modelFile });
  if (!model && !ctx.io.providerOverride) throw new KarmenError("model.notConfigured");
  const moa = resolveMoa(loadConfig(env));
  if (opts.moa !== undefined) moa.enabled = opts.moa;
  const agent = await openAgent({ workspace: ctx.workspace, env, model, moa, providerOverride: ctx.io.providerOverride, fetchImpl: ctx.io.fetchImpl });
  const convo = await agent.conversation(opts.session || "ask", { mode: opts.mode || "standard" });
  const prompter = stdin.isTTY ? createPrompter({ input: stdin, output: stderr }) : null;

  async function decide(pause) {
    if (pause.kind === "secret") return { cancel: true };
    if (opts.yes && (pause.kind === "change" || pause.kind === "approval")) return { accept: true };
    if (!prompter) return { accept: false };
    if (pause.kind === "choice") {
      const index = await prompter.choose(`${pause.question}\n> `, pause.options, { allowEmpty: true });
      return index < 0 ? { cancel: true } : { index };
    }
    const label = pause.kind === "change" ? t("dialog.change", { path: pause.path }) : `${t("dialog.command")}: ${pause.command}`;
    return { accept: await prompter.confirm(`${label} [y/N] `, false) };
  }

  let open = false;
  if (opts.new) await convo.reset(opts.mode || "standard");
  const outcome = await convo.turn(prompt, {
    mode: opts.mode,
    interaction: opts.interaction || "agent",
    decide,
    onEvent(event) {
      if (opts.json) {
        stdout.write(`${JSON.stringify(event.type === "message" ? { type: event.message.role, text: event.message.content || "", name: event.message.name } : event)}\n`);
        return;
      }
      if (event.type === "delta") {
        stdout.write(event.text);
        open = !event.text.endsWith("\n");
      } else if (event.type === "message" && event.message.role === "assistant") {
        const rest = String(event.message.content || "").slice(event.streamed || 0);
        if (rest) {
          stdout.write(rest);
          open = !rest.endsWith("\n");
        }
      } else if (event.type === "message" && event.message.role === "tool") {
        stderr.write(`  ↳ ${event.message.name}\n`);
      } else if (event.type === "message" && event.message.role === "notice") {
        stderr.write(`! ${event.message.code === "API_UNREACHABLE" ? t("tui.unreachable", { detail: "" }) : event.message.content}\n`);
      } else if (event.type === "decision" && !event.decision.cancel) {
        const pause = event.pause;
        const text = pause.kind === "change"
          ? t(event.decision.accept ? "dialog.accepted" : "dialog.rejected", { path: pause.path })
          : pause.kind === "approval" ? t(event.decision.accept ? "dialog.allowed" : "dialog.denied") : t("dialog.picked", { option: pause.options[event.decision.index] });
        stderr.write(`  ${text}\n`);
      }
    },
  });
  prompter?.close();
  if (open) stdout.write("\n");
  if (outcome.detail) stderr.write(`${t("tui.unreachable", { detail: `（${outcome.detail}）` })}\n`);
  return outcome.code;
}

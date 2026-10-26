import fs from "node:fs";
import { KarmenError } from "../errors.mjs";
import { speakText } from "../voice/tts.mjs";
import { transcribeFile } from "../voice/stt.mjs";
import { run as runAsk } from "./ask.mjs";

/**
 * Voice MVP (P2):
 *   karmenbot voice say "text"           — system TTS of a string
 *   karmenbot voice last                 — TTS of ~/.karmenbot/voice/last-reply.txt
 *   karmenbot voice ask <audio>          — STT (BYOK) → ask → save reply → optional TTS
 *   karmenbot voice --file <audio> …     — same as ask
 *
 * No forced cloud: STT uses whatever OpenAI-compatible endpoint you configure.
 */
export async function run(ctx) {
  const en = ctx.t.lang === "en";
  const [action, ...rest] = ctx.args;
  const homeVoice = `${ctx.env.KARMENBOT_HOME || `${ctx.env.HOME}/.karmenbot`}/voice`;
  fs.mkdirSync(homeVoice, { recursive: true, mode: 0o700 });

  if (!action || action === "help") {
    ctx.stdout.write(en
      ? "voice say <text> | voice last | voice ask <wav/mp3>  (STT BYOK; see docs/VOICE.md)\n"
      : "voice say <文本> | voice last | voice ask <wav/mp3>  （STT 自带密钥；见 docs/VOICE.md）\n");
    return 0;
  }

  if (action === "say") {
    const text = rest.join(" ").trim();
    if (!text) throw new KarmenError("err.flagValue", { flag: "voice say <text>" });
    const out = speakText(text, { lang: ctx.t.lang });
    if (!out.ok) throw new KarmenError("err.failed", { message: out.reason || "TTS failed" });
    return 0;
  }

  if (action === "last") {
    const file = `${homeVoice}/last-reply.txt`;
    if (!fs.existsSync(file)) throw new KarmenError("err.failed", { message: en ? "No last reply yet." : "还没有上次回复。" });
    const text = fs.readFileSync(file, "utf8");
    const out = speakText(text, { lang: ctx.t.lang });
    if (!out.ok) {
      ctx.stdout.write(`${text}\n`);
      throw new KarmenError("err.failed", { message: out.reason || "TTS failed" });
    }
    return 0;
  }

  if (action === "ask" || action === "--file") {
    const file = action === "--file" ? rest[0] : rest[0];
    if (!file) throw new KarmenError("err.flagValue", { flag: "voice ask <audio-file>" });
    let transcript;
    try {
      transcript = await transcribeFile(file, { env: ctx.env, fetchImpl: ctx.io.fetchImpl });
    } catch (error) {
      throw new KarmenError("err.failed", { message: error.message });
    }
    ctx.stdout.write(`${en ? "Heard" : "识别"}: ${transcript.text}\n`);
    if (!transcript.text) return 1;

    // Capture ask stdout into last-reply for TTS
    const chunks = [];
    const code = await runAsk({
      ...ctx,
      args: [transcript.text],
      opts: { ...ctx.opts, interaction: "ask" },
      stdout: {
        write(s) {
          chunks.push(s);
          ctx.stdout.write(s);
        },
      },
    });
    const reply = chunks.join("").trim();
    if (reply) fs.writeFileSync(`${homeVoice}/last-reply.txt`, reply, { mode: 0o600 });
    if (ctx.opts.voice || ctx.opts.speak) {
      speakText(reply.slice(0, 800), { lang: ctx.t.lang });
    }
    return code;
  }

  throw new KarmenError("err.unknownCommand", { name: `voice ${action}` });
}

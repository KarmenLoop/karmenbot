import fs from "node:fs";
import path from "node:path";
import { loadConfig, loadSecrets } from "../home.mjs";

/**
 * Transcribe wav/mp3 via OpenAI-compatible STT (BYOK).
 * Config: voice.stt = { baseUrl, model } ; secrets.voice.apiKey or models key.
 * Or env KARMENBOT_STT_API_KEY / OPENAI_API_KEY.
 */
export async function transcribeFile(filePath, {
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`audio not found: ${abs}`);
  const cfg = loadConfig(env).voice?.stt || {};
  const baseUrl = String(cfg.baseUrl || env.KARMENBOT_STT_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = cfg.model || env.KARMENBOT_STT_MODEL || "whisper-1";
  const secrets = loadSecrets(env);
  const apiKey = secrets.voice?.apiKey || env.KARMENBOT_STT_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("STT needs secrets.voice.apiKey or KARMENBOT_STT_API_KEY / OPENAI_API_KEY (BYOK)");

  const bytes = fs.readFileSync(abs);
  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(abs));
  form.append("model", model);
  const res = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`STT HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return { text: String(data.text || "").trim(), model, baseUrl };
}

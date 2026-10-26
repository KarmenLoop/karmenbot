import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Escape for PowerShell single-quoted string (double any '). */
export function escapePsSingleQuoted(text) {
  return String(text ?? "").replace(/'/g, "''");
}

function speakWindows(body, spawn = spawnSync) {
  // Single-quoted Speak('…') so metacharacters in the text cannot break out.
  const script =
    "Add-Type -AssemblyName System.Speech; " +
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
    `$s.Speak('${escapePsSingleQuoted(body)}')`;
  const r = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  if (r.error && r.error.code === "ENOENT") return { ok: false, reason: "powershell not found" };
  return { ok: r.status === 0, reason: r.stderr || null };
}

/** Speak text with system TTS (macOS `say`, Windows System.Speech, Linux `espeak`/`spd-say`). */
export function speakText(text, { lang = "zh", platform = process.platform, spawn = spawnSync } = {}) {
  const body = String(text || "").trim();
  if (!body) return { ok: false, reason: "empty" };
  if (platform === "darwin") {
    const r = spawn("say", ["-v", lang.startsWith("zh") ? "Ting-Ting" : "Samantha", body], { encoding: "utf8" });
    if (r.error && r.error.code === "ENOENT") return { ok: false, reason: "say not found" };
    return { ok: r.status === 0, reason: r.stderr || null };
  }
  if (platform === "win32") return speakWindows(body, spawn);
  for (const [bin, args] of [["spd-say", [body]], ["espeak", [body]]]) {
    const r = spawn(bin, args, { encoding: "utf8" });
    if (!r.error) return { ok: r.status === 0, reason: r.stderr || null };
  }
  return { ok: false, reason: "no system TTS (install say/espeak/spd-say or use Windows PowerShell)" };
}

export function detectTtsBin({ platform = process.platform, spawn = spawnSync } = {}) {
  if (platform === "darwin") return "say";
  if (platform === "win32") return "powershell";
  for (const bin of ["spd-say", "espeak"]) {
    const r = spawn(bin, ["--version"], { encoding: "utf8" });
    if (!r.error) return bin;
  }
  return null;
}

function voiceDir(env = process.env) {
  const home = env.KARMENBOT_HOME || path.join(env.HOME || os.homedir(), ".karmenbot");
  const dir = path.join(home, "voice");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function saveLastReply(text, env = process.env) {
  const file = path.join(voiceDir(env), "last-reply.txt");
  fs.writeFileSync(file, String(text || ""), { mode: 0o600 });
  return file;
}

export function readLastReply(env = process.env) {
  const file = path.join(voiceDir(env), "last-reply.txt");
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

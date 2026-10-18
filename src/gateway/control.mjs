import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { karmenHome } from "../home.mjs";
import { logFile } from "./service.mjs";

// Start, stop and query the background gateway: shared by `karmenbot gateway`
// and the settings centre.
const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "karmenbot.mjs");

export const pidFile = (env) => path.join(karmenHome(env), "gateway.pid");

export function runningPid(env) {
  try {
    const pid = Number(fs.readFileSync(pidFile(env), "utf8"));
    process.kill(pid, 0);
    return pid;
  } catch {
    return 0;
  }
}

export async function startGateway(env, { workspace = null } = {}) {
  const existing = runningPid(env);
  if (existing) return existing;
  const log = logFile(env);
  fs.mkdirSync(path.dirname(log), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(log, "a");
  const child = spawn(process.execPath, [bin, "gateway", "run", ...(workspace ? ["-w", workspace] : [])], { detached: true, windowsHide: true, stdio: ["ignore", fd, fd], env });
  child.unref();
  fs.closeSync(fd);
  for (let i = 0; i < 30 && !runningPid(env); i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  return runningPid(env);
}

export async function stopGateway(env) {
  const pid = runningPid(env);
  if (!pid) return false;
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 50 && runningPid(env); i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  return true;
}

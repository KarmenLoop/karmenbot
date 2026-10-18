import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { karmenHome } from "../home.mjs";

// Start-at-login registration for the gateway: a launchd agent on macOS, a
// systemd user unit on Linux, the current user's Run key on Windows (no
// administrator rights). `karmenbot gateway start` alone never touches these.
const LABEL = "com.karmenbot.gateway";
const UNIT = "karmenbot-gateway.service";
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE = "karmenbot-gateway";
const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "karmenbot.mjs");

const xml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function logFile(env) {
  return path.join(karmenHome(env), "logs", "gateway.log");
}

export function serviceFile({ env = process.env, platform = process.platform, node = process.execPath, home = os.homedir() } = {}) {
  const log = logFile(env);
  const vars = { KARMENBOT_HOME: karmenHome(env), PATH: env.PATH || "/usr/bin:/bin" };
  if (platform === "darwin") {
    return {
      path: path.join(home, "Library", "LaunchAgents", `${LABEL}.plist`),
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(node)}</string><string>${xml(bin)}</string><string>gateway</string><string>run</string></array>
  <key>EnvironmentVariables</key>
  <dict>${Object.entries(vars).map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join("")}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`,
    };
  }
  if (platform === "win32") {
    return { registry: RUN_KEY, name: RUN_VALUE, path: `${RUN_KEY}\\${RUN_VALUE}`, content: `"${node}" "${bin}" gateway start` };
  }
  if (platform === "linux") {
    return {
      path: path.join(home, ".config", "systemd", "user", UNIT),
      content: `[Unit]
Description=karmenbot gateway
After=network-online.target

[Service]
ExecStart=${node} ${bin} gateway run
Restart=on-failure
RestartSec=5
${Object.entries(vars).map(([key, value]) => `Environment=${key}=${value}`).join("\n")}
StandardOutput=append:${log}
StandardError=append:${log}

[Install]
WantedBy=default.target
`,
    };
  }
  return null;
}

export async function installService(ctx) {
  const file = serviceFile({ env: ctx.env });
  if (!file) return false;
  if (file.registry) {
    execFileSync("reg", ["add", file.registry, "/v", file.name, "/t", "REG_SZ", "/d", file.content, "/f"], { stdio: "ignore" });
    return file.path;
  }
  fs.mkdirSync(path.dirname(file.path), { recursive: true });
  fs.mkdirSync(path.dirname(logFile(ctx.env)), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file.path, file.content);
  if (process.platform === "darwin") {
    const domain = `gui/${process.getuid()}`;
    try {
      execFileSync("launchctl", ["bootout", `${domain}/${LABEL}`], { stdio: "ignore" });
    } catch {
      // Not loaded yet.
    }
    execFileSync("launchctl", ["bootstrap", domain, file.path], { stdio: "ignore" });
  } else {
    execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
    execFileSync("systemctl", ["--user", "enable", "--now", UNIT], { stdio: "ignore" });
  }
  return file.path;
}

export async function stopService(ctx, { remove = false } = {}) {
  const file = serviceFile({ env: ctx.env });
  if (file?.registry) {
    if (!remove) return false;
    try {
      execFileSync("reg", ["delete", file.registry, "/v", file.name, "/f"], { stdio: "ignore" });
    } catch {
      // Not registered.
    }
    return true;
  }
  if (!file || !fs.existsSync(file.path)) return false;
  try {
    if (process.platform === "darwin") execFileSync("launchctl", ["bootout", `gui/${process.getuid()}/${LABEL}`], { stdio: "ignore" });
    else execFileSync("systemctl", ["--user", remove ? "disable" : "stop", "--now", UNIT], { stdio: "ignore" });
  } catch {
    // Already stopped.
  }
  if (remove) fs.rmSync(file.path, { force: true });
  return true;
}

export function serviceInstalled(env) {
  const file = serviceFile({ env });
  if (!file) return false;
  if (!file.registry) return fs.existsSync(file.path);
  try {
    execFileSync("reg", ["query", file.registry, "/v", file.name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { karmenHome } from "../home.mjs";
import { createPrompter } from "../prompt.mjs";

// Removes what the installer created: the launcher, installed releases and the
// private Node runtime. Config and keys stay unless --all.
export async function run(ctx) {
  const { env, t, opts } = ctx;
  const home = karmenHome(env);
  const bin = process.platform === "win32"
    ? path.join(home, "bin", "karmenbot.cmd")
    : path.join(env.KARMENBOT_BIN_DIR || path.join(env.HOME || os.homedir(), ".local", "bin"), "karmenbot");
  const targets = opts.all ? [home, bin] : [path.join(home, "app"), path.join(home, "runtime"), bin];
  const existing = targets.filter((item) => fs.existsSync(item));
  const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io.answers });
  try {
    if (existing.length && !opts.yes && !(await prompter.confirm(t("cli.uninstallAsk", { paths: existing.join("、") }), false))) return 1;
    try {
      const { stopService } = await import("../gateway/service.mjs");
      await stopService(ctx, { remove: true });
    } catch {
      // No background service installed.
    }
    for (const item of existing) fs.rmSync(item, { recursive: true, force: true });
    if (process.platform === "win32") spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", userPathRemoval(path.dirname(bin))], { windowsHide: true, stdio: "ignore" });
    prompter.print(t("cli.uninstalled"));
    if (!opts.all) prompter.print(t("cli.uninstallKept", { home }));
    return 0;
  } finally {
    prompter.close();
  }
}

// PowerShell that drops the launcher folder install.ps1 added to the user PATH.
export function userPathRemoval(dir) {
  const quoted = `'${dir.replace(/'/g, "''")}'`;
  return `$d=${quoted};$p=[Environment]::GetEnvironmentVariable('Path','User');if($p){[Environment]::SetEnvironmentVariable('Path',((($p -split ';')|Where-Object{$_ -and $_ -ne $d}) -join ';'),'User')}`;
}

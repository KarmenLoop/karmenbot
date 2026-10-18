#!/usr/bin/env node
import fs from "node:fs";
import module from "node:module";

// The Koder kernel is not in the open-source repository; the official
// installer puts it in vendor/, and scripts/fetch-kernel.mjs does the same for a clone.
if (!fs.existsSync(new URL("../vendor/MANIFEST.json", import.meta.url))) {
  process.stderr.write([
    "karmenbot 需要 Koder 内核才能运行，内核不在开源代码里。",
    "  · 用官网的一行安装命令安装 karmenbot，会自动带上内核；",
    "  · 从 GitHub 克隆的源码：在源码目录运行  node scripts/fetch-kernel.mjs --from https://karmenloop.com/downloads/karmenbot",
    "karmenbot needs the Koder kernel, which is not part of the open-source code.",
    "Install with the official one-line installer, or in a clone run: node scripts/fetch-kernel.mjs --from <official download URL>",
    "",
  ].join("\n"));
  process.exit(3);
}

module.enableCompileCache?.();
const { runCli } = await import("../src/cli.mjs");
// Exit explicitly: an interrupted model request may still hold a socket open.
process.exit(await runCli(process.argv.slice(2)));

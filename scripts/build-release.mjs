#!/usr/bin/env node
// Builds a karmenbot release for the official site; the one-line installers fetch it:
//   <out>/karmenbot-<version>.tar.gz          the open-source app (GPL-3.0, same as GitHub)
//   <out>/karmenbot-kernel-<version>.tar.gz   the Koder kernel (vendor/ + KERNEL-LICENSE.md), closed
//   <out>/latest.json                         { version, file, sha256, kernel: { file, sha256 }, node }
//   <out>/install.sh, install.ps1      with the download address filled in
//   <out>/SHA256SUMS
//   node scripts/build-release.mjs --base-url https://get.example.com/karmenbot [--out dist] [--node-version v22.23.2]
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BANNER_WIDE_COLUMNS, bannerAnsi } from "../src/brand.mjs";
import { checkVendor } from "../src/commands/doctor.mjs";
import { VERSION } from "../src/version.mjs";
import { powershellBootstrap } from "./installer-bootstrap.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const baseUrl = arg("--base-url");
const out = path.resolve(arg("--out", path.join(pkg, "dist")));
const nodeVersion = arg("--node-version", process.version);
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error("--base-url https://… is required (where latest.json and the archive will be served)");
  process.exit(2);
}
if (!/^v22\.\d+\.\d+$|^v2[3-9]\.\d+\.\d+$/.test(nodeVersion)) {
  console.error(`--node-version must be v22 or newer, got ${nodeVersion}`);
  process.exit(2);
}

const vendor = checkVendor();
if (vendor.bad.length) {
  console.error(`vendor/ differs from its manifest: ${vendor.bad.join(", ")}. Reinstall the kernel before releasing.`);
  process.exit(1);
}

// Pre-rendered glass-ring banners: a shell script cannot draw the ring itself.
function shellBanner() {
  const block = (lines) => `cat <<'KARMEN_BANNER'\n${lines.join("\n")}\nKARMEN_BANNER`;
  const cases = [];
  for (const depth of ["truecolor", "256", "none"]) {
    for (const wide of [true, false]) cases.push(`    ${depth}:${wide ? "wide" : "narrow"})\n${block(bannerAnsi({ depth, wide, version: VERSION }))}\n    ;;`);
  }
  return `banner() {
  if [ "$COLS" -ge ${BANNER_WIDE_COLUMNS + 2} ]; then W=wide; else W=narrow; fi
  D="$DEPTH"; [ "$D" = 16 ] && D=none
  case "$D:$W" in
${cases.join("\n")}
  esac
}`;
}

// Windows PowerShell 5.1 decodes `irm` downloads as Latin-1 unless the server
// says UTF-8, which would garble every Chinese line. Ship an ASCII wrapper
// that carries the real script as base64 and decodes it as UTF-8.

function powershellBanner() {
  const quote = (line) => line.replaceAll("'", "''");
  const lines = (depth, wide) => bannerAnsi({ depth, wide, version: VERSION }).map(quote).join("\n");
  return `$BannerColorWide = @'\n${lines("truecolor", true)}\n'@\n$BannerColorNarrow = @'\n${lines("truecolor", false)}\n'@\n$BannerPlain = @'\n${lines("none", false)}\n'@`;
}

const APP_FILES = ["bin", "src", "docs", "package.json", "README.md", "LICENSE", "LICENSE-EXCEPTION.md", "THIRD_PARTY_NOTICES.md", "site.json"];
const KERNEL_FILES = ["vendor", "KERNEL-LICENSE.md"];

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "karmenbot-stage-"));
const sha = (target) => crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
function pack(name, items) {
  for (const item of items) fs.cpSync(path.join(pkg, item), path.join(stage, name, item), { recursive: true });
  const file = `${name}.tar.gz`;
  const tar = spawnSync("tar", ["-czf", path.join(out, file), "-C", stage, name], { env: { ...process.env, COPYFILE_DISABLE: "1" }, stdio: "inherit" });
  if (tar.status !== 0) process.exit(tar.status || 1);
  return file;
}
try {
  fs.mkdirSync(out, { recursive: true });
  const file = pack(`karmenbot-${VERSION}`, APP_FILES);
  const kernel = pack(`karmenbot-kernel-${VERSION}`, KERNEL_FILES);
  const archive = path.join(out, file);
  fs.writeFileSync(path.join(out, "latest.json"), `${JSON.stringify({
    version: VERSION,
    file,
    sha256: sha(archive),
    kernel: { file: kernel, sha256: sha(path.join(out, kernel)) },
    node: ">=22",
    builtAt: new Date().toISOString(),
  }, null, 2)}\n`);
  for (const script of ["install.sh", "install.ps1", "install.cmd"]) {
    const text = fs.readFileSync(path.join(pkg, "install", script), "utf8")
      .replace("__BANNER__", script === "install.sh" ? shellBanner() : "")
      .replace("__PS_BANNER__", script === "install.ps1" ? powershellBanner() : "")
      .replaceAll("__BASE_URL__", baseUrl.replace(/\/+$/, ""))
      .replaceAll("__NODE_VERSION__", nodeVersion);
    fs.writeFileSync(path.join(out, script), script === "install.cmd" ? text.replace(/\r?\n/g, "\r\n") : script === "install.ps1" ? powershellBootstrap(text, baseUrl) : text, { mode: 0o755 });
  }
  const sums = [file, kernel, "install.sh", "install.ps1", "install.cmd", "latest.json"].map((item) => `${sha(path.join(out, item))}  ${item}`).join("\n");
  fs.writeFileSync(path.join(out, "SHA256SUMS"), `${sums}\n`);
  const size = (target) => (fs.statSync(path.join(out, target)).size / 1024).toFixed(0);
  console.log(`built ${file} (${size(file)} KB) and ${kernel} (${size(kernel)} KB) in ${out}`);
  console.log(`install: curl -fsSL ${baseUrl.replace(/\/+$/, "")}/install.sh | sh`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

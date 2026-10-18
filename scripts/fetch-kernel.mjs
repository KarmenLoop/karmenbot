#!/usr/bin/env node
// Puts the Koder kernel into vendor/ for a source checkout. The kernel is not
// open source and not in the repository; it comes from the official download
// site, checked against latest.json and its own MANIFEST.json.
//   node scripts/fetch-kernel.mjs --from https://<official site>/karmenbot [--force]
// --force accepts a kernel built for a different karmenbot version.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/version.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const base = (arg("--from") || process.env.KARMENBOT_DIST_URL || "").replace(/\/+$/, "");
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (!/^https?:\/\//.test(base)) fail("需要官网下载地址：--from https://… （或设置 KARMENBOT_DIST_URL）");

const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) fail(`下载失败：${url}（HTTP ${response.status}）`);
  return Buffer.from(await response.arrayBuffer());
}

const latest = JSON.parse((await get(`${base}/latest.json`)).toString("utf8"));
const kernel = latest.kernel || {};
if (!/^[0-9A-Za-z._-]+\.tar\.gz$/.test(kernel.file || "") || !/^[0-9a-f]{64}$/.test(kernel.sha256 || "")) fail("发布信息里没有有效的内核包");
if (latest.version !== VERSION && !process.argv.includes("--force")) {
  fail(`官网的内核对应 karmenbot ${latest.version}，这份源码是 ${VERSION}。切换到对应版本的源码，或加 --force。`);
}
const archive = await get(`${base}/${kernel.file}`);
if (sha(archive) !== kernel.sha256) fail("内核包校验不一致，已停止，没有改动 vendor/");

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "karmenbot-kernel-"));
try {
  fs.writeFileSync(path.join(stage, kernel.file), archive);
  const tar = spawnSync("tar", ["-xzf", path.join(stage, kernel.file), "-C", stage], { stdio: "inherit" });
  if (tar.status !== 0) fail("内核包解压失败");
  const root = path.join(stage, kernel.file.replace(/\.tar\.gz$/, ""));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "vendor", "MANIFEST.json"), "utf8"));
  for (const [rel, sum] of Object.entries(manifest.files)) {
    const file = path.join(root, "vendor", rel);
    if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== sum) fail(`内核文件与清单不符：${rel}`);
  }
  fs.rmSync(path.join(pkg, "vendor"), { recursive: true, force: true });
  fs.renameSync(path.join(root, "vendor"), path.join(pkg, "vendor"));
  fs.copyFileSync(path.join(root, "KERNEL-LICENSE.md"), path.join(pkg, "KERNEL-LICENSE.md"));
  console.log(`内核已就位：${Object.keys(manifest.files).length} 个文件，来自 ${base}（按 KERNEL-LICENSE.md 授权，不随源码开源）`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

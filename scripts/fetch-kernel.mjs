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

async function main() {
  const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const arg = (name) => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : undefined;
  };
  const base = (arg("--from") || process.env.KARMENBOT_DIST_URL || "").replace(/\/+$/, "");
  const fail = (message) => {
    throw new Error(message);
  };
  if (!/^https?:\/\//.test(base)) fail("需要官网下载地址：--from https://… （或设置 KARMENBOT_DIST_URL）");

  const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
  function replaceKernel(vendor, license) {
    const lock = path.join(pkg, ".kernel-install.lock");
    fs.mkdirSync(lock);
    let transaction;
    let oldVendor = false, oldLicense = false, newVendor = false, newLicense = false;
    let retainBackup = false;
    const currentVendor = path.join(pkg, "vendor");
    const currentLicense = path.join(pkg, "KERNEL-LICENSE.md");
    try {
      transaction = fs.mkdtempSync(path.join(pkg, ".kernel-install-"));
      fs.cpSync(vendor, path.join(transaction, "new-vendor"), { recursive: true });
      fs.copyFileSync(license, path.join(transaction, "new-license"));
      if (fs.existsSync(currentVendor)) {
        fs.renameSync(currentVendor, path.join(transaction, "old-vendor"));
        oldVendor = true;
      }
      if (fs.existsSync(currentLicense)) {
        fs.renameSync(currentLicense, path.join(transaction, "old-license"));
        oldLicense = true;
      }
      fs.renameSync(path.join(transaction, "new-vendor"), currentVendor);
      newVendor = true;
      fs.renameSync(path.join(transaction, "new-license"), currentLicense);
      newLicense = true;
    } catch (error) {
      try {
        if (newLicense) fs.rmSync(currentLicense);
        if (newVendor) fs.rmSync(currentVendor, { recursive: true });
        if (oldLicense) fs.renameSync(path.join(transaction, "old-license"), currentLicense);
        if (oldVendor) fs.renameSync(path.join(transaction, "old-vendor"), currentVendor);
      } catch (restoreError) {
        retainBackup = true;
        throw new Error(`Kernel installation failed and recovery needs attention. Backup: ${transaction}. ${restoreError.message}`);
      }
      throw error;
    } finally {
      if (transaction && !retainBackup) fs.rmSync(transaction, { recursive: true, force: true });
      fs.rmSync(lock, { recursive: true });
    }
  }
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
    const archiveFile = path.join(stage, kernel.file);
    const folder = kernel.file.replace(/\.tar\.gz$/, "");
    fs.writeFileSync(archiveFile, archive);
    const listing = spawnSync("tar", ["-tzf", archiveFile], { encoding: "utf8" });
    const types = spawnSync("tar", ["-tvzf", archiveFile], { encoding: "utf8" });
    if (listing.status !== 0 || types.status !== 0) fail("Kernel archive inventory could not be read");
    for (const entry of listing.stdout.trimEnd().split("\n")) {
      const parts = entry.replace(/\\/g, "/").replace(/\/$/, "").split("/");
      if (parts[0] !== folder || parts.some(part => !part || part === "." || part === "..")) fail("Kernel archive contains an invalid path");
    }
    if (types.stdout.trimEnd().split("\n").some(line => !/^[-d]/.test(line))) fail("Kernel archives may contain only regular files and directories");
    const tar = spawnSync("tar", ["-xzf", archiveFile, "-C", stage], { stdio: "inherit" });
    if (tar.status !== 0) fail("内核包解压失败");
    const root = path.join(stage, kernel.file.replace(/\.tar\.gz$/, ""));
    const stagedVendor = path.join(root, "vendor");
    const license = path.join(root, "KERNEL-LICENSE.md");
    if (!fs.lstatSync(license).isFile()) fail("KERNEL-LICENSE.md must be a regular file");
    const manifest = JSON.parse(fs.readFileSync(path.join(stagedVendor, "MANIFEST.json"), "utf8"));
    if (!manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files) || !Object.keys(manifest.files).length) fail("Invalid kernel file manifest");
    for (const [rel, sum] of Object.entries(manifest.files)) {
      const parts = rel.split(/[\\/]/);
      if (path.isAbsolute(rel) || parts.some(part => !part || part === "." || part === "..") || !/^[0-9a-f]{64}$/.test(sum)) fail(`Invalid kernel file entry: ${rel}`);
      let file = stagedVendor;
      for (const part of parts) {
        file = path.join(file, part);
        if (fs.lstatSync(file).isSymbolicLink()) fail(`Kernel symlinks are not supported: ${rel}`);
      }
      if (!fs.lstatSync(file).isFile()) fail(`Kernel entry must be a regular file: ${rel}`);
      if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== sum) fail(`内核文件与清单不符：${rel}`);
    }
    replaceKernel(stagedVendor, license);
    console.log(`内核已就位：${Object.keys(manifest.files).length} 个文件，来自 ${base}（按 KERNEL-LICENSE.md 授权，不随源码开源）`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

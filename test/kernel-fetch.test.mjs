import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pkg = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function checkRejectedKernel(t, { missingLicense = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-fetch-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const temporary = path.join(root, "temporary");
  for (const dir of [path.join(app, "scripts"), path.join(app, "src"), path.join(app, "vendor"), temporary]) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(pkg, "scripts/fetch-kernel.mjs"), path.join(app, "scripts/fetch-kernel.mjs"));
  fs.copyFileSync(path.join(pkg, "src/version.mjs"), path.join(app, "src/version.mjs"));
  fs.writeFileSync(path.join(app, "vendor/keep.txt"), "current kernel");
  const name = "karmenbot-kernel-0.1.0";
  const source = path.join(root, name);
  fs.mkdirSync(path.join(source, "vendor"), { recursive: true });
  const fixture = "export {};\n";
  fs.writeFileSync(path.join(source, "vendor/fixture.mjs"), fixture);
  const checksum = missingLicense ? crypto.createHash("sha256").update(fixture).digest("hex") : "0".repeat(64);
  fs.writeFileSync(path.join(source, "vendor/MANIFEST.json"), JSON.stringify({ files: { "fixture.mjs": checksum } }));
  if (!missingLicense) fs.writeFileSync(path.join(source, "KERNEL-LICENSE.md"), "Synthetic test fixture\n");
  const archivePath = path.join(root, name + ".tar.gz");
  const tar = spawnSync("tar", ["-czf", archivePath, "-C", root, name], { encoding: "utf8" });
  assert.equal(tar.status, 0, tar.stderr);
  const archive = fs.readFileSync(archivePath);
  const latest = JSON.stringify({ version: "0.1.0", kernel: { file: name + ".tar.gz", sha256: crypto.createHash("sha256").update(archive).digest("hex") } });
  const server = http.createServer((req, res) => res.end(req.url.endsWith("latest.json") ? latest : archive));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(app, "scripts/fetch-kernel.mjs"), "--from", `http://127.0.0.1:${server.address().port}`], { env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary } });
    let output = "";
    child.stdout.on("data", c => { output += c; });
    child.stderr.on("data", c => { output += c; });
    child.once("error", reject);
    child.once("close", code => resolve({ code, output }));
  });
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, missingLicense ? /KERNEL-LICENSE/ : /fixture\.mjs/);
  assert.equal(fs.readFileSync(path.join(app, "vendor/keep.txt"), "utf8"), "current kernel");
  assert.deepEqual(fs.readdirSync(temporary), []);
}

test("a rejected kernel preserves the current vendor and removes its temporary stage", t => checkRejectedKernel(t));
test("a kernel without its license cannot replace a working installation", t => checkRejectedKernel(t, { missingLicense: true }));

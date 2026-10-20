#!/usr/bin/env node
// Exercises the installer path for machines without Node 22: a local mirror is
// built from this machine's official Node distribution (same layout and
// SHASUMS256.txt as nodejs.org), then `curl … | sh` runs with
// KARMENBOT_FORCE_RUNTIME=1 and a PATH that has no node at all.
//   node scripts/install-runtime-e2e.mjs
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.version;
const platform = process.platform === "darwin" ? "darwin" : "linux";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const name = `node-${version}-${platform}-${arch}`;
const distribution = path.resolve(path.dirname(fs.realpathSync(process.execPath)), "..");
if (path.basename(distribution) !== name) {
  console.error(`expected an official Node layout named ${name}, found ${distribution}`);
  process.exit(2);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runtime-e2e-"));
const mirror = path.join(root, "mirror", version);
const dist = path.join(root, "dist");
const home = path.join(root, "home");
fs.mkdirSync(mirror, { recursive: true });
fs.mkdirSync(home);
const step = (text) => console.log(`· ${text}`);

try {
  step(`packing ${name} as a mirror archive`);
  const tar = spawnSync("tar", ["-czf", path.join(mirror, `${name}.tar.gz`), "-C", path.dirname(distribution), name], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  if (tar.status !== 0) throw new Error("tar failed");
  const sum = crypto.createHash("sha256").update(fs.readFileSync(path.join(mirror, `${name}.tar.gz`))).digest("hex");
  fs.writeFileSync(path.join(mirror, "SHASUMS256.txt"), `${"0".repeat(64)}  node-${version}-other.tar.gz\n${sum}  ${name}.tar.gz\n`);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x").pathname;
    const file = url.startsWith("/node/") ? path.join(root, "mirror", url.slice("/node/".length)) : path.join(dist, path.basename(url));
    fs.readFile(file, (error, data) => (error ? res.writeHead(404).end() : res.writeHead(200).end(data)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const built = spawnSync(process.execPath, [path.join(pkg, "scripts", "build-release.mjs"), "--base-url", base, "--out", dist, "--node-version", version], { encoding: "utf8" });
  if (built.status !== 0) throw new Error(built.stderr);

  const env = { HOME: home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", SHELL: "/bin/bash", KARMENBOT_NO_SETUP: "1", KARMENBOT_FORCE_RUNTIME: "1", KARMENBOT_NODE_MIRROR: `${base}/node` };
  const run = (script) => new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", script], { env });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (status) => resolve({ status, out }));
  });
  const started = Date.now();
  step("curl -fsSL …/install.sh | sh   (PATH without node, forced private runtime)");
  const install = await run(`curl -fsSL ${base}/install.sh | sh`);
  console.log(install.out.trim().split("\n").map((line) => `    ${line}`).join("\n"));
  const runtime = path.join(home, ".karmenbot", "runtime", name, "bin", "node");
  const launcher = path.join(home, ".local", "bin", "karmenbot");
  const versionOut = await run(`"${launcher}" --version`);
  const doctor = await run(`"${launcher}" doctor`);
  const launcherText = fs.readFileSync(launcher, "utf8");
  const results = {
    installExit: install.status,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    privateRuntime: fs.existsSync(runtime),
    launcherUsesRuntime: launcherText.includes(runtime),
    version: versionOut.out.trim(),
    doctorKernel: /✓ 内核快照 (\d+)\/\1/.test(doctor.out),
    bashProfile: fs.existsSync(path.join(home, ".bash_profile")) && fs.readFileSync(path.join(home, ".bash_profile"), "utf8").includes("# karmenbot PATH"),
  };

  step("tampered Node archive must be refused");
  fs.appendFileSync(path.join(mirror, `${name}.tar.gz`), "x");
  const fresh = path.join(root, "home2");
  fs.mkdirSync(fresh);
  const refused = await new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", `curl -fsSL ${base}/install.sh | sh`], { env: { ...env, HOME: fresh } });
    let out = "";
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (status) => resolve({ status, out }));
  });
  results.tamperedNodeRefused = refused.status !== 0 && /Node\.js 校验不一致/.test(refused.out);
  results.tamperedNothingInstalled = !fs.existsSync(path.join(fresh, ".local", "bin", "karmenbot"));
  server.close();
  console.log(JSON.stringify(results, null, 2));
  const ok = results.installExit === 0 && results.privateRuntime && results.launcherUsesRuntime && results.version === "karmenbot 0.1.1" && results.doctorKernel && results.bashProfile && results.tamperedNodeRefused && results.tamperedNothingInstalled;
  process.exitCode = ok ? 0 : 1;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

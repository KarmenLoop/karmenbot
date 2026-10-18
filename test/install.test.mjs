import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openAiServer } from "./mock/servers.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function staticServer(dir, rewrite = {}) {
  const server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1));
    if (rewrite[name]) return res.writeHead(200).end(rewrite[name]);
    try {
      res.writeHead(200).end(await fs.readFile(path.join(dir, path.basename(name))));
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

// Async on purpose: the release server lives in this process and must keep answering.
function sh(script, env) {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", script], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      if (process.env.KB_TEST_TRACE) process.stderr.write(`[sh ${status}] ${script.slice(0, 80)}\n${stderr.slice(-400)}\n`);
      resolve({ status, stdout, stderr });
    });
  });
}

// The real one-liner against a local release: curl … | sh, then the installed command.
test("one-line install, re-install, a real task from the installed copy, tampered archive refused, uninstall", async (t) => {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), "kb-dist-"));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "kb-install-home-"));
  const other = await fs.mkdtemp(path.join(os.tmpdir(), "kb-install-home2-"));
  t.after(() => Promise.all([dist, home, other].map((dir) => fs.rm(dir, { recursive: true, force: true }))));

  const release = await staticServer(dist);
  t.after(() => release.close());
  const build = spawnSync(process.execPath, [path.join(pkg, "scripts", "build-release.mjs"), "--base-url", release.url, "--out", dist], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const manifest = JSON.parse(await fs.readFile(path.join(dist, "latest.json"), "utf8"));
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.kernel.file, "karmenbot-kernel-0.1.0.tar.gz");
  const listing = (file) => spawnSync("tar", ["-tzf", path.join(dist, file)], { encoding: "utf8" }).stdout.split("\n");
  const app = listing(manifest.file);
  assert.ok(app.includes("karmenbot-0.1.0/LICENSE") && app.includes("karmenbot-0.1.0/bin/karmenbot.mjs"));
  assert.ok(!app.some((entry) => entry.includes("/vendor")), "the open-source archive carries no kernel");
  const kernel = listing(manifest.kernel.file);
  assert.ok(kernel.includes("karmenbot-kernel-0.1.0/vendor/MANIFEST.json") && kernel.includes("karmenbot-kernel-0.1.0/KERNEL-LICENSE.md"));
  assert.ok(kernel.filter(Boolean).every((entry) => /^karmenbot-kernel-0\.1\.0\/(vendor\/|KERNEL-LICENSE\.md$|$)/.test(entry)), "the kernel archive carries only the kernel");
  assert.match(await fs.readFile(path.join(dist, "install.sh"), "utf8"), new RegExp(`BASE="\\$\\{KARMENBOT_DIST_URL:-${release.url.replace(/[.:/]/g, "\\$&")}\\}"`));

  const env = (dir) => ({ HOME: dir, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, SHELL: "/bin/zsh", KARMENBOT_NO_SETUP: "1", LANG: "zh_CN.UTF-8" });
  const oneLiner = `curl -fsSL ${release.url}/install.sh | sh`;

  const first = await sh(oneLiner, env(home));
  assert.equal(first.status, 0, first.stderr + first.stdout);
  assert.match(first.stdout, /karmenbot 0\.1\.0 安装完成/);
  for (const step of ["检查系统", "准备 Node.js", "获取发布信息", "下载安装包", "安装", "加入 PATH"]) assert.match(first.stdout, new RegExp(`✓ \\d  ${step}`), step);
  assert.match(first.stdout, /KB \+ 内核 \d+ KB · SHA-256 已校验/);
  await fs.access(path.join(home, ".karmenbot", "app", "0.1.0", "KERNEL-LICENSE.md"));
  const site = JSON.parse(await fs.readFile(path.join(home, ".karmenbot", "app", "0.1.0", "site.json"), "utf8"));
  assert.equal(site.site, "https://karmenloop.com");
  assert.equal(site.updates, "https://karmenloop.com/updates.html");
  assert.equal(site.distUrl, release.url);
  assert.match(first.stdout, /KARMENBOT 0\.1\.0/, "the banner is printed");
  const launcher = path.join(home, ".local", "bin", "karmenbot");
  assert.equal((await fs.stat(launcher)).mode & 0o111, 0o111);
  assert.equal(await fs.readlink(path.join(home, ".karmenbot", "app", "current")), path.join(home, ".karmenbot", "app", "0.1.0"));
  assert.equal((await sh(`"${launcher}" --version`, env(home))).stdout.trim(), "karmenbot 0.1.0");
  const doctor = await sh(`"${launcher}" doctor`, env(home));
  assert.match(doctor.stdout, /✓ 内核快照 (\d+)\/\1/);
  assert.match(doctor.stdout, new RegExp(`安装位置 ${path.join(await fs.realpath(home), ".karmenbot", "app", "0.1.0").replace(/[.]/g, "\\.")}`));

  const again = await sh(`curl -fsSL ${release.url}/install.sh | /bin/dash`, env(home));
  assert.equal(again.status, 0, `dash (Ubuntu's /bin/sh) must run the installer too\n${again.stderr}`);
  const zshrc = await fs.readFile(path.join(home, ".zshrc"), "utf8");
  assert.equal(zshrc.match(/# karmenbot PATH/g).length, 1, "PATH is added once");

  const model = await openAiServer(() => ({ text: "安装后的 karmenbot 可以正常工作。" }));
  t.after(() => model.close());
  const task = await sh(`cd "${home}" && "${launcher}" "自检一下"`, { ...env(home), KARMENBOT_MODEL: "mock", KARMENBOT_BASE_URL: `${model.url}/v1`, KARMENBOT_API_KEY: "k" });
  assert.equal(task.status, 0, task.stderr);
  assert.match(task.stdout, /安装后的 karmenbot 可以正常工作/);

  const forged = await staticServer(dist, { "latest.json": JSON.stringify({ ...manifest, sha256: "0".repeat(64) }) });
  t.after(() => forged.close());
  const refused = await sh(`curl -fsSL ${forged.url}/install.sh | KARMENBOT_DIST_URL=${forged.url} sh`, env(other));
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /安装包校验不一致，已停止，没有安装任何东西/);
  await assert.rejects(fs.access(path.join(other, ".local", "bin", "karmenbot")));
  await assert.rejects(fs.access(path.join(other, ".karmenbot", "app", "0.1.0")));

  const forgedKernel = await staticServer(dist, { "latest.json": JSON.stringify({ ...manifest, kernel: { ...manifest.kernel, sha256: "0".repeat(64) } }) });
  t.after(() => forgedKernel.close());
  const refusedKernel = await sh(`curl -fsSL ${forgedKernel.url}/install.sh | KARMENBOT_DIST_URL=${forgedKernel.url} sh`, env(other));
  assert.notEqual(refusedKernel.status, 0);
  assert.match(refusedKernel.stderr, /内核包校验不一致，已停止，没有安装任何东西/);
  await assert.rejects(fs.access(path.join(other, ".karmenbot", "app", "0.1.0")));

  const removed = await sh(`"${launcher}" uninstall --yes`, env(home));
  assert.equal(removed.status, 0, removed.stderr);
  await assert.rejects(fs.access(launcher));
  await assert.rejects(fs.access(path.join(home, ".karmenbot", "app")));
});

test("Windows installers: ASCII-only PowerShell wrapper that decodes to the full script, CMD with CRLF and a version gate", async (t) => {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), "kb-dist-win-"));
  t.after(() => fs.rm(dist, { recursive: true, force: true }));
  const build = spawnSync(process.execPath, [path.join(pkg, "scripts", "build-release.mjs"), "--base-url", "https://get.example.invalid/kb", "--out", dist], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const ps1 = await fs.readFile(path.join(dist, "install.ps1"), "utf8");
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(ps1), "install.ps1 is pure ASCII");
  const inner = Buffer.from(ps1.split("@'")[1].split("'@")[0].replace(/\s/g, ""), "base64").toString("utf8");
  assert.match(inner, /安装完成/);
  assert.match(inner, /内核包校验不一致/);
  assert.match(inner, /Move-Item "\$KDir\\vendor"/);
  assert.match(inner, /\$BannerColorWide = @'/);
  assert.match(inner, /\$Os\.Major -lt 10/);
  assert.match(inner, /SecurityProtocolType\]::Tls12/);
  assert.match(inner, /-UseBasicParsing/);
  assert.doesNotMatch(inner, /^\s*exit\b/m, "never exit the user's PowerShell window");
  assert.doesNotMatch(inner, /__[A-Z_]+__/);
  const cmd = await fs.readFile(path.join(dist, "install.cmd"), "utf8");
  assert.ok(cmd.split("\n").slice(0, -1).every((line) => line.endsWith("\r")), "CRLF line endings");
  assert.match(cmd, /Version 1\[0-9\]/);
  assert.match(cmd, /irm 'https:\/\/get\.example\.invalid\/kb\/install\.ps1' \| iex/);
  const sums = await fs.readFile(path.join(dist, "SHA256SUMS"), "utf8");
  for (const file of ["karmenbot-kernel-0.1.0.tar.gz", "install.sh", "install.ps1", "install.cmd", "latest.json"]) assert.match(sums, new RegExp(`  ${file.replace(".", "\\.")}$`, "m"));
});

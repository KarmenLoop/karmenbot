import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { audit, exportTo } from "../scripts/export-github.mjs";

// The GitHub repository holds karmenbot without the Koder kernel; the kernel
// comes only from the official site, verified, under its own license.
const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const walk = async (dir) => (await fs.readdir(dir, { withFileTypes: true, recursive: true })).filter((entry) => entry.isFile()).map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));

async function site(dir, rewrite = {}) {
  const server = http.createServer(async (req, res) => {
    const name = path.basename(new URL(req.url, "http://x").pathname);
    if (rewrite[name]) return res.writeHead(200).end(rewrite[name]);
    try {
      res.writeHead(200).end(await fs.readFile(path.join(dir, name)));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

// Async: the stand-in official site runs in this process.
function node(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, env: { PATH: process.env.PATH, HOME: os.tmpdir() } });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (status) => resolve({ status, out }));
  });
}

test("the GitHub export has the open source, the licenses and no kernel; the audit refuses planted kernel code, keys and local paths", async (t) => {
  const tree = await fs.mkdtemp(path.join(os.tmpdir(), "kb-github-"));
  t.after(() => fs.rm(tree, { recursive: true, force: true }));
  assert.deepEqual(exportTo(tree), []);
  const files = await walk(tree);
  assert.ok(!files.some((file) => file.startsWith("vendor")), "no kernel file");
  assert.ok(!files.includes(path.join("scripts", "sync-kernel.mjs")), "no internal tool");
  for (const file of ["LICENSE", "LICENSE-EXCEPTION.md", "KERNEL-LICENSE.md", "README.md", "THIRD_PARTY_NOTICES.md", "scripts/fetch-kernel.mjs"]) assert.ok(files.includes(file), file);
  assert.match(await fs.readFile(path.join(tree, "LICENSE"), "utf8"), /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.equal(JSON.parse(await fs.readFile(path.join(tree, "package.json"), "utf8")).license, "GPL-3.0-only");
  assert.match(await fs.readFile(path.join(tree, ".gitignore"), "utf8"), /^vendor\/$/m);

  const kernelLines = (await fs.readFile(path.join(pkg, "vendor", "koder-desktop", "harness", "tools.mjs"), "utf8")).split("\n");
  // A copied block of short lines (caught as a run) and one long line on its own.
  const start = kernelLines.findIndex((_, i) => kernelLines.slice(i, i + 4).every((line) => line.trim().length >= 20 && line.trim().length < 80));
  const long = kernelLines.find((line) => line.trim().length >= 80);
  await fs.writeFile(path.join(tree, "src", "copied.mjs"), `// looks innocent\n${kernelLines.slice(start, start + 4).join("\n")}\n`);
  await fs.writeFile(path.join(tree, "src", "one-line.mjs"), `${long}\n`);
  await fs.writeFile(path.join(tree, "src", "leaky.mjs"), `const key = "sk-${"a".repeat(24)}";\nconst home = "/${"Users"}/someone/notes";\n`);
  const problems = audit(tree);
  assert.ok(problems.some((line) => line.startsWith("src/copied.mjs: ") && /run\(s\) of kernel source/.test(line)), problems.join("\n"));
  assert.ok(problems.some((line) => line === "src/one-line.mjs:1: kernel source line"), problems.join("\n"));
  assert.ok(problems.some((line) => line.startsWith("src/leaky.mjs:1") && /credential/.test(line)));
  assert.ok(problems.some((line) => line.startsWith("src/leaky.mjs:2") && /local user path/.test(line)));
  await fs.mkdir(path.join(tree, "vendor"));
  await fs.writeFile(path.join(tree, "vendor", "x.mjs"), "");
  assert.ok(audit(tree).some((line) => line === "vendor/x.mjs: kernel file"));
});

test("a clone without the kernel explains itself; fetch-kernel installs it from the official site, verified", async (t) => {
  const tree = await fs.mkdtemp(path.join(os.tmpdir(), "kb-clone-"));
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), "kb-official-"));
  t.after(() => Promise.all([tree, dist].map((dir) => fs.rm(dir, { recursive: true, force: true }))));
  assert.deepEqual(exportTo(tree), []);

  const bare = await node(["bin/karmenbot.mjs", "--version"], tree);
  assert.equal(bare.status, 3);
  assert.match(bare.out, /karmenbot 需要 Koder 内核才能运行，内核不在开源代码里/);
  assert.match(bare.out, /node scripts\/fetch-kernel\.mjs --from/);

  const build = spawnSync(process.execPath, [path.join(pkg, "scripts", "build-release.mjs"), "--base-url", "https://official.example.invalid/kb", "--out", dist], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const latest = JSON.parse(await fs.readFile(path.join(dist, "latest.json"), "utf8"));

  const tampered = await site(dist, { "latest.json": JSON.stringify({ ...latest, kernel: { ...latest.kernel, sha256: "f".repeat(64) } }) });
  t.after(() => tampered.close());
  const refused = await node(["scripts/fetch-kernel.mjs", "--from", tampered.url], tree);
  assert.equal(refused.status, 1);
  assert.match(refused.out, /内核包校验不一致，已停止，没有改动 vendor\//);
  await assert.rejects(fs.access(path.join(tree, "vendor")));

  const older = await site(dist, { "latest.json": JSON.stringify({ ...latest, version: "0.0.9" }) });
  t.after(() => older.close());
  const mismatch = await node(["scripts/fetch-kernel.mjs", "--from", older.url], tree);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.out, /官网的内核对应 karmenbot 0\.0\.9，这份源码是 0\.1\.1/);

  const official = await site(dist);
  t.after(() => official.close());
  const fetched = await node(["scripts/fetch-kernel.mjs", "--from", official.url], tree);
  assert.equal(fetched.status, 0, fetched.out);
  assert.match(fetched.out, /内核已就位：\d+ 个文件/);
  assert.deepEqual(await fs.readFile(path.join(tree, "vendor", "MANIFEST.json")), await fs.readFile(path.join(pkg, "vendor", "MANIFEST.json")));
  const ready = await node(["bin/karmenbot.mjs", "--version"], tree);
  assert.equal(ready.status, 0, ready.out);
  assert.equal(ready.out.trim(), "karmenbot 0.1.1");
});

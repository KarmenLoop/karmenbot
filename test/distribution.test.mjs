import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const pkg = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = 'https://github.com/KarmenLoop/karmenbot/releases/latest/download';

test('a source checkout fetches its kernel from the public release without a website cookie', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-public-dist-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const app = path.join(root, 'app');
  for (const dir of ['scripts', 'src']) fs.mkdirSync(path.join(app, dir), {recursive: true});
  for (const file of ['scripts/fetch-kernel.mjs', 'src/version.mjs']) fs.copyFileSync(path.join(pkg, file), path.join(app, file));
  const name = 'karmenbot-kernel-0.1.1';
  const vendor = path.join(root, name, 'vendor');
  fs.mkdirSync(vendor, {recursive: true});
  const sha = body => crypto.createHash('sha256').update(body).digest('hex');
  fs.writeFileSync(path.join(vendor, 'fixture.mjs'), 'export {};\n');
  fs.writeFileSync(path.join(vendor, 'MANIFEST.json'), JSON.stringify({files: {'fixture.mjs': sha('export {};\n')}}));
  fs.writeFileSync(path.join(root, name, 'KERNEL-LICENSE.md'), 'Synthetic fixture license\n');
  const archive = path.join(root, name + '.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', archive, '-C', root, name]).status, 0);
  const manifest = {version: '0.1.1', kernel: {file: name + '.tar.gz', sha256: sha(fs.readFileSync(archive))}};
  const preload = path.join(root, 'download.mjs');
  fs.writeFileSync(preload, `import fs from 'node:fs';\nglobalThis.fetch = async (url, options) => {\n if (url !== ${JSON.stringify(base)} + '/latest.json' && url !== ${JSON.stringify(base + '/' + name + '.tar.gz')}) throw new Error('Unexpected distribution URL: ' + url);\n if (options?.headers?.cookie || options?.headers?.authorization) throw new Error('Public downloads must not need credentials');\n return new Response(url.endsWith('latest.json') ? ${JSON.stringify(JSON.stringify(manifest))} : fs.readFileSync(${JSON.stringify(archive)}));\n};\n`);
  const env = {...process.env};
  delete env.KARMENBOT_DIST_URL;
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/fetch-kernel.mjs'], {cwd: app, env, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(path.join(app, 'vendor/fixture.mjs'), 'utf8'), 'export {};\n');
});

test('installation docs and update defaults use the public karmenbot release', () => {
  const site = JSON.parse(fs.readFileSync(path.join(pkg, 'site.json'), 'utf8'));
  assert.equal(site.dist, base);
  const readme = fs.readFileSync(path.join(pkg, 'README.md'), 'utf8');
  for (const file of ['install.sh', 'install.ps1', 'install.cmd']) assert.ok(readme.includes(`${base}/${file}`), file);
  for (const file of ['README.md', 'src/official.mjs', 'docs/GUIDE.md']) assert.ok(!fs.readFileSync(path.join(pkg, file), 'utf8').includes('https://karmenloop.com/downloads/karmenbot'), file);
});

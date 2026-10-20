#!/usr/bin/env node
// Download and exercise the installed release in an isolated home and workspace.
// The HTTP model fixture drives real kernel approvals and filesystem tools.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const option = name => {const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1];};
const base = (option('--base-url') || 'https://github.com/KarmenLoop/karmenbot/releases/latest/download').replace(/\/+$/, '');
const output = option('--output');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'karmenbot-acceptance-'));
const home = path.join(root, 'home');
const kbHome = path.join(home, '.karmenbot');
const workspace = path.join(root, 'workspace');
await fs.mkdir(home); await fs.mkdir(workspace);
const env = {...process.env, HOME: home, USERPROFILE: home, KARMENBOT_HOME: kbHome, KARMENBOT_BIN_DIR: path.join(home, 'bin'), KARMENBOT_NO_SETUP: '1', KARMENBOT_NO_MODIFY_PATH: '1', NO_COLOR: '1', LANG: 'en_US.UTF-8'};
const receipt = {base, platform: process.platform, arch: process.arch, node: process.version, checks: [], scope: 'Real public downloads, native installation, kernel tools and approvals with a loopback model fixture. Commercial model accounts and live chat channels are not exercised.'};
const quotePS = value => "'" + value.replaceAll("'", "''") + "'";
function run(command, args, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: workspace, env: {...env, ...extra}, windowsHide: true, stdio: ['ignore','pipe','pipe']});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on('data', c => stdout += c); child.stderr.on('data', c => stderr += c);
    child.on('error', reject);
    child.on('close', code => {clearTimeout(timer); resolve({code, stdout, stderr});});
  });
}
async function get(file) {
  const response = await fetch(`${base}/${file}`, {signal: AbortSignal.timeout(90_000)});
  assert.equal(response.status, 200, `${file}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
let server;
try {
  const manifest = JSON.parse(await get('latest.json'));
  const sums = (await get('SHA256SUMS')).toString('utf8');
  const script = process.platform === 'win32' ? 'install.ps1' : 'install.sh';
  const installer = await get(script);
  assert.ok(sums.includes(`${crypto.createHash('sha256').update(installer).digest('hex')}  ${script}`), 'installer checksum');
  const installerPath = path.join(root, script); await fs.writeFile(installerPath, installer);
  const install = process.platform === 'win32'
    ? await run('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',installerPath])
    : await run('/bin/sh', [installerPath]);
  assert.equal(install.code, 0, install.stdout + install.stderr);
  receipt.checks.push({name: 'public installer', exit_code: install.code, version: manifest.version});
  const launcher = process.platform === 'win32' ? path.join(kbHome,'bin','karmenbot.cmd') : path.join(home,'bin','karmenbot');
  await fs.access(launcher);
  const cli = args => process.platform === 'win32'
    ? run('powershell.exe',['-NoProfile','-Command',`& ${[launcher,...args].map(quotePS).join(' ')}; exit $LASTEXITCODE`])
    : run(launcher,args);
  const version = await cli(['--version']); assert.equal(version.code, 0, version.stderr);
  assert.equal(version.stdout.trim(), `karmenbot ${manifest.version}`);
  const doctor = await cli(['doctor']); assert.equal(doctor.code, 0, doctor.stdout + doctor.stderr);
  assert.match(doctor.stdout, /(?:Kernel snapshot|内核快照) (\d+)\/\1/);
  receipt.checks.push({name: 'installed launcher and kernel', exit_code: doctor.code, version: version.stdout.trim()});
  const tasks = new Map();
  server = http.createServer(async (req,res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      const user = [...request.messages].reverse().find(m => m.role === 'user')?.content || '';
      const denied = String(user).includes('denied.txt');
      const key = denied ? 'deny' : 'write';
      const tools = request.messages.filter(m => m.role === 'tool');
      tasks.set(key, {calls: (tasks.get(key)?.calls || 0) + 1, tool_results: tools.map(m => ({content:m.content, name:m.name}))});
      let tool;
      if (!tools.length) tool = {name:'write_file', arguments:{path: denied ? 'denied.txt' : 'notes.md', content:'Verified installed karmenbot file task.\n'}};
      else if (!denied && tools.length === 1) tool = {name:'read_file', arguments:{path:'notes.md'}};
      const text = tool ? '' : denied ? 'The write was denied.' : 'Verified installed karmenbot file task.';
      res.writeHead(200, {'content-type':'text/event-stream'});
      const delta = tool ? {tool_calls:[{index:0,id:`tool_${tools.length}`,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.arguments)}}]} : {content:text};
      res.write(`data: ${JSON.stringify({choices:[{index:0,delta}]})}\n\n`);
      res.end(`data: ${JSON.stringify({choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`);
    } catch (error) {res.writeHead(500).end(error.message);}
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  env.KARMENBOT_MODEL = 'acceptance-fixture'; env.KARMENBOT_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`; env.KARMENBOT_API_KEY = 'local-test-key';
  const denied = await cli(['run','--new','--session','denied','Write denied.txt.']);
  assert.equal(denied.code, 0, denied.stdout + denied.stderr);
  await assert.rejects(fs.access(path.join(workspace,'denied.txt')));
  assert.ok(tasks.get('deny')?.tool_results.length, 'denial returned to model');
  receipt.checks.push({name:'unapproved write refused', exit_code:denied.code, model_calls:tasks.get('deny').calls});
  const task = await cli(['run','--new','--session','write','--yes','Write notes.md, then read it back.']);
  assert.equal(task.code, 0, task.stdout + task.stderr);
  assert.equal(await fs.readFile(path.join(workspace,'notes.md'),'utf8'), 'Verified installed karmenbot file task.\n');
  const results = tasks.get('write');
  assert.equal(results.tool_results.length, 2);
  assert.ok(results.tool_results.some(t => JSON.stringify(t.content).includes('Verified installed karmenbot file task.')));
  assert.match(task.stdout, /Verified installed karmenbot file task/);
  receipt.checks.push({name:'approved write, readback and model continuation', exit_code:task.code, model_calls:results.calls, tool_results:results.tool_results.length});
  receipt.ok = true;
} catch (error) {
  receipt.ok = false; receipt.error = error.stack; process.exitCode = 1;
} finally {
  if (server) {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  if (output) await fs.writeFile(output, JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
  if (!process.argv.includes('--keep')) await fs.rm(root,{recursive:true,force:true});
  else console.log(`Acceptance directory: ${root}`);
}

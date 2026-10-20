import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {powershellBootstrap} from '../scripts/installer-bootstrap.mjs';

const script = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\nWrite-Output "bootstrap-ok 你好"\n';
test('PowerShell download wrapper preserves UTF-8 through an ASCII payload', () => {
  const wrapper = powershellBootstrap(script, 'https://example.invalid/release');
  assert.match(wrapper, /^[\x09\x0a\x0d\x20-\x7e]*$/);
  const payload = wrapper.split("@'")[1].split("'@")[0].replace(/\s/g, '');
  assert.equal(Buffer.from(payload, 'base64').toString('utf8'), script);
});
test('Windows PowerShell decodes and executes the generated bootstrap', {skip:process.platform !== 'win32'}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'kb-powershell-wrapper-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const file = path.join(root,'install.ps1');
  fs.writeFileSync(file,powershellBootstrap(script,'https://example.invalid/release'));
  const result = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',timeout:30_000});
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout,/bootstrap-ok 你好/);
  assert.equal(result.stderr,'');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRepairablePath, stripTrailingWhitespace } from '../scripts/git-upload-repair.mjs';
import { isAIRepairablePath, parseKeyList, validateRepairPayload } from '../scripts/nexora-git-repair.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('deterministic repair strips trailing spaces but preserves line endings and content',()=>{
  assert.equal(stripTrailingWhitespace('a  \r\nb\t\nc \r'), 'a\r\nb\nc\r');
});
test('repair path policy accepts only changed source/config areas',()=>{
  assert.equal(isRepairablePath('.github/workflows/ci.yml'),true);
  assert.equal(isRepairablePath('src/core/Bot.js'),true);
  assert.equal(isRepairablePath('data/private.json'),false);
  assert.equal(isRepairablePath('../package.json'),false);
  assert.equal(isRepairablePath('/etc/passwd'),false);
  assert.equal(isRepairablePath('sessions/auth.json'),false);
});
test('NEXORA key parser supports arrays and legacy multi-key strings',()=>{
  assert.deepEqual(parseKeyList('["a","b"]'),['a','b']);
  assert.deepEqual(parseKeyList('a;b,c'),['a','b','c']);
  assert.deepEqual(parseKeyList(''),[]);
});
test('NEXORA repair output can only modify exact staged files',()=>{
  const result=validateRepairPayload({files:[{path:'src/core/Bot.js',content:'export default 1;'}]},['src/core/Bot.js']);
  assert.equal(result[0].path,'src/core/Bot.js');
  assert.equal(isAIRepairablePath('src/core/Bot.js'),true);
  assert.equal(isAIRepairablePath('.github/workflows/ci.yml'),false);
  assert.equal(isAIRepairablePath('scripts/auto-push.sh'),false);
  assert.equal(isAIRepairablePath('scripts/helper.mjs'),true);
  assert.throws(()=>validateRepairPayload({files:[{path:'../../.env',content:'secret'}]},['src/core/Bot.js']));
  assert.throws(()=>validateRepairPayload({files:[{path:'README.md',content:'x'}]},['README.md']));
});
test('upload stages invoke deterministic repair before whitespace gate and NEXORA fallback is opt-in',async()=>{
  const script=await readFile(path.join(root,'scripts/auto-push.sh'),'utf8');
  assert.match(script,/repair_upload_whitespace\(\)/);
  assert.match(script,/git-upload-repair\.mjs --staged/);
  assert.match(script,/agent reads local \.env and checks explicit opt-in/);
  assert.match(script,/nexora-git-repair\.mjs --staged/);
  assert.match(script,/WHISKAY_GITHUB_TOKEN/);
  assert.match(script,/for push_attempt in 1 2 3/);
  assert.doesNotMatch(script,/git push --force|git push -f/);
});
test('NEXORA agent enforces retry cap, backups and test-before-acceptance',async()=>{
  const script=await readFile(path.join(root,'scripts/nexora-git-repair.mjs'),'utf8');
  assert.match(script,/MAX_ATTEMPTS/);
  assert.match(script,/attempt-\$\{String\(attempt\)/);
  assert.match(script,/npm',\['test'\]/);
  assert.match(script,/await writeFile\(target,await readFile\(item\.backup\)/);
  assert.match(script,/OPENAI_API_KEYS/);
  assert.match(script,/GEMINI_API_KEYS/);
});


test('deterministic repair fixes a staged workflow file and preserves a private backup',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'whiskay-stage66-real-'));
  const run=(args)=>execFileSync('git',args,{cwd:temp,stdio:'ignore'});
  try {
    run(['init','-q']); run(['config','user.name','Stage66 Test']); run(['config','user.email','stage66@example.invalid']);
    await writeFile(path.join(temp,'base.txt'),'base\n'); run(['add','base.txt']); run(['commit','-qm','base']);
    const workflow=path.join(temp,'.github','workflows','ci.yml');
    await mkdir(path.dirname(workflow),{recursive:true}); await writeFile(workflow,'name: CI  \nrun: true\t\n');
    run(['add','.']);
    await mkdir(path.join(temp,'scripts'));
    const source=await readFile(path.join(root,'scripts/git-upload-repair.mjs'));
    await writeFile(path.join(temp,'scripts/git-upload-repair.mjs'),source);
    const result=spawnSync(process.execPath,['scripts/git-upload-repair.mjs','--staged'],{cwd:temp,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal((await readFile(workflow,'utf8')),'name: CI\nrun: true\n');
    const check=spawnSync('git',['diff','--cached','--check'],{cwd:temp,encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);
    const backupRoot=path.join(temp,'data','test-reports','git-upload-repair');
    const runFolders=await readdir(backupRoot);
    assert.equal(runFolders.length,1);
    const backup=path.join(backupRoot,runFolders[0],'deterministic','.github','workflows','ci.yml');
    assert.equal((await readFile(backup,'utf8')),'name: CI  \nrun: true\t\n');
  } finally { await rm(temp,{recursive:true,force:true}); }
});


test('reported CI workflow line no longer contains trailing whitespace',async()=>{
  const workflow=await readFile(path.join(root,'.github/workflows/ci.yml'),'utf8');
  const lines=workflow.split(/\r?\n/);
  assert.equal(lines[124]?.trimEnd(),lines[124]);
});

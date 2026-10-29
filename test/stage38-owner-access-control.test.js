import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
function run(script) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'whiskay-owner-access-'));
  try {
    const pluginUrl = pathToFileURL(path.resolve(root, 'src/plugins/owner/owner-access-control.js')).href;
    const securityUrl = pathToFileURL(path.resolve(root, 'src/lib/security.js')).href;
    const accessUrl = pathToFileURL(path.resolve(root, 'src/lib/owner-access.js')).href;
    const full = `
      import assert from 'node:assert/strict';
      import { readFile } from 'node:fs/promises';
      const plugin = (await import(${JSON.stringify(pluginUrl)})).default;
      const security = await import(${JSON.stringify(securityUrl)});
      const access = await import(${JSON.stringify(accessUrl)});
      const primary='6280000000000@s.whatsapp.net';
      const managed='6281111111111@s.whatsapp.net';
      const target='6282222222222@s.whatsapp.net';
      const makeCtx=(command,args=[],extra={})=>({command,args,isOwner:true,sender:primary,chat:primary,prefix:'.',mentions:[],replies:[],interactive:[],async reply(t){this.replies.push(String(t));return t},async sendInteractive(x){this.interactive.push(x);return x},sock:{async updateBlockStatus(jid,action){this.blocked={jid,action}}},...extra});
      ${script}
    `;
    const res = spawnSync(process.execPath, ['--input-type=module','-e',full], { cwd: temp, env: { ...process.env, WHISKAY_DATA_DIR: path.join(temp,'data'), SESSION_DIR: path.join(temp,'sessions'), OWNERS:'6280000000000' }, encoding:'utf8', timeout:20000 });
    if (res.status !== 0) throw new Error(`subprocess failed ${res.status}\n${res.stderr}\n${res.stdout}`);
    return res.stdout;
  } finally { rmSync(temp,{recursive:true,force:true}); }
}

test('Stage 38-I3 owner registry is persisted, effective immediately, and primary owner cannot be removed', () => {
  const out = run(`
    assert.equal(security.isOwner([primary]), true);
    let ctx=makeCtx('addowner',[managed],{mentions:[managed]});
    await plugin.execute(ctx);
    assert.equal(security.isOwner([managed]), true);
    assert.deepEqual(access.getManagedOwners(),[managed]);
    const saved=JSON.parse(await readFile(access.ownerAccessFilePath(),'utf8'));
    assert.deepEqual(saved.owners,[managed]);
    ctx=makeCtx('delowner',[primary],{mentions:[primary]});
    await plugin.execute(ctx);
    assert.match(ctx.replies.at(-1),/owner utama tidak dapat dihapus/i);
    assert.equal(security.isOwner([primary]),true);
    ctx=makeCtx('delowner',[managed],{mentions:[managed]});
    await plugin.execute(ctx);
    assert.equal(security.isOwner([managed]),false);
    console.log('PASS owner registry');
  `);
  assert.match(out,/PASS owner registry/);
});

test('Stage 38-I3 only primary owner may modify owner list', () => {
  const out=run(`
    const ctx=makeCtx('addowner',[target],{sender:managed,isOwner:true,mentions:[target]});
    await plugin.execute(ctx);
    assert.match(ctx.replies[0],/Hanya owner utama/i);
    assert.equal(security.isOwner([target]),false);
    console.log('PASS primary-only owner mutation');
  `);
  assert.match(out,/PASS primary-only owner mutation/);
});

test('Stage 38-I3 native WhatsApp block requires confirmation and protects owner identities', () => {
  const out=run(`
    let ctx=makeCtx('blockuser',[target],{mentions:[target]});
    await plugin.execute(ctx);
    assert.match(ctx.replies[0],/Konfirmasi/i);
    assert.equal(ctx.sock.blocked,undefined);
    ctx=makeCtx('blockuser',[target,'confirm'],{mentions:[target]});
    await plugin.execute(ctx);
    assert.deepEqual(ctx.sock.blocked,{jid:target,action:'block'});
    ctx=makeCtx('blockuser',[primary,'confirm'],{mentions:[primary]});
    await plugin.execute(ctx);
    assert.match(ctx.replies[0],/Tidak dapat memblokir owner/i);
    console.log('PASS native block guard');
  `);
  assert.match(out,/PASS native block guard/);
});

test('Stage 38-I3 LID and self targets are refused for native block', () => {
  const out=run(`
    let ctx=makeCtx('blockuser',['z-user@lid','confirm'],{mentions:['z-user@lid']});
    await plugin.execute(ctx);
    assert.match(ctx.replies[0],/target nomor WhatsApp PN yang valid/i);
    ctx=makeCtx('unblockuser',[primary,'confirm'],{mentions:[primary]});
    await plugin.execute(ctx);
    assert.match(ctx.replies[0],/Tidak dapat memblokir owner/i);
    console.log('PASS target namespace guard');
  `);
  assert.match(out,/PASS target namespace guard/);
});

test('Stage 38-I3 session status is read-only and reports metadata only', () => {
  const out=run(`
    const fs=await import('node:fs/promises');
    const dir=process.env.SESSION_DIR;
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(dir+'/creds.json','SECRET-SESSION-CONTENT');
    const ctx=makeCtx('sessionstatus');
    await plugin.execute(ctx);
    const body=ctx.interactive[0].body;
    assert.match(body,/creds.json/);
    assert.doesNotMatch(body,/SECRET-SESSION-CONTENT/);
    assert.equal(await fs.readFile(dir+'/creds.json','utf8'),'SECRET-SESSION-CONTENT');
    console.log('PASS read-only session status');
  `);
  assert.match(out,/PASS read-only session status/);
});

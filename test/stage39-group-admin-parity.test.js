import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
function run(script) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage39-'));
  try {
    const pluginUrl = pathToFileURL(path.resolve(root, 'src/plugins/general/group-tools.js')).href;
    const settingsUrl = pathToFileURL(path.resolve(root, 'src/lib/group-settings.js')).href;
    const full = `
      import assert from 'node:assert/strict';
      const plugin=(await import(${JSON.stringify(pluginUrl)})).default;
      const settings=await import(${JSON.stringify(settingsUrl)});
      const group='120363000000000000@g.us';
      const admin='6280000000000@s.whatsapp.net';
      const member='6281111111111@s.whatsapp.net';
      const calls=[];
      const makeCtx=(command,args=[],extra={})=>({command,args,isGroup:true,isAdmin:true,isOwner:false,isBotAdmin:true,chat:group,sender:admin,prefix:'.',mentions:[],replies:[],sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {subject:'Test Group',creation:1700000000,ephemeralDuration:0,participants:[{id:admin,admin:'admin'},{id:member},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}},async groupToggleEphemeral(...a){calls.push(['ephemeral',...a])},async groupSettingUpdate(...a){calls.push(['settings',...a])},async sendMessage(...a){calls.push(['send',...a])}},async reply(t){this.replies.push(String(t));return t},raw:{key:{id:'test'}},...extra});
      ${script}
    `;
    const res=spawnSync(process.execPath,['--input-type=module','-e',full],{cwd:temp,env:{...process.env,WHISKAY_GROUP_SETTINGS_FILE:path.join(temp,'group-settings.json')},encoding:'utf8',timeout:20000});
    if(res.status!==0) throw new Error(`subprocess failed ${res.status}\n${res.stderr}\n${res.stdout}`);
    return res.stdout;
  } finally { rmSync(temp,{recursive:true,force:true}); }
}

test('Stage 39-I1 command block list persists and normalizes command names',()=>{
 const out=run(`
   let ctx=makeCtx('bancmd',['.tiktok,','ig']); await plugin.execute(ctx);
   let s=await settings.getGroupSettings(group); assert.deepEqual(s.cmdblocked,['tiktok','ig']);
   ctx=makeCtx('unbancmd',['ig']); await plugin.execute(ctx);
   s=await settings.getGroupSettings(group); assert.deepEqual(s.cmdblocked,['tiktok']);
   ctx=makeCtx('bancmd',['--list']); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/\.tiktok/);
   console.log('PASS command block persistence');
 `); assert.match(out,/PASS command block persistence/);
});

test('Stage 39-I1 command block refuses protected recovery commands',()=>{
 const out=run(`
   const ctx=makeCtx('bancmd',['menu','grouphelp','ping','tiktok']); await plugin.execute(ctx);
   assert.deepEqual((await settings.getGroupSettings(group)).cmdblocked,['tiktok']);
   console.log('PASS protected command guard');
 `); assert.match(out,/PASS protected command guard/);
});

test('Stage 39-I1 ephemeral command maps only supported durations and calls Baileys API',()=>{
 const out=run(`
   let ctx=makeCtx('ephemeral',['7d']); await plugin.execute(ctx);
   assert.deepEqual(calls[0],['ephemeral',group,604800]);
   ctx=makeCtx('ephemeral',['off']); await plugin.execute(ctx);
   assert.deepEqual(calls[1],['ephemeral',group,0]);
   ctx=makeCtx('ephemeral',['forever']); await plugin.execute(ctx);
   assert.match(ctx.replies.at(-1),/Format/); assert.equal(calls.length,2);
   console.log('PASS ephemeral allowlist');
 `); assert.match(out,/PASS ephemeral allowlist/);
});

test('Stage 39-I1 ephemeral gracefully refuses unsupported transport method',()=>{
 const out=run(`
   const ctx=makeCtx('ephemeral',['24h'],{sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {participants:[{id:admin,admin:'admin'},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}}}});
   await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/tidak menyediakan groupToggleEphemeral/i);
   console.log('PASS missing transport guard');
 `); assert.match(out,/PASS missing transport guard/);
});

test('Stage 39-I3 totag relays quoted text and mentions current group members',()=>{
 const out=run(`
   const quoted={type:'conversation',message:{conversation:'Pesan penting'},text:'Pesan penting',download:async()=>Buffer.from('')};
   const ctx=makeCtx('totag',[],{quoted}); await plugin.execute(ctx);
   const send=calls.find(c=>c[0]==='send'); assert.ok(send); assert.match(send[2].text,/Pesan penting/); assert.ok(send[2].mentions.includes(member));
   console.log('PASS totag text forwarding');
 `); assert.match(out,/PASS totag text forwarding/);
});

test('Stage 39-I3 inviteinfo validates URLs and reports unsupported API safely',()=>{
 const out=run(`
   let ctx=makeCtx('inviteinfo',['https://example.com/not-a-group']); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/tautan undangan WhatsApp yang valid/i);
   ctx=makeCtx('inviteinfo',['https://chat.whatsapp.com/ABCDEFGHIJKL']); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/groupGetInviteInfo tidak tersedia/i);
   console.log('PASS inviteinfo URL guard');
 `); assert.match(out,/PASS inviteinfo URL guard/);
});

test('Stage 39-I3 inviteinfo renders validated group metadata',()=>{
 const out=run(`
   const ctx=makeCtx('inviteinfo',['chat.whatsapp.com/ABCDEFGHIJKL'],{sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {participants:[{id:admin,admin:'admin'},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}},async groupGetInviteInfo(code){assert.equal(code,'ABCDEFGHIJKL'); return {subject:'Invite Group',id:group,size:23,creation:1700000000,desc:'A group'}}}});
   await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Invite Group/); assert.match(ctx.replies.at(-1),/23/);
   console.log('PASS inviteinfo metadata');
 `); assert.match(out,/PASS inviteinfo metadata/);
});

test('Stage 39-I3 setppgc requires supported image and API and caps size',()=>{
 const out=run(`
   const quoted={type:'imageMessage',mimetype:'image/jpeg',download:async()=>Buffer.from('image')};
   let ctx=makeCtx('setppgc',[],{quoted}); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/updateProfilePicture tidak tersedia/i);
   let callsPP=[]; ctx=makeCtx('setppgc',[],{quoted,sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {participants:[{id:admin,admin:'admin'},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}},async updateProfilePicture(...args){callsPP.push(args)}}}); await plugin.execute(ctx); assert.equal(callsPP.length,1); assert.equal(callsPP[0][0],group);
   ctx=makeCtx('setppgc',[],{quoted:{...quoted,mimetype:'text/plain'}}); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/JPEG, PNG, atau WebP/);
   console.log('PASS setppgc safety');
 `); assert.match(out,/PASS setppgc safety/);
});

test('Stage 39-I4 attendance opens, records once per member, and lists persisted entries',()=>{
 const out=run(`
   let ctx=makeCtx('absen',['buka','Rapat']); await plugin.execute(ctx);
   assert.match(ctx.replies.at(-1),/Absensi dibuka/);
   ctx=makeCtx('absen',[],{isAdmin:false,sender:member,pushName:'Anggota'}); await plugin.execute(ctx);
   assert.match(ctx.replies.at(-1),/Kehadiran tercatat/);
   ctx=makeCtx('absen',[],{isAdmin:false,sender:member,pushName:'Anggota'}); await plugin.execute(ctx);
   assert.match(ctx.replies.at(-1),/sudah tercatat/);
   const saved=await settings.getGroupSettings(group); assert.equal(saved.attendance.entries.length,1); assert.equal(saved.attendance.entries[0].jid,member);
   ctx=makeCtx('absen',['list']); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Anggota/);
   console.log('PASS attendance persistence and dedupe');
 `); assert.match(out,/PASS attendance persistence and dedupe/);
});

test('Stage 39-I4 attendance close/reset are admin-only and close prevents new records',()=>{
 const out=run(`
   let ctx=makeCtx('absen',['buka']); await plugin.execute(ctx);
   ctx=makeCtx('absen',['tutup'],{isAdmin:false,sender:member}); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Hanya admin/);
   ctx=makeCtx('absen',['tutup']); await plugin.execute(ctx);
   ctx=makeCtx('absen',[],{isAdmin:false,sender:member}); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/belum dibuka atau sudah ditutup/);
   ctx=makeCtx('absen',['reset'],{isAdmin:false,sender:member}); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Hanya admin/);
   ctx=makeCtx('absen',['reset']); await plugin.execute(ctx); assert.equal((await settings.getGroupSettings(group)).attendance.entries.length,0);
   console.log('PASS attendance role controls');
 `); assert.match(out,/PASS attendance role controls/);
});

test('Stage 39-I4 pin command validates duration and relays a quoted key to socket',()=>{
 const out=run(`
   const quoted={key:{remoteJid:group,id:'quoted-message',participant:member}};
   let ctx=makeCtx('pinchat',['bad'],{quoted}); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Durasi pin/); assert.equal(calls.length,0);
   ctx=makeCtx('pinchat',['7d'],{quoted}); await plugin.execute(ctx);
   const pin=calls.find(c=>c[0]==='send' && c[2]?.pin); assert.ok(pin); assert.equal(pin[2].pin.id,'quoted-message'); assert.equal(pin[2].time,604800);
   console.log('PASS pin command guard and payload');
 `); assert.match(out,/PASS pin command guard and payload/);
});

test('Stage 39-I5 aliases map to guarded group settings and preserve correct Baileys values',()=>{
 const out=run(`
   let ctx=makeCtx('close',[]); await plugin.execute(ctx); assert.deepEqual(calls.at(-1),['settings',group,'announcement']);
   ctx=makeCtx('open',[]); await plugin.execute(ctx); assert.deepEqual(calls.at(-1),['settings',group,'not_announcement']);
   ctx=makeCtx('locked',[]); await plugin.execute(ctx); assert.deepEqual(calls.at(-1),['settings',group,'locked']);
   ctx=makeCtx('unlocked',[]); await plugin.execute(ctx); assert.deepEqual(calls.at(-1),['settings',group,'unlocked']);
   ctx=makeCtx('setname',['Nama','Baru'],{sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {participants:[{id:admin,admin:'admin'},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}},async groupUpdateSubject(...a){calls.push(['subject',...a])}}}); await plugin.execute(ctx); assert.deepEqual(calls.at(-1),['subject',group,'Nama Baru']);
   console.log('PASS settings aliases');
 `); assert.match(out,/PASS settings aliases/);
});

test('Stage 39-I5 .group settings umbrella supports aliases and link safely',()=>{
 const out=run(`
   let ctx=makeCtx('group',['close']); await plugin.execute(ctx); assert.deepEqual(calls.at(-1),['settings',group,'announcement']);
   ctx=makeCtx('group',['locked']); await plugin.execute(ctx); assert.deepEqual(calls.at(-1),['settings',group,'locked']);
   ctx=makeCtx('group',['unknown']); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Format: \.group/);
   ctx=makeCtx('linkgc',[],{sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {participants:[{id:admin,admin:'admin'},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}},async groupInviteCode(){return 'ABCDEF123456'}}}); await plugin.execute(ctx); assert.ok(ctx.replies.at(-1).includes('chat.whatsapp.com/ABCDEF123456'));
   console.log('PASS group umbrella and link');
 `); assert.match(out,/PASS group umbrella and link/);
});

test('Stage 39-I6 blacklist is persistent, per-group, and protects admins',()=>{
 const out=run(`
   let ctx=makeCtx('blacklist',[],{mentionedJid:[member]}); await plugin.execute(ctx);
   let s=await settings.getGroupSettings(group); assert.deepEqual(s.blacklist,[member]);
   ctx=makeCtx('blacklist',[],{mentionedJid:[admin]}); await plugin.execute(ctx);
   s=await settings.getGroupSettings(group); assert.deepEqual(s.blacklist,[member]); assert.match(ctx.replies.at(-1),/Tidak diproses/);
   ctx=makeCtx('unblacklist',[],{mentionedJid:[member]}); await plugin.execute(ctx);
   s=await settings.getGroupSettings(group); assert.deepEqual(s.blacklist,[]);
   console.log('PASS group blacklist persistence and protected users');
 `); assert.match(out,/PASS group blacklist persistence/);
});

test('Stage 39-I6 profile picture commands guard missing API and deliver valid URL',()=>{
 const out=run(`
   let ctx=makeCtx('getppgc',[]); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/profilePictureUrl tidak tersedia/);
   let sent=[]; ctx=makeCtx('getppgc',[],{sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {subject:'Test Group',participants:[{id:admin,admin:'admin'},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}},async profilePictureUrl(jid,type){assert.equal(jid,group);assert.equal(type,'image');return 'https://cdn.example/image.jpg'},async sendMessage(...args){sent.push(args)}}});
   await plugin.execute(ctx); assert.equal(sent.length,1); assert.equal(sent[0][1].image.url,'https://cdn.example/image.jpg');
   console.log('PASS profile picture API guards');
 `); assert.match(out,/PASS profile picture API guards/);
});

test('Stage 39-I6 profile picture command validates user target and handles privacy failures',()=>{
 const out=run(`
   let ctx=makeCtx('getpp',[],{sock:{user:{id:'6289999999999@s.whatsapp.net'},async groupMetadata(){return {participants:[{id:admin,admin:'admin'},{id:'6289999999999@s.whatsapp.net',admin:'admin'}]}},async profilePictureUrl(){throw new Error('not-authorized')}}});
   await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Foto profil tidak dapat diakses/);
   ctx=makeCtx('getpp',[],{mentionedJid:['not-a-jid']}); await plugin.execute(ctx); assert.match(ctx.replies.at(-1),/Target pengguna tidak valid/);
   console.log('PASS profile picture privacy and target guards');
 `); assert.match(out,/PASS profile picture privacy/);
});

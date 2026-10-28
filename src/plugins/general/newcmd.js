import { readFile } from 'node:fs/promises';
import path from 'node:path';
const LEDGER = path.resolve('data/menu-command-ledger.json');
const WINDOW = 7 * 24 * 60 * 60 * 1000;
export function formatCountdown(addedAt, now = Date.now()) { const remaining = Math.max(0, WINDOW - (now - Number(addedAt || 0))); return { active: remaining > 0, hours: Math.floor(remaining / 3600000), minutes: Math.floor((remaining % 3600000) / 60000) }; }
export default { name:'newcmd', command:['newcmd'], menuCommands:['newcmd'], category:'general', description:'Daftar perintah baru dengan countdown tujuh hari', async execute(ctx) {
 let ledger={}; try { ledger=JSON.parse(await readFile(LEDGER,'utf8')); } catch {}
 const now=Date.now(); const rows=Object.entries(ledger).filter(([key,row])=>key!=='__meta'&&Number(row?.newUntil||0)>now).map(([command,row])=>{const addedAt=Number(row.firstSeen||(Number(row.newUntil)-WINDOW));return {command,addedAt,timer:formatCountdown(addedAt,now)};}).filter(r=>r.timer.active).sort((a,b)=>b.addedAt-a.addedAt);
 if(!rows.length)return ctx.reply('Belum ada command yang berstatus 🆕 dalam tujuh hari terakhir.');
 return ctx.reply(`🆕 COMMAND BARU · 7 HARI\n\n${rows.map((r,i)=>`${i+1}. ${ctx.prefix}${r.command} — ${r.timer.hours}j ${r.timer.minutes}m tersisa`).join('\n')}\n\nCountdown dihitung saat perintah dijalankan.`);
} };

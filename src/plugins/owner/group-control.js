import { getGroupPolicy, isGroupMuted, muteGroup, unmuteGroup, setOnlyGroup, resetGroupMutePolicy, listConfiguredGroups } from '../../lib/group-policy.js';

const HELP = `🛡️ *WHISKAY GROUP CONTROL* (owner only)\n\n.groupbot panel — buka tombol kontrol\n.groupbot list — daftar grup dibisukan + ID\n.groupbot status — kebijakan global\n.groupbot mute <GROUP_ID> — nonaktifkan bot di grup\n.groupbot unmute <GROUP_ID> — aktifkan bot di grup\n.groupbot onlyhere — aktifkan hanya di grup ini\n.groupbot reset — hapus aturan mute global\n\nID grup berbentuk 1203...@g.us. Perintah ini hanya mengatur bot, bukan mengubah hak admin WhatsApp.`;
function groupId(value) { const s=String(value||'').trim(); return /^\d{5,30}-\d{5,30}@g\.us$/.test(s) || /^\d{10,30}@g\.us$/.test(s) ? s : ''; }
function buttons(ctx) {
  if (ctx.isGroup && String(ctx.chat||'').endsWith('@g.us')) return [
    { name:'quick_reply', title:'🔇 Mute grup ini', id:`${ctx.prefix}groupbot mute ${ctx.chat}` },
    { name:'quick_reply', title:'🎯 Hanya grup ini aktif', id:`${ctx.prefix}groupbot onlyhere` },
    { name:'quick_reply', title:'🔊 Reset aturan mute', id:`${ctx.prefix}groupbot reset` }
  ];
  return [
    { name:'quick_reply', title:'📋 Daftar grup mute', id:`${ctx.prefix}groupbot list` },
    { name:'quick_reply', title:'📊 Status grup', id:`${ctx.prefix}groupbot status` },
    { name:'quick_reply', title:'🔊 Reset aturan mute', id:`${ctx.prefix}groupbot reset` }
  ];
}
export default {
  name:'group-control', command:['groupbot'], category:'owner', owner:true,
  description:'Kontrol owner untuk mute bot per grup dan allowlist grup',
  async execute(ctx) {
    const sub=String(ctx.args?.[0]||'help').toLowerCase();
    if (sub==='panel') return ctx.sendInteractive({title:'WHISKAY · GROUP CONTROL',subtitle:'Kontrol bot per grup',body:`Grup saat ini: ${ctx.isGroup?ctx.chat:'perintah dari chat pribadi'}\nPilih kebijakan di bawah. Tombol hanya mengatur grup bot, bukan mengubah pengaturan WhatsApp.`,buttons:buttons(ctx)});
    if (sub==='help') return ctx.reply(HELP);
    if (sub==='status') { const p=getGroupPolicy(); return ctx.reply(`🛡️ *GROUP BOT STATUS*\nMode hanya-grup: ${p.onlyGroup||'nonaktif'}\nGrup dimute: ${p.mutedGroups.length}\nGrup berkonfigurasi: ${Object.keys(p.groups||{}).length}\nGunakan .groupbot list untuk melihat ID.`); }
    if (sub==='list') {
      const p=getGroupPolicy(); const ids=[...new Set([...p.mutedGroups,...(p.onlyGroup?[p.onlyGroup]:[])])];
      let live=[]; try { if (typeof ctx.sock?.groupFetchAllParticipating==='function') live=Object.keys(await ctx.sock.groupFetchAllParticipating()||{}).filter(x=>x.endsWith('@g.us')); } catch {}
      const rows=ids.map(id=>`${id===p.onlyGroup?'🎯 ONLY-HERE':'🔇 MUTED'} ${id}`);
      if (p.onlyGroup) for (const id of live) if(id!==p.onlyGroup&&!ids.includes(id)) rows.push(`🔇 MUTED (oleh mode onlyhere) ${id}`);
      return ctx.reply(`📋 *DAFTAR STATUS GRUP*\nMode hanya-grup: ${p.onlyGroup||'nonaktif'}\n${rows.join('\n')||'Tidak ada grup yang dibisukan.'}\n\nTotal grup yang bot ikuti: ${live.length}`);
    }
    if (sub==='onlyhere') {
      if (!ctx.isGroup || !String(ctx.chat||'').endsWith('@g.us')) return ctx.reply('Jalankan .groupbot onlyhere dari dalam grup yang ingin tetap aktif.');
      setOnlyGroup(ctx.chat); return ctx.reply(`✅ Bot sekarang hanya aktif di grup ini:\n${ctx.chat}\nSemua grup lain dibisukan. Gunakan .groupbot reset untuk membatalkan.`);
    }
    if (sub==='reset') { resetGroupMutePolicy(); return ctx.reply('✅ Aturan mute global direset. Bot kembali aktif di semua grup; konfigurasi anti-toxic dan text guard tiap grup tetap dipertahankan.'); }
    if (sub==='mute' || sub==='unmute') {
      const target=groupId(ctx.args?.[1]) || (ctx.isGroup && ctx.args?.length===1 ? ctx.chat : '');
      if (!target) return ctx.reply(`Format: .groupbot ${sub} <GROUP_ID>\nAtau gunakan .groupbot mute dari dalam grup ini.`);
      if(sub==='mute') muteGroup(target); else unmuteGroup(target);
      return ctx.reply(`${sub==='mute'?'🔇 Bot dibisukan di':'🔊 Bot diaktifkan di'} grup ${target}`);
    }
    return ctx.reply(HELP);
  }
};

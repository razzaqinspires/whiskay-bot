import { getGroupSettings, updateGroupSettings } from '../../lib/group-policy.js';
const HELP=`🛡️ *GROUP SAFETY*\n.antitoxic on|off|add <kata>|remove <kata>|list\n.antibanword on|off|add <kata/frasa>|remove <kata/frasa>|list\n.textguard on|off|status\n.groupstatus\n.grouphelp\n\nPengaturan hanya berlaku untuk grup ini. Admin grup diperlukan untuk mengubahnya; bot perlu menjadi admin agar dapat menghapus pesan.`;
function validWord(raw) { const w=String(raw||'').normalize('NFKC').trim().toLowerCase(); return w.length>=2 && w.length<=80 && !/[\u0000-\u001f]/.test(w) ? w : ''; }
export default {
  name:'group-safety', command:['antitoxic','antibanword','textguard','groupstatus','grouphelp'], category:'group', group:true,
  description:'Filter kata toxic, anti-ban-word, dan perlindungan pesan flood/teks lag',
  async execute(ctx) {
    if(!ctx.isGroup) return ctx.reply('Perintah ini hanya untuk grup.');
    const cmd=ctx.command;
    if(cmd==='grouphelp') return ctx.reply(HELP);
    if(!ctx.isAdmin && !ctx.isOwner) return ctx.reply('🔒 Hanya admin grup yang dapat mengubah pengaturan keamanan.');
    const s=getGroupSettings(ctx.chat);
    if(cmd==='groupstatus') return ctx.reply(`🛡️ *STATUS KEAMANAN GRUP*\nAnti-toxic: ${s.toxic?'ON':'OFF'}\nAnti-ban-word: ${s.antiBanWord?'ON':'OFF'} (${s.banWords.length} kata/frasa)\nKata toxic kustom: ${s.toxicWords.length}\nText guard: ${s.textGuard?'ON':'OFF'}\nBot admin: ${ctx.isBotAdmin?'ya':'tidak'}\n\nGunakan .grouphelp untuk bantuan.`);
    const sub=String(ctx.args?.[0]||'status').toLowerCase();
    if(cmd==='textguard') {
      if(sub==='on'||sub==='off') { const next=updateGroupSettings(ctx.chat,{textGuard:sub==='on'}); return ctx.reply(`🧹 Text guard ${next.textGuard?'diaktifkan':'dinonaktifkan'}. Filter mendeteksi teks sangat panjang, pengulangan ekstrem, dan karakter zero-width berlebihan.`); }
      return ctx.reply(`🧹 Text guard: ${s.textGuard?'ON':'OFF'}\nStatus: ${ctx.isBotAdmin?'bot admin — dapat menghapus pesan':'bot bukan admin — pesan tidak bisa dihapus otomatis'}`);
    }
    const key=cmd==='antitoxic'?'toxicWords':'banWords'; const enabledKey=cmd==='antitoxic'?'toxic':'antiBanWord';
    if(['on','off'].includes(sub)) { const next=updateGroupSettings(ctx.chat,{[enabledKey]:sub==='on'}); return ctx.reply(`🛡️ ${cmd} ${next[enabledKey]?'diaktifkan':'dinonaktifkan'}.`); }
    if(sub==='list') return ctx.reply(`📋 *${cmd.toUpperCase()}*\nAktif: ${s[enabledKey]?'ya':'tidak'}\n${cmd==='antitoxic'&&s.toxic?'Kamus dasar aktif.':''}\n${s[key].map((w,i)=>`${i+1}. ${w}`).join('\n')||'Belum ada kata/frasa kustom.'}`);
    if(sub==='add'||sub==='remove') {
      const word=validWord(ctx.args.slice(1).join(' ')); if(!word) return ctx.reply(`Format: .${cmd} ${sub} <kata/frasa 2–80 karakter>`);
      const words=new Set(s[key]); if(sub==='add') words.add(word); else words.delete(word);
      updateGroupSettings(ctx.chat,{[key]:[...words]}); return ctx.reply(`✅ ${sub==='add'?'Ditambahkan':'Dihapus'}: “${word}”\nGunakan .${cmd} on untuk mengaktifkan filter.`);
    }
    return ctx.reply(HELP);
  }
};

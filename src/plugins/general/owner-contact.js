import config from '../../config/index.js';
export default {
  name:'owner-contact', command:['owner','kontakowner'], category:'general', cooldown:1200,
  description:'Kirim kontak owner resmi Whiskay',
  async execute(ctx) {
    const jid = (config.owners || []).find(x => String(x).endsWith('@s.whatsapp.net'));
    if (!jid) return ctx.reply('Nomor owner belum dikonfigurasi. Isi OWNERS di .env.');
    const number = String(jid).split('@')[0].replace(/\D/g,'');
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:WHISKAY OWNER\nTEL;type=CELL;type=VOICE;waid=${number}:+${number}\nEND:VCARD`;
    try {
      await ctx.sock.sendMessage(ctx.chat, { contacts: { displayName: 'WHISKAY OWNER', contacts: [{ vcard }] } });
      return ctx.reply('📇 Kontak owner resmi dikirim. Hubungi hanya untuk keperluan dukungan yang relevan.');
    } catch {
      return ctx.reply(`Kontak owner: https://wa.me/${number}`);
    }
  }
};

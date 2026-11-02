import config from '../../config/index.js';

export default {
  name: 'owner-contact',
  command: ['owner', 'kontakowner'],
  category: 'general',
  cooldown: 1200,
  description: 'Kirim kontak resmi developer/owner Whiskay',
  async execute(ctx) {
    const ownerName = String(process.env.OWNER_NAME || config.ownerName || 'Whiskay Owner').trim().slice(0, 80);
    const jid = (config.owners || []).find(value => String(value).endsWith('@s.whatsapp.net'));
    const fallbackPhone = String(process.env.OWNER_PHONE || process.env.BOT_WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '');
    const number = jid ? String(jid).split('@')[0].replace(/\D/g, '') : fallbackPhone;
    if (!number || number.length < 8) {
      return ctx.sendInteractive({ title: '👤 WHISKAY · OWNER CONTACT', body: `${ownerName}
Nomor kontak belum dikonfigurasi. Owner perlu mengisi OWNER_PHONE atau OWNERS pada .env melalui .config.`, buttons: [{ name: 'quick_reply', title: 'Buka Config (Owner)', id: '.config' }] });
    }
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nORG:Whiskay Bot;Developer\nTEL;type=CELL;type=VOICE;waid=${number}:+${number}\nEND:VCARD`;
    try {
      await ctx.sock.sendMessage(ctx.chat, { contacts: { displayName: ownerName, contacts: [{ vcard }] } });
      return ctx.reply(`📇 Kontak resmi ${ownerName} dikirim. Developer: Arifi Razzaq.`);
    } catch {
      return ctx.sendInteractive({ title: '👤 WHISKAY · OWNER CONTACT', body: `Nama: ${ownerName}
Developer: Arifi Razzaq
Kontak: +${number}`, buttons: [{ name: 'cta_url', title: 'Chat Owner', url: `https://wa.me/${number}` }] });
    }
  }
};

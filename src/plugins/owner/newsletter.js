const MAX_TEXT = 3000;
const jidPattern = /^[0-9]+@newsletter$/;
const clean = value => String(value || '').trim();
const asNewsletterJid = value => {
  const s = clean(value);
  if (jidPattern.test(s)) return s;
  // IDs returned by Baileys may be represented as a bare channel ID.
  if (/^[0-9]+$/.test(s)) return `${s}@newsletter`;
  return '';
};

export default {
  name: 'newsletter',
  command: ['saluran', 'newsletter'],
  category: 'owner',
  owner: true,
  description: 'Buat dan kelola WhatsApp Channel/Newsletter (owner only)',
  async execute(ctx) {
    if (!ctx.isOwner) return ctx.reply('🔒 Perintah saluran hanya untuk owner.');
    const sock = ctx.sock;
    if (!sock) return ctx.reply('❌ Socket WhatsApp tidak tersedia.');
    const args = (ctx.args || []).map(String);
    const action = (args.shift() || 'help').toLowerCase();
    const rest = args.join(' ').trim();
    const unsupported = method => typeof sock[method] !== 'function';
    const help = `📣 *WHISKAY · KONTROL SALURAN*\n\n` +
      `• .saluran buat Nama | Deskripsi\n` +
      `• .saluran info <id@newsletter atau invite-link>\n` +
      `• .saluran kirim <id@newsletter> | pesan\n` +
      `• .saluran nama <id@newsletter> | nama baru\n` +
      `• .saluran deskripsi <id@newsletter> | deskripsi baru\n` +
      `• .saluran follow <id@newsletter>\n` +
      `• .saluran unfollow <id@newsletter>\n\n` +
      `Catatan: fitur bergantung pada API Baileys yang terpasang dan izin akun. Uji kirim ke saluran privat terlebih dahulu.`;
    if (['help', 'bantuan', '--help'].includes(action)) return ctx.reply(help);

    if (action === 'buat' || action === 'create') {
      if (unsupported('newsletterCreate')) return ctx.reply('❌ Versi Baileys ini tidak menyediakan newsletterCreate. Periksa versi package.json.');
      const [name, ...descriptionParts] = rest.split('|');
      const title = clean(name), description = clean(descriptionParts.join('|'));
      if (!title || title.length > 100 || description.length > 500) return ctx.reply('Format: .saluran buat Nama Saluran | Deskripsi (nama maks. 100, deskripsi maks. 500 karakter).');
      const result = await sock.newsletterCreate(title, description || undefined);
      const jid = result?.id || result?.jid || result?.newsletterJid || '';
      const invite = result?.invite || result?.inviteLink || result?.url || '';
      return ctx.reply(`✅ *Permintaan pembuatan saluran selesai*\nNama: ${result?.name || title}\nJID: ${jid || '(JID tidak dikembalikan)'}${invite ? `\nTautan: ${invite}` : ''}\n\nSimpan JID dari respons Baileys. Periksa saluran di WhatsApp untuk memastikan benar-benar terbentuk.`);
    }

    if (action === 'info') {
      if (unsupported('newsletterMetadata')) return ctx.reply('❌ newsletterMetadata tidak tersedia pada versi Baileys ini.');
      if (!rest) return ctx.reply('Format: .saluran info <id@newsletter atau tautan undangan>');
      const type = rest.includes('whatsapp.com/channel/') ? 'invite' : 'jid';
      const key = type === 'invite' ? rest.split('?')[0].split('/').filter(Boolean).at(-1) : asNewsletterJid(rest);
      if (!key) return ctx.reply('JID saluran tidak valid. Gunakan ID angka atau akhiran @newsletter.');
      const result = await sock.newsletterMetadata(type, key);
      if (!result) return ctx.reply('Tidak ada metadata saluran yang dikembalikan.');
      return ctx.reply(`📣 *INFO SALURAN*\nNama: ${result.name || '-'}\nJID: ${result.id || result.jid || (type === 'jid' ? key : '-')}\nDeskripsi: ${result.description || '-'}\nSubscriber: ${result.subscribers ?? '-'}\nState: ${result.state || '-'}`);
    }

    if (action === 'kirim' || action === 'send') {
      const [rawJid, ...messageParts] = rest.split('|');
      const jid = asNewsletterJid(rawJid);
      const message = messageParts.join('|').trim();
      if (!jid || !message || message.length > MAX_TEXT) return ctx.reply('Format: .saluran kirim <id@newsletter> | pesan (maks. 3000 karakter).');
      // Baileys uses sendMessage for newsletter JIDs, but text delivery can be
      // unstable in some releases. Report the library result and never claim delivery without it.
      const result = await sock.sendMessage(jid, { text: message });
      return ctx.reply(`📨 Permintaan kirim diteruskan ke Baileys.\nJID: ${jid}\nMessage ID: ${result?.key?.id || '(tidak dikembalikan)'}\nPeriksa saluran untuk memastikan pesan benar-benar tampil.`);
    }

    if (['nama', 'rename'].includes(action)) {
      const [rawJid, ...nameParts] = rest.split('|');
      const jid = asNewsletterJid(rawJid), name = nameParts.join('|').trim();
      if (!jid || !name || name.length > 100) return ctx.reply('Format: .saluran nama <id@newsletter> | nama baru');
      if (unsupported('newsletterUpdateName')) return ctx.reply('❌ newsletterUpdateName tidak tersedia pada versi Baileys ini.');
      await sock.newsletterUpdateName(jid, name);
      return ctx.reply(`✅ Permintaan ubah nama dikirim untuk ${jid}. Verifikasi di WhatsApp.`);
    }

    if (['deskripsi', 'description', 'desc'].includes(action)) {
      const [rawJid, ...descParts] = rest.split('|');
      const jid = asNewsletterJid(rawJid), description = descParts.join('|').trim();
      if (!jid || description.length > 500) return ctx.reply('Format: .saluran deskripsi <id@newsletter> | deskripsi baru (maks. 500 karakter)');
      if (unsupported('newsletterUpdateDescription')) return ctx.reply('❌ newsletterUpdateDescription tidak tersedia pada versi Baileys ini.');
      await sock.newsletterUpdateDescription(jid, description);
      return ctx.reply(`✅ Permintaan ubah deskripsi dikirim untuk ${jid}. Verifikasi di WhatsApp.`);
    }

    if (['follow', 'ikuti', 'unfollow', 'berhenti'].includes(action)) {
      const jid = asNewsletterJid(rest);
      if (!jid) return ctx.reply(`Format: .saluran ${action} <id@newsletter>`);
      const method = ['follow', 'ikuti'].includes(action) ? 'newsletterFollow' : 'newsletterUnfollow';
      if (unsupported(method)) return ctx.reply(`❌ ${method} tidak tersedia pada versi Baileys ini.`);
      await sock[method](jid);
      return ctx.reply(`✅ Permintaan ${method === 'newsletterFollow' ? 'follow' : 'unfollow'} dikirim untuk ${jid}.`);
    }

    return ctx.reply(help);
  }
};

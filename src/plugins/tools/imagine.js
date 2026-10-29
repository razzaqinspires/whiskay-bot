const MAX_PROMPT = 1200;
function promptFrom(ctx) { return (ctx.args || []).join(' ').trim().slice(0, MAX_PROMPT); }
export default {
  name: 'imagine', command: ['imagine', 'imajinasi'], menuCommands: ['imagine'], category: 'tools', cooldown: 15000,
  description: 'Buat gambar dari prompt menggunakan provider gambar yang dikonfigurasi',
  async execute(ctx) {
    const prompt = promptFrom(ctx);
    if (!prompt) return ctx.sendInteractive({ title: 'Whiskay Imagine', body: 'Kirim prompt gambar, misalnya: .imagine karakter RPG fantasi dengan mantel biru, ilustrasi anime, landscape. Fitur ini membutuhkan OPENAI_API_KEY dan akses model gambar.', buttons: [{ name: 'quick_reply', title: 'Contoh karakter', id: `${ctx.prefix}imagine anime RPG adventurer, blue cloak, cinematic landscape` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
    const key = String(process.env.OPENAI_API_KEY || '').trim();
    if (!key) return ctx.reply('🎨 Imagine belum aktif: OPENAI_API_KEY belum dikonfigurasi. Tidak ada gambar palsu yang akan dikirim. Atur key di environment lalu restart bot.');
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.WHISKAY_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024', n: 1 }), signal: AbortSignal.timeout(90000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Image API HTTP ${response.status}`);
      const b64 = data.data?.[0]?.b64_json;
      if (b64) return ctx.sock.sendMessage(ctx.chat, { image: Buffer.from(b64, 'base64'), caption: `🎨 WHISKAY IMAGINE\nPrompt: ${prompt.slice(0, 500)}` }, ctx.quoted ? { quoted: ctx.quoted } : {});
      const url = data.data?.[0]?.url;
      if (url) { const img = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!img.ok) throw new Error('Gagal mengunduh hasil gambar.'); const bytes = Buffer.from(await img.arrayBuffer()); return ctx.sock.sendMessage(ctx.chat, { image: bytes, caption: `🎨 WHISKAY IMAGINE\nPrompt: ${prompt.slice(0, 500)}` }, ctx.quoted ? { quoted: ctx.quoted } : {}); }
      throw new Error('Provider tidak mengembalikan gambar yang dapat dibaca.');
    } catch (error) { return ctx.reply(`🎨 Gagal membuat gambar: ${String(error?.message || error).slice(0, 260)}\nCoba prompt lebih ringkas atau periksa akses model gambar pada API key.`); }
  }
};

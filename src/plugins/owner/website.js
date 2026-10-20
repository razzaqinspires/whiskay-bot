import { checkRazzaqWebsite, getRazzaqWebsiteAnalytics, getRazzaqWebsiteContent, sendRazzaqWebsiteEvent } from '../../services/razzaqWebsite.js';

export default {
  name: 'website-integration',
  command: ['webstatus', 'webpush', 'webreport', 'webhelp', 'webset', 'websale', 'webexpense', 'webproduct'],
  aliases: ['rvstatus', 'webview', 'rvpush', 'rvreport', 'rvhelp', 'rvset', 'rvsale', 'rvexpense', 'rvproduct'],
  menuCommands: ['webexpense', 'webhelp', 'webproduct', 'webpush', 'webreport', 'websale', 'webset', 'webstatus'],
  description: 'Integrasi website Razzaq Ventures',
  menuDescriptions: { webexpense: 'Catat biaya operasional', webhelp: 'Panduan kontrol website', webproduct: 'Tampilkan atau perbarui katalog produk', webpush: 'Kirim event integrasi yang diizinkan', webreport: 'Lihat laporan penjualan dan biaya', websale: 'Catat transaksi penjualan', webset: 'Ubah konten website yang diizinkan', webstatus: 'Cek status live website' },
  category: 'owner',
  owner: true,
  cooldown: 2500,
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    if (['webhelp','rvhelp'].includes(cmd)) {
      return ctx.reply(
        '*RAZZAQ VENTURES — OWNER CONTROL*\n' +
        '.webstatus / .webview — cek koneksi website secara live\n' +
        '.webset heroTitle | We build what comes next.\n' +
        '.webset heroIntro | Deskripsi baru perusahaan\n' +
        '.webset ceoName | Nama CEO\n' +
        '.webset ceoTitle | Founder & CEO\n' +
        '.webset announcement | Pengumuman publik\n' +
        '.webset accentColor | #d6f36a\n' +
        '.webset showAnnouncement | true atau false\n' +
        '.websale {"product":"LUMÓRA Lavender","quantity":2,"unitPrice":59900,"unitCost":25000,"channel":"Shopee"}\n' +
        '.webexpense {"category":"Packaging","description":"Kotak produk","amount":45000}\n' +
        '.webproduct {"sku":"LUM-LAV-85","name":"LUMÓRA Lavender","stock":10,"price":59900}\n' +
        '.webreport — ringkasan penjualan dan biaya\n' +
        '.webpush event.name {"key":"value"} — mode event lanjutan'
      );
    }
    if (['webstatus', 'rvstatus', 'webview'].includes(cmd)) {
      try {
        const s = await checkRazzaqWebsite();
        const body = `Status: ${s.status || 'unknown'}\nAPI: ${s.apiVersion || 'v1'}\nHTTP: ${s.httpStatus}\nWaktu: ${s.timestamp || '-'}`;
        const sock = ctx.sock;
        // The serializer exposes AIRich on the message context (ctx.airich) and
        // on the socket in different builds. Prefer the context factory first.
        // Build both submessage text and a valid unified-response section; a
        // malformed view_model can make WhatsApp silently display no rich card.
        try {
          const rich = typeof ctx.airich === 'function'
            ? ctx.airich()
            : typeof ctx.rich === 'function'
              ? ctx.rich()
              : typeof sock?.airich === 'function'
                ? sock.airich()
                : null;
          if (rich && typeof rich.setTitle === 'function' && typeof rich.setFooter === 'function' && typeof rich.addText === 'function' && typeof rich.addSection === 'function' && typeof rich.send === 'function') {
            const ok = String(s.status || 'unknown').toLowerCase();
            const healthy = ['healthy', 'ok', 'online', 'operational', 'up'].includes(ok);
            const safe = value => String(value ?? '-').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
            const html = `<style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#0b1220;color:#e5edf8;font-family:Arial,sans-serif}.card{max-width:420px;margin:auto;border:1px solid #26364f;border-radius:16px;overflow:hidden;background:#111c2e}.head{padding:16px;background:#172840}.title{font-size:17px;font-weight:800}.sub{margin-top:5px;font-size:11px;color:#a7bad3}.row{display:flex;justify-content:space-between;gap:12px;padding:11px 15px;border-top:1px solid #24334a}.label{color:#9eb0c9}.value{font-weight:700;text-align:right;overflow-wrap:anywhere}.pill{display:inline-block;padding:4px 9px;border-radius:99px;background:${healthy ? '#123e35' : '#49331d'};color:${healthy ? '#6ee7b7' : '#fbbf24'};font-size:11px;font-weight:800}.foot{padding:12px 15px;color:#8296b3;font-size:10px;border-top:1px solid #24334a}</style><div class="card"><div class="head"><div class="title">🌐 RAZZAQ VENTURES</div><div class="sub">WEBSITE · LIVE STATUS</div><div style="margin-top:12px"><span class="pill">${healthy ? '● ONLINE' : '● CHECK STATUS'}</span></div></div><div class="row"><span class="label">Status API</span><span class="value">${safe(s.status || 'unknown')}</span></div><div class="row"><span class="label">HTTP response</span><span class="value">${safe(s.httpStatus ?? '-')}</span></div><div class="row"><span class="label">API version</span><span class="value">${safe(s.apiVersion || 'v1')}</span></div><div class="row"><span class="label">Checked at</span><span class="value">${safe(s.timestamp || new Date().toLocaleString('id-ID'))}</span></div><div class="foot">Diperiksa langsung dari API integrasi website · Razzaq Ventures</div></div>`;
            rich.setTitle('RAZZAQ VENTURES WEBSITE').setFooter('Status diperiksa langsung dari API website.');
            if (typeof rich.addSubmessage === 'function') rich.addSubmessage({ messageType: 2, messageText: body });
            rich.addSection({ view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'FOAHtmlPrimitiveDemoDONOTUSE', trusted_sources: [], payload: html } } });
            return await rich.send(ctx.chat, { quoted: ctx.raw });
          }
        } catch (richError) {
          console.error('[WEBSITE] AIRich status card failed:', richError?.stack || richError?.message || richError);
        }
        return ctx.sendInteractive({
          title: 'RAZZAQ VENTURES WEBSITE',
          subtitle: 'Live status',
          body,
          footer: 'Status diperiksa langsung dari API website.',
          buttons: [
            { name: 'quick_reply', title: 'Refresh Status', id: `${ctx.prefix}webstatus` },
            { name: 'cta_url', title: 'Buka Website', url: 'https://razzaq-ventures-platform.vercel.app' }
          ]
        });
      } catch (e) { return ctx.reply(`Website tidak terhubung.\n${e.message}`); }
    }
    if (['webreport','rvreport'].includes(cmd)) {
      try {
        const r = await getRazzaqWebsiteAnalytics();
        const idr = n => `Rp${Number(n || 0).toLocaleString('id-ID')}`;
        return ctx.reply(`*RV — RINGKASAN MANAJEMEN*\nTransaksi: ${r.sales?.transactions ?? 0}\nUnit terjual: ${r.sales?.unitsSold ?? 0}\nOmzet tercatat: ${idr(r.sales?.grossRevenue)}\nHPP tercatat: ${idr(r.sales?.recordedCostOfGoods)}\nBiaya operasional: ${idr(r.expenses?.total)}\nLaba kotor estimasi: ${idr(r.estimate?.grossProfitBeforeOperatingExpenses)}\nEstimasi sebelum pajak: ${idr(r.estimate?.estimatedNetBeforeTax)}\n\nCatatan: ${r.note || 'Data berdasarkan transaksi yang dicatat.'}`);
      } catch (e) { return ctx.reply(`Laporan belum tersedia.\n${e.message}`); }
    }
    if (['webset','rvset'].includes(cmd)) {
      const raw = String(ctx.text || '').trim();
      const ix = raw.indexOf('|');
      if (ix < 1) return ctx.reply('Format: .webset key | nilai\nKey: heroTitle, heroIntro, ceoName, ceoTitle, announcement, accentColor, showAnnouncement');
      const key = raw.slice(0, ix).trim();
      let value = raw.slice(ix + 1).trim();
      if (key === 'showAnnouncement') {
        if (!['true','false'].includes(value.toLowerCase())) return ctx.reply('showAnnouncement harus true atau false.');
        value = value.toLowerCase() === 'true';
      }
      try {
        const out = await sendRazzaqWebsiteEvent({ event: 'content.update', data: { key, value } });
        return ctx.reply(`Website diperbarui.\nField: ${key}\nMode: ${out.result?.mode || 'unknown'}\nID: ${out.eventId}\nBuka ulang website untuk melihat perubahan.`);
      } catch (e) { return ctx.reply(`Gagal memperbarui konten.\n${e.message}`); }
    }
    if (['webproduct', 'rvproduct'].includes(cmd) && !String(ctx.text || '').trim()) {
      try {
        const result = await getRazzaqWebsiteContent();
        const rawProducts = result.products || result.catalog?.products || result.catalog || result.items || result.data?.products || [];
        const products = Array.isArray(rawProducts) ? rawProducts : [];
        if (!products.length) return ctx.reply('Katalog produk belum tersedia dari endpoint /api/v1/content. Pastikan API mengembalikan products[] dengan name, price, image/imageUrl dan description. Untuk memperbarui produk, gunakan .webproduct {JSON}.');
        const normalized = products.slice(0, 10).map((p, i) => ({
          name: String(p.name || p.title || p.productName || `Produk ${i + 1}`),
          description: String(p.description || p.summary || ''),
          price: p.price ?? p.unitPrice ?? null,
          image: p.image || p.imageUrl || p.image_url || p.thumbnail || p.thumbnailUrl || '',
          url: p.url || p.productUrl || p.link || 'https://razzaq-ventures-platform.vercel.app',
          sku: p.sku || p.id || ''
        }));
        const money = n => n == null || n === '' ? 'Hubungi kami' : `Rp${Number(n).toLocaleString('id-ID')}`;
        // Use the project carousel builder when its real API is available. The
        // current serializer ZIP may omit the helper module, so a safe image-card
        // fallback is retained and no builder methods are assumed blindly.
        const carousel = typeof ctx.carouselBuilder === 'function' ? ctx.carouselBuilder() : null;
        const cardBuilderFactory = typeof ctx.buttonBuilder === 'function' ? ctx.buttonBuilder : null;
        if (carousel && cardBuilderFactory && typeof carousel.addCard === 'function' && typeof carousel.send === 'function') {
          try {
            carousel.setBody('Katalog produk Razzaq Ventures').setFooter('Geser untuk melihat produk lainnya.');
            for (const p of normalized) {
              const cardBuilder = cardBuilderFactory()
                .setTitle(p.name)
                .setSubtitle(money(p.price))
                .setBody(`${money(p.price)}${p.description ? `\n${p.description}` : ''}`)
                .setFooter(p.sku ? `SKU: ${p.sku}` : 'Razzaq Ventures');
              if (p.image && /^https:\/\//i.test(p.image)) cardBuilder.setImage(p.image);
              cardBuilder.addUrl('Lihat Produk', p.url);
              const card = await cardBuilder.toCard();
              carousel.addCard(card);
            }
            return await carousel.send(ctx.chat, { quoted: ctx.raw });
          } catch (carouselError) {
            // Native carousel support varies by client/version; fall through to image cards.
          }
        }
        for (const p of normalized) {
          const body = `${p.name}\nHarga: ${money(p.price)}${p.sku ? `\nSKU: ${p.sku}` : ''}${p.description ? `\n\n${p.description}` : ''}`;
          if (p.image && /^https:\/\//i.test(p.image)) {
            await ctx.sendInteractive({ title: p.name, body, image: p.image, footer: 'Razzaq Ventures', buttons: [{ name: 'cta_url', title: 'Lihat Produk', url: p.url }] });
          } else {
            await ctx.sendInteractive({ title: p.name, body, footer: 'Gambar produk belum disetel.', buttons: [{ name: 'cta_url', title: 'Lihat Produk', url: p.url }] });
          }
        }
        return;
      } catch (e) { return ctx.reply(`Gagal memuat katalog produk.\n${e.message}\n\nUntuk mengubah data produk: .webproduct {JSON}`); }
    }
    const mapped = { websale: 'sale.record', rvsale: 'sale.record', webexpense: 'expense.record', rvexpense: 'expense.record', webproduct: 'product.update', rvproduct: 'product.update' };
    if (mapped[cmd]) {
      let data;
      try { data = JSON.parse(String(ctx.text || '').trim()); }
      catch { return ctx.reply(`Format: .${cmd} {JSON}\nGunakan .webhelp untuk contoh.`); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return ctx.reply('Payload harus berupa objek JSON.');
      try {
        const out = await sendRazzaqWebsiteEvent({ event: mapped[cmd], data });
        return ctx.reply(`Data berhasil dicatat.\nJenis: ${mapped[cmd]}\nMode: ${out.result?.mode || 'unknown'}\nID: ${out.eventId}`);
      } catch (e) { return ctx.reply(`Gagal menyimpan data.\n${e.message}`); }
    }
    // Advanced, allowlisted events only; website validates every event schema.
    const raw = String(ctx.text || '').trim();
    const splitAt = raw.indexOf(' ');
    if (splitAt < 1) return ctx.reply('Format: .webpush event.name {"key":"value"}\nGunakan .webhelp untuk daftar perintah.');
    const event = raw.slice(0, splitAt).trim();
    let data = {};
    try { data = JSON.parse(raw.slice(splitAt + 1).trim()); }
    catch { return ctx.reply('JSON tidak valid.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return ctx.reply('Payload harus berupa objek JSON.');
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 6000) return ctx.reply('Payload terlalu besar (maks. 6 KB).');
    try {
      const out = await sendRazzaqWebsiteEvent({ event, data });
      return ctx.reply(`*RAZZAQ VENTURES — WEBHOOK*\nEvent: ${event}\nID: ${out.eventId}\nHTTP: ${out.httpStatus}\nMode: ${out.result?.mode || 'unknown'}`);
    } catch (e) { return ctx.reply(`Gagal mengirim event.\n${e.message}`); }
  }
};

import os from 'node:os';

const esc = value => String(value ?? '-').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmt = ms => ms < 1000 ? `${ms.toFixed(1)} ms` : `${(ms / 1000).toFixed(2)} s`;

export default {
  command: ['ping', 'p'], category: 'general', cooldown: 2000,
  async execute(ctx) {
    const started = performance.now();
    const sentAt = Date.now();
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const status = 'OPERATIONAL';
    const latency = performance.now() - started;
    const title = 'WHISKAYBOT · SYSTEM PULSE';
    const body = `Status: ${status}\nRespons: ${fmt(latency)}\nUptime: ${Math.floor(uptime)} detik\nRAM: ${Math.round(memory.rss / 1024 / 1024)} MB\nRuntime: Node.js ${process.versions.node}`;
    const html = `<style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#080d18;color:#e9f1ff;font-family:Arial,sans-serif}.shell{max-width:520px;margin:auto;border:1px solid #293956;border-radius:18px;overflow:hidden;background:#0e1728}.hero{padding:18px;background:linear-gradient(120deg,#182944,#101827 70%);position:relative}.eyebrow{font-size:10px;letter-spacing:2px;color:#91a8c9;font-weight:700}.title{font-size:20px;font-weight:800;margin-top:7px}.sub{font-size:11px;color:#91a8c9;margin-top:5px}.pill{display:inline-block;margin-top:13px;border:1px solid #1d6d5c;border-radius:99px;background:#10372f;color:#7cf0c7;padding:6px 10px;font-size:10px;font-weight:800;letter-spacing:1px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#25344b}.metric{padding:14px;background:#101b2d;min-height:76px}.label{font-size:10px;color:#8ea3c1;text-transform:uppercase;letter-spacing:1px}.value{font-size:20px;font-weight:800;margin-top:8px;overflow-wrap:anywhere}.unit{font-size:10px;color:#a8bbd6;font-weight:500}.foot{padding:12px 16px;color:#8297b7;font-size:10px;border-top:1px solid #24334a;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}</style><div class="shell"><div class="hero"><div class="eyebrow">NEXORA SYSTEMS / BOT TELEMETRY</div><div class="title">WHISKAYBOT</div><div class="sub">Live diagnostic · WhatsApp runtime</div><div class="pill">● ${esc(status)}</div></div><div class="grid"><div class="metric"><div class="label">Response</div><div class="value">${esc(fmt(latency))}</div></div><div class="metric"><div class="label">Uptime</div><div class="value">${esc(Math.floor(uptime))}<span class="unit"> sec</span></div></div><div class="metric"><div class="label">RSS Memory</div><div class="value">${esc(Math.round(memory.rss / 1024 / 1024))}<span class="unit"> MB</span></div></div><div class="metric"><div class="label">Node Runtime</div><div class="value">${esc(process.versions.node)}</div></div></div><div class="foot"><span>Host: ${esc(os.platform())} · ${esc(os.arch())}</span><span>Checked: ${esc(new Date(sentAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))} WIB</span></div></div>`;
    try {
      const sock = ctx.sock;
      const rich = typeof ctx.airich === 'function' ? ctx.airich() : typeof ctx.rich === 'function' ? ctx.rich() : typeof sock?.airich === 'function' ? sock.airich() : null;
      if (rich && typeof rich.setTitle === 'function' && typeof rich.setFooter === 'function' && typeof rich.addText === 'function' && typeof rich.addSection === 'function' && typeof rich.send === 'function') {
        rich.setTitle(title).setFooter('Diagnostik runtime lokal; bukan pengukuran end-to-end jaringan WhatsApp.');
        if (typeof rich.addSubmessage === 'function') rich.addSubmessage({ messageType: 2, messageText: body });
        rich.addSection({ view_model: { __typename: 'GenAISingleLayoutViewModel', primitive: { __typename: 'FOAHtmlPrimitiveDemoDONOTUSE', trusted_sources: [], payload: html } } });
        return await rich.send(ctx.chat, { quoted: ctx.raw });
      }
    } catch (error) {
      console.error('[PING] AIRich card fallback:', error?.message || error);
    }
    return ctx.sendInteractive({ title, subtitle: 'Live runtime diagnostic', body, footer: 'Diagnostik runtime lokal; gunakan .ping untuk refresh.', buttons: [{ name: 'quick_reply', title: 'Refresh Ping', id: `${ctx.prefix}ping` }, { name: 'quick_reply', title: 'Lihat Menu', id: `${ctx.prefix}menu` }] });
  }
};

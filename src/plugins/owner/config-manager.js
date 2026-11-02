import { getEnvGroups, getEnvSettings, getEnvSetting, describeEnvValue, setEnvSetting, setPendingEnvInput } from '../../lib/env-config.js';
import { reloadConfigFromEnvFile, getEnvFilePath } from '../../config/index.js';

const groupTitle = id => getEnvGroups().find(item => item.id === id)?.title || id;
const isSecret = key => Boolean(getEnvSetting(key)?.secret);

export default {
  name: 'config-manager',
  command: ['config', 'envconfig'],
  category: 'owner',
  owner: true,
  cooldown: 1500,
  description: 'Pusat konfigurasi .env interaktif dengan validasi dan hot reload',
  async execute(ctx) {
    const [action = 'home', arg = '', ...rest] = ctx.args || [];
    const sub = String(action).toLowerCase();

    if (sub === 'status') {
      const total = getEnvSettings().length;
      const configured = getEnvSettings().filter(item => process.env[item.key] !== undefined && process.env[item.key] !== '').length;
      return ctx.sendInteractive({ title: '⚙️ WHISKAY · CONFIG STATUS', body: `Owner: ${process.env.OWNER_NAME || 'Arifi Razzaq'}\nSetting terdaftar: ${total}\nSudah memiliki nilai di process.env: ${configured}\nFile aktif: ${getEnvFilePath()}\nHot reload: ${String(process.env.ENV_RELOAD_ENABLED || 'true').toLowerCase() !== 'false' ? 'ON' : 'OFF'}\n\nSecret ditampilkan sebagai status saja, tidak pernah dikirim kembali dalam bentuk aslinya.`, buttons: [{ name: 'quick_reply', title: 'Buka Kategori', id: '.config' }, { name: 'quick_reply', title: 'Reload .env', id: '.config reload' }] });
    }

    if (sub === 'reload') {
      const result = await reloadConfigFromEnvFile();
      return ctx.reply(`♻️ .env dimuat ulang. Key berubah: ${result.changedKeys.length ? result.changedKeys.join(', ') : 'tidak ada perubahan terdeteksi'}. Restart tetap diperlukan untuk parameter service yang dibuat sekali saat boot.`);
    }

    if (sub === 'category' || sub === 'group') {
      const group = String(arg || '').toLowerCase();
      const settings = getEnvSettings(group);
      if (!settings.length) return ctx.reply('Kategori tidak ditemukan. Buka .config untuk melihat daftar kategori.');
      const pageSize = 10;
      const page = Math.max(0, Number.parseInt(rest[0] || '0', 10) || 0);
      const pageCount = Math.ceil(settings.length / pageSize);
      const safePage = Math.min(page, pageCount - 1);
      const rows = settings.slice(safePage * pageSize, (safePage + 1) * pageSize).map(item => ({ title: item.key, description: `${item.secret ? 'Rahasia' : 'Nilai'} · ${item.hotReloadable ? 'Hot reload' : 'Butuh restart'} · ${describeEnvValue(item)}`.slice(0, 72), id: `.config key ${item.key}` }));
      const buttons = [];
      if (safePage > 0) buttons.push({ name: 'quick_reply', title: '◀ Sebelumnya', id: `.config category ${group} ${safePage - 1}` });
      if (safePage < pageCount - 1) buttons.push({ name: 'quick_reply', title: 'Berikutnya ▶', id: `.config category ${group} ${safePage + 1}` });
      buttons.push({ name: 'quick_reply', title: 'Kembali', id: '.config' });
      return ctx.sendInteractive({ title: `⚙️ ${groupTitle(group)} · ${safePage + 1}/${pageCount}`, body: `Pilih key untuk mengubahnya. Secret hanya ditampilkan sebagai status.\nKey ${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, settings.length)} dari ${settings.length}.`, buttons: [{ name: 'single_select', title: 'Pilih pengaturan', sections: [{ title: 'Environment', rows }] }, ...buttons] });
    }

    if (sub === 'key' || sub === 'set') {
      const key = String(arg || '').trim().toUpperCase();
      const setting = getEnvSetting(key);
      if (!setting) return ctx.reply('Key tidak dikenal atau tidak dapat diubah melalui menu ini. Gunakan .config untuk daftar resmi.');
      const inlineValue = rest.join(' ');
      if (setting.secret && ctx.isGroup) return ctx.reply('🔐 Pengaturan secret hanya dapat diubah melalui chat pribadi bot. Buka DM bot lalu gunakan .config key ' + key + '.');
      if (sub === 'set' && inlineValue && !setting.secret) {
        try {
          const result = await setEnvSetting(key, inlineValue);
          return ctx.reply(`✅ ${key} diperbarui. ${result.hotReloadable ? 'Hot reload diterapkan.' : 'Restart diperlukan untuk service yang membaca nilai saat boot.'}`);
        } catch (error) { return ctx.reply(`⚠️ ${error.message}`); }
      }
      if (setting.secret && inlineValue) return ctx.reply('🔐 Untuk keamanan, API key/token hanya boleh dimasukkan dengan membalas pesan permintaan input; jangan tulis secret sebagai argumen command.');
      const prompt = await ctx.reply(`⚙️ *SET ENV · ${key}*\n${setting.description || ''}\nStatus saat ini: ${describeEnvValue(setting)}\n\nBalas pesan ini dengan nilai baru. Untuk mengosongkan nilai, kirim __EMPTY__. Ketik BATAL untuk membatalkan.`);
      if (prompt?.key?.id) setPendingEnvInput({ sender: ctx.sender, chat: ctx.chat, promptId: prompt.key.id, key });
      return;
    }

    if (sub === 'home' || sub === 'list' || sub === 'help') {
      const groups = getEnvGroups();
      const sections = groups.map(group => ({ title: group.title, rows: [{ title: 'Buka pengaturan', description: group.description, id: `.config category ${group.id}` }] }));
      return ctx.sendInteractive({
        title: '⚙️ WHISKAY · CONFIGURATION CENTER',
        subtitle: `Owner control · ${getEnvSettings().length} environment keys`,
        body: [
          'Pusat pengaturan terkurasi untuk .env. Pilih kategori → pilih key → balas pesan prompt dengan nilai baru.',
          '',
          '🛡️ Proteksi: owner-only, whitelist key, validasi tipe, penulisan atomik, file permission 0600, secret masking.',
          '🔄 Hot refresh: konfigurasi yang aman diperbarui langsung; port, binary, direktori, dan parameter boot diberi label restart-required.',
          '',
          'Perintah: .config status · .config reload · .config key NAMA_KEY'
        ].join('\n'),
        buttons: [{ name: 'single_select', title: 'Pilih kategori', sections }, { name: 'quick_reply', title: 'Status konfigurasi', id: '.config status' }, { name: 'quick_reply', title: 'Reload .env', id: '.config reload' }]
      });
    }

    return ctx.reply('Format: .config | .config category identity | .config key BOT_NAME | .config set BOT_NAME WhiskayBot | .config status | .config reload');
  }
};

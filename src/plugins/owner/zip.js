import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execP = promisify(_exec);

async function has(cmd) {
  try { await execP('command -v ' + cmd); return true; } catch { return false; }
}

export default {
  command: ['zip', 'backup'],
  aliases: ['archive'],
  category: 'owner',
  owner: true,
  cooldown: 15000,
  description: 'Kirim backup source (tanpa sessions & node_modules)',
  async execute(ctx) {
    const cwd = process.cwd();
    const zipAvail = await has('zip');
    const ext = zipAvail ? 'zip' : 'tar.gz';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `whiskay-backup-${stamp}.${ext}`;
    const out = path.join(os.tmpdir(), name);

    await ctx.reply(`📦 Membuat backup (${ext})...\n⏳ Bisa memakan waktu, tunggu ya.`);

    const excludes = ['node_modules', 'sessions', '.git', '*.zip', '*.tar.gz', '*.log'];

    let cmd;
    if (zipAvail) {
      const exArgs = excludes.map(e => `-x '${e}' '${e}/*'`).join(' ');
      cmd = `cd '${cwd}' && zip -rq '${out}' . ${exArgs}`;
    } else {
      const exArgs = excludes.map(e => `--exclude='./${e}' --exclude='${e}'`).join(' ');
      cmd = `cd '${cwd}' && tar ${exArgs} -czf '${out}' .`;
    }

    try {
      await execP(cmd, { maxBuffer: 500 * 1024 * 1024, shell: '/bin/bash' });
      const st = await stat(out);
      const sizeMB = (st.size / 1024 / 1024).toFixed(2);
      const buf = await readFile(out);

      await ctx.sock.sendMessage(ctx.chat, {
        document: buf,
        mimetype: zipAvail ? 'application/zip' : 'application/gzip',
        fileName: name,
        caption: `✅ *Backup Selesai*\n📦 ${name}\n📊 ${sizeMB} MB\n🚫 Exclude: node_modules, sessions, .git`
      }, { quoted: ctx.raw });

      await unlink(out).catch(() => {});
    } catch (e) {
      await ctx.reply('❌ Gagal backup: ' + e.message);
    }
  }
};

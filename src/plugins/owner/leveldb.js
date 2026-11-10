import { getLevelingStorageStatus, restoreLevelingFromBackup } from '../../lib/leveling.js';

export default {
  name: 'leveling-database-control',
  command: ['leveldb'],
  category: 'owner',
  owner: true,
  cooldown: 2000,
  description: 'Status penyimpanan XP/level, arsip, dan pemulihan backup',
  async execute(ctx) {
    const action = String(ctx.args?.[0] || 'status').toLowerCase();
    if (action === 'restore') {
      const result = await restoreLevelingFromBackup();
      return ctx.sendInteractive({
        title: result.restored ? 'Pemulihan Leveling Selesai' : 'Backup Leveling Tidak Tersedia',
        body: result.restored ? `Database leveling dipulihkan dari sumber valid:\n${result.source}\n\nPeriksa .profile dan .leaderboard setelah pemulihan.` : 'Tidak ditemukan backup atau arsip yang dapat dipulihkan. File aktif tidak dihapus.',
        buttons: [{ name: 'quick_reply', title: 'Status Database', id: `${ctx.prefix}leveldb status` }, { name: 'quick_reply', title: 'Lihat Profil', id: `${ctx.prefix}profile` }]
      });
    }
    if (action !== 'status') return ctx.reply(`Format: ${ctx.prefix}leveldb status|restore`);
    const s = await getLevelingStorageStatus();
    const mb = (s.bytes / 1024 / 1024).toFixed(2);
    const threshold = (s.archiveThreshold / 1024 / 1024).toFixed(0);
    const health = s.primaryStatus === 'VALID' && s.backupStatus === 'VALID' ? 'NORMAL' : 'CHECK REQUIRED';
    return ctx.sendInteractive({
      title: 'WHISKAY · LEVELING STORAGE',
      subtitle: 'XP · Level · Coin · Recovery',
      body: `Status: ${health}\nLokasi data: ${s.root}\nFile database: ${s.dataFile||s.file}\nWorking directory: ${s.processCwd}\nPrimary: ${s.primaryStatus} (${mb} MB)\nBackup: ${s.backupStatus} (${(s.backupBytes / 1024 / 1024).toFixed(2)} MB)\nAmbang snapshot arsip: ${threshold} MB\nArsip tersimpan: ${s.archiveCount}\nProfil tersimpan: ${s.users}\nMapping LID → PN: ${s.identityAliases||0}\nTotal XP tersimpan: ${s.xpTotal}\nPembaruan terakhir: ${s.updatedAt || '-'}\n\nPenyimpanan memakai atomic replace, validasi database, backup generasi sebelumnya, process lock, pemulihan backup/arsip, dan snapshot gzip saat ambang tercapai. Kegagalan backup membatalkan penulisan agar database utama tidak tertimpa.`,
      buttons: [{ name: 'quick_reply', title: 'Refresh Status', id: `${ctx.prefix}leveldb status` }, { name: 'quick_reply', title: 'Pulihkan Backup', id: `${ctx.prefix}leveldb restore` }, { name: 'quick_reply', title: 'Profil Saya', id: `${ctx.prefix}profile` }]
    });
  }
};

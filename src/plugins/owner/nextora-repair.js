import {
  listNextoraFailures, getNextoraFailure, diagnoseNextoraFailure,
  prepareNextoraRepair, testNextoraRepair, saveNextoraRepair
} from '../../services/nextora-repair/NextoraRepairService.js';

const help = '.nextora inbox | inspect <id> | repair <id> | test <id> | save <id>';

export default {
  name: 'nextora-repair',
  command: ['nextora'],
  menuCommands: ['nextora'],
  category: 'owner',
  owner: true,
  cooldown: 3000,
  description: 'Nextora autonomous repair queue, sandbox test, and owner-approved save',
  async execute(ctx) {
    const [action = 'inbox', id] = ctx.args || [];
    if (action === 'inbox' || action === 'list') {
      const tasks = await listNextoraFailures();
      if (!tasks.length) return ctx.sendInteractive({ title: 'NEXORA · Repair Inbox', body: 'Belum ada command error yang tercatat.', buttons: [{ name: 'quick_reply', title: 'Refresh', id: `${ctx.prefix}nextora inbox` }] });
      const rows = tasks.map(task => ({
        title: `${task.command || 'command'} · ${task.status}`.slice(0, 24),
        description: `${task.id} · ${task.error}`.slice(0, 72),
        id: `${ctx.prefix}nextora inspect ${task.id}`
      }));
      return ctx.sendInteractive({ title: 'NEXORA · Repair Inbox', body: `${tasks.length} task terakhir. Pilih untuk melihat analisis.`, buttons: [{ name: 'single_select', title: 'Pilih Error', sections: [{ title: 'Repair Tasks', rows }] }] });
    }
    if (!id) return ctx.reply(`Gunakan: ${help}`);
    if (action === 'inspect') {
      const task = await getNextoraFailure(id);
      if (!task) throw new Error('Task tidak ditemukan.');
      const result = await diagnoseNextoraFailure(id);
      return ctx.sendInteractive({
        title: `NEXORA · Analisis ${id}`,
        body: `Command: ${task.command}\nError: ${task.error}\nFile sumber: ${task.sourceFile || 'Tidak terpetakan'}\nDependency diperiksa: ${result.report.dependencyCount}\n\n${result.report.likelyCauses.join('\n')}`,
        buttons: [{ name: 'quick_reply', title: 'Perbaiki dengan Nexora', id: `${ctx.prefix}nextora repair ${id}` }, { name: 'quick_reply', title: 'Inbox', id: `${ctx.prefix}nextora inbox` }]
      });
    }
    if (action === 'repair') {
      const result = await prepareNextoraRepair(id);
      return ctx.sendInteractive({
        title: `NEXORA · Proposal Siap`,
        body: `Task: ${id}\nFile target: ${result.proposal.targetFile}\nRingkasan: ${result.proposal.summary}\nAkar masalah: ${result.proposal.rootCause}\n\nPatch hanya disimpan di staging. Source produksi belum diubah.`,
        buttons: [{ name: 'quick_reply', title: 'Uji Testing', id: `${ctx.prefix}nextora test ${id}` }, { name: 'quick_reply', title: 'Batalkan / Inbox', id: `${ctx.prefix}nextora inbox` }]
      });
    }
    if (action === 'test') {
      const result = await testNextoraRepair(id);
      return ctx.sendInteractive({
        title: 'NEXORA · Testing Lulus',
        body: `Task: ${id}\nTarget: ${result.targetFile}\nTest suite: ${result.testScript}\nStatus: PASS\n\nSource produksi belum diubah. Tekan Simpan untuk menerapkan patch yang sudah diuji.`,
        buttons: [{ name: 'quick_reply', title: 'Simpan Perbaikan', id: `${ctx.prefix}nextora save ${id}` }, { name: 'quick_reply', title: 'Inbox', id: `${ctx.prefix}nextora inbox` }]
      });
    }
    if (action === 'save') {
      const result = await saveNextoraRepair(id);
      return ctx.sendInteractive({
        title: 'NEXORA · Perbaikan Disimpan',
        body: `File: ${result.targetFile}\nBackup: ${result.backup}\nWaktu: ${new Date(result.savedAt).toLocaleString('id-ID')}\n\nPerubahan sudah diterapkan setelah testing dan persetujuan owner. Reload plugin secara terkontrol diperlukan agar source baru aktif.`,
        buttons: [{ name: 'quick_reply', title: 'Reload Plugin', id: `${ctx.prefix}reload` }, { name: 'quick_reply', title: 'Inbox', id: `${ctx.prefix}nextora inbox` }]
      });
    }
    return ctx.reply(`Aksi tidak dikenal.\n${help}`);
  }
};

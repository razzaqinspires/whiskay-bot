import {
  getEffectiveAdzanProfile, requestAdzanLocation, setAdzanTimezone,
  clearAdzanUserLocation, clearAdzanOwnerDefault, getAdzanProfileStoreStatus, setPersonalAdzanEnabled, setPersonalAdzanAudioEnabled, getPersonalAdzanPreferences, getPersonalAdzanDeliveryStats, updatePersonalAdzanSettings, getPersonalAdzanActivity
} from '../../services/AdzanProfileStore.js';
import { getAdzanSettings, updateAdzanSettings, DEFAULT_TIMES } from '../../services/AdzanManager.js';
import { getPersonalAdzanSchedule, getPersonalAdzanIntelligence, getPersonalAdzanRange, getPersonalAdzanCalendarFile, formatCountdown } from '../../services/AdzanEngineService.js';
import { getAdzanAudioStatus } from '../../services/AdzanAudioService.js';

const formatLocation = (profile, { privateView = true } = {}) => {
  if (!profile.location) return 'Belum ada lokasi yang dikonfigurasi.';
  const { latitude, longitude, name, address, mapUrl } = profile.location;
  if (!privateView) return [name, address, 'Lokasi tersimpan (detail koordinat disembunyikan di grup).'].filter(Boolean).join('\n');
  return [name, address, `Koordinat: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, `Peta: ${mapUrl}`].filter(Boolean).join('\n');
};
const usage = 'Perintah lokasi:\n.adzan lokasi — atur lokasi pribadi\n.adzan default — atur lokasi default (owner)\n.adzan timezone Asia/Jakarta — zona waktu pribadi\n.adzan default-timezone Asia/Jakarta — zona waktu default (owner)\n.adzan clear — hapus lokasi pribadi\n.adzan jadwal — lihat jadwal hari ini\n.adzan on/off — aktif/nonaktifkan notifikasi adzan pribadi via DM\n.adzan audio on/off/status/pack default|custom — preferensi audio pribadi\n.adzan metode indonesia|mwl|egyptian — metode hitung\n.adzan koreksi subuh|zuhur|asar|magrib|isya -30..30 — koreksi menit\n.adzan riwayat — aktivitas pengiriman\n.adzan berikutnya — hitung mundur salat berikutnya\n.adzan kiblat — arah kiblat\n.adzan hijriah — tanggal Hijriah perkiraan\n.adzan mingguan/bulanan — ringkasan jadwal\n.adzan ics — ekspor kalender\n.adzan pengingat 0..30 — pengingat sebelum adzan\n.adzan automasi — status automasi\n.adzan jumat on|off|HH:mm — pengingat Jumat\n.adzan ramadan on|off — pengingat Ramadan\n.adzan sahur 0..120 — menit sebelum Subuh (0=off)\n.adzan iftar on|off|0..60 — pengingat berbuka';

export default {
  name: 'adzan-reminder', command: ['adzan'], category: 'tools', cooldown: 1500,
  energyMode: 'free', energyCost: 0,
  description: 'Pengaturan wilayah adzan personal dengan lokasi WhatsApp dan zona waktu IANA',
  async execute(ctx) {
    const [rawAction = 'status', value = ''] = ctx.args || [];
    const action = String(rawAction).toLowerCase();
    const user = ctx.sender;
    if (!user) return ctx.reply('Identitas pengguna tidak tersedia.');

    if (action === 'lokasi' || action === 'location') {
      if (ctx.isGroup) return ctx.reply('Demi privasi koordinat GPS, jalankan .adzan lokasi melalui chat pribadi dengan bot.');
      const request = await requestAdzanLocation(user);
      return ctx.sendInteractive({
        title: '📍 Atur Lokasi Adzan Pribadi',
        body: `Kirim lokasi WhatsApp sebagai *Current Location* dalam 10 menit.\nLokasi ini hanya digunakan untuk menghitung jadwal adzan akunmu.\n\n${new Date(request.expiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB batas waktu permintaan.`,
        buttons: [{ name: 'quick_reply', title: 'Cek Status Lokasi', id: `${ctx.prefix}adzan status` }]
      });
    }

    if (action === 'default') {
      if (ctx.isGroup) return ctx.reply('Demi privasi koordinat GPS, owner harus mengatur lokasi default melalui chat pribadi dengan bot.');
      if (!ctx.isOwner) return ctx.reply('Hanya owner yang dapat menetapkan lokasi default bot.');
      const request = await requestAdzanLocation(user, { ownerDefault: true });
      return ctx.reply(`📍 Kirim *Current Location* WhatsApp untuk menjadikannya wilayah default seluruh pengguna yang belum mengatur lokasi pribadi. Permintaan berlaku sampai ${new Date(request.expiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB.`);
    }

    if (action === 'timezone' || action === 'default-timezone') {
      const ownerDefault = action === 'default-timezone';
      if (ownerDefault && !ctx.isOwner) return ctx.reply('Hanya owner yang dapat mengubah zona waktu default.');
      try {
        const profile = await setAdzanTimezone(user, value, { ownerDefault, isOwner: Boolean(ctx.isOwner) });
        return ctx.reply(`✅ Zona waktu ${ownerDefault ? 'default' : 'pribadi'} disimpan: *${value}*.\nSumber wilayah: ${profile.source}.`);
      } catch (error) { return ctx.reply(`Tidak dapat menyimpan zona waktu: ${error.message}`); }
    }

    if (action === 'metode' || action === 'method') {
      if (ctx.isGroup) return ctx.reply('Pengaturan metode pribadi hanya melalui chat pribadi.');
      const method = String(value || 'status').toLowerCase();
      const map = { indonesia: 'indonesia-kemenag-reference', kemenag: 'indonesia-kemenag-reference', mwl: 'mwl', egyptian: 'egyptian' };
      if (method === 'status') { const p = await getEffectiveAdzanProfile(user); return ctx.reply(`Metode perhitungan: *${p.methodId}*\nPilihan: indonesia, mwl, egyptian`); }
      if (!map[method]) return ctx.reply('Format: .adzan metode indonesia | mwl | egyptian');
      await updatePersonalAdzanSettings(user, { methodId: map[method] });
      return ctx.reply(`✅ Metode perhitungan pribadi diubah menjadi *${map[method]}*. Cocokkan hasilnya dengan jadwal resmi setempat.`);
    }

    if (action === 'koreksi' || action === 'correction') {
      if (ctx.isGroup) return ctx.reply('Koreksi waktu pribadi hanya melalui chat pribadi.');
      const prayerMap = { subuh: 'fajr', zuhur: 'dhuhr', dzuhur: 'dhuhr', asar: 'asr', ashar: 'asr', magrib: 'maghrib', maghrib: 'maghrib', isya: 'isha' };
      const prayer = prayerMap[String(value || '').toLowerCase()];
      const amount = Number(ctx.args?.[2]);
      if (!prayer || !Number.isInteger(amount) || Math.abs(amount) > 30) return ctx.reply('Format: .adzan koreksi subuh +2\nRentang koreksi -30 sampai +30 menit.');
      const profile = await getEffectiveAdzanProfile(user);
      const corrections = { ...(profile.corrections || {}), [prayer]: amount };
      await updatePersonalAdzanSettings(user, { corrections });
      return ctx.reply(`✅ Koreksi ${value} disimpan: ${amount > 0 ? '+' : ''}${amount} menit.`);
    }

    if (action === 'riwayat' || action === 'history') {
      if (ctx.isGroup) return ctx.reply('Riwayat pengiriman pribadi hanya dapat dilihat melalui chat pribadi.');
      const history = await getPersonalAdzanActivity(user, 10);
      if (!history.length) return ctx.reply('Belum ada riwayat pengiriman adzan.');
      const names = { fajr: 'Subuh', dhuhr: 'Zuhur', asr: 'Asar', maghrib: 'Magrib', isha: 'Isya', jummah: 'Pengingat Jumat', sahur: 'Pengingat Sahur', iftar: 'Pengingat Berbuka', 'pre-fajr': 'Pra-Subuh', 'pre-dhuhr': 'Pra-Zuhur', 'pre-asr': 'Pra-Asar', 'pre-maghrib': 'Pra-Magrib', 'pre-isha': 'Pra-Isya' };
      return ctx.reply(`📋 *RIWAYAT ADZAN TERAKHIR*\n\n${history.map(item => `• ${names[item.prayer] || item.prayer} · ${item.date} · ${item.status} · percobaan ${item.attempts}${item.cancelReason ? ` · ${item.cancelReason}` : ''}`).join('\n')}`);
    }

    if (action === 'audio') {
      if (ctx.isGroup) return ctx.reply('Pengaturan audio pribadi hanya dapat diubah melalui chat pribadi dengan bot.');
      const audioAction = String(value || 'status').toLowerCase();
      if (audioAction === 'on' || audioAction === 'off') {
        const enabled = await setPersonalAdzanAudioEnabled(user, audioAction === 'on');
        return ctx.reply(enabled ? '🔊 Audio adzan pribadi diaktifkan. Jika file audio belum tersedia, bot otomatis mengirim teks.' : '🔕 Audio adzan dinonaktifkan. Kamu tetap menerima pengingat teks jika langganan adzan aktif.');
      }
      if (audioAction === 'pack') {
        const pack = String(ctx.args?.[2] || '').toLowerCase();
        if (!['default', 'custom'].includes(pack)) return ctx.reply('Format: .adzan audio pack default | custom\nPaket custom memakai custom-subuh.mp3 dan custom-umum.mp3.');
        await updatePersonalAdzanSettings(user, { audioPack: pack });
        return ctx.reply(`✅ Paket audio pribadi: *${pack}*. ${pack === 'custom' ? 'Pastikan file custom sudah dipasang; jika tidak tersedia, bot menggunakan teks.' : 'Menggunakan audio standar.'}`);
      }
      if (audioAction === 'status' || audioAction === 'check') {
        const [preferences, files] = await Promise.all([getPersonalAdzanPreferences(user), getAdzanAudioStatus()]);
        return ctx.reply(`🔊 *PREFERENSI AUDIO ADZAN*\nAudio pribadi: ${preferences.audioEnabled ? 'AKTIF' : 'NONAKTIF'}\nPaket audio: ${preferences.audioPack}\nFile Subuh: ${files.files.fajr.available ? 'tersedia' : 'belum dipasang'}\nFile salat lainnya: ${files.files.others.available ? 'tersedia' : 'belum dipasang'}\nPaket custom Subuh: ${files.customFiles.fajr.available ? 'tersedia' : 'belum dipasang'}\nPaket custom lainnya: ${files.customFiles.others.available ? 'tersedia' : 'belum dipasang'}\n\nNama file: \`subuh.mp3\` dan \`umum.mp3\`\nFolder: \`media/adzan\` (atau ADZAN_AUDIO_DIR)\nBatas ukuran tiap file: 20 MB.`);
      }
      return ctx.reply('Format: .adzan audio on | off | status | pack default|custom');
    }

    if ((action === 'on' || action === 'off') && !ctx.isGroup) {
      const profile = await getEffectiveAdzanProfile(user);
      if (!profile.location || !profile.timezone) return ctx.reply('Lokasi/zona waktu belum siap. Atur dahulu dengan .adzan lokasi dan .adzan timezone Asia/Jakarta.');
      const enabled = await setPersonalAdzanEnabled(user, action === 'on');
      return ctx.reply(enabled
        ? '✅ Notifikasi waktu salat pribadi AKTIF. Bot akan mengirim pengingat ke chat pribadi ini sesuai lokasi dan zona waktumu.'
        : '🔕 Notifikasi waktu salat pribadi NONAKTIF.');
    }

    if (['berikutnya', 'next', 'kiblat', 'qibla', 'hijriah', 'hijri'].includes(action)) {
      if (ctx.isGroup) return ctx.reply('Informasi wilayah pribadi hanya tersedia melalui chat pribadi.');
      try {
        const data = await getPersonalAdzanIntelligence(user);
        if (['kiblat', 'qibla'].includes(action)) return ctx.reply(`🧭 *ARAH KIBLAT*\nArah: *${data.qibla.degrees.toFixed(2)}°* dari utara sejati\nKompas: *${data.qibla.compass}*\nReferensi: Ka'bah, Makkah\n\nArah ini adalah bearing geografis; gunakan kompas yang telah dikalibrasi dan koreksi deklinasi magnetik perangkat.`);
        if (['hijriah', 'hijri'].includes(action)) return ctx.reply(`🌙 *KALENDER HIJRIAH PERKIRAAN*\n${data.hijri.day} ${data.hijri.monthName} ${data.hijri.year} H\nTanggal Masehi: ${data.schedule.date}\nMetode: kalender tabular-civil (hisab), bukan penetapan rukyat resmi.`);
        const labels = { fajr: 'Subuh', dhuhr: 'Zuhur', asr: 'Asar', maghrib: 'Magrib', isha: 'Isya' };
        return ctx.reply(`⏳ *SALAT BERIKUTNYA*\n${labels[data.next.prayer]} · *${data.next.time}*\nHitung mundur: *${formatCountdown(data.next.inSeconds)}*\nTanggal: ${data.schedule.date}\nZona waktu: ${data.profile.timezone}`);
      } catch (error) { return ctx.reply(`Informasi belum tersedia: ${error.message}`); }
    }

    if (['mingguan', 'weekly', 'bulanan', 'monthly'].includes(action)) {
      if (ctx.isGroup) return ctx.reply('Ringkasan jadwal pribadi hanya tersedia melalui chat pribadi.');
      try {
        const days = ['bulanan', 'monthly'].includes(action) ? 30 : 7;
        const range = await getPersonalAdzanRange(user, days);
        const labels = [['fajr','Subuh'],['dhuhr','Zuhur'],['asr','Asar'],['maghrib','Magrib'],['isha','Isya']];
        const lines = range.map(day => `${day.date}: ${labels.map(([key,label]) => `${label} ${day.times[key].time}`).join(' · ')}`);
        return ctx.reply(`🗓️ *JADWAL SALAT ${days === 7 ? '7 HARI' : '30 HARI'}*\nZona waktu: ${ (await getEffectiveAdzanProfile(user)).timezone }\n\n${lines.join('\n')}\n\n_Perhitungan astronomis perkiraan; verifikasi dengan otoritas/masjid setempat._`);
      } catch (error) { return ctx.reply(`Jadwal belum dapat dibuat: ${error.message}`); }
    }

    if (action === 'ics' || action === 'kalender') {
      if (ctx.isGroup) return ctx.reply('Ekspor kalender pribadi hanya tersedia melalui chat pribadi.');
      try {
        const file = await getPersonalAdzanCalendarFile(user);
        return ctx.sock.sendMessage(ctx.chat, { document: Buffer.from(file.content, 'utf8'), mimetype: 'text/calendar', fileName: file.filename, caption: `🗓️ Kalender waktu salat ${file.profile.location.name || 'lokasi pribadi'} · ${file.profile.timezone}` }, { quoted: ctx.raw });
      } catch (error) { return ctx.reply(`Ekspor kalender gagal: ${error.message}`); }
    }

    if (action === 'pengingat' || action === 'prealert') {
      if (ctx.isGroup) return ctx.reply('Pengingat awal hanya dapat diatur melalui chat pribadi.');
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 30) return ctx.reply('Format: .adzan pengingat 0..30\n0 = nonaktif; 1–30 = menit sebelum adzan.');
      await updatePersonalAdzanSettings(user, { preAlertMinutes: minutes });
      return ctx.reply(minutes ? `⏰ Pengingat awal aktif: ${minutes} menit sebelum setiap waktu salat. Pengingat dikirim sebagai teks.` : '🔕 Pengingat awal dinonaktifkan. Notifikasi tepat waktu tetap mengikuti pengaturan .adzan on/off.');
    }

    if (['automasi', 'automation'].includes(action)) {
      if (ctx.isGroup) return ctx.reply('Pengaturan automasi pribadi hanya dapat dibuka melalui chat pribadi.');
      const p = await getPersonalAdzanPreferences(user);
      return ctx.sendInteractive({
        title: '🤖 ADZAN SMART AUTOMATION',
        body: `Pengingat Jumat: ${p.fridayReminderEnabled ? `AKTIF · ${p.fridayReminderTime}` : 'NONAKTIF'}\nPengingat Ramadan: ${p.ramadanReminderEnabled ? 'AKTIF' : 'NONAKTIF'}\nSahur: ${p.sahurReminderMinutes ? `${p.sahurReminderMinutes} menit sebelum Subuh` : 'NONAKTIF'}\nBerbuka: ${p.iftarReminderEnabled ? `${p.iftarReminderMinutes ? `${p.iftarReminderMinutes} menit sebelum Magrib` : 'saat Magrib'}` : 'NONAKTIF'}\n\nSemua pengingat dikirim sebagai teks melalui DM dan memerlukan .adzan on. Kalender Ramadan menggunakan estimasi tabular-civil, bukan penetapan rukyat.`,
        buttons: [
          { name: 'quick_reply', title: p.fridayReminderEnabled ? '🔕 Jumat OFF' : '🕌 Jumat ON', id: `${ctx.prefix}adzan jumat ${p.fridayReminderEnabled ? 'off' : 'on'}` },
          { name: 'quick_reply', title: p.ramadanReminderEnabled ? '🌙 Ramadan OFF' : '🌙 Ramadan ON', id: `${ctx.prefix}adzan ramadan ${p.ramadanReminderEnabled ? 'off' : 'on'}` },
          { name: 'quick_reply', title: '⏳ Sahur 30 menit', id: `${ctx.prefix}adzan sahur 30` },
          { name: 'quick_reply', title: '🌅 Berbuka ON', id: `${ctx.prefix}adzan iftar on` }
        ]
      });
    }

    if (action === 'jumat' || action === 'jummah' || action === 'friday') {
      if (ctx.isGroup) return ctx.reply('Pengingat Jumat pribadi hanya dapat diatur melalui chat pribadi.');
      const setting = String(value || 'status').toLowerCase();
      if (setting === 'on' || setting === 'off') {
        await updatePersonalAdzanSettings(user, { fridayReminderEnabled: setting === 'on' });
        return ctx.reply(setting === 'on' ? '🕌 Pengingat Jumat aktif. Kamu akan menerima pengingat setiap Jumat pada jam yang tersimpan.' : '🔕 Pengingat Jumat dinonaktifkan.');
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(setting)) {
        const p = await getPersonalAdzanPreferences(user);
        return ctx.reply(`Pengingat Jumat: ${p.fridayReminderEnabled ? 'AKTIF' : 'NONAKTIF'}\nJam: ${p.fridayReminderTime}\nFormat: .adzan jumat on | off | HH:mm`);
      }
      await updatePersonalAdzanSettings(user, { fridayReminderEnabled: true, fridayReminderTime: setting });
      const profile = await getEffectiveAdzanProfile(user);
      return ctx.reply(`✅ Pengingat Jumat aktif setiap Jumat pukul *${setting}* (${profile.timezone}).`);
    }

    if (action === 'ramadan' || action === 'ramadhan') {
      if (ctx.isGroup) return ctx.reply('Pengingat Ramadan pribadi hanya dapat diatur melalui chat pribadi.');
      const setting = String(value || 'status').toLowerCase();
      if (!['on', 'off'].includes(setting)) {
        const p = await getPersonalAdzanPreferences(user);
        return ctx.reply(`Pengingat Ramadan: ${p.ramadanReminderEnabled ? 'AKTIF' : 'NONAKTIF'}\nFormat: .adzan ramadan on | off`);
      }
      await updatePersonalAdzanSettings(user, { ramadanReminderEnabled: setting === 'on' });
      return ctx.reply(setting === 'on'
        ? '🌙 Pengingat Ramadan aktif. Bot menjadwalkan pengingat sahur dan berbuka saat kalender Hijriah perkiraan menunjukkan bulan Ramadan. Pastikan .adzan on aktif.'
        : '🔕 Pengingat sahur dan berbuka Ramadan dinonaktifkan.');
    }

    if (action === 'sahur') {
      if (ctx.isGroup) return ctx.reply('Pengingat sahur pribadi hanya dapat diatur melalui chat pribadi.');
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120) return ctx.reply('Format: .adzan sahur 0..120\n0 = nonaktif; 1–120 = menit sebelum Subuh.');
      await updatePersonalAdzanSettings(user, { sahurReminderMinutes: minutes });
      return ctx.reply(minutes ? `⏳ Pengingat sahur akan dikirim ${minutes} menit sebelum Subuh selama automasi Ramadan aktif.` : '🔕 Pengingat sahur dinonaktifkan.');
    }

    if (action === 'iftar' || action === 'berbuka') {
      if (ctx.isGroup) return ctx.reply('Pengingat berbuka pribadi hanya dapat diatur melalui chat pribadi.');
      const setting = String(value || 'status').toLowerCase();
      if (setting === 'on' || setting === 'off') {
        await updatePersonalAdzanSettings(user, { iftarReminderEnabled: setting === 'on' });
        return ctx.reply(setting === 'on' ? '🌅 Pengingat berbuka aktif saat Magrib selama automasi Ramadan aktif.' : '🔕 Pengingat berbuka dinonaktifkan.');
      }
      const minutes = Number(setting);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60) return ctx.reply('Format: .adzan iftar on | off | 0..60\n0 = saat Magrib; 1–60 = menit sebelum Magrib.');
      await updatePersonalAdzanSettings(user, { iftarReminderEnabled: true, iftarReminderMinutes: minutes });
      return ctx.reply(minutes ? `🌅 Pengingat berbuka aktif ${minutes} menit sebelum Magrib selama automasi Ramadan aktif.` : '🌅 Pengingat berbuka aktif tepat pada waktu Magrib selama automasi Ramadan aktif.');
    }

    if (action === 'jadwal' || action === 'schedule') {
      try {
        const { profile, schedule } = await getPersonalAdzanSchedule(user);
        const labels = [['fajr', 'Subuh'], ['dhuhr', 'Zuhur'], ['asr', 'Asar'], ['maghrib', 'Magrib'], ['isha', 'Isya']];
        const rows = labels.map(([key, label]) => `${label}: *${schedule.times[key].time}*`).join('\n');
        return ctx.reply(`🕌 *JADWAL SALAT HARI INI*\nTanggal: ${schedule.date}\nZona waktu: ${profile.timezone}\nWilayah: ${profile.location.name || 'Lokasi tersimpan'}\nSumber lokasi: ${profile.source}\nMetode: ${schedule.method.name}\n\n${rows}\n\n_Catatan: perhitungan astronomis perkiraan, bukan keluaran resmi SIHAT/Kemenag. Verifikasi dengan jadwal otoritas/masjid setempat._`);
      } catch (error) { return ctx.reply(`Jadwal belum dapat dihitung: ${error.message}`); }
    }

    if (action === 'clear') {
      const removed = await clearAdzanUserLocation(user);
      return ctx.reply(removed ? 'Lokasi pribadi dihapus. Akunmu sekarang mengikuti wilayah default owner.' : 'Belum ada lokasi pribadi yang tersimpan.');
    }
    if (action === 'clear-default') {
      if (!ctx.isOwner) return ctx.reply('Hanya owner yang dapat menghapus lokasi default.');
      await clearAdzanOwnerDefault(user, true);
      return ctx.reply('Lokasi default owner dihapus. Pengguna tanpa lokasi pribadi perlu mengatur wilayah sendiri.');
    }

    if (action === 'admin') {
      if (!ctx.isOwner) return ctx.reply('Panel kontrol Adzan hanya tersedia untuk owner.');
      const [storage, audio, delivery] = await Promise.all([getAdzanProfileStoreStatus(), getAdzanAudioStatus(), getPersonalAdzanDeliveryStats()]);
      const fmt = item => item.available ? `SIAP (${(item.sizeBytes / 1024 / 1024).toFixed(2)} MB)` : 'BELUM TERSEDIA / TIDAK VALID';
      return ctx.reply(`🛠️ *ADZAN CONTROL CENTER*\n\n*Database*\nUtama: ${storage.files.primary.exists ? 'OK' : 'BELUM ADA'} (${storage.files.primary.bytes} byte)\nBackup: ${storage.files.backup.exists ? 'OK' : 'BELUM ADA'}\nProfil pengguna: ${storage.users}\n\n*Audio*\nSubuh: ${fmt(audio.files.fajr)}\nUmum: ${fmt(audio.files.others)}\nFolder: ${audio.directory}\nBatas: 20 MB/file\n\n*Delivery Outbox*\nAntrean: ${delivery.queued}\nTerkirim: ${delivery.delivered}\nGagal permanen: ${delivery.dead}\nDibatalkan/stale: ${delivery.cancelled || 0}\nTotal tercatat: ${delivery.total}\n\n*Retry policy*\nMaksimum 5 percobaan; jeda 1, 5, 15, dan 30 menit.\n\nGunakan \.adzan audio check untuk memeriksa file audio.`);
    }

    if (action === 'status') {
      const [profile, storage, audioPrefs, audioFiles] = await Promise.all([getEffectiveAdzanProfile(user), getAdzanProfileStoreStatus(), getPersonalAdzanPreferences(user), getAdzanAudioStatus()]);
      const own = profile.hasOwnLocation ? 'Lokasi pribadi' : profile.source === 'owner-default' ? 'Mengikuti default owner' : 'Belum dikonfigurasi';
      const tzSource = profile.hasOwnTimezone ? 'pribadi' : 'default';
      return ctx.sendInteractive({
        title: '🕌 ADZAN · PREFERENSI WILAYAH',
        subtitle: `Sumber: ${own}`,
        body: `${formatLocation(profile, { privateView: !ctx.isGroup })}\n\nZona waktu: ${profile.timezone} (${tzSource})\nMetode: ${profile.methodId}\nKoreksi: ${Object.entries(profile.corrections || {}).map(([k,v]) => `${k} ${v > 0 ? '+' : ''}${v}m`).join(', ') || 'default'}\nPaket audio: ${profile.audioPack || 'default'}\nPengingat awal: ${profile.preAlertMinutes || 0} menit\nAutomasi Jumat: ${audioPrefs.fridayReminderEnabled ? `aktif ${audioPrefs.fridayReminderTime}` : 'nonaktif'}\nAutomasi Ramadan: ${audioPrefs.ramadanReminderEnabled ? `aktif · sahur ${audioPrefs.sahurReminderMinutes}m · iftar ${audioPrefs.iftarReminderEnabled ? `${audioPrefs.iftarReminderMinutes}m` : 'off'}` : 'nonaktif'}\n\nDatabase: ${storage.files.primary.exists ? 'tersimpan' : 'belum dibuat'} · Backup: ${storage.files.backup.exists ? 'tersedia' : 'belum tersedia'}\nProfil personal: ${storage.users}\nAudio: ${audioPrefs.audioEnabled ? 'aktif' : 'nonaktif'} · Subuh ${audioFiles.files.fajr.available ? 'siap' : 'belum ada'} · Umum ${audioFiles.files.others.available ? 'siap' : 'belum ada'}`,
        buttons: [
          { name: 'quick_reply', title: '📍 Atur Lokasi Saya', id: `${ctx.prefix}adzan lokasi` },
          { name: 'quick_reply', title: '🕌 Lihat Jadwal', id: `${ctx.prefix}adzan jadwal` },
          { name: 'quick_reply', title: '🔊 Pengaturan Audio', id: `${ctx.prefix}adzan audio status` },
          { name: 'quick_reply', title: '📋 Riwayat Pengiriman', id: `${ctx.prefix}adzan riwayat` },
          { name: 'quick_reply', title: '🤖 Smart Automation', id: `${ctx.prefix}adzan automasi` },
          { name: 'quick_reply', title: '🧮 Metode Hitung', id: `${ctx.prefix}adzan metode status` },
          { name: 'quick_reply', title: profile.adzanEnabled ? '🔕 Matikan Notifikasi' : '🔔 Aktifkan Notifikasi', id: `${ctx.prefix}adzan ${profile.adzanEnabled ? 'off' : 'on'}` },
          ...(ctx.isOwner ? [{ name: 'quick_reply', title: '🌐 Atur Default Owner', id: `${ctx.prefix}adzan default` }] : []),
          { name: 'quick_reply', title: 'Hapus Lokasi Saya', id: `${ctx.prefix}adzan clear` }
        ]
      });
    }

    // Preserve the existing manual group reminder controls during Stage 2 migration.
    if (['on', 'off', 'set', 'manual-status'].includes(action)) {
      if (!ctx.isGroup) return ctx.reply('Pengingat manual grup hanya tersedia di grup. Preferensi wilayah pribadi tetap bisa diatur lewat .adzan lokasi.');
      if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('Hanya admin grup atau owner yang dapat mengatur pengingat manual grup.');
      const settings = await getAdzanSettings(ctx.chat);
      if (action === 'set') {
        const prayer = String(value).toLowerCase(), time = String(ctx.args?.[2] || '');
        if (!Object.hasOwn(DEFAULT_TIMES, prayer) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return ctx.reply(`Format: .adzan set subuh 04:45\nNama: ${Object.keys(DEFAULT_TIMES).join(', ')}`);
        const saved = await updateAdzanSettings(ctx.chat, { times: { ...settings.times, [prayer]: time } });
        return ctx.reply(`Jadwal manual ${prayer} disimpan: ${time}.`);
      }
      if (action === 'on' || action === 'off') {
        const saved = await updateAdzanSettings(ctx.chat, { enabled: action === 'on' });
        return ctx.reply(`Pengingat manual grup: ${saved.enabled ? 'AKTIF' : 'NONAKTIF'}. Catatan: fitur ini masih memakai jadwal manual lama.`);
      }
      return ctx.reply(`Pengingat manual: ${settings.enabled ? 'AKTIF' : 'NONAKTIF'}\n${Object.entries(settings.times).map(([k, v]) => `${k}: ${v}`).join('\n')}`);
    }

    return ctx.reply(usage);
  }
};

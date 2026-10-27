const TRUTHS = [
  'Apa keputusan kecil yang paling kamu syukuri?', 'Apa kebiasaan yang ingin kamu perbaiki?', 'Siapa orang yang paling menginspirasimu dan kenapa?',
  'Apa hal lucu yang pernah membuatmu malu?', 'Apa kemampuan baru yang ingin kamu pelajari?', 'Apa kebaikan sederhana yang pernah kamu terima?',
  'Apa target yang ingin kamu capai bulan ini?', 'Apa film atau lagu yang selalu membuatmu bersemangat?', 'Apa hal yang paling kamu hargai dalam persahabatan?',
  'Kapan terakhir kali kamu keluar dari zona nyaman?'
];
const DARES = [
  'Kirim satu pujian tulus kepada anggota grup (tanpa mengejek).', 'Ceritakan satu fakta unik tentang dirimu.', 'Buat pantun empat baris tentang hari ini.',
  'Tulis pesan motivasi maksimal 20 kata.', 'Sebutkan tiga hal yang membuatmu tertawa.', 'Gunakan satu emoji untuk menggambarkan suasana hatimu dan jelaskan.',
  'Rekomendasikan satu lagu beserta alasannya.', 'Tulis ucapan terima kasih kepada seseorang yang membantumu.'
];
const pick = list => list[Math.floor(Math.random() * list.length)];
export default {
  name: 'truth-dare', command: ['truth','dare','tod','truthdare'], category: 'games', cooldown: 1500,
  description: 'Permainan Truth or Dare dengan tombol pilihan',
  async execute(ctx) {
    const choice = String(ctx.args?.[0] || '').toLowerCase();
    const send = (kind, text) => ctx.sendInteractive({ title: '🎲 TRUTH OR DARE', subtitle: 'WHISKAY · FUN ROOM', body: `${kind}\n\n${text}\n\nLewati tantangan jika membuatmu tidak nyaman. Dilarang meminta data pribadi, tindakan berbahaya, atau pelecehan.`, footer: 'Pilih lagi untuk ronde berikutnya.', buttons: [{name:'quick_reply',title:'💬 Truth',id:'.truth'},{name:'quick_reply',title:'🔥 Dare',id:'.dare'}] });
    if (ctx.command === 'truth' || choice === 'truth') return send('💬 TRUTH', pick(TRUTHS));
    if (ctx.command === 'dare' || choice === 'dare') return send('🔥 DARE', pick(DARES));
    return send('Pilih mode', 'Tekan Truth untuk pertanyaan jujur atau Dare untuk tantangan ringan.');
  }
};

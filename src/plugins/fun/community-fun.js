const pick = list => list[Math.floor(Math.random() * list.length)];
const tidy = (value, max = 220) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export const FUN_DATA = {
  eightball: [
    'Tanda-tandanya mengarah ke iya.', 'Belum bisa dipastikan; coba lagi nanti.',
    'Peluangnya bagus, tetapi tetap gunakan pertimbanganmu.', 'Sebaiknya jangan mengandalkan hasil ini.',
    'Fokus ke hal yang bisa kamu kendalikan.', 'Jawabannya belum jelas untuk saat ini.',
    'Bisa saja—rencanakan langkah berikutnya dengan matang.', 'Lebih baik tunda keputusan besar dan cari informasi tambahan.'
  ],
  fact: [
    'Gurita memiliki tiga jantung; dua membantu mengalirkan darah ke insang.',
    'Satu hari di Venus lebih panjang daripada satu tahun Venus.',
    'Madu yang disimpan dengan baik dapat bertahan sangat lama karena kadar airnya rendah dan sifatnya asam.',
    'Hiu telah ada sebelum pohon pertama muncul dalam catatan fosil.',
    'Petir dapat memanaskan udara di sekitarnya hingga jauh lebih panas daripada permukaan Matahari.',
    'Wombat menghasilkan kotoran berbentuk kubus; bentuknya terbentuk di usus.'
  ],
  joke: [
    'Kenapa programmer suka kopi? Karena hidupnya penuh Java.',
    'Aku mau jadi awan: terlihat santai, padahal banyak beban air.',
    'Kenapa kalender kelihatan sibuk? Karena hari-harinya penuh.',
    'Wi-Fi putus bukan berarti hubungan harus ikut putus—coba cek routernya dulu.'
  ],
  compliment: [
    'Kamu punya cara sendiri untuk membuat suasana terasa lebih ringan.',
    'Usahamu tetap berarti, bahkan ketika hasilnya belum terlihat.',
    'Kamu layak mendapat apresiasi atas hal-hal kecil yang terus kamu lakukan.',
    'Semoga hari ini kamu bisa melihat sisi baik dari dirimu sendiri.'
  ],
  flirt: [
    'Kalau senyum bisa jadi notifikasi, sepertinya aku baru dapat pesan darimu.',
    'Kamu bukan Wi-Fi, tapi suasana jadi lebih nyambung saat kamu hadir.',
    'Aku bukan peramal, tapi obrolan yang baik bisa jadi awal cerita menarik.'
  ],
  insult: [
    'Roasting ringan: loading-mu bukan lambat, kamu sedang memberi waktu dunia untuk bersiap.',
    'Kamu bukan error, cuma fitur eksperimental yang belum selesai diuji.',
    'Energi tokoh utama, manajemen waktunya tokoh yang lupa alarm.'
  ],
  quote: [
    'Kemajuan kecil yang konsisten sering lebih kuat daripada rencana besar yang tidak dimulai.',
    'Tidak semua jeda adalah kemunduran; kadang itu ruang untuk menyusun arah.',
    'Kita tidak selalu bisa memilih keadaan, tetapi bisa belajar memilih langkah selanjutnya.'
  ],
  shayari: [
    'Langit senja perlahan merona, angin membawa cerita; semoga langkahmu hari ini ditemani kabar gembira.',
    'Bintang kecil menghias malam, bulan menjaga sunyi; semoga lelahmu menemukan rehat dan harapan tumbuh kembali.'
  ],
  roseday: [
    '🌹 Setangkai mawar untuk mengingatkanmu bahwa perhatian sederhana pun bisa membuat hari lebih indah.',
    '🌹 Semoga harimu tumbuh seperti mawar: berani mekar, tetap lembut, dan tidak kehilangan warna.'
  ]
};

const LABELS = {
  eightball: '🔮 WHISKAY · MAGIC 8-BALL', fact: '🧠 WHISKAY · FAKTA SINGKAT',
  joke: '😄 WHISKAY · JOKE BREAK', compliment: '✨ WHISKAY · APRESIASI',
  flirt: '💌 WHISKAY · GOMBAL SANTAI', insult: '🫣 WHISKAY · ROASTING RAMAH',
  quote: '📜 WHISKAY · KUTIPAN', shayari: '🌙 WHISKAY · SHAYARI', roseday: '🌹 WHISKAY · ROSE DAY'
};
const HELP = `Command hiburan Whiskay:\n.eightball [pertanyaan] · .fact · .joke · .compliment\n.flirt · .insult · .quote · .shayari · .roseday · .trivia\n\nKonten bersifat hiburan. Fakta disajikan sebagai trivia umum; untuk keputusan penting, verifikasi dari sumber tepercaya.`;
const QUESTIONS = [
  { q: 'Planet terbesar di Tata Surya adalah …', options: ['Jupiter', 'Mars', 'Merkurius', 'Venus'], answer: 0, note: 'Jupiter adalah planet terbesar berdasarkan diameter dan massa.' },
  { q: 'Rumus kimia air adalah …', options: ['CO₂', 'H₂O', 'O₂', 'NaCl'], answer: 1, note: 'Satu molekul air terdiri dari dua atom hidrogen dan satu atom oksigen.' },
  { q: 'Bahasa yang menjadi standar utama untuk struktur halaman web adalah …', options: ['HTML', 'SQL', 'Bash', 'CSV'], answer: 0, note: 'HTML menyusun struktur konten halaman web.' },
  { q: 'Hewan mamalia yang dapat terbang aktif adalah …', options: ['Tupai terbang', 'Kelelawar', 'Lemur', 'Sugar glider'], answer: 1, note: 'Kelelawar adalah mamalia yang mampu melakukan penerbangan aktif.' },
  { q: 'Berapa sisi yang dimiliki segitiga?', options: ['2', '3', '4', '5'], answer: 1, note: 'Segitiga memiliki tiga sisi.' },
  { q: 'Proses tumbuhan menggunakan cahaya untuk membuat gula disebut …', options: ['Fermentasi', 'Fotosintesis', 'Evaporasi', 'Kondensasi'], answer: 1, note: 'Fotosintesis menggunakan energi cahaya untuk membantu membentuk senyawa organik.' }
];
const triviaSessions = new Map();
const sessionKey = ctx => `${String(ctx.chat || '')}|${String(ctx.sender || '')}`;
export function createTriviaRound(random = Math.random) {
  const item = QUESTIONS[Math.floor(random() * QUESTIONS.length)];
  return { ...item, id: Math.random().toString(36).slice(2, 9), expiresAt: Date.now() + 120_000 };
}
export function evaluateTrivia(round, index) {
  const n = Number(index);
  if (!round || !Number.isInteger(n) || n < 0 || n >= round.options.length) return { valid: false, correct: false };
  return { valid: true, correct: n === round.answer, note: round.note };
}
export default {
  name: 'community-fun',
  command: ['funhelp','eightball','8ball','fact','joke','compliment','flirt','insult','quote','shayari','roseday','trivia'],
  aliases: ['magic8ball','funfact','pickup'],
  menuCommands: ['eightball','fact','joke','compliment','flirt','insult','quote','shayari','roseday','trivia'],
  category: 'fun', cooldown: 1800,
  description: 'Hiburan lokal, kutipan, fakta singkat, dan trivia interaktif',
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    if (cmd === 'funhelp') return ctx.sendInteractive({ title: '🎲 Whiskay Fun Center', body: HELP, buttons: [
      { name: 'quick_reply', title: '🎱 Magic 8-Ball', id: `${ctx.prefix}eightball apakah hari ini beruntung?` },
      { name: 'quick_reply', title: '🧠 Fakta', id: `${ctx.prefix}fact` },
      { name: 'single_select', title: 'Aktivitas Lain', sections: [{ title: 'Fun', rows: ['joke','compliment','flirt','insult','quote','shayari','roseday','trivia'].map(k => ({ title: `.${k}`, description: `Jalankan ${k}`, id: `${ctx.prefix}${k}` })) }] }
    ] });
    if (cmd === 'trivia') {
      const sub = String(ctx.args?.[0] || '').toLowerCase();
      const key = sessionKey(ctx);
      if (sub === 'answer') {
        const [, id, rawIndex] = ctx.args || [];
        const round = triviaSessions.get(key);
        if (!round || round.id !== id || round.expiresAt < Date.now()) {
          triviaSessions.delete(key);
          return ctx.sendInteractive({ title: '⏱️ Ronde berakhir', body: 'Ronde trivia tidak ditemukan atau sudah kedaluwarsa. Mulai ronde baru untuk menerima pilihan yang valid.', buttons: [{ name: 'quick_reply', title: 'Mulai Trivia', id: `${ctx.prefix}trivia` }] });
        }
        const result = evaluateTrivia(round, rawIndex);
        triviaSessions.delete(key);
        return ctx.sendInteractive({ title: result.correct ? '✅ Jawaban benar' : '❌ Belum tepat', body: `${round.q}\n\n${result.correct ? 'Tepat!' : `Jawaban benar: ${round.options[round.answer]}.`}\n${round.note}\n\nPoin RPG tidak berubah oleh mode trivia ini.`, buttons: [{ name: 'quick_reply', title: 'Ronde Berikutnya', id: `${ctx.prefix}trivia` }, { name: 'quick_reply', title: 'Menu', id: `${ctx.prefix}menu` }] });
      }
      const round = createTriviaRound(); triviaSessions.set(key, round);
      const buttons = round.options.map((label, index) => ({ name: 'quick_reply', title: `${String.fromCharCode(65 + index)}. ${label}`.slice(0, 22), id: `${ctx.prefix}trivia answer ${round.id} ${index}` }));
      buttons.push({ name: 'single_select', title: 'Bantuan Trivia', sections: [{ title: 'Aksi', rows: [{ title: 'Batal / menu', id: `${ctx.prefix}menu` }] }] });
      return ctx.sendInteractive({ title: '🧠 WHISKAY · TRIVIA', subtitle: 'Satu ronde · 2 menit', body: `${round.q}\n\nPilih satu jawaban. Jawaban akan dinilai pada ronde ini saja.`, buttons });
    }
    if (cmd === 'eightball' || cmd === '8ball' || cmd === 'magic8ball') {
      const question = tidy(ctx.args?.join(' '), 180);
      if (!question) return ctx.sendInteractive({ title: LABELS.eightball, body: 'Kirim pertanyaan yang bisa dijawab secara santai. Contoh: .eightball apakah sebaiknya aku mulai belajar sekarang?', buttons: [{ name: 'quick_reply', title: 'Contoh pertanyaan', id: `${ctx.prefix}eightball apakah ide baruku menarik?` }, { name: 'quick_reply', title: 'Menu Fun', id: `${ctx.prefix}funhelp` }] });
      return ctx.sendInteractive({ title: LABELS.eightball, body: `Pertanyaan: ${question}\n\n${pick(FUN_DATA.eightball)}\n\n_Hiburan acak, bukan prediksi atau saran profesional._`, buttons: [{ name: 'quick_reply', title: 'Tanya Lagi', id: `${ctx.prefix}eightball ${question}` }, { name: 'quick_reply', title: 'Menu Fun', id: `${ctx.prefix}funhelp` }] });
    }
    const content = FUN_DATA[cmd];
    if (!content) return ctx.reply('Command hiburan tidak dikenal. Gunakan .funhelp untuk melihat daftar.');
    return ctx.sendInteractive({ title: LABELS[cmd], body: pick(content), buttons: [{ name: 'quick_reply', title: 'Lagi', id: `${ctx.prefix}${cmd}` }, { name: 'single_select', title: 'Fun Center', sections: [{ title: 'Pilih hiburan', rows: ['eightball','fact','joke','compliment','flirt','insult','quote','shayari','roseday','trivia'].map(k => ({ title: `.${k}`, id: `${ctx.prefix}${k}` })) }] }] });
  }
};

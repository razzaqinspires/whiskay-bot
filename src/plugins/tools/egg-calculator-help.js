export default {
  name: 'egg-calculator-help',
  command: ['egghelp', 'bantuantelur'],
  menuCommands: [],
  description: 'Panduan singkat kalkulator telur',
  category: 'tools',
  cooldown: 1500,
  async execute(ctx) {
    return ctx.sendInteractive({
      title: 'Panduan Kalkulator Telur',
      subtitle: 'Tiga langkah untuk transaksi cepat',
      body: '1. Masukkan uang yang diberikan pembeli.\n2. Masukkan harga satu butir telur.\n3. Tekan Hitung transaksi.\n\nContoh: Rp10.000 ÷ Rp1.700 = 5,88. Ambil angka bulat ke bawah, jadi 5 butir. Total 5 × Rp1.700 = Rp8.500. Kembalian Rp10.000 − Rp8.500 = Rp1.500.\n\nAngka desimal tidak dibulatkan ke atas karena pembeli belum cukup uang untuk membeli butir berikutnya.',
      footer: 'Perintah: .telur untuk membuka website kalkulator.',
      buttons: [{ name: 'quick_reply', title: 'Buka Kalkulator', id: `${ctx.prefix}telur` }]
    });
  }
};

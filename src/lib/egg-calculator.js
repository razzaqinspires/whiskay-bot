export function calculateEggTransaction(uangInput, hargaInput) {
  const uang = Number(uangInput);
  const harga = Number(hargaInput);
  if (!Number.isFinite(uang) || !Number.isFinite(harga) || uang <= 0 || harga <= 0) {
    throw new Error('Uang dan harga harus berupa angka positif.');
  }
  if (!Number.isSafeInteger(uang) || !Number.isSafeInteger(harga)) {
    throw new Error('Gunakan nominal Rupiah berupa bilangan bulat tanpa desimal.');
  }
  if (uang > 1_000_000_000 || harga > 100_000_000) {
    throw new Error('Nominal melewati batas aman kalkulator.');
  }
  const jumlah = Math.floor(uang / harga);
  const total = jumlah * harga;
  const kembalian = Math.max(0, uang - total);
  const kurang = Math.max(0, harga - uang);
  return { uang, harga, jumlah, total, kembalian, kurang };
}

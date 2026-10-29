/** Locale helper: message text stays out of handlers. */
const catalogs = {
  id: { event: { argsRequired: 'Masukkan teks terlebih dahulu.', mentionRequired: 'Mention atau balas pesan target.', quoteRequired: 'Balas pesan yang dimaksud.', premiumRequired: 'Fitur ini khusus premium.', mediaRequired: 'Lampirkan atau balas media yang dibutuhkan.', urlRequired: 'Kirim tautan yang valid.', handlerError: 'Fitur gagal dijalankan. Coba lagi nanti.' } },
  en: { event: { argsRequired: 'Please provide the required text.', mentionRequired: 'Mention or reply to the target.', quoteRequired: 'Reply to the target message.', premiumRequired: 'This feature requires premium access.', mediaRequired: 'Attach or reply to the required media.', urlRequired: 'Please provide a valid link.', handlerError: 'The feature failed. Please try again later.' } }
};
export function getLocale(locale = 'id') { return catalogs[String(locale).toLowerCase()] || catalogs.id; }
export function formatLocale(locale, path, vars = {}) { const value = String(path || '').split('.').reduce((o, k) => o?.[k], getLocale(locale)); return String(value ?? path ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')); }

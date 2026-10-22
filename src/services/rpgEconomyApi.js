import { dashboardPlayerId } from './dungeonWebsiteSync.js';

const TIMEOUT_MS = Math.max(1500, Math.min(15000, Number(process.env.RPG_ECONOMY_TIMEOUT_MS || 8000)));
const baseUrl = () => String(process.env.DUNGEON_WEBSITE_URL || process.env.WEBSITE_BASE_URL || 'https://whiskay-rpg-companion.vercel.app').replace(/\/+$/, '');

export async function rpgEconomyRequest(ctx, route, payload = {}) {
  const token = String(process.env.DUNGEON_SYNC_TOKEN || process.env.BOT_SYNC_TOKEN || '').trim();
  if (!token) throw new Error('ECONOMY_NOT_CONFIGURED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl()}${route}`, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ userId: dashboardPlayerId(ctx.chat, ctx.sender), ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result?.ok) return result;
    const error = new Error(String(result?.error || `HTTP_${response.status}`));
    error.status = response.status;
    error.data = result;
    throw error;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('ECONOMY_TIMEOUT');
    if (error instanceof TypeError) throw new Error('ECONOMY_UNREACHABLE');
    throw error;
  } finally { clearTimeout(timer); }
}

export function economyErrorText(error) {
  const code = error?.message;
  if (code === 'ECONOMY_NOT_CONFIGURED') return '⚠️ Sistem ekonomi belum dikonfigurasi. Admin perlu mengatur DUNGEON_SYNC_TOKEN.';
  if (code === 'ECONOMY_TIMEOUT') return '⏱️ Server terlalu lama merespons. Status transaksi belum pasti—cek inventory sebelum mengulang.';
  if (code === 'ECONOMY_UNREACHABLE') return '📡 Server RPG tidak dapat dijangkau. Coba lagi nanti.';
  if (error?.status === 401) return '🔒 Autentikasi bot ditolak server. Samakan token bot dan website.';
  if (code === 'insufficient_gold') return `💰 Gold tidak cukup. Dibutuhkan ${Number(error.data?.price || 0).toLocaleString('id-ID')} Gold; saldo kamu ${Number(error.data?.gold || 0).toLocaleString('id-ID')} Gold.`;
  if (code === 'insufficient_item') return '🎒 Item itu tidak tersedia di inventory.';
  if (code === 'listing_not_found') return '🏷️ Listing tidak ditemukan atau sudah dibeli.';
  if (code === 'cannot_buy_own_listing') return '🏷️ Kamu tidak bisa membeli listing milik sendiri.';
  if (code === 'invalid_listing') return 'Format listing tidak valid. Gunakan .auction sell <item-id> <harga>.';
  if (code === 'database_not_configured') return '⚠️ Database belum dikonfigurasi pada website RPG.';
  if (code === 'already_in_guild') return '🏰 Kamu sudah menjadi anggota guild.';
  if (code === 'guild_not_found') return '🏰 Guild tidak ditemukan. Periksa ID guild.';
  if (code === 'guild_name_taken') return '🏰 Nama guild sudah digunakan. Pilih nama lain.';
  if (code === 'not_guild_leader') return '🔒 Hanya leader guild yang dapat mengeluarkan anggota.';
  if (code === 'not_guild_member') return '🏰 Kamu belum bergabung dengan guild.';
  if (code === 'member_not_found') return '👤 Anggota tersebut tidak ditemukan dalam guild kamu.';
  if (code === 'invalid_guild_name') return 'Nama guild harus terdiri dari 3–32 karakter.';
  if (code === 'insufficient_materials') return `🧱 Material belum cukup. ${error.data?.message || 'Periksa material yang diperlukan.'}`;
  if (code === 'insufficient_item') return '🎒 Item yang ingin ditransfer tidak tersedia dalam jumlah cukup.';
  if (code === 'recipient_not_found') return '👤 Snapshot pemain tujuan belum ditemukan. Pastikan pemain sudah pernah membuka RPG di grup ini.';
  if (code === 'cannot_trade_self') return '🤝 Kamu tidak bisa melakukan trade ke diri sendiri.';
  if (code === 'invalid_trade') return 'Format trade tidak valid. Gunakan: .trade @user gold 100 atau .trade @user potion-small 1';
  if (code === 'recipe_not_found') return '📜 Resep tidak ditemukan. Gunakan: .craft potion';
  return '⚠️ Transaksi gagal atau belum dapat dikonfirmasi. Coba lagi nanti; jangan mengulang transaksi yang statusnya belum jelas.';
}

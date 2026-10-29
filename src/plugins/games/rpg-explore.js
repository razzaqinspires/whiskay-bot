import ExploreReport from '../general/explore.js';
const events = [
  ['🌿 Jejak Spirit','Kamu menemukan jejak spirit di dekat hutan. Catat lokasinya dan bersiap menghadapi monster.'],
  ['🐺 Monster terlihat','Seekor monster mengintai dari balik pepohonan. Jaga HP sebelum bertarung.'],
  ['⛏️ Deposit mineral','Kamu melihat mineral berkilau. Dekati resource di dunia untuk mengumpulkan material.'],
  ['🧭 Penanda kuno','Sebuah penanda kuno menunjuk ke arah gerbang Dungeonia.'],
  ['🌧️ Perubahan cuaca','Kabut turun dan jarak pandang berkurang. Perjalanan berisiko lebih tinggi.'],
  ['✨ Resonansi checkpoint','Checkpoint terdekat beresonansi. Gunakan .enterdungeon untuk menyinkronkan titik masuk.']
];
export default { name:'rpg-explore', command:['explore','enterdungeon'], category:'games', description:'Jelajahi dunia dan sinkronkan checkpoint dungeon', cooldown:5000, energyMode:'static', energyCost:1.5, async execute(ctx) {
  if (ctx.command === 'explore' && ['stats','commands','rekomendasi'].includes(String(ctx.args?.[0]||'').toLowerCase())) return ExploreReport.execute(ctx);
  if (ctx.command === 'explore') { const [title, body] = events[Math.floor(Math.random()*events.length)]; return ctx.reply(`🌍 *OPEN WORLD — LAPORAN EKSPEDISI*\n\n*${title}*\n${body}\n\nCheckpoint: gunakan .enterdungeon untuk membuat tautan masuk yang tersinkron.`); }
  const { dashboardPlayerId } = await import('../../services/dungeonWebsiteSync.js');
  const crypto = await import('node:crypto');
  const secret = String(process.env.DUNGEON_SYNC_TOKEN || process.env.BOT_SYNC_TOKEN || '').trim();
  const base = String(process.env.DUNGEON_WEBSITE_URL || '').replace(/\/+$/,'');
  if (!secret || !base) return ctx.reply('⚠️ Akses dungeon belum dikonfigurasi. Atur DUNGEON_WEBSITE_URL dan DUNGEON_SYNC_TOKEN.');
  const player = dashboardPlayerId(ctx.chat,ctx.sender), exp = Math.floor(Date.now()/1000)+900;
  const payload = Buffer.from(JSON.stringify({player,exp,nonce:crypto.randomBytes(8).toString('hex')})).toString('base64url');
  const sig = crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  const link = `${base}/adventure?access=${payload}.${sig}&player=${player}&enter=dungeon`;
  return ctx.reply(`🌀 *CHECKPOINT DUNGEONIA DISINKRONKAN*\nTautan akses berlaku 15 menit dan terikat ke karakter WhatsApp ini.\n\n${link}\n\nBuka tautan ini untuk melanjutkan karakter dan berjalan menuju gua utama.`);
}};

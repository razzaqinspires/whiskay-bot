import { readFile } from 'node:fs/promises';
const TERMAI_JSON = 'https://c.termai.cc/json/';
const DB_URL = 'https://raw.githubusercontent.com/Rifza123/lib/refs/heads/main/db/';
const GAME_TYPES = {
  tebakgambar: { title: 'TEBAK GAMBAR', reward: 35, data: [{ question: 'Gambar apa yang sering disebut sebagai simbol cinta?', answer: 'hati', hint: 'Organ tubuh yang memompa darah; juga simbol cinta.', localImage: 'heart.png' }, { question: 'Benda apa yang ditunjukkan oleh gambar ini?', answer: 'jam', hint: 'Dipakai untuk melihat waktu.', localImage: 'clock.png' }] },
  susunkata: { title: 'SUSUN KATA', reward: 25, data: [{ type: 'Kota', question: 'D N A E M', answer: 'medan' }, { type: 'Hewan', question: 'C I N G U K', answer: 'kucing' }, { type: 'Buah', question: 'G N A P E', answer: 'pepang' }] },
  family100: { title: 'FAMILY 100', reward: 75, multi: true, data: [{ question: 'Sebutkan sesuatu yang biasanya ada di dapur.', answer: ['kompor', 'panci', 'wajan', 'pisau', 'sendok', 'piring', 'kulkas', 'gelas', 'rice cooker', 'blender'] }, { question: 'Sebutkan hewan yang hidup di air.', answer: ['ikan', 'hiu', 'paus', 'lumba-lumba', 'gurita', 'udang', 'kepiting', 'ubur-ubur'] }] },
  tebakanime: { title: 'TEBAK ANIME', reward: 35, data: [{ question: 'Tokoh utama berambut pirang yang bercita-cita menjadi Hokage.', answer: 'naruto', hint: 'Nama keluarganya Uzumaki.' }, { question: 'Kapten Topi Jerami dalam One Piece.', answer: 'luffy', hint: 'Nama lengkapnya Monkey D. ...' }] },
  caklontong: { title: 'CAK LONTONG', reward: 45, data: [{ question: 'Apa yang selalu naik tetapi tidak pernah turun?', answer: 'umur', hint: 'Bertambah setiap ulang tahun.', description: 'Jawaban sederhana sering paling tepat.' }, { question: 'Apa yang punya banyak gigi tetapi tidak bisa menggigit?', answer: 'sisir', hint: 'Dipakai untuk merapikan rambut.', description: 'Benda yang biasa ada di kamar mandi.' }] },
  asahotak: { title: 'ASAH OTAK', reward: 40, data: [{ question: 'Aku punya kota tetapi tidak punya rumah, punya hutan tetapi tidak punya pohon. Apakah aku?', answer: 'peta', hint: 'Bisa menunjukkan lokasi.' }, { question: 'Semakin diambil, semakin besar. Apakah itu?', answer: 'lubang', hint: 'Bisa dibuat dengan menggali.' }] },
  tebakjenaka: { title: 'TEBAK JENAKA', reward: 30, data: [{ question: 'Apa yang punya leher tetapi tidak punya kepala?', answer: 'botol', hint: 'Tempat menyimpan minuman.' }, { question: 'Apa yang punya kaki tetapi tidak bisa berjalan?', answer: 'meja', hint: 'Perabot untuk menaruh barang.' }] },
  tebakbendera: { title: 'TEBAK BENDERA', reward: 35, data: [{ question: 'Negara apa yang benderanya merah putih dengan dua warna horizontal?', answer: 'indonesia', hint: 'Negara kepulauan di Asia Tenggara.' }, { question: 'Bendera dengan daun maple merah di tengah berlatar putih dan merah berasal dari negara apa?', answer: 'kanada', hint: 'Negara di Amerika Utara.' }] },
  tebaktebakan: { title: 'TEBAK-TEBAKAN', reward: 30, data: [{ question: 'Apa yang bisa berjalan tanpa kaki?', answer: 'waktu', hint: 'Tidak bisa dihentikan.' }, { question: 'Apa yang basah saat mengeringkan?', answer: 'handuk', hint: 'Dipakai setelah mandi.' }] },
  tebaklirik: { title: 'TEBAK LIRIK', reward: 40, data: [{ question: 'Lengkapi ungkapan umum: “Indonesia tanah airku, tanah tumpah darahku...” (jawab satu kata: nama negara)', answer: 'indonesia', hint: 'Nama negara kita.' }, { question: 'Lengkapi: “Balonku ada lima, rupa-rupa...” (jawab warna)', answer: 'warna', hint: 'Kata setelah “rupa-rupa”.' }] }
};
const sessions = new Map();
const pollSessions = new Map();
const OPTION_PREFIXES = ['A', 'B', 'C', 'D'];
const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const pick = list => list[Math.floor(Math.random() * list.length)];
const keyFor = ctx => String(ctx.chat || ctx.sender || 'unknown');
const gameLabel = type => GAME_TYPES[type]?.title || type;
async function fetchRemote(type) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const url = type === 'tebakbendera' ? `${DB_URL}countries.json` : `${TERMAI_JSON}${encodeURIComponent(type)}.json`;
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const reader = response.body?.getReader?.();
    if (!reader) return null;
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) { await reader.cancel().catch(() => {}); return null; }
      chunks.push(Buffer.from(value));
    }
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (type === 'tebakbendera') {
      const values = Object.values(json || {}).filter(x => typeof x === 'string' && /^[\p{L} -]{2,60}$/u.test(x));
      const name = pick(values);
      return name ? { question: 'Negara apa yang memiliki bendera ini?', answer: name, hint: `Nama negara terdiri dari ${name.length} karakter.`, remoteImage: `${DB_URL}image/flags/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}.png` } : null;
    }
    const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.result) ? json.result : [];
    const item = pick(rows);
    if (!item || typeof item !== 'object') return null;
    const question = item.question || item.pertanyaan || item.desc || item.description;
    const answer = item.answer || item.jawaban || item.correctAnswer;
    const remoteImage = item.img || item.image || item.url;
    if (typeof question !== 'string' || !(typeof answer === 'string' || Array.isArray(answer))) return null;
    if (type === 'tebakgambar' && !(typeof remoteImage === 'string' && /^https:\/\/(c\.termai\.cc|raw\.githubusercontent\.com)\//i.test(remoteImage))) return null;
    return { ...item, question, answer: Array.isArray(answer) ? answer : String(answer), hint: item.hint || item.petunjuk, remoteImage };
  } catch { return null; } finally { clearTimeout(timer); }
}
export function normalizeQuizAnswer(value) { return norm(value); }
export function isQuizAnswerCorrect(game, answer) {
  const given = norm(answer);
  if (!game || !given) return false;
  const answers = Array.isArray(game.answer) ? game.answer : [game.answer];
  return answers.some(item => norm(item) === given);
}
export function getQuizTypes() { return Object.keys(GAME_TYPES); }
export function getQuizDatabaseEntries() { return Object.entries(GAME_TYPES).flatMap(([type, definition]) => definition.data.map((item, index) => ({ type, index, answer: item.answer }))); }

const allKnownAnswers = () => Object.values(GAME_TYPES).flatMap(def => def.data.flatMap(item => Array.isArray(item.answer) ? item.answer : [item.answer])).map(value => String(value ?? '').trim()).filter(Boolean);
export function buildMultipleChoice(type, answer, random = Math.random) {
  const correctAnswers = (Array.isArray(answer) ? answer : [answer]).map(value => String(value ?? '').trim()).filter(Boolean);
  const correct = correctAnswers[Math.floor(random() * Math.max(1, correctAnswers.length))] || 'Tidak diketahui';
  let pool = type === 'family100' ? [...correctAnswers] : allKnownAnswers().filter(value => norm(value) !== norm(correct));
  pool = [...new Map(pool.filter(value => norm(value) !== norm(correct)).map(value => [norm(value), value])).values()];
  const distractors = [];
  while (pool.length && distractors.length < 3) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    const [value] = pool.splice(index, 1);
    if (norm(value) !== norm(correct) && !distractors.some(item => norm(item) === norm(value))) distractors.push(value);
  }
  const generic = ['Pilihan lainnya', 'Tidak ada yang benar', 'Jawaban berbeda', 'Belum diketahui', 'Pilihan acak'];
  for (const value of generic) {
    if (distractors.length >= 3) break;
    if (norm(value) !== norm(correct) && !distractors.some(item => norm(item) === norm(value))) distractors.push(value);
  }
  const choices = [correct, ...distractors.slice(0, 3)];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { choices, correct, values: choices.map((value, i) => `${OPTION_PREFIXES[i]}. ${String(value).slice(0, 76)}`), answerIndex: choices.findIndex(value => norm(value) === norm(correct)) };
}

function clearGame(key, game = sessions.get(key)) {
  if (game?.timeout) clearTimeout(game.timeout);
  if (game?.pollId) pollSessions.delete(game.pollId);
  sessions.delete(key);
}
function sameJid(a, b) {
  const normalizeJid = value => String(value || '').replace(/:\d+(?=@)/, '').toLowerCase();
  return normalizeJid(a) === normalizeJid(b);
}
function creatorAliases(ctx) {
  const key = ctx?.raw?.key || ctx?.key || {};
  return [...new Set([
    ctx?.sender, ctx?.senderJid, ctx?.senderPn, ctx?.senderLid,
    key.participant, key.participantAlt, key.participantPn, key.participantLid,
    key.remoteJidAlt, key.remoteJidPn
  ].filter(value => typeof value === 'string' && value.includes('@')).map(value => value.replace(/:\d+(?=@)/, '').toLowerCase()))];
}
export function isAllowedQuizVoter(state, voter) {
  if (!state || !voter || !Array.isArray(state.allowedVoters)) return false;
  return state.allowedVoters.some(allowed => sameJid(allowed, voter));
}
function isCreator(game, ctx) {
  const identities = creatorAliases(ctx);
  const allowed = Array.isArray(game?.allowedVoters) && game.allowedVoters.length ? game.allowedVoters : [game?.creator];
  return identities.some(identity => allowed.some(candidate => sameJid(candidate, identity)));
}
function mergePollUpdates(existing = [], incoming = []) {
  const seen = new Set(existing.map(update => {
    try { return JSON.stringify(update); } catch { return String(update?.senderTimestampMs || ''); }
  }));
  const merged = [...existing];
  for (const update of incoming) {
    let signature;
    try { signature = JSON.stringify(update); } catch { signature = `${update?.senderTimestampMs || ''}:${update?.pollUpdateMessage?.key?.participant || ''}`; }
    if (!seen.has(signature)) { seen.add(signature); merged.push(update); }
  }
  return merged.slice(-500);
}
async function rotateFamily100Poll(sock, gameKey, game, chat) {
  const oldState = game.pollId ? pollSessions.get(game.pollId) : null;
  if (oldState) { oldState.closed = true; pollSessions.delete(oldState.pollId); }
  const remaining = game.answer.filter(item => !(game.answered || []).some(found => norm(found) === norm(item)));
  if (!remaining.length) {
    clearGame(gameKey, game);
    await sock.sendMessage(chat, { text: `🏆 FAMILY 100 SELESAI!\nSemua ${game.answer.length} jawaban ditemukan.\nJawaban: ${game.answer.join(', ')}` }).catch(() => {});
    return;
  }
  await sock.sendMessage(chat, { text: `Progress Family 100: ${game.answered.length}/${game.answer.length} jawaban ditemukan.\nPilih satu jawaban baru pada polling berikutnya. Hanya pembuat sesi yang boleh menjawab; satu pilihan dihitung per polling.` }).catch(() => {});
  const choices = buildMultipleChoice('family100', remaining);
  try {
    const sent = await sock.sendMessage(chat, { poll: { name: `FAMILY 100: ${String(game.question || 'Cari jawaban survei').replace(/\s+/g, ' ').slice(0, 150)}`, values: choices.values, selectableCount: 1 } });
    const pollId = String(sent?.key?.id || '');
    if (!pollId) throw new Error('Poll creation returned no message id');
    game.pollId = pollId;
    pollSessions.set(pollId, { pollId, type: 'family100', gameKey, chat, allowedVoters: [...(game.allowedVoters || [game.creator])], pollCreationMessage: sent.message, optionMap: Object.fromEntries(choices.values.map((value, index) => [value, choices.choices[index]])), pollUpdates: [], answeredVoters: [], closed: false });
  } catch {
    await sock.sendMessage(chat, { text: 'Polling lanjutan tidak tersedia. Gunakan .jawab <jawaban> untuk menyelesaikan Family 100.' }).catch(() => {});
  }
}

async function processPollSelection(sock, state, voter, optionName) {
  // Check identity before touching session state or emitting a response. This
  // also silently ignores unauthorized votes against an expired/stale poll.
  if (!isAllowedQuizVoter(state, voter)) return;
  const game = sessions.get(state.gameKey);
  if (!game || game.expiresAt <= Date.now()) {
    clearGame(state.gameKey, game);
    await sock.sendMessage(state.chat, { text: `⏱️ Waktu ${gameLabel(state.type)} habis. Ronde ditutup.` }).catch(() => {});
    return;
  }
  if (state.closed || state.answeredVoters.some(jid => sameJid(jid, voter))) return;
  const chosen = state.optionMap[optionName];
  if (chosen === undefined) return;
  // Consume the authorized user's first valid choice before doing any async work.
  // Normal quiz rounds close after one click; Family 100 rotates to a new poll.
  state.answeredVoters.push(voter);
  if (game.type !== 'family100') {
    state.closed = true;
    game.pollConsumed = true;
  }
  if (game.type === 'family100' && Array.isArray(game.answer)) {
    const found = game.answer.find(item => norm(item) === norm(chosen));
    if (!found) {
      state.closed = true;
      await sock.sendMessage(state.chat, { text: `❌ @${voter.split('@')[0]} pilihan pada polling ini belum tepat. Polling berikutnya akan memberi pilihan baru.`, mentions: [voter] }).catch(() => {});
      await rotateFamily100Poll(sock, state.gameKey, game, state.chat);
      return;
    }
    game.answered = game.answered || [];
    if (game.answered.some(item => norm(item) === norm(found))) {
      await sock.sendMessage(state.chat, { text: `ℹ️ Jawaban *${found}* sudah ditemukan sebelumnya.` }).catch(() => {});
      return;
    }
    game.answered.push(found);
    if (game.answered.length >= game.answer.length) {
      clearGame(state.gameKey, game);
      await sock.sendMessage(state.chat, { text: `🏆 FAMILY 100 SELESAI!\nSemua ${game.answer.length} jawaban ditemukan.\nJawaban: ${game.answer.join(', ')}` }).catch(() => {});
    } else {
      state.closed = true;
      await sock.sendMessage(state.chat, { text: `✅ @${voter.split('@')[0]} menemukan: *${found}*\nProgress: ${game.answered.length}/${game.answer.length} jawaban.`, mentions: [voter] }).catch(() => {});
      await rotateFamily100Poll(sock, state.gameKey, game, state.chat);
    }
    return;
  }
  if (!isQuizAnswerCorrect(game, chosen)) {
    const answer = Array.isArray(game.answer) ? game.answer.join(', ') : game.answer;
    clearGame(state.gameKey, game);
    await sock.sendMessage(state.chat, { text: `❌ PILIHAN BELUM TEPAT\n${gameLabel(game.type)}\nJawaban yang benar: *${answer}*\nRonde selesai. Pilihan pertama dari pemain yang dituju sudah digunakan.`, mentions: [voter] }).catch(() => {});
    return;
  }
  clearGame(state.gameKey, game);
  await sock.sendMessage(state.chat, { text: `🎉 JAWABAN BENAR!\n${gameLabel(game.type)}\nPemenang: @${voter.split('@')[0]}\nJawaban: *${Array.isArray(game.answer) ? chosen : game.answer}*\nRonde selesai. Hadiah konfigurasi: ${game.reward} energy; kredit energy otomatis belum diaktifkan.`, mentions: [voter] }).catch(() => {});
}

async function processPollUpdates(sock, state, updates) {
  const game = sessions.get(state.gameKey);
  if (!game) return;
  let aggregate;
  try {
    const { getAggregateVotesInPollMessage } = await import('@whiskeysockets/baileys');
    aggregate = getAggregateVotesInPollMessage({ message: state.pollCreationMessage, pollUpdates: state.pollUpdates?.length ? state.pollUpdates : updates }, sock?.user?.id);
  } catch { return; }
  for (const option of aggregate || []) {
    for (const voter of option.voters || []) {
      if (!sessions.has(state.gameKey)) return;
      if (state.closed || !sessions.has(state.gameKey)) return;
      if (!state.answeredVoters.some(jid => sameJid(jid, voter))) await processPollSelection(sock, state, String(voter), option.name);
      if (state.closed) return;
    }
  }
}


// Baileys commonly reports poll votes as `messages.update` on the poll-creation key.
export async function handleClassicQuizPollUpdates(sock, updates) {
  if (!Array.isArray(updates)) return false;
  let handled = false;
  for (const item of updates) {
    const pollId = String(item?.key?.id || '');
    const state = pollSessions.get(pollId);
    const pollUpdates = item?.update?.pollUpdates;
    if (!state || !Array.isArray(pollUpdates)) continue;
    state.pollUpdates = mergePollUpdates(state.pollUpdates || [], pollUpdates);
    await processPollUpdates(sock, state, state.pollUpdates);
    handled = true;
  }
  return handled;
}

export default {
  name: 'classic-quiz',
  command: [...Object.keys(GAME_TYPES), 'jawab', 'answer', 'hint', 'cleargame', 'nyerah', 'cek'],
  menuCommands: [...Object.keys(GAME_TYPES), 'jawab', 'hint', 'cleargame', 'nyerah', 'cek'],
  category: 'games', cooldown: 1000,
  description: 'Game tebak gambar, kata, anime, Family 100, bendera, lirik, teka-teki dan cek hiburan',
  menuDescriptions: {
    tebakgambar: 'Tebak gambar dan petunjuk', susunkata: 'Susun huruf menjadi kata', family100: 'Tebak jawaban survei Family 100', tebakanime: 'Tebak karakter anime', caklontong: 'Teka-teki Cak Lontong', asahotak: 'Asah otak dan logika', tebakjenaka: 'Tebak-tebakan jenaka', tebakbendera: 'Tebak nama negara', tebaktebakan: 'Teka-teki umum', tebaklirik: 'Tebak kata dari petunjuk lirik', jawab: 'Jawab ronde game aktif', hint: 'Minta petunjuk game aktif', cleargame: 'Hentikan game di chat ini', nyerah: 'Menyerah pada game aktif', cek: 'Cek skor hiburan acak'
  },
  async execute(ctx) {
    const cmd = String(ctx.command || '').toLowerCase();
    const key = keyFor(ctx);
    let game = sessions.get(key);
    if (game && game.expiresAt <= Date.now()) { clearGame(key, game); game = null; }
    if (cmd === 'cek') {
      const modes = ['imut','malas','wibu','psikopat','kaya','sabar','pintar','hoki','overpower','gacha','karbit','setia','ganteng','cantik','jomblo','femboy'];
      const mode = String(ctx.args?.[0] || '').toLowerCase();
      if (!modes.includes(mode)) return ctx.sendInteractive({ title: '🎲 CEK RANDOM', body: `Pilih kategori: ${modes.map(x => `.${ctx.prefix}cek ${x}`).join(' · ')}`, buttons: modes.slice(0, 8).map(x => ({ name: 'quick_reply', title: `Cek ${x}`, id: `${ctx.prefix}cek ${x}` })).concat([{ name: 'single_select', title: 'Kategori lain', sections: [{ title: 'Cek', rows: modes.slice(8).map(x => ({ title: `Cek ${x}`, id: `${ctx.prefix}cek ${x}` })) }] }]) });
      const target = ctx.mentionedJid?.[0] || ctx.mentions?.[0] || ctx.sender;
      const percent = Math.floor(Math.random() * 101);
      const labels = percent >= 85 ? 'LEVEL DEWA ✨' : percent >= 65 ? 'Di atas rata-rata 😎' : percent >= 40 ? 'Lumayan juga 🙂' : 'Masih bisa ditingkatkan 😅';
      return ctx.sendInteractive({ title: `🎲 CEK ${mode.toUpperCase()}`, body: `Target: @${String(target).split('@')[0]}
Hasil acak: *${percent}%*
${labels}

Ini hanya hiburan acak, bukan penilaian faktual.`, buttons: [{ name: 'quick_reply', title: 'Cek Lagi', id: `${ctx.prefix}cek ${mode}` }, { name: 'quick_reply', title: 'Menu Game', id: `${ctx.prefix}menu` }] });
    }
    if (cmd === 'cleargame' || cmd === 'nyerah') {
      if (!game) return ctx.reply('Tidak ada game aktif di chat ini.');
      if (!isCreator(game, ctx) && !ctx.isAdmin && !ctx.isOwner) return ctx.reply('Hanya pembuat ronde, admin grup, atau owner yang dapat mengakhiri ronde ini.');
      clearGame(key, game);
      return ctx.reply(`🛑 Game ${gameLabel(game.type)} dihentikan. Jawaban: ${Array.isArray(game.answer) ? game.answer.join(', ') : game.answer}`);
    }
    if (cmd === 'hint') {
      if (!game) return ctx.reply('Tidak ada game aktif. Mulai salah satu game terlebih dahulu.');
      if (!isCreator(game, ctx)) return ctx.reply('Ronde ini khusus untuk pengguna yang memulainya.');
      const answer = Array.isArray(game.answer) ? game.answer[0] : String(game.answer);
      const hint = game.hint || `Panjang jawaban: ${answer.length} karakter. Pola: ${[...answer].map((c, i) => i === 0 || i === answer.length - 1 ? c : (/[\s-]/.test(c) ? c : '_')).join(' ')}`;
      return ctx.reply(`💡 Petunjuk ${gameLabel(game.type)}: ${hint}\nSisa waktu: ${Math.max(0, Math.ceil((game.expiresAt - Date.now()) / 1000))} detik.`);
    }
    if (cmd === 'jawab' || cmd === 'answer') {
      if (!game) return ctx.reply('Tidak ada game aktif di chat ini.');
      if (!isCreator(game, ctx)) return ctx.reply('Ronde ini khusus untuk pengguna yang memulainya.');
      if (game.pollId && pollSessions.has(game.pollId)) return ctx.reply('Polling ronde ini aktif. Jawaban hanya dihitung dari satu pilihan polling pertama; perintah .jawab dinonaktifkan selama polling aktif.');
      const given = ctx.args.join(' ').trim();
      if (!given) return ctx.reply(`Format: ${ctx.prefix}jawab <jawaban>`);
      if (game.type === 'family100' && Array.isArray(game.answer)) {
        const found = game.answer.find(item => norm(item) === norm(given));
        if (!found) return ctx.reply('❌ Belum tepat. Coba lagi atau gunakan .hint.');
        game.answered = game.answered || [];
        if (game.answered.some(x => norm(x) === norm(found))) return ctx.reply('Jawaban ini sudah ditemukan.');
        game.votedPlayers = game.votedPlayers || [];
        if (ctx.sender && !game.votedPlayers.some(jid => sameJid(jid, ctx.sender))) game.votedPlayers.push(String(ctx.sender));
        game.answered.push(found);
        if (game.answered.length >= game.answer.length) {
          clearGame(key, game);
          return ctx.reply(`✅ Benar: ${found}\nDitemukan ${game.answered.length}/${game.answer.length} jawaban.\n🏆 Semua jawaban ditemukan!`);
        }
        if (game.pollId) await rotateFamily100Poll(ctx.sock, key, game, ctx.chat);
        return ctx.reply(`✅ Benar: ${found}\nDitemukan ${game.answered.length}/${game.answer.length} jawaban.`);
      }
      if (!isQuizAnswerCorrect(game, given)) return ctx.reply('❌ Belum tepat. Coba lagi atau gunakan .hint.');
      clearGame(key, game);
      return ctx.sendInteractive({ title: '🎉 JAWABAN BENAR!', subtitle: gameLabel(game.type), body: `Jawaban: *${game.answer}*\nRonde selesai. Hadiah nominal ${game.reward} adalah nilai konfigurasi permainan; integrasi pemberian energy otomatis belum diaktifkan.`, buttons: [{ name: 'quick_reply', title: 'Main lagi', id: `${ctx.prefix}${game.type}` }, { name: 'quick_reply', title: 'Menu Game', id: `${ctx.prefix}menu` }] });
    }
    if (!GAME_TYPES[cmd]) return ctx.reply('Game tidak dikenal. Gunakan .menu untuk melihat semua game.');
    if (game) return ctx.reply(`Masih ada game aktif di chat ini: ${gameLabel(game.type)}. Gunakan .hint, .jawab, .nyerah, atau .cleargame.`);
    const definition = GAME_TYPES[cmd];
    let item = await fetchRemote(cmd);
    if (!item) item = pick(definition.data);
    if (cmd === 'susunkata' && item.question && item.answer) {
      const answer = String(item.answer).trim();
      if (item.question === item.answer || item.question === answer) item.question = [...answer.replace(/\s/g, '')].sort(() => Math.random() - 0.5).join(' ').toUpperCase();
    }
    const answer = Array.isArray(item.answer) ? [...new Map(item.answer.map(value => [norm(value), String(value ?? '').trim()]).filter(([key, value]) => key && value)).values()] : String(item.answer ?? '').trim();
    const expiresAt = Date.now() + (cmd === 'family100' ? 5 * 60_000 : 60_000);
    const multipleChoice = buildMultipleChoice(cmd, answer);
    const allowedVoters = creatorAliases(ctx);
    if (!allowedVoters.length && ctx.sender) allowedVoters.push(String(ctx.sender).replace(/:\d+(?=@)/, '').toLowerCase());
    game = { type: cmd, question: item.question || item.description || 'Jawab pertanyaan berikut.', answer, hint: item.hint, description: item.description, image: item.remoteImage || item.img || item.image, localImage: item.localImage, reward: definition.reward, creator: String(ctx.sender || ''), allowedVoters, expiresAt, answered: [], votedPlayers: [], multipleChoice };
    sessions.set(key, game);
    const body = `*${definition.title}*\n\n${cmd === 'susunkata' ? `Tipe: ${item.type || 'Umum'}\nHuruf: ${item.question}` : item.question || item.description || 'Tebak jawaban yang tepat.'}\n\n${multipleChoice.values.join('\n')}\n\nWaktu: ${cmd === 'family100' ? '5 menit' : '1 menit'}\nHadiah konfigurasi: ${definition.reward} energy\n\nPilih SATU jawaban pada polling di bawah. Hanya pengguna yang memulai ronde ini yang dihitung; satu klik diproses sekali. Perintah .jawab hanya menjadi fallback bila polling gagal dibuat.\nGunakan *${ctx.prefix}hint* untuk petunjuk.`;
    game.timeout = setTimeout(async () => {
      if (sessions.get(key) !== game) return;
      clearGame(key, game);
      await ctx.sock?.sendMessage(ctx.chat, { text: `⏱️ Waktu ${definition.title} habis.\nJawaban: ${Array.isArray(answer) ? answer.join(', ') : answer}` }).catch(() => {});
    }, Math.max(0, expiresAt - Date.now()));
    game.timeout.unref?.();
    if (cmd === 'tebakgambar' && typeof ctx.sock?.sendMessage === 'function') {
      let imageSent = false;
      if (game.image && /^https:\/\/(c\.termai\.cc|raw\.githubusercontent\.com)\//i.test(game.image)) {
        try { await ctx.sock.sendMessage(ctx.chat, { image: { url: game.image }, caption: `🎮 TEBAK GAMBAR\nWHISKAY · GAME ROOM\n\n${body}` }, { quoted: ctx.raw }); imageSent = true; }
        catch { /* use local fallback art below */ }
      }
      if (!imageSent) {
        try {
          const fallbackName = game.localImage || (Math.random() < 0.5 ? 'heart.png' : 'clock.png');
          const imageBuffer = await readFile(new URL(`../../assets/quiz/${fallbackName}`, import.meta.url));
          await ctx.sock.sendMessage(ctx.chat, { image: imageBuffer, caption: `🎮 TEBAK GAMBAR\nWHISKAY · GAME ROOM\n\n${body}` }, { quoted: ctx.raw });
        } catch { /* image unavailable; continue with the text and poll */ }
      }
    }
    if (typeof ctx.sock?.sendMessage === 'function') {
      await ctx.sendInteractive({ title: `🎮 ${definition.title}`, subtitle: 'WHISKAY · GAME ROOM', body: `${body}\n\nPolling: pilih satu opsi A–D.`, buttons: [{ name: 'quick_reply', title: '💡 Petunjuk', id: `${ctx.prefix}hint` }, { name: 'quick_reply', title: '🏳️ Menyerah', id: `${ctx.prefix}nyerah` }] }).catch(() => {});
      try {
        const values = multipleChoice.values;
        const sent = await ctx.sock.sendMessage(ctx.chat, { poll: { name: `${definition.title}: ${String(game.question || 'Pilih jawaban yang benar').replace(/\s+/g, ' ').slice(0, 180)}`, values, selectableCount: 1 } }, { quoted: ctx.raw });
        const pollId = String(sent?.key?.id || '');
        if (pollId) {
          game.pollId = pollId;
          pollSessions.set(pollId, { pollId, type: cmd, gameKey: key, chat: ctx.chat, allowedVoters: [...game.allowedVoters], pollCreationMessage: sent.message, optionMap: Object.fromEntries(values.map((value, index) => [value, multipleChoice.choices[index]])), pollUpdates: [], answeredVoters: [], closed: false });
        }
        return sent;
      } catch (error) {
        return ctx.reply('Polling native tidak tersedia pada koneksi ini. Ronde tetap aktif; gunakan .jawab <jawaban> atau .hint.');
      }
    }
    return ctx.sendInteractive({ title: `🎮 ${definition.title}`, subtitle: 'WHISKAY · GAME ROOM', body, buttons: [{ name: 'quick_reply', title: '💡 Petunjuk', id: `${ctx.prefix}hint` }, { name: 'quick_reply', title: '🏳️ Menyerah', id: `${ctx.prefix}nyerah` }] });
  }
};

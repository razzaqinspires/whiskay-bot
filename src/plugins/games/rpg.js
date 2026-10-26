import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Worker } from 'node:worker_threads';
const execFileAsync = promisify(execFile);
import { syncDashboardPlayer, dashboardUrl } from '../../services/dungeonWebsiteSync.js';
const DATA = path.resolve('data/dungeon-rpg.json');
const FLOOR_DATA = path.resolve('data/dungeon/floors.json');
async function getFloorDefinition(floor){try{const d=JSON.parse(await readFile(FLOOR_DATA,'utf8'));return d.floors?.[clamp(Number(floor||1)-1,0,(d.floors?.length||1)-1)]||null;}catch{return null;}}
function predictBattle(player,enemy){return new Promise(resolve=>{let settled=false;const finish=v=>{if(settled)return;settled=true;resolve(v);};let worker;try{worker=new Worker(new URL('../../workers/dungeon-predictor.js',import.meta.url));worker.once('message',data=>{finish(data);worker.terminate().catch(()=>{});});worker.once('error',()=>{finish({winProbability:50,estimatedTurns:1,estimatedIncoming:0,confidence:55});worker?.terminate().catch(()=>{});});worker.postMessage({player,enemy});setTimeout(()=>{finish({winProbability:50,estimatedTurns:1,estimatedIncoming:0,confidence:55});worker?.terminate().catch(()=>{});},1500).unref?.();}catch{finish({winProbability:50,estimatedTurns:1,estimatedIncoming:0,confidence:55});}});}

const CARD_DIR = path.resolve('data/cache/rpg-cards');
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const keyFor = (ctx) => `${ctx.chat}|${ctx.sender}`;
const defaults = () => ({ level: 1, xp: 0, hp: 100, maxHp: 100, gold: 0, potions: 2, weapon: 'Rusty Blade', weaponPower: 5, floor: 1, wins: 0, losses: 0, lastActionAt: 0 });
async function readAll() { try { const d = JSON.parse(await readFile(DATA, 'utf8')); return d && typeof d === 'object' ? d : {}; } catch { return {}; } }
async function writeAll(data) { await mkdir(path.dirname(DATA), { recursive: true }); const temp = DATA + '.tmp'; await writeFile(temp, JSON.stringify(data, null, 2)); await rename(temp, DATA); }
async function fetchAuthoritativePlayer(ctx) {
  const base = String(process.env.DUNGEON_WEBSITE_URL || '').replace(/\/+$/, '');
  if (!base) return null; // Legacy/offline development mode only.
  const playerId = (await import('../../services/dungeonWebsiteSync.js')).dashboardPlayerId(ctx.chat, ctx.sender);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`${base}/api/player?player=${encodeURIComponent(playerId)}`, { cache:'no-store', headers:{accept:'application/json'}, signal:controller.signal });
    if (response.status === 503 || response.status >= 500) throw new Error('RPG_DATABASE_UNAVAILABLE');
    if (!response.ok) throw new Error(`RPG_DATABASE_READ_${response.status}`);
    const result = await response.json();
    return result?.player && typeof result.player === 'object' ? result.player : null;
  } catch (error) { if (error.message?.startsWith('RPG_DATABASE_')) throw error; throw new Error('RPG_DATABASE_UNAVAILABLE'); }
  finally { clearTimeout(timer); }
}
async function getPlayer(ctx) {
  const d = await readAll();
  const remote = await fetchAuthoritativePlayer(ctx);
  if (remote) {
    const player = { ...defaults(), ...(d[keyFor(ctx)] || {}), ...remote };
    // The persistent server snapshot wins for every persisted RPG stat.
    for (const field of ['level','xp','hp','maxHp','gold','potions','weapon','weaponPower','floor','wins','losses']) if (remote[field] !== undefined) player[field] = remote[field];
    return { all:d, player };
  }
  return { all:d, player:{ ...defaults(), ...(d[keyFor(ctx)] || {}) } };
}
async function savePlayer(ctx, all, player) {
  const payload = {name:ctx.pushName||'Adventurer',level:player.level,xp:player.xp,nextXp:needXp(player.level),hp:player.hp,maxHp:player.maxHp,gold:player.gold,weapon:player.weapon,weaponPower:player.weaponPower,potions:player.potions,wins:player.wins,losses:player.losses,floor:player.floor,inventory:Array.isArray(player.inventory)?player.inventory:[{name:player.weapon,slot:'weapon',power:player.weaponPower},{name:'Potion of Renewal',slot:'consumable',quantity:player.potions}]};
  const base = String(process.env.DUNGEON_WEBSITE_URL || '').replace(/\/+$/, '');
  if (base && process.env.DUNGEON_SYNC_TOKEN) {
    const sync = await syncDashboardPlayer(ctx.chat,ctx.sender,payload);
    if (!sync?.ok) throw new Error('RPG_DATABASE_WRITE_FAILED: perubahan belum dikonfirmasi oleh Supabase');
  }
  all[keyFor(ctx)] = player; await writeAll(all);
}
const needXp = level => Math.floor(70 + level * 42 + Math.pow(level, 1.35) * 9);
const rank = level => level >= 30 ? 'MYTHIC' : level >= 20 ? 'DIAMOND' : level >= 12 ? 'PLATINUM' : level >= 7 ? 'GOLD' : level >= 3 ? 'SILVER' : 'ROOKIE';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function svgCard(p, label = 'DUNGEON CHRONICLE') {
  const progress = Math.round(p.xp / needXp(p.level) * 100);
  const hp = Math.round(p.hp / p.maxHp * 100);
  const bar = (x, y, w, percent, color) => `<rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="#202c40"/><rect x="${x}" y="${y}" width="${Math.round(w * clamp(percent,0,100)/100)}" height="10" rx="5" fill="${color}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0a1020"/><stop offset=".55" stop-color="#17243b"/><stop offset="1" stop-color="#311d35"/></linearGradient><linearGradient id="glow"><stop stop-color="#d5b56d"/><stop offset="1" stop-color="#7ce0c3"/></linearGradient><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#c6d3e7" stroke-opacity=".06"/></pattern></defs><rect width="1200" height="675" fill="url(#bg)"/><rect width="1200" height="675" fill="url(#grid)"/><circle cx="1000" cy="100" r="180" fill="#ad6b9c" opacity=".09"/><path d="M760 675L900 420 1010 520 1120 350 1200 420V675Z" fill="#080d18" opacity=".72"/><path d="M0 550L120 430 220 520 320 390 440 520 560 450 690 565V675H0Z" fill="#080d18" opacity=".75"/><rect x="48" y="48" width="1104" height="579" rx="28" fill="#0c1424" fill-opacity=".78" stroke="#647994" stroke-opacity=".5"/><text x="84" y="103" font-family="Arial,sans-serif" font-size="16" letter-spacing="5" fill="#9cb2ce">WHISKAYBOT  /  RPG MODE</text><text x="84" y="166" font-family="Arial,sans-serif" font-weight="800" font-size="42" fill="#f0e7d4">${esc(label)}</text><text x="84" y="220" font-family="Arial,sans-serif" font-size="24" fill="#c2d1e5">${esc(rank(p.level))} · LEVEL ${p.level}</text><text x="84" y="280" font-family="Arial,sans-serif" font-size="16" fill="#8fa5c4">EXPERIENCE · ${p.xp} / ${needXp(p.level)} XP</text>${bar(84,300,490,progress,'url(#glow)')}<text x="84" y="368" font-family="Arial,sans-serif" font-size="16" fill="#8fa5c4">VITALITY · ${p.hp} / ${p.maxHp} HP</text>${bar(84,388,490,hp,'#f27f76')}<text x="84" y="468" font-family="Arial,sans-serif" font-size="18" fill="#e9d8a6">✦ ${p.gold} GOLD</text><text x="84" y="508" font-family="Arial,sans-serif" font-size="16" fill="#c2d1e5">⚔ ${esc(p.weapon)}  ·  POWER ${p.weaponPower}</text><text x="84" y="548" font-family="Arial,sans-serif" font-size="16" fill="#c2d1e5">FLOOR ${p.floor}  ·  VICTORIES ${p.wins}  ·  POTIONS ${p.potions}</text><g transform="translate(820 190)"><path d="M120 0L240 65V205L120 270 0 205V65Z" fill="#121e32" stroke="#d5b56d" stroke-width="2"/><path d="M120 35L205 83V183L120 232 35 183V83Z" fill="#1d2d44" stroke="#7ce0c3" stroke-opacity=".7"/><path d="M120 75L157 132 120 190 83 132Z" fill="url(#glow)"/><path d="M120 75V190L157 132Z" fill="#f5e6bf" opacity=".7"/><circle cx="120" cy="132" r="80" fill="none" stroke="#d5b56d" stroke-opacity=".3" stroke-width="2"/></g><text x="84" y="594" font-family="Arial,sans-serif" font-size="12" letter-spacing="3" fill="#8298b6">YOUR STORY IS WRITTEN ONE RUN AT A TIME</text></svg>`;
}
async function renderCard(p, label) {
  await mkdir(CARD_DIR, { recursive: true });
  const base = path.join(CARD_DIR, `${process.pid}-${Date.now()}`);
  const svg = `${base}.svg`, png = `${base}.png`;
  try {
    await writeFile(svg, svgCard(p, label));
    await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-i',svg,'-frames:v','1','-vf','format=rgb24',png], { timeout: 10000 });
    return { buffer: await readFile(png), cleanup: () => Promise.all([rm(svg,{force:true}),rm(png,{force:true})]) };
  } catch (e) {
    console.error('[RPG] landscape card render failed:', e?.stderr || e?.message || e);
    await Promise.all([rm(svg,{force:true}),rm(png,{force:true})]);
    return null;
  }
}
async function sendCard(ctx, p, label, body, buttons) {
  const card = await renderCard(p, label);
  try {
    // Follow the same pattern as ytsearch/YouTube preview: image + text + buttons
    // are sent in ONE native-flow message, never as a separate image message.
    return await ctx.sendInteractive({
      title: `Dungeon Chronicle · ${label}`,
      subtitle: `${rank(p.level)} · Level ${p.level}`,
      body: `${body}${card ? '' : '\n\nCatatan: kartu gambar tidak dapat dirender di host ini. Pastikan FFmpeg terpasang.'}`,
      footer: 'RPG tersimpan lokal per chat dan pemain.',
      image: card?.buffer || undefined,
      buttons: normalizeActionButtons(ctx, buttons)
    });
  } finally { if (card) await card.cleanup(); }
}
const btn = (ctx, title, command) => ({ name:'quick_reply', title, id:`${ctx.prefix}${command}` });
function normalizeActionButtons(ctx, buttons = []) {
  // Keep native-flow to three top-level buttons and preserve CTA URLs as CTAs.
  if (buttons.length <= 3) return buttons;
  const cta = buttons.find(b => ['cta_url', 'open_webview', 'url'].includes(b.name || b.type));
  const quick = buttons.filter(b => !['cta_url', 'open_webview', 'url', 'single_select', 'list'].includes(b.name || b.type));
  const primary = quick.slice(0, cta ? 1 : 2);
  if (cta) primary.push(cta);
  const remaining = quick.slice(primary.length - (cta ? 1 : 0));
  if (remaining.length) {
    primary.push({ name:'single_select', title:'Aksi Lainnya', sections:[{title:'Aksi RPG', rows:remaining.map((b, i) => ({
      title: String(b.title || `Aksi ${i + 1}`).slice(0, 24),
      description: 'Aksi RPG',
      id: String(b.id || `${ctx.prefix}rpg status`)
    }))}] });
  }
  return primary.slice(0, 3);
}

export default {
  name: 'dungeon-rpg', command: ['rpg','dungeon','adventure'], menuCommands: ['rpg','dungeon'], category: 'games', description: 'Dungeon RPG: jelajah, bertarung, level-up, loot dan potion', cooldown: 1200,
  async execute(ctx) {
    const sub = String(ctx.args?.[0] || 'status').toLowerCase();
    const { all, player: p } = await getPlayer(ctx);
    const actions = [btn(ctx,'Jelajah Dungeon','rpg explore'),btn(ctx,'Profil RPG','rpg status'),btn(ctx,'Gunakan Potion','rpg potion'),btn(ctx,'Istirahat','rpg rest'),btn(ctx,'Panduan','rpg help')];
    if (sub === 'help') return ctx.sendInteractive({ title:'DUNGEON RPG · FIELD GUIDE', subtitle:'Turn-based adventure', body:'EXPLORE — lawan monster dan kumpulkan XP/gold.\nPOTION — pulihkan HP, jika potion tersedia.\nREST — pulihkan sebagian HP dengan biaya gold.\nCOACH — rekomendasi strategi berdasarkan profil saat ini.\nSTATUS — lihat level, rank, senjata dan progres.\n\nTombol menjalankan aksi sebagai perintah WhatsApp. RPG bersifat hiburan dan datanya disimpan lokal di server.', buttons:[btn(ctx,'Mulai Petualangan','rpg explore'),btn(ctx,'Strategi RPG','rpg coach'),btn(ctx,'Lihat Status','rpg status')] });
    if (sub === 'coach' || sub === 'strategy') {
      const hpPct = p.maxHp > 0 ? p.hp / p.maxHp : 0;
      const advice = [];
      if (hpPct < 0.35) advice.push(p.potions > 0 ? 'HP kritis: gunakan .rpg potion sebelum bertarung.' : `HP kritis dan potion habis: kumpulkan gold (${15 + p.level * 4}) lalu gunakan .rpg rest.`);
      else if (hpPct < 0.65 && p.potions > 0) advice.push('HP menengah: pertimbangkan potion sebelum melawan monster kuat.');
      if (p.weaponPower < p.level * 2 + 4) advice.push('Kekuatan senjata tertinggal dari level: periksa .inventory dan gunakan .equip weapon <id> jika ada senjata lebih baik.');
      if (p.gold < 15 + p.level * 4 && hpPct < 0.8) advice.push('Gold belum cukup untuk istirahat; pilih pertarungan yang aman dan gunakan potion secara hemat.');
      if (p.floor >= 8) advice.push('Lantai tinggi: pulihkan HP penuh, pastikan potion tersedia, dan periksa equipment sebelum lanjut.');
      if (p.wins > 0 && p.wins % 3 !== 0) advice.push(`Kemenangan ${p.wins}: setiap 3 kemenangan dapat menaikkan progres lantai dalam mode ini.`);
      if (!advice.length) advice.push('Kondisi relatif stabil. Jelajahi dungeon, simpan potion untuk keadaan darurat, dan cek inventory untuk equipment yang lebih kuat.');
      return ctx.sendInteractive({ title:'🧠 RPG TACTICAL COACH', subtitle:`Level ${p.level} · Floor ${p.floor}`, body:`Profil: HP ${p.hp}/${p.maxHp} · Power ${p.weaponPower} · Gold ${p.gold} · Potion ${p.potions}\n\n${advice.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nSaran berbasis statistik tersimpan; bukan jaminan hasil pertarungan.`, buttons:[btn(ctx,'Jelajah','rpg explore'),btn(ctx,'Potion','rpg potion'),btn(ctx,'Status','rpg status')] });
    }
    if (sub === 'status' || sub === 'start') {
      await savePlayer(ctx, all, p);
      const body = `Rank: ${rank(p.level)}\nLevel: ${p.level}\nXP: ${p.xp}/${needXp(p.level)}\nHP: ${p.hp}/${p.maxHp}\nGold: ${p.gold}\nSenjata: ${p.weapon} (Power ${p.weaponPower})\nFloor: ${p.floor}\nKemenangan: ${p.wins} · Kekalahan: ${p.losses}\nPotion: ${p.potions}\n\nPilih aksi dari tombol di bawah.`;
      return sendCard(ctx,p,'PLAYER PROFILE',body,actions);
    }
    if (sub === 'potion') {
      if (p.potions < 1) return sendCard(ctx,p,'INVENTORY', 'Potion habis. Jelajahi dungeon untuk mendapat peluang loot.', [btn(ctx,'Jelajah Dungeon','rpg explore'),btn(ctx,'Kembali','rpg status')]);
      if (p.hp >= p.maxHp) return sendCard(ctx,p,'VITALITY FULL','HP sudah penuh. Simpan potion untuk pertarungan berikutnya.',actions);
      p.potions--; const heal = Math.min(45,p.maxHp-p.hp); p.hp += heal; await savePlayer(ctx,all,p);
      return sendCard(ctx,p,'POTION USED',`Kamu memulihkan ${heal} HP.\nHP sekarang: ${p.hp}/${p.maxHp}\nPotion tersisa: ${p.potions}`,actions);
    }
    if (sub === 'rest') {
      const cost = 15 + p.level * 4;
      if (p.hp >= p.maxHp) return sendCard(ctx,p,'CAMP','HP sudah penuh; tidak perlu istirahat.',actions);
      if (p.gold < cost) return sendCard(ctx,p,'CAMP LOCKED',`Istirahat memerlukan ${cost} gold. Jelajahi dungeon untuk mendapatkan loot.`,[btn(ctx,'Jelajah','rpg explore'),btn(ctx,'Status','rpg status')]);
      p.gold -= cost; const heal = Math.min(p.maxHp-p.hp,Math.ceil(p.maxHp*.55)); p.hp += heal; await savePlayer(ctx,all,p);
      return sendCard(ctx,p,'CAMP REST',`Kamu beristirahat dan pulih ${heal} HP. Biaya: ${cost} gold.`,actions);
    }
    if (sub === 'explore' || sub === 'fight') {
      if (p.hp <= 0) p.hp = Math.ceil(p.maxHp*.5);
      const floorDef = await getFloorDefinition(p.floor);
      const enemy = floorDef?.enemy;
      const m = enemy ? {name:enemy.name,hp:enemy.hp,attack:enemy.attack,xp:floorDef.rewards.xp,gold:floorDef.rewards.gold,defense:enemy.defense,skills:enemy.skills} : {name:'Cave Slime',hp:26,attack:8,xp:28,gold:12,defense:0,skills:[]};
      const rawDamage = Math.max(1, p.weaponPower + Math.floor(Math.random()*12) + Math.floor(p.level/3));
      const damage = Math.max(1, rawDamage - Math.floor((m.defense||0)*0.35));
      const monsterDamage = Math.max(1,m.attack - Math.floor(p.level/4));
      const forecastData = await predictBattle(p,m);
      const forecast = `\n\n📊 Worker AI Forecast: peluang menang ${forecastData.winProbability}% · ${forecastData.estimatedTurns} giliran · potensi damage masuk ~${forecastData.estimatedIncoming} HP · confidence ${forecastData.confidence}%. Estimasi statistik, bukan jaminan; buff, skill, dan variasi serangan dapat mengubah hasil.`;

      if (damage >= m.hp) {
        p.wins++; p.xp += m.xp; p.gold += m.gold; p.hp = Math.min(p.maxHp,p.hp + 8);
        const loot = Math.random() < .18;
        if (loot) { p.potions++; }
        const oldLevel=p.level;
        while (p.xp >= needXp(p.level)) { p.xp -= needXp(p.level); p.level++; p.maxHp += 8; p.hp = Math.min(p.maxHp,p.hp+18); p.weaponPower += (p.level%3===0?2:1); }
        if (p.wins%3===0) p.floor=Math.min(10,p.floor+1);
        await savePlayer(ctx,all,p);
        const levelLine = p.level>oldLevel ? `\n\nLEVEL UP! ${oldLevel} → ${p.level}. Max HP dan kekuatan meningkat.` : '';
        return sendCard(ctx,p,'VICTORY',`Lantai ${p.floor}: ${floorDef?.name||'Dungeon'}\nMonster: ${m.name}\nSeranganmu: ${damage} damage — monster dikalahkan.\nLoot: +${m.xp} XP, +${m.gold} gold${loot?' dan +1 potion':''}.\nPemulihan tempur: +8 HP.${levelLine}${forecast}`, [...actions,{name:'cta_url',title:'⚔️ Arena Battle Web',url:dashboardUrl(ctx.chat,ctx.sender,`/dungeon?floor=${p.floor}`),merchant_url:dashboardUrl(ctx.chat,ctx.sender,`/dungeon?floor=${p.floor}`),webview_interaction:true}]);
      }
      p.hp = Math.max(0,p.hp-monsterDamage); p.losses++; p.xp += Math.floor(m.xp*.2);
      const defeated = p.hp === 0;
      if (defeated) { p.gold=Math.max(0,p.gold-Math.min(p.gold,5+p.floor*2)); p.hp=Math.ceil(p.maxHp*.4); }
      await savePlayer(ctx,all,p);
      return sendCard(ctx,p,'RETREAT',`Lantai ${p.floor}: ${floorDef?.name||'Dungeon'}\nMonster: ${m.name}\nDamage seranganmu: ${damage}; monster masih bertahan.\nKamu menerima ${monsterDamage} damage.\n${defeated?'Kamu tumbang lalu kembali ke camp; sebagian gold hilang.':''}\nHP: ${p.hp}/${p.maxHp}\nKamu memperoleh ${Math.floor(m.xp*.2)} XP dari pertarungan.${forecast}`,[btn(ctx,'Coba Lagi','rpg explore'),btn(ctx,'Gunakan Potion','rpg potion'),btn(ctx,'Profil RPG','rpg status'),{name:'cta_url',title:'Arena Battle Web',url:dashboardUrl(ctx.chat,ctx.sender,`/dungeon?floor=${p.floor}`),merchant_url:dashboardUrl(ctx.chat,ctx.sender,`/dungeon?floor=${p.floor}`),webview_interaction:true}]);
    }
    return ctx.sendInteractive({ title:'DUNGEON RPG', subtitle:'WhiskayBot Adventure System', body:'Petualangan turn-based dengan level, XP, rank, HP, gold, potion, monster, loot, dan dungeon floor.\n\nTekan Mulai untuk membuat profil lalu jelajahi dungeon.', buttons:[btn(ctx,'Mulai / Status','rpg status'),btn(ctx,'Jelajah Dungeon','rpg explore'),btn(ctx,'Panduan','rpg help')] });
  }
};

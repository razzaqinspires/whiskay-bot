import config from '../../config/index.js';
import { registry } from '../../core/registry.js';
import { getMenuSettings, getNewCommandSet, getCommandRecommendations, getGlobalRecommendationsEnabled } from '../../lib/menu-settings.js';
import { filterRecommendationCandidates } from '../../lib/stage30-recommendations.js';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { getRazzaqWebsiteContent } from '../../services/razzaqWebsite.js';
import { getEnergy, complexityScore, getHits } from '../../lib/energy-worker.js';
import { getEnergySaver } from '../../lib/energy-saver.js';
import { getProfile, getLeaderboard } from '../../lib/leveling.js';
import { renderMenuCardV2 } from '../../services/canvas-v2.js';
import { getUser, getUserStats, readAppDatabase } from '../../lib/app-database.js';


async function renderOfficialCanvas(kind, botName, avatarPath = null) { return renderMenuCardV2({ botName, avatarPath, subtitle: kind === 'rpg' ? 'PLAYER PROFILE / LEVEL · XP · INVENTORY' : 'PERSONALIZED COMMAND CENTER' }); }

function mapChars(text, upper, lower, digits = null) {
  return String(text).replace(/[A-Za-z0-9]/g, c => {
    const n = c.charCodeAt(0);
    if (n >= 65 && n <= 90) return upper ? String.fromCodePoint(upper + n - 65) : c;
    if (n >= 97 && n <= 122) return lower ? String.fromCodePoint(lower + n - 97) : c;
    if (n >= 48 && n <= 57) return digits ? String.fromCodePoint(digits + n - 48) : c;
    return c;
  });
}
const superscript = Object.fromEntries([...('abcdefghijklmnopqrstuvwxyz')].map((c,i)=>[c,[...'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ'][i] || c]));
const smallCaps = Object.fromEntries([...('abcdefghijklmnopqrstuvwxyz')].map((c,i)=>[c,[...'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ'][i] || c]));
const replaceMap = (s, source, target) => { const m = new Map([...source].map((c,i)=>[c,target[i]||c])); return [...String(s)].map(c=>m.get(c)||m.get(c.toLowerCase())||c).join(''); };
const fontFns = {
  normal: s => String(s),
  bolditalic: s => mapChars(s,0x1D468,0x1D482),
  square: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ'),
  bold: s => mapChars(s,0x1D400,0x1D41A,0x1D7CE),
  sans: s => mapChars(s,0x1D5D4,0x1D5EE,0x1D7F6),
  mono: s => mapChars(s,0x1D670,0x1D68A,0x1D7F6),
  superscript: s => [...String(s)].map(c=>superscript[c.toLowerCase()] || c).join(''),
  double: s => mapChars(s,0x1D538,0x1D552,0x1D7D8),
  smallcaps: s => [...String(s)].map(c=>smallCaps[c.toLowerCase()] || c).join(''),
  fraktur: s => mapChars(s,0x1D56C,0x1D586),
  italicbold: s => mapChars(s,0x1D468,0x1D482),
  sansbold: s => mapChars(s,0x1D5D4,0x1D5EE,0x1D7F6),
  mixed: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map(c=>({'A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'E','F':'ᖴ','G':'G','H':'ᕼ','I':'I','J':'ᒍ','K':'K','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'O','P':'ᑭ','Q':'ᑫ','R':'ᖇ','S':'ᔕ','T':'T','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'᙭','Y':'Y','Z':'ᘔ','a':'ᗩ','b':'ᗷ','c':'ᑕ','d':'ᗪ','e':'E','f':'ᖴ','g':'G','h':'ᕼ','i':'I','j':'ᒍ','k':'K','l':'ᒪ','m':'ᗰ','n':'ᑎ','o':'O','p':'ᑭ','q':'ᑫ','r':'ᖇ','s':'ᔕ','t':'T','u':'ᑌ','v':'ᐯ','w':'ᗯ','x':'᙭','y':'Y','z':'ᘔ'}[c])).join('')),
  cyrillic: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','АВCDЕFGНІЈКLМNOPQRSТUVWХYZаьсԁеfɡһіјκӏmnорԛгѕтцѵԝхуz'),
  greek: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','ΑΒϹDΕFϜΗΙЈΚLΜΝΟΡϘRSΤՍVШΧΥΖαβϲδεζηιϳκλμνορςτυνχωყζ'),
  italic: s => mapChars(s,0x1D434,0x1D44E),
  script: s => mapChars(s,0x1D49C,0x1D4B6),
  circled: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ')
};
const FONT_LABELS = {
  normal: ['Normal','Teks standar, paling kompatibel','Type something to start'],
  bolditalic: ['Bold Italic Sans','Sans tebal miring','𝙏𝙮𝙥𝙚 𝙨𝙤𝙢𝙚𝙩𝙝𝙞𝙣𝙜'],
  square: ['Squared Display','Karakter kotak; beberapa huruf memakai simbol fallback','🅃🅈🄿🄴 🅂🄾🄼🄴'],
  bold: ['Bold Serif','Tebal dan formal','𝐓𝐲𝐩𝐞 𝐬𝐨𝐦𝐞𝐭𝐡𝐢𝐧𝐠 𝐭𝐨 𝐬𝐭𝐚𝐫𝐭'],
  sans: ['Sans Bold','Tebal modern','𝗧𝘆𝗽𝗲 𝘀𝗼𝗺𝗲𝘁𝗵𝗶𝗻𝗴 𝘁𝗼 𝘀𝘁𝗮𝗿𝘁'],
  mono: ['Monospace','Gaya terminal','𝚃𝚢𝚙𝚎 𝚜𝚘𝚖𝚎𝚝𝚑𝚒𝚗𝚐 𝚝𝚘 𝚜𝚝𝚊𝚛𝚝'],
  superscript: ['Superscript','Huruf kecil di atas; dukungan karakter terbatas','ᵀʸᵖᵉ ˢᵒᵐᵉᵗʰⁱⁿᵍ ᵗᵒ ˢᵗᵃʳᵗ'],
  double: ['Double-struck','Gaya matematika ganda','𝕋𝕪𝕡𝕖 𝕤𝕠𝕞𝕖𝕥𝕙𝕚𝕟𝕘 𝕥𝕠 𝕤𝕥𝕒𝕣𝕥'],
  smallcaps: ['Small Caps','Huruf kapital kecil','ᴛʏᴘᴇ ꜱᴏᴍᴇᴛʜɪɴɢ ᴛᴏ ꜱᴛᴀʀᴛ'],
  fraktur: ['Fraktur','Gaya gotik','𝔗𝔶𝔭𝔢 𝔰𝔬𝔪𝔢𝔱𝔥𝔦𝔫𝔤 𝔱𝔬 𝔰𝔱𝔞𝔯𝔱'],
  italicbold: ['Bold Italic','Miring dan tebal','𝑻𝒚𝒑𝒆 𝒔𝒐𝒎𝒆𝒕𝒉𝒊𝒏𝒈 𝒕𝒐 𝒔𝒕𝒂𝒓𝒕'],
  sansbold: ['Sans Bold','Sans-serif tebal','𝗧𝘆𝗽𝗲 𝘀𝗼𝗺𝗲𝘁𝗵𝗶𝗻𝗴 𝘁𝗼 𝘀𝘁𝗮𝗿𝘁'],
  italic: ['Italic Serif','Miring elegan','𝑇𝑦𝑝𝑒'],
  script: ['Script','Tulisan kaligrafi','𝒯𝓎𝓅𝑒'],
  circled: ['Circled','Huruf dalam lingkaran','Ⓣⓨⓟⓔ']
};
const TEMPLATE = {
  corporate: { top: '╭━━━〔', mid: '┃', bottom: '╰━━━━━━━━━━━━━━━━' },
  minimal: { top: '┌─', mid: '│', bottom: '└────────────' },
  terminal: { top: '╔══[', mid: '║', bottom: '╚════════════' },
  elegant: { top: '┏━━━━━━━━', mid: '┃', bottom: '┗━━━━━━━━━━━━' },
  aurora: { top: '✦･ﾟ〔', mid: '✧', bottom: '✦━━━━━━━━━━━━' },
  classic: { top: '╔════〔', mid: '║', bottom: '╚════════════' },
  compact: { top: '〔', mid: '›', bottom: '┈┈┈┈┈┈┈┈┈' },
  minimalist: { top: '┌─', mid: '·', bottom: '└────────────' },
  cyberpunk: { top: '╔═[', mid: '▸', bottom: '╚════════════' },
  fantasy: { top: '✧༺', mid: '✦', bottom: '༻✧━━━━━━━━━━' },
  ocean: { top: '🌊 ━〔', mid: '≈', bottom: '🌊 ━━━━━━━━━' },
  sunset: { top: '🌇 ╭〔', mid: '☀', bottom: '╰━━━━━━━━🌇' },
  emerald: { top: '❖ ╭〔', mid: '◆', bottom: '╰━━━━━━━━❖' },
  sakura: { top: '🌸 ╭〔', mid: '✿', bottom: '╰━━━━━━━━🌸' },
  monochrome: { top: '▰▰〔', mid: '│', bottom: '▰▰▰▰▰▰▰' },
  royal: { top: '♛ ╔〔', mid: '♜', bottom: '╚════════♛' }
};
const WIDGETS = new Set(['category','count','prefix','new','owner','footer','heading','intro','website','rank','rpgstatus','leaderboard','commandhits','biocore','events','messages','uptime','database']);
const canonicalFor = p => Array.isArray(p.menuCommands) ? p.menuCommands : (Array.isArray(p.command) ? p.command.slice(0,1) : [p.command]);
function getCommandRows() {
  const rows=[];
  const plugins = registry.plugins?.plugins instanceof Map ? [...registry.plugins.plugins.values()] : [];
  for (const plugin of plugins) {
    const cmds = canonicalFor(plugin);
    const categoryCandidates = [plugin.category, ...(Array.isArray(plugin.categories) ? plugin.categories : []), ...(Array.isArray(plugin.tags) ? plugin.tags : [])];
    const category = categoryCandidates.map(v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')).find(Boolean) || 'general';
    for (const cmd of cmds) if (typeof cmd==='string' && cmd.trim()) rows.push({command:cmd.toLowerCase(),category,description:String(plugin.menuDescriptions?.[cmd]||plugin.description||plugin.menuDescription||'').trim(),owner:Boolean(plugin.owner),limitCost:Number(plugin.limitCost||0),premium:Boolean(plugin.premium),groupOnly:Boolean(plugin.groupOnly),privateOnly:Boolean(plugin.privateOnly),coinCost:Number(plugin.coinCost||plugin.modCoinCost||0),recommendable:plugin.recommendable!==false});
  }
  const unique=new Map(); for(const row of rows) if(!unique.has(row.command)) unique.set(row.command,row);
  return [...unique.values()];
}
const style=(s,font)=> (fontFns[font]||fontFns.normal)(s);
const titleCase=s=>String(s||'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function isBold(settings,part){return (settings.boldParts||[]).includes(part);}
function emphasized(settings,text,part){return isBold(settings,part)?`*${text}*`:text;}
function line(settings, text, part='meta') { const raw=emphasized(settings,text,part); return `${settings.linePrefix ? (TEMPLATE[settings.template]||TEMPLATE.corporate).mid+' ' : ''}${style(raw,settings.font)}`; }
function widgetLine(settings, text, part='meta') {
  const designs = { classic: x => x, minimal: x => `· ${x}`, cyberpunk: x => `[ SYS ] :: ${x}`, kawaii: x => `┊ ${x} ♡`, boxed: x => `├ ${x}`, elegant: x => `✦ ${x}`, japanese: x => `╟ ${x}`, developer: x => `:: ${x}` };
  const decorated = (designs[settings.widgetDesign] || designs.classic)(String(text));
  const visible=settings.showWidgetSymbols!==false; const before=visible&&settings.showWidgetSymbolBefore!==false?String(settings.widgetSymbolBefore||'').slice(0,12):'', after=visible&&settings.showWidgetSymbolAfter!==false?String(settings.widgetSymbolAfter||'').slice(0,12):'';
  return line(settings, `${before}${decorated}${after}`, part);
}
async function renderMenu(ctx) {
  const settings=await getMenuSettings(ctx.sender||ctx.chat);
  let rows=getCommandRows();
  const newSet=await getNewCommandSet(rows.map(r=>r.command));
  if(!settings.widgets.includes('owner')) rows=rows.filter(r=>!r.owner);
  if(settings.categories?.length) rows=rows.filter(r=>settings.categories.includes(r.category));
  rows.sort((a,b)=> { if(settings.order==='category'){const byCategory=a.category.localeCompare(b.category);if(byCategory)return byCategory;return a.command.localeCompare(b.command);} return settings.order==='za'?-a.command.localeCompare(b.command):a.command.localeCompare(b.command); });
  const energy=await getEnergy(ctx.sender||ctx.chat).catch(()=>({energy:100}));
  const saver=await getEnergySaver(ctx.sender||ctx.chat).catch(()=>({enabled:false}));
  let saverCompact=false;
  if(saver.enabled&&Number(energy.energy)<20){const topCategories=[...new Set(rows.map(r=>r.category))].slice(0,5);rows=rows.filter(r=>topCategories.includes(r.category));saverCompact=true;}
  const totalCommands = rows.length;
  const pageLimitEnabled = settings.commandPageLimitEnabled !== false;
  const pageSize = pageLimitEnabled ? Math.max(100, Math.min(500, Math.floor(Number(settings.commandPageSize) || 100))) : Math.max(1, totalCommands);
  const page = Math.max(1, Math.floor(Number(ctx.args?.[0]) || 1));
  const totalPages = pageLimitEnabled ? Math.max(1, Math.ceil(totalCommands / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  rows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const t=TEMPLATE[settings.template]||TEMPLATE.corporate;
  const lines=[];
  if(settings.widgets.includes('heading')) {
    if(settings.topBorder!==false) lines.push(style(emphasized(settings,`${t.top} ${config.botName} — MENU`,'border'),settings.font));
    else lines.push(style(emphasized(settings,`${config.botName} — MENU`,'heading'),settings.font));
  }
  const batteryText = `🔋 Energi: ${Number(energy.energy||0).toFixed(2).replace('.',',')}%`;
  if (settings.showEnergyWidget !== false) lines.push(widgetLine(settings, settings.batteryDisplayStyle === 'match_menu' ? style(batteryText, settings.font) : batteryText));
  if(settings.energyDetails) lines.push('⚠️ Warning: Memuat detail energi akan memperlambat loading menu.');
  if(settings.widgets.includes('intro')) lines.push(style(emphasized(settings,`${settings.order==='category'?'Daftar perintah berdasarkan kategori lalu A–Z':settings.order==='za'?'Daftar perintah Z–A':'Daftar perintah A–Z'}\n`,'intro'),settings.font));
  const gap='\n'.repeat(Math.max(0,Math.min(3,Number(settings.spacing)||0)));
  const widgetLines = {};
  if(settings.widgets.includes('count')) widgetLines.count=widgetLine(settings,`Total perintah: ${totalCommands}${pageLimitEnabled?` · Halaman ${safePage}/${totalPages}`:''}`);
  if(settings.widgets.includes('prefix')) widgetLines.prefix=widgetLine(settings,`Prefix: ${config.prefixes.join(' ')}`);
  if(settings.widgets.includes('new')) widgetLines.new=widgetLine(settings,'🆕 = perintah baru selama 7 hari');
  if(settings.widgets.includes('website')) widgetLines.website=widgetLine(settings,`Website: ${config.website.baseUrl || 'belum dikonfigurasi'}`);
  if(settings.widgets.includes('info')) widgetLines.info=widgetLine(settings,`Info: Bot aktif · Prefix ${config.prefixes.join(' ')}`);
  if(settings.widgets.includes('rank')) widgetLines.rank=widgetLine(settings,`Rank/engagement: ${ctx.prefix}profile`);
  if(settings.widgets.includes('toprank')) { try { const board=await getLeaderboard(ctx.chat,3); widgetLines.toprank=widgetLine(settings,`Top Rank: ${board.length?board.map((p,i)=>`${i+1}. ${String(p.user||'player').split('@')[0]} · Lv.${p.level||1}`).join(' | '):'belum ada data'}`); } catch { widgetLines.toprank=widgetLine(settings,'Top Rank: data belum tersedia'); } }
  if(settings.widgets.includes('toplevels')) { try { const board=await getLeaderboard(ctx.chat,3); widgetLines.toplevels=widgetLine(settings,`Top Level: ${board.length?board.map((p,i)=>`${i+1}. ${String(p.user||'player').split('@')[0]} · Lv.${p.level||1}`).join(' | '):'belum ada data'}`); } catch { widgetLines.toplevels=widgetLine(settings,'Top Level: data belum tersedia'); } }
  if(settings.widgets.includes('modcoins')) { try { const energyInfo=await getEnergy(ctx.sender||ctx.chat); widgetLines.modcoins=widgetLine(settings,`Coin Mod: ${Number(energyInfo.modCoins||0).toLocaleString('id-ID')}`); } catch { widgetLines.modcoins=widgetLine(settings,'Coin Mod: data belum tersedia'); } }
  if(settings.widgets.includes('rpgstatus')) { try { const p=await getProfile(ctx.chat,ctx.sender); widgetLines.rpgstatus=widgetLine(settings,`RPG: Level ${p.level||1} · Gold/Coin ${Number(p.coin||0).toLocaleString('id-ID')} · XP ${p.xp||0}`); } catch { widgetLines.rpgstatus=widgetLine(settings,'RPG: data karakter belum tersedia'); } }
  if(settings.widgets.includes('leaderboard')) { try { const board=await getLeaderboard(ctx.chat,3); widgetLines.leaderboard=widgetLine(settings,`Leaderboard: ${board.length?board.map((p,i)=>`${i+1}.${String(p.user||'player').split('@')[0]} Lv.${p.level||1}`).join(' · '):'belum ada data'}`); } catch { widgetLines.leaderboard=widgetLine(settings,'Leaderboard: data belum tersedia'); } }
  if(settings.widgets.includes('commandhits')) { try { const hits=await getHits(); widgetLines.commandhits=widgetLine(settings,`Total hit command: ${Number(hits.total||0).toLocaleString('id-ID')}`); } catch { widgetLines.commandhits=widgetLine(settings,'Total hit command: tidak tersedia'); } }
  if(settings.widgets.includes('balance')) { try { const user=await getUser(ctx.sender); widgetLines.balance=widgetLine(settings,`Saldo: Rp${Number(user?.balance||0).toLocaleString('id-ID')}`); } catch { widgetLines.balance=widgetLine(settings,'Saldo: data belum tersedia'); } }
  if(settings.widgets.includes('totalusers') || settings.widgets.includes('registeredusers')) { try { const stats=await getUserStats(); if(settings.widgets.includes('totalusers')) widgetLines.totalusers=widgetLine(settings,`Total pengguna terpantau: ${stats.total}`); if(settings.widgets.includes('registeredusers')) widgetLines.registeredusers=widgetLine(settings,`Pengguna terdaftar: ${stats.registered}`); } catch {} }
  if(settings.widgets.includes('websiteProducts')) { try { const content=await getRazzaqWebsiteContent(); const products=content.products||content.catalog?.products||content.items||content.data?.products||[]; widgetLines.websiteProducts=widgetLine(settings,`Produk website: ${Array.isArray(products)?products.length:'data tidak tersedia'}`); } catch { widgetLines.websiteProducts=widgetLine(settings,'Produk website: data live tidak tersedia'); } }
  if(settings.widgets.includes('biocore')) widgetLines.biocore=widgetLine(settings,`Bio Core: runtime aktif · ${registry.plugins?.plugins?.size||0} plugin terdaftar`);
  if(settings.widgets.includes('events')) { try { const hits=await getHits(); widgetLines.events=widgetLine(settings,`Event/command tercatat: ${Number(hits.total||0).toLocaleString('id-ID')}`); } catch { widgetLines.events=widgetLine(settings,'Event runtime: tidak tersedia'); } }
  if(settings.widgets.includes('messages') || settings.widgets.includes('database')) { try { const db=await readAppDatabase(); const users=Object.values(db.users||{}); const totalMessages=users.reduce((n,u)=>n+Math.max(0,Number(u.messageCount)||0),0); if(settings.widgets.includes('messages')) widgetLines.messages=widgetLine(settings,`Pesan masuk tercatat: ${totalMessages.toLocaleString('id-ID')}`); if(settings.widgets.includes('database')) widgetLines.database=widgetLine(settings,`Database: lokal · ${users.length} user · update ${db.updatedAt?new Date(db.updatedAt).toLocaleString('id-ID'):'belum ada'}`); } catch { if(settings.widgets.includes('messages')) widgetLines.messages=widgetLine(settings,'Pesan masuk: data tidak tersedia'); if(settings.widgets.includes('database')) widgetLines.database=widgetLine(settings,'Database: tidak tersedia'); } }
  if(settings.widgets.includes('uptime')) { const seconds=Math.floor(process.uptime()); const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60); widgetLines.uptime=widgetLine(settings,`Uptime proses: ${hours}j ${minutes}m`); }
  const widgetOrder = [...new Set([...(settings.widgetOrder||[]), ...Object.keys(widgetLines)])].filter(id => widgetLines[id]);
  for (const [widgetIndex,id] of widgetOrder.entries()) lines.push(settings.widgetNumbering?`${widgetIndex+1}. ${widgetLines[id]}`:widgetLines[id]);
  if(['count','prefix','new'].some(id=>widgetLines[id])) lines.push('');
  let lastCategory='';
  rows.forEach((row,index)=>{
    if(settings.categoriesVisible!==false&&settings.widgets.includes('category')&&row.category!==lastCategory){lastCategory=row.category;lines.push('',line(settings,`〔 ${titleCase(lastCategory)} 〕`,'category'));}
    const plugin=registry.plugins.resolve(row.command);
    const energyMark=plugin?.energyMode==='static'?'📌':'⚡';
    const showEnergy=(settings.energyDetails||settings.showEnergyNumbers);
    const energyValue=settings.showEnergyNumbers?` ${Number(plugin?.energyCost ?? complexityScore(`${row.command} ${row.description}`)).toFixed(2).replace('.',',')}%`:'';
    const energySuffix=showEnergy?`${settings.showEnergyEmoji===false?'':` ${energyMark}`}${energyValue}`:'';
    const mark=newSet.has(row.command)?' 🆕':'';
    const desc=settings.description&&row.description?` — ${row.description}`:'';
    const accessMarks=`${row.limitCost>0?'🎟️ ':''}${row.premium?'💎 ':''}`;
    const commandText=emphasized(settings,`${String(index+1).padStart(2,'0')}. ${ctx.prefix}${row.command}${mark}${accessMarks}${energySuffix}`,'command'); const descText=desc&&isBold(settings,'description')?` — *${row.description}*`:desc; lines.push(`${gap}${line(settings,`${commandText}${descText}`,'none')}`);
  });
  if(settings.widgets.includes('footer')) lines.push('',line(settings,`Atur tampilan: ${ctx.prefix}setmenu`,'footer'));
  if(settings.widgets.includes('footer')) lines.push('',line(settings,'Legenda: ⚡ Energi dinamis · 📌 Energi statis · 🔢 angka biaya · 🎟️ memakai Limit · 💎 Premium eksklusif','footer'));
  if(settings.bottomBorder!==false) lines.push(style(emphasized(settings,t.bottom,'border'),settings.font));
  const text=lines.join('\n');
  if(saverCompact) return ctx.reply(`🔒 SAVER MODE · 5 kategori teratas untuk menghemat bandwidth\n\n${text}`);
  if(energy.energy < 10) return ctx.reply(`🌙 Mode energi rendah: menu ringkas tersedia.\n\n${text}`);
  if(settings.mode==='text') return ctx.reply(text);
  const user=ctx.sender||ctx.chat;
  const globalRecommendationsEnabled=await getGlobalRecommendationsEnabled();
  const recommendationContext={chatId:ctx.chat||ctx.chatId,isGroup:ctx.isGroup,isOwner:ctx.isOwner||ctx.owner,isPremium:ctx.isPremium||ctx.premium,limit:ctx.limit,modCoins:ctx.modCoins};
  const recommendationRows=filterRecommendationCandidates(rows,recommendationContext);
  const recommendations=(!globalRecommendationsEnabled||settings.recommendationEnabled===false)?[]:await getCommandRecommendations(user,recommendationRows,1);
  const rec=recommendations[0];
  const buttons=[];
  if(globalRecommendationsEnabled&&settings.recommendationEnabled!==false){ if(rec) buttons.push({name:'quick_reply',title:`Rekomendasi: ${ctx.prefix}${rec.command} (${rec.percentage}%)`,id:`${ctx.prefix}${rec.command}`}); else buttons.push({name:'quick_reply',title:'Lihat rekomendasi',id:`${ctx.prefix}explore`}); }
  if (settings.showNextPageInfo !== false && totalPages > 1) buttons.push({name:'quick_reply',title:safePage < totalPages ? `Halaman ${safePage+1} ➡️` : `⬅️ Halaman ${safePage-1}`,id:`${ctx.prefix}menu ${safePage < totalPages ? safePage+1 : safePage-1}`});
  buttons.push({name:'cta_url',title:'Website Official',url:config.website.baseUrl||'https://razzaq-ventures-platform.vercel.app',merchant_url:config.website.baseUrl||'https://razzaq-ventures-platform.vercel.app',webview_interaction:true});
  const rowsMenu=[{title:'Buka Pengaturan Utama Lengkap',description:'Font, widget, template, border, spasi, gambar, urutan dan ketebalan font',id:`${ctx.prefix}setmenu`},{title:'Desain menu berbantuan AI',description:'Pilih mode desain; struktur command dan izin tetap dikunci oleh registry',id:`${ctx.prefix}setmenu response`},{title:'Mode respon menu',description:`Saat ini: ${settings.menuResponseMode||'classic'} · ganti klasik/AI`,id:`${ctx.prefix}setmenu response`}];
  buttons.push({name:'single_select',title:'Pengaturan Menu',sections:[{title:'Pengaturan Lengkap',rows:rowsMenu}]});
  let image=null;
  let imageWarning='';
  if(settings.imageMode==='manual'&&settings.imagePath){
    try { image=await readFile(settings.imagePath); }
    catch { imageWarning='Foto menu manual tidak ditemukan di penyimpanan bot. Pilih ulang melalui .setmenu image manual.'; }
  } else if(['official','official-rpg','official-v2','official-rpg-v2'].includes(settings.imageMode)) {
    const isCanvasV2 = String(settings.imageMode).endsWith('-v2');
    const officialUrl=String(isCanvasV2 ? '' : (String(settings.imageMode).startsWith('official-rpg') ? (config.website.rpgImageUrl||'') : (config.website.menuImageUrl||''))).trim();
    let validUrl=false;try{const parsed=new URL(officialUrl);validUrl=['http:','https:'].includes(parsed.protocol);}catch{}
    if(validUrl) image={url:officialUrl};
    else {
      let avatarPath = null;
      const configuredAvatar = settings.canvasAvatarSource === 'logo' ? process.env.BOT_LOGO_PATH : process.env.OWNER_AVATAR_PATH;
      if (configuredAvatar) avatarPath = configuredAvatar;
      if (!avatarPath && settings.canvasAvatarSource !== 'logo') { try { const profile = await getProfile(ctx.chat, ctx.sender); if (profile?.profileImageMode === 'manual' && profile?.profileImagePath) avatarPath = profile.profileImagePath; } catch {} }
      const canvas = await renderOfficialCanvas(String(settings.imageMode).startsWith('official-rpg')?'rpg':'menu', config.botName, avatarPath);
      if(canvas) image=canvas;
      else imageWarning='Kanvas official gagal dibuat pada host ini. Pastikan FFmpeg tersedia; menu teks tetap dapat digunakan.';
    }
  }
  // Attach the canvas directly to the same interactive message so the image,
  // command list, and embedded settings button are delivered together.
  const finalText=imageWarning?`${text}\n\n⚠️ ${imageWarning}`:text;
  try { return await ctx.sendInteractive({title:'',subtitle:'',body:finalText,footer:style('Pengaturan menu tersimpan per pengguna.',settings.font),image:image||undefined,buttons,quoteMode:settings.quoteMode||'default',quoteExperiment:settings.quoteExperiment||'',fakeContactName:settings.fakeContactName,fakeContactNumber:settings.fakeContactNumber,fakeProductName:settings.fakeProductName,fakeProductPrice:settings.fakeProductPrice,fakeProductImageUrl:settings.fakeProductImageUrl,forwardedLabelMode:settings.forwardedLabelMode||'full'}); }
  catch { return ctx.reply(`${finalText}\n\nGunakan ${ctx.prefix}setmenu untuk mengatur menu.`); }
}
export default {name:'menu',command:['menu','help'],menuCommands:['menu'],description:'Tampilkan daftar perintah dan pengaturan menu pribadi',category:'general',cooldown:3000,async execute(ctx){return renderMenu(ctx);}};

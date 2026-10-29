import { mutateAppDatabase, readAppDatabase } from '../../lib/app-database.js';

const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const token = () => Math.random().toString(36).slice(2, 9).toUpperCase();
const key = (ctx) => `${ctx.chat}|${ctx.sender}`;
const safe = (v, n=100) => String(v || '').replace(/[\r\n\t]/g, ' ').slice(0,n);
export function sosLines(board) { return WIN_LINES.filter(line => line.map(i => board[i]).join('').toUpperCase() === 'SOS'); }
function render(board) { return [0,1,2].map(r => board.slice(r*3,r*3+3).map((v,c) => `${'ABC'[c]}${r+1}:${v || '·'}`).join(' │ ')).join('\n'); }
function buttons(ctx, game, action='move') {
  const rows=[];
  for (let i=0;i<9;i++) if (!game.board[i]) rows.push({title:`${'ABC'[i%3]}${Math.floor(i/3)+1}`,description:'Pilih kotak kosong',id:`${ctx.prefix}sos ${action} ${game.id} ${i} S`});
  return [{name:'single_select',title:'Pilih kotak dan simbol S',sections:[{title:'Simbol S',rows}]}, {name:'single_select',title:'Pilih kotak dan simbol O',sections:[{title:'Simbol O',rows:rows.map(r=>({...r,id:r.id.replace(/ S$/,' O')}))}]}, {name:'quick_reply',title:'Lihat papan',id:`${ctx.prefix}sos board ${game.id}`},{name:'quick_reply',title:'Menyerah',id:`${ctx.prefix}sos resign ${game.id}`}];
}
async function saveGame(id, patch) { return mutateAppDatabase(db => { db.games ||= {}; if (!db.games[id]) throw new Error('Permainan tidak ditemukan.'); Object.assign(db.games[id], patch); return structuredClone(db.games[id]); }); }
export default {
  name:'sos-multiplayer', command:['sos'], category:'games', cooldown:900,
  description:'SOS multiplayer dengan undangan, validasi giliran, deteksi SOS, seri dan timeout',
  async execute(ctx) {
    const [actionRaw, idRaw, indexRaw, letterRaw] = ctx.args || [];
    const action=String(actionRaw||'help').toLowerCase();
    const sender=String(ctx.sender||'');
    if (!sender) return ctx.reply('Identitas pemain tidak tersedia.');
    if (['help',''].includes(action)) return ctx.sendInteractive({title:'🔠 SOS Multiplayer',body:`Tantang lawan dengan .sos challenge @anggota\nTerima: .sos accept ID\nLangkah: gunakan tombol papan atau .sos move ID KOTAK S/O\nContoh: .sos move ABC123 4 S\nPapan dan sesi tersimpan agar tetap konsisten setelah bot restart.`,buttons:[{name:'quick_reply',title:'Tantang pemain',id:`${ctx.prefix}sos challenge`},{name:'quick_reply',title:'Lihat aturan',id:`${ctx.prefix}sos rules`}]});
    if (action==='rules') return ctx.reply('Aturan SOS: pemain bergiliran memilih kotak kosong dan menulis S atau O. Setiap garis S-O-S horizontal, vertikal, atau diagonal yang baru terbentuk memberi 1 poin; pemain yang membentuk SOS mendapat giliran tambahan. Papan penuh mengakhiri permainan; skor tertinggi menang.');
    if (action==='challenge' || action==='start' && !idRaw) {
      const opponent=String(ctx.mentionedJid?.[0] || ctx.mentions?.[0] || '').trim();
      if (!opponent) return ctx.reply(`Mention lawan. Contoh: ${ctx.prefix}sos challenge @anggota`);
      if (opponent===sender) return ctx.reply('Kamu tidak dapat menantang diri sendiri.');
      const id=token(); const game={id,type:'sos',status:'pending',chat:ctx.chat,players:[sender,opponent],turn:0,board:Array(9).fill(''),scores:{[sender]:0,[opponent]:0},createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+15*60_000,lastLines:[]};
      await mutateAppDatabase(db=>{db.games ||= {};db.games[id]=game;});
      return ctx.sendInteractive({title:'🔠 Tantangan SOS',body:`${sender} menantang ${opponent}.\nID: ${id}\nBatas menerima: 15 menit.`,buttons:[{name:'quick_reply',title:'Terima tantangan',id:`${ctx.prefix}sos accept ${id}`},{name:'quick_reply',title:'Tolak',id:`${ctx.prefix}sos decline ${id}`}]});
    }
    const id=String(idRaw||'').toUpperCase(); const db=await readAppDatabase(); const game=db.games?.[id];
    if (!game || game.type!=='sos') return ctx.reply('Game SOS tidak ditemukan atau sudah tidak tersedia.');
    if (game.expiresAt && game.expiresAt < Date.now() && !['finished','declined','resigned'].includes(game.status)) { await saveGame(id,{status:'expired',updatedAt:Date.now()}); return ctx.reply('Sesi SOS sudah kedaluwarsa. Buat tantangan baru.'); }
    if (action==='accept') { if (sender!==game.players[1]) return ctx.reply('Hanya pemain yang ditantang dapat menerima.'); if(game.status!=='pending')return ctx.reply('Tantangan tidak lagi menunggu jawaban.'); const next=await saveGame(id,{status:'active',expiresAt:Date.now()+15*60_000,updatedAt:Date.now()}); return ctx.sendInteractive({title:'🔠 SOS · Pertandingan dimulai',body:`${render(next.board)}\n\nGiliran: @${next.players[next.turn].split('@')[0]}\nSkor: ${next.players.map(p=>`${p.split('@')[0]} ${next.scores[p]}`).join(' · ')}`,buttons:buttons(ctx,next)}); }
    if (action==='decline') { if(sender!==game.players[1])return ctx.reply('Hanya lawan yang ditantang dapat menolak.');await saveGame(id,{status:'declined',updatedAt:Date.now()});return ctx.reply('Tantangan SOS ditolak.'); }
    if (action==='resign') { if(!game.players.includes(sender))return ctx.reply('Kamu bukan pemain pertandingan ini.');if(game.status!=='active')return ctx.reply('Pertandingan tidak aktif.');const winner=game.players.find(p=>p!==sender);await saveGame(id,{status:'resigned',winner,updatedAt:Date.now()});return ctx.reply(`🏳️ ${sender.split('@')[0]} menyerah. Pemenang: ${winner.split('@')[0]}.`); }
    if (!game.players.includes(sender)) return ctx.reply('Tombol/ID pertandingan ini bukan milikmu.');
    if (action==='board') return ctx.sendInteractive({title:'🔠 SOS · Papan',body:`${render(game.board)}\n\nStatus: ${game.status}\nGiliran: ${game.players[game.turn]?.split('@')[0]||'-'}\nSkor: ${game.players.map(p=>`${p.split('@')[0]} ${game.scores[p]}`).join(' · ')}`,buttons:game.status==='active'?buttons(ctx,game):[{name:'quick_reply',title:'Tantangan baru',id:`${ctx.prefix}sos challenge`}]});
    if (action!=='move') return ctx.reply(`Gunakan: ${ctx.prefix}sos board ${id} atau pilih langkah dari tombol.`);
    if(game.status!=='active')return ctx.reply('Pertandingan belum aktif atau sudah selesai.');
    if(game.players[game.turn]!==sender)return ctx.reply('Bukan giliranmu.');
    const index=Number(indexRaw),letter=String(letterRaw||'').toUpperCase();
    if(!Number.isInteger(index)||index<0||index>8||game.board[index]||!['S','O'].includes(letter))return ctx.reply('Langkah tidak valid: pilih kotak kosong dan simbol S atau O.');
    const board=[...game.board];board[index]=letter;
    const old=new Set((game.lastLines||[]).map(x=>x.join(',')));const lines=sosLines(board);const fresh=lines.filter(line=>!old.has(line.join(',')));const scores={...game.scores};if(fresh.length)scores[sender]=(scores[sender]||0)+fresh.length;
    const finished=board.every(Boolean);const winner=finished?(scores[game.players[0]]===scores[game.players[1]]?null:scores[game.players[0]]>scores[game.players[1]]?game.players[0]:game.players[1]):null;
    const nextTurn=fresh.length?game.turn:1-game.turn;
    const updated=await saveGame(id,{board,scores,lastLines:lines,turn:nextTurn,status:finished?'finished':'active',winner,updatedAt:Date.now(),expiresAt:Date.now()+15*60_000});
    const note=fresh.length?`\n✨ SOS terbentuk (${fresh.length})! Giliran tambahan.`:'';
    const result=finished?`\n\n🏁 Selesai: ${winner?`pemenang ${winner.split('@')[0]}`:'seri'}\nSkor akhir: ${game.players.map(p=>`${p.split('@')[0]} ${scores[p]}`).join(' · ')}`:'';
    return ctx.sendInteractive({title:finished?'🏁 SOS · Selesai':'🔠 SOS Multiplayer',body:`${render(board)}\n\nSkor: ${game.players.map(p=>`${p.split('@')[0]} ${scores[p]}`).join(' · ')}${note}${result}${finished?'':`\nGiliran: ${updated.players[updated.turn].split('@')[0]}`}`,buttons:finished?[{name:'quick_reply',title:'Main lagi',id:`${ctx.prefix}sos challenge`},{name:'Menu game',id:`${ctx.prefix}menu`}]:buttons(ctx,updated)});
  }
};

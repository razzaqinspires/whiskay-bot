import { mutateAppDatabase, readAppDatabase, updateUser } from '../../lib/app-database.js';
const FILES = 'abcdefgh';
const INITIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const PIECES = { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟' };
function initialBoard() { const board={}; const rows=INITIAL.split('/'); rows.forEach((row,ri)=>{let file=0;for(const c of row){if(/\d/.test(c)){file+=Number(c);continue;}board[`${FILES[file]}${8-ri}`]=c;file++;}});return board; }
function render(board) { const lines=['    a b c d e f g h','  ┌─────────────────┐']; for(let rank=8;rank>=1;rank--){lines.push(`${rank} │ ${FILES.split('').map(file=>PIECES[board[`${file}${rank}`]]||'·').join(' ')} │ ${rank}`);} lines.push('  └─────────────────┘','    a b c d e f g h');return lines.join('\n'); }
const side = p => p === p.toUpperCase() ? 'white' : 'black';
function coords(sq){if(!/^[a-h][1-8]$/.test(sq))return null;return {f:FILES.indexOf(sq[0]),r:Number(sq[1])};}
function pathClear(board,from,to,df,dr){let f=from.f+df,r=from.r+dr;while(f!==to.f||r!==to.r){if(board[`${FILES[f]}${r}`])return false;f+=df;r+=dr;}return true;}
function isLegalPseudo(board,fromSq,toSq,color){
 const from=coords(fromSq),to=coords(toSq);if(!from||!to||fromSq===toSq)return false;
 const piece=board[fromSq],target=board[toSq];if(!piece||side(piece)!==color||(target&&side(target)===color))return false;
 const type=piece.toLowerCase(),df=to.f-from.f,dr=to.r-from.r,adf=Math.abs(df),adr=Math.abs(dr);
 if(type==='p'){const dir=color==='white'?1:-1,start=color==='white'?2:7;if(df===0&&!target&&dr===dir)return true;if(df===0&&!target&&from.r===start&&dr===2*dir&&!board[`${FILES[from.f]}${from.r+dir}`])return true;return adf===1&&dr===dir&&Boolean(target);}
 if(type==='n')return (adf===1&&adr===2)||(adf===2&&adr===1);
 if(type==='k')return adf<=1&&adr<=1;
 if(type==='r'&&(df===0||dr===0))return pathClear(board,from,to,Math.sign(df),Math.sign(dr));
 if(type==='b'&&adf===adr)return pathClear(board,from,to,Math.sign(df),Math.sign(dr));
 if(type==='q'&&(df===0||dr===0||adf===adr))return pathClear(board,from,to,Math.sign(df),Math.sign(dr));
 return false;
}
function move(board,from,to,color){if(!isLegalPseudo(board,from,to,color))return false;const piece=board[from];board[to]=piece;delete board[from];if(piece.toLowerCase()==='p'&&(to.endsWith('8')||to.endsWith('1')))board[to]=color==='white'?'Q':'q';return true;}
function squareRows(prefix, gameId, action, coordsList=FILES.split('').flatMap(f=>[8,7,6,5,4,3,2,1].map(r=>`${f}${r}`))) {
 const sections=[];for(let i=0;i<coordsList.length;i+=8)sections.push({title:`Pilih kotak ${Math.floor(i/8)+1}`,rows:coordsList.slice(i,i+8).map(sq=>({title:sq.toUpperCase(),description:'Kotak papan catur',id:`${prefix}catur ${action} ${gameId} ${sq}`}))});
 return sections;
}
async function sendBoard(ctx, game, note='') {
 const turnName=game.turn==='white'?'Putih':'Hitam';
 const body=`♟️ *WHISKAY CHESS*\nGame: ${game.id}\nPutih: ${game.white}\nHitam: ${game.black}\nGiliran: ${turnName}\n\n${render(game.board)}\n\n${note}\n\nCatatan: engine ini memvalidasi gerak dasar bidak; belum memvalidasi skak, skakmat, rokade, atau en passant.`;
 return ctx.sendInteractive({title:'♟️ Catur WHISKAY',subtitle:`Giliran ${turnName}`,body,footer:'Pilih bidak lalu pilih tujuan dari daftar.',buttons:[{name:'single_select',title:'Pilih Bidak',sections:squareRows(ctx.prefix,game.id,'from')},{name:'quick_reply',title:'Batalkan game',id:`${ctx.prefix}catur stop ${game.id}`}]});
}
export default {
 name:'chess', command:['catur','chess'], category:'games', cooldown:1000, description:'Catur dua pemain dengan tombol pilih kotak dan validasi giliran',
 async execute(ctx){
  const args=ctx.args||[], action=String(args[0]||'start').toLowerCase(), sender=String(ctx.sender||ctx.chat);
  if(ctx.isGroup===false && action==='start') {
    // Private games can still be challenged by supplying a JID/phone.
  }
  if(action==='start'||action==='new'){
   let opponent=String(args[1]||'').replace(/[^\d@.a-z_-]/gi,''); if(/^\d{8,15}$/.test(opponent)) opponent += '@s.whatsapp.net';
   if(ctx.mentionedJid?.length)opponent=ctx.mentionedJid[0];
   if(!opponent)return ctx.reply('Format: .catur @lawan (mention lawan di grup) atau .catur 628xxxx@s.whatsapp.net');
   if(opponent===sender)return ctx.reply('Pilih lawan selain dirimu.');
   const id=Math.random().toString(36).slice(2,9).toUpperCase();
   const game={id,white:sender,black:opponent,turn:'white',board:initialBoard(),createdAt:Date.now(),status:'active',selected:{}};
   await mutateAppDatabase(db=>{db.games[id]=game;});
   return ctx.sendInteractive({title:'♟️ Tantangan Catur',subtitle:'WHISKAY Chess',body:`Tantangan catur dari ${sender} kepada ${opponent}.\nGame ID: ${id}\nPutih bergerak pertama. Engine memvalidasi gerak dasar, tetapi belum menangani skak/skakmat.`,buttons:[{name:'quick_reply',title:'Terima & tampilkan papan',id:`${ctx.prefix}catur accept ${id}`},{name:'quick_reply',title:'Tolak',id:`${ctx.prefix}catur decline ${id}`}]});
  }
  const id=String(args[1]||'').toUpperCase();
  const db=await readAppDatabase();const game=db.games[id];
  if(!game)return ctx.reply('Game tidak ditemukan atau sudah tidak tersedia.');
  if(action==='decline'){if(sender!==game.black)return ctx.reply('Hanya pemain yang ditantang yang dapat menolak.');await mutateAppDatabase(d=>{if(d.games[id])d.games[id].status='declined';});return ctx.reply('Tantangan ditolak.');}
  if(action==='accept'){if(sender!==game.black)return ctx.reply('Hanya pemain yang ditantang yang dapat menerima.');return sendBoard(ctx,game,'Tantangan diterima.');}
  if(action==='stop'){if(![game.white,game.black].includes(sender)&&!ctx.isOwner){const u=await updateUser(sender,{warnings:(Number((await readAppDatabase()).users[sender]?.warnings)||0)+1});if(u.warnings>=3)await updateUser(sender,{banned:true});return ctx.reply(u.warnings>=3?'⛔ Tiga percobaan tanpa izin. Akun diblokir dari command.':'⚠️ Tombol game ini bukan milikmu. Percobaan dicatat.');}await mutateAppDatabase(d=>{if(d.games[id])d.games[id].status='stopped';});return ctx.reply('Game dihentikan.');}
  if(!['from','to'].includes(action))return sendBoard(ctx,game);
  if(![game.white,game.black].includes(sender)){
   const user=(await readAppDatabase()).users[sender];const warnings=(Number(user?.warnings)||0)+1;await updateUser(sender,{warnings,banned:warnings>=3});
   return ctx.reply(warnings>=3?'⛔ Akses command diblokir setelah 3 percobaan mengendalikan game milik orang lain.':'⚠️ Tombol ini bukan milikmu. Aksi diabaikan; jangan gunakan tombol game pengguna lain.');
  }
  if(game.status!=='active')return ctx.reply('Game sudah selesai/dihentikan.');
  const color=sender===game.white?'white':'black';
  if(game.turn!==color)return ctx.reply('Bukan giliranmu.');
  const square=String(args[2]||'').toLowerCase();
  if(action==='from'){
   if(!coords(square)||!game.board[square]||side(game.board[square])!==color)return ctx.reply('Pilih kotak berisi bidak milikmu.');
   await mutateAppDatabase(d=>{d.games[id].selected[sender]=square;});
   const targets=FILES.split('').flatMap(f=>[8,7,6,5,4,3,2,1].map(r=>`${f}${r}`));
   return ctx.sendInteractive({title:'♟️ Pilih Tujuan',subtitle:`Bidak ${square.toUpperCase()}`,body:`Bidak dipilih: ${square.toUpperCase()}\nPilih kotak tujuan. Gerak ilegal akan ditolak.`,buttons:[{name:'single_select',title:'Pilih Kotak Tujuan',sections:squareRows(ctx.prefix,id,'to',targets)},{name:'quick_reply',title:'Kembali ke papan',id:`${ctx.prefix}catur board ${id}`}]});
  }
  const from=game.selected?.[sender];
  if(!from)return ctx.reply(`Pilih bidak dahulu: .catur from ${id} e2`);
  if(!coords(square))return ctx.reply('Koordinat tidak valid, contoh e4.');
  const next={...game.board};
  if(!move(next,from,square,color))return ctx.reply('Gerakan tidak valid menurut aturan dasar bidak. Pilih kembali bidak dan tujuan.');
  const captured=game.board[square];const kingCaptured=captured?.toLowerCase()==='k';
  await mutateAppDatabase(d=>{const g=d.games[id];if(!g||g.turn!==color)return;g.board=next;g.turn=color==='white'?'black':'white';g.selected={};g.lastMove={from,to:square,by:sender,at:Date.now()};if(kingCaptured)g.status='finished';});
  const updated=(await readAppDatabase()).games[id];
  if(kingCaptured)return ctx.reply(`🏁 ${color==='white'?'Putih':'Hitam'} menang dengan menangkap raja. (Mode latihan; engine belum menerapkan aturan skakmat.)\n${render(updated.board)}`);
  return sendBoard(ctx,updated,`Gerakan: ${from.toUpperCase()} → ${square.toUpperCase()}`);
 }
};

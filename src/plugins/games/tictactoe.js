const games = new Map();
const WIN = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const LABELS = ['A1','A2','A3','B1','B2','B3','C1','C2','C3'];
const EMPTY = '·';
export function winner(board) { for (const [a,b,c] of WIN) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]; return board.every(Boolean) ? 'draw' : null; }
export function chooseBotMove(board) {
  const winningMove = (symbol) => { for (let i=0;i<9;i++) if (!board[i]) { const copy=[...board]; copy[i]=symbol; if (winner(copy)===symbol) return i; } return -1; };
  const win = winningMove('O'); if (win >= 0) return win;
  const block = winningMove('X'); if (block >= 0) return block;
  if (!board[4]) return 4;
  const corners = [0,2,6,8].filter(i=>!board[i]);
  if (corners.length) return corners[0];
  return board.findIndex(v=>!v);
}
function boardText(board) { return `Kamu: X · Bot: O\n\n${[0,1,2].map(r=>`${board.slice(r*3,r*3+3).map(x=>x||EMPTY).join(' │ ')}`).join('\n───┼───┼───\n')}\n\nPilih kotak kosong dari daftar.`; }
function boardButtons(ctx, id, board) { const rows=LABELS.map((label,i)=>({title:`${label} · ${board[i]||'kosong'}`,description:board[i]?'Sudah terisi':'Pilih kotak ini',id:`${ctx.prefix}tictactoe move ${id} ${i}`})).filter((_,i)=>!board[i]); return [{name:'single_select',title:'Pilih Kotak',sections:[{title:'Kotak Tersedia',rows}]},{name:'quick_reply',title:'Menyerah / tutup',id:`${ctx.prefix}tictactoe stop ${id}`}]; }
export default {
  name:'tictactoe', command:['tictactoe','ttt'], category:'games', cooldown:1200,
  description:'Permainan Tic-Tac-Toe solo melawan bot dengan langkah tervalidasi',
  async execute(ctx) {
    const sub=String(ctx.args?.[0]||'').toLowerCase(); const id=String(ctx.args?.[1]||''); const ownerKey=`${ctx.chat}|${ctx.sender}`;
    if(sub==='stop') { const game=games.get(ownerKey); if(!game||game.id!==id) return ctx.reply('Sesi Tic-Tac-Toe tidak ditemukan atau bukan milikmu.'); games.delete(ownerKey); return ctx.reply('Sesi Tic-Tac-Toe ditutup.'); }
    if(sub==='move') {
      const game=games.get(ownerKey); const index=Number(ctx.args?.[2]);
      if(!game||game.id!==id||game.expiresAt<Date.now()) { games.delete(ownerKey); return ctx.sendInteractive({title:'♟️ Tic-Tac-Toe',body:'Sesi tidak ditemukan atau kedaluwarsa. Mulai permainan baru.',buttons:[{name:'quick_reply',title:'Mulai lagi',id:`${ctx.prefix}tictactoe`}]}); }
      if(!Number.isInteger(index)||index<0||index>8||game.board[index]) return ctx.sendInteractive({title:'Langkah Ditolak',body:'Kotak tidak valid atau sudah terisi. Pilih kotak kosong.',buttons:boardButtons(ctx,game.id,game.board)});
      game.board[index]='X'; let result=winner(game.board);
      if(!result) { const move=chooseBotMove(game.board); if(move>=0)game.board[move]='O'; result=winner(game.board); }
      game.expiresAt=Date.now()+10*60_000;
      if(result) { games.delete(ownerKey); const message=result==='draw'?'Permainan seri.':result==='X'?'Kamu menang!':'Bot menang ronde ini.'; return ctx.sendInteractive({title:'⭕ Tic-Tac-Toe · Selesai',body:`${boardText(game.board)}\n\n${message}\nSesi berakhir.`,buttons:[{name:'quick_reply',title:'Main lagi',id:`${ctx.prefix}tictactoe`},{name:'quick_reply',title:'Menu Game',id:`${ctx.prefix}menu`}]}); }
      return ctx.sendInteractive({title:'⭕ WHISKAY · TIC-TAC-TOE',body:boardText(game.board),buttons:boardButtons(ctx,game.id,game.board)});
    }
    const board=Array(9).fill(null); const game={id:Math.random().toString(36).slice(2,9),board,expiresAt:Date.now()+10*60_000}; games.set(ownerKey,game);
    return ctx.sendInteractive({title:'⭕ WHISKAY · TIC-TAC-TOE',subtitle:'Kamu X · Bot O · Sesi 10 menit',body:boardText(board)+'\nBot akan memblokir langkah menang yang terlihat; permainan ini hiburan lokal.',buttons:boardButtons(ctx,game.id,board)});
  }
};

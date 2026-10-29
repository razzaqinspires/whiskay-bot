/** Whiskay Werewolf engine: deterministic, room-local state; rebuilt from documented game concepts. */
import { randomInt } from 'node:crypto';

export const WEREWOLF_ROLES = Object.freeze({
  werewolf: { team: 'wolf', skill: 'kill' }, villager: { team: 'village', skill: null },
  seer: { team: 'village', skill: 'inspect' }, guardian: { team: 'village', skill: 'protect' },
  witch: { team: 'village', skill: 'potion' }, hunter: { team: 'village', skill: 'hunt' },
  sorcerer: { team: 'wolf', skill: 'inspect' }, traitor: { team: 'village', skill: 'convert' },
  lycan: { team: 'village', skill: null }
});
const clone = value => structuredClone(value);
const active = room => room.players.filter(p => p.alive);
const shuffled = values => { const a=[...values]; for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; };
export function createWerewolfRoom({ chat, owner, now=Date.now() }) {
  if (!String(chat||'').endsWith('@g.us')) throw new TypeError('Werewolf hanya dapat dimainkan di grup.');
  if (!owner) throw new TypeError('owner wajib ditentukan.');
  return { id:`WW-${randomInt(0x100000,0xffffff).toString(16).toUpperCase()}`, chat, owner, status:'lobby', phase:'lobby', round:0, players:[], votes:{}, nightActions:{}, mayor:null, history:[], createdAt:now, updatedAt:now, winner:null };
}
export function joinWerewolf(room, user, name='Player', now=Date.now()) {
  if (!room || room.status!=='lobby') throw new Error('Room tidak sedang menerima pemain.');
  if (!user) throw new Error('ID pemain tidak valid.');
  if (room.players.some(p=>p.id===user)) throw new Error('Kamu sudah bergabung.');
  if (room.players.length>=15) throw new Error('Room penuh (maksimal 15 pemain).');
  room.players.push({ id:user, name:String(name||'Player').slice(0,60), number:room.players.length+1, role:null, alive:true, mayor:false, potions:{heal:true,poison:true}, actionsUsed:{} });
  room.updatedAt=now; return clone(room);
}
export function leaveWerewolf(room,user,now=Date.now()) {
  if(!room||room.status!=='lobby') throw new Error('Pemain hanya dapat keluar sebelum game dimulai.');
  const idx=room.players.findIndex(p=>p.id===user); if(idx<0)throw new Error('Pemain tidak ada di room.');
  room.players.splice(idx,1); room.players.forEach((p,i)=>p.number=i+1); if(room.owner===user)room.owner=room.players[0]?.id||null; room.updatedAt=now; return clone(room);
}
export function startWerewolf(room,actor,now=Date.now()) {
  if(!room||room.status!=='lobby')throw new Error('Game bukan di fase lobby.');
  if(room.owner!==actor)throw new Error('Hanya pembuat room yang dapat memulai game.');
  if(room.players.length<5)throw new Error('Minimal 5 pemain dibutuhkan.');
  const n=room.players.length;
  const roles=['werewolf']; if(n>=7)roles.push('werewolf');
  if(n>=5)roles.push('seer'); if(n>=6)roles.push('guardian'); if(n>=7)roles.push('witch'); if(n>=8)roles.push('sorcerer'); if(n>=9)roles.push('hunter'); if(n>=10)roles.push('traitor'); if(n>=11)roles.push('lycan');
  while(roles.length<n)roles.push('villager');
  shuffled(roles).forEach((role,i)=>{room.players[i].role=role;room.players[i].alive=true;room.players[i].actionsUsed={};});
  room.status='active';room.phase='night';room.round=1;room.votes={};room.nightActions={};room.updatedAt=now;
  room.history.push({at:now,type:'started',players:n}); return clone(room);
}
function assertAlive(room,user){const p=room.players.find(p=>p.id===user);if(!p)throw new Error('Kamu bukan pemain room ini.');if(!p.alive)throw new Error('Pemain yang sudah mati tidak dapat melakukan aksi.');return p;}
export function voteWerewolf(room,user,target,now=Date.now()) {
  if(room?.status!=='active'||room.phase!=='day')throw new Error('Voting hanya dapat dilakukan pada fase siang.');
  assertAlive(room,user); const victim=assertAlive(room,target); if(victim.id===user)throw new Error('Tidak dapat memilih diri sendiri.');
  room.votes[user]=target;room.updatedAt=now;return tallyWerewolfVotes(room);
}
export function tallyWerewolfVotes(room){const tally={};for(const [user,target] of Object.entries(room.votes||{})){if(room.players.some(p=>p.id===user&&p.alive)&&room.players.some(p=>p.id===target&&p.alive))tally[target]=(tally[target]||0)+1;}
 const rows=Object.entries(tally).sort((a,b)=>b[1]-a[1]);return {tally,eliminated:rows.length&&(!rows[1]||rows[0][1]>rows[1][1])?rows[0][0]:null,tie:rows.length>1&&rows[0][1]===rows[1][1]};}
export function submitWerewolfNightAction(room,user,action,target,now=Date.now()) {
  if(room?.status!=='active'||room.phase!=='night')throw new Error('Aksi role hanya dapat dilakukan saat malam.');
  const actor=assertAlive(room,user),def=WEREWOLF_ROLES[actor.role]; if(!def?.skill)throw new Error('Role kamu tidak memiliki aksi malam.');
  const allowed={werewolf:['kill'],seer:['inspect'],sorcerer:['inspect'],guardian:['protect'],witch:['heal','poison'],hunter:['hunt'],traitor:[]};
  if(!(allowed[actor.role]||[]).includes(action))throw new Error('Aksi tidak sesuai role.');
  if(actor.actionsUsed[action])throw new Error('Aksi ini sudah digunakan pada ronde ini.');
  if(actor.role==='witch'&&['heal','poison'].includes(action)&&(actor.actionsUsed.heal||actor.actionsUsed.poison))throw new Error('Witch hanya dapat memakai satu potion per malam.');
  const victim=assertAlive(room,target);if(action!=='heal'&&target===user)throw new Error('Target tidak valid.');
  if(action==='kill'&&victim.role==='werewolf')throw new Error('Werewolf tidak dapat menyerang sesamanya.');
  if(action==='heal'&&!actor.potions.heal)throw new Error('Potion penyembuh sudah habis.');
  if(action==='poison'&&!actor.potions.poison)throw new Error('Potion racun sudah habis.');
  actor.actionsUsed[action]=true;if(action==='heal')actor.potions.heal=false;if(action==='poison')actor.potions.poison=false;
  room.nightActions[action]=room.nightActions[action]||{};room.nightActions[action][user]=target;room.updatedAt=now;
  if(['inspect'].includes(action))return {privateResult:true,target:target,role:action==='inspect'?(victim.role==='lycan'?'werewolf':victim.role):undefined};
  return {ok:true,action,target};
}
export function resolveWerewolfNight(room,now=Date.now()) {
  if(room?.status!=='active'||room.phase!=='night')throw new Error('Tidak sedang dalam fase malam.');
  const actions=room.nightActions||{}, protectedIds=new Set(Object.values(actions.protect||{}));
  const killed=Object.values(actions.kill||{}); const poisoned=Object.values(actions.poison||{}); const protectedTarget=Object.values(actions.protect||{});
  const saved=new Set(Object.values(actions.heal||{}));const deaths=[...new Set([...killed,...poisoned])].filter(id=>!protectedIds.has(id)&&!protectedTarget.includes(id)&&!saved.has(id));
  for(const id of deaths){const p=room.players.find(p=>p.id===id&&p.alive);if(p){p.alive=false;room.history.push({at:now,type:'death',player:id,phase:'night'});}}
  const survivors=active(room),wolves=survivors.filter(p=>['werewolf','sorcerer'].includes(p.role));
  if(wolves.length===0&&survivors.some(p=>p.role==='traitor')){const t=survivors.find(p=>p.role==='traitor');t.role='werewolf';}
  const win=werewolfWinner(room);room.nightActions={};room.votes={};room.phase=win?'finished':'day';room.status=win?'finished':'active';room.winner=win;room.updatedAt=now;room.round+=win?0:0;
  room.history.push({at:now,type:'night-resolved',deaths,phase:room.phase});return {room:clone(room),deaths,winner:win};
}
export function resolveWerewolfDay(room,now=Date.now()) {
  if(room?.status!=='active'||room.phase!=='day')throw new Error('Tidak sedang dalam fase siang.');
  const result=tallyWerewolfVotes(room);if(result.eliminated){const p=room.players.find(p=>p.id===result.eliminated);if(p)p.alive=false;room.history.push({at:now,type:'execution',player:result.eliminated});}
  const win=werewolfWinner(room);room.winner=win;room.status=win?'finished':'active';room.phase=win?'finished':'night';if(!win)room.round+=1;room.votes={};room.updatedAt=now;return {room:clone(room),eliminated:result.eliminated,tie:result.tie,winner:win,tally:result.tally};
}
export function werewolfWinner(room){const live=active(room),wolves=live.filter(p=>['werewolf','sorcerer'].includes(p.role)).length,village=live.length-wolves;if(!wolves)return 'village';if(wolves>=village)return 'wolves';return null;}
export function publicWerewolfState(room){return {id:room.id,status:room.status,phase:room.phase,round:room.round,players:room.players.map(p=>({id:p.id,name:p.name,number:p.number,alive:p.alive,mayor:p.mayor})),mayor:room.mayor,winner:room.winner,updatedAt:room.updatedAt};}

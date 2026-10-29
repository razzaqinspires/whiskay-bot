/** Bounded process-local memory with explicit-tag decay. No inferred emotional/health labels. */
const MAX_TURNS=8,MAX_TEXT=1200,MAX_USERS=2000;
const NORMAL_HALF_LIFE=12*60*60*1000,TAGGED_HALF_LIFE=72*60*60*1000,NORMAL_TTL=7*86400000,TAGGED_TTL=30*86400000;
const sessions=new Map();
function clean(value){return String(value||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,MAX_TEXT);}
function validTag(tag){return ['important','emotional-opt-in'].includes(String(tag||''))?String(tag):null;}
export function getConversation(userId,now=Date.now()){
 const key=String(userId||'').slice(0,180);if(!key)return[];const list=sessions.get(key)||[];const kept=[];
 for(const item of list){const age=Math.max(0,now-Number(item.at||now)),tagged=Boolean(item.memoryTag),ttl=tagged?TAGGED_TTL:NORMAL_TTL;if(age>ttl)continue;const half=tagged?TAGGED_HALF_LIFE:NORMAL_HALF_LIFE;const weight=Math.max(0,Math.min(1,Math.pow(0.5,age/half)));if(weight<0.04)continue;kept.push({...item,weight:Math.round(weight*1000)/1000});}
 if(kept.length!==list.length)sessions.set(key,kept.slice(-MAX_TURNS));return kept.map(item=>({...item}));
}
export function appendConversation(userId,role,content,options={}){
 const key=String(userId||'').slice(0,180);if(!key||!['user','assistant'].includes(role))return;
 if(!sessions.has(key)&&sessions.size>=MAX_USERS)sessions.delete(sessions.keys().next().value);
 const list=sessions.get(key)||[],memoryTag=validTag(options?.memoryTag);list.push({role,content:clean(content),at:Number(options?.at)||Date.now(),...(memoryTag?{memoryTag}:{})});sessions.set(key,list.slice(-MAX_TURNS));
}
export function clearConversation(userId){return sessions.delete(String(userId||'').slice(0,180));}
export function memoryStats(now=Date.now()){for(const k of sessions.keys())getConversation(k,now);return{sessions:sessions.size,maxUsers:MAX_USERS,maxTurns:MAX_TURNS,normalHalfLifeHours:NORMAL_HALF_LIFE/3600000,explicitTagHalfLifeHours:TAGGED_HALF_LIFE/3600000,taggedTTLHours:TAGGED_TTL/3600000};}

export function tagRecentConversation(userId,tag='important',count=2){const key=String(userId||'').slice(0,180);if(!key)return 0;const list=sessions.get(key)||[],valid=validTag(tag);if(!valid)return 0;let changed=0;for(let i=list.length-1;i>=0&&changed<Math.max(1,Math.min(8,Number(count)||2));i--){list[i].memoryTag=valid;changed++;}sessions.set(key,list.slice(-MAX_TURNS));return changed;}

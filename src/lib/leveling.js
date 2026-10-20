import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../data');
const FILE=path.join(ROOT,'leveling.json');
const defaults={groups:{},users:{},audit:[]};
async function read(){try{return {...defaults,...JSON.parse(await readFile(FILE,'utf8'))}}catch{return structuredClone(defaults)}}
async function save(data){await mkdir(ROOT,{recursive:true});const tmp=FILE+'.tmp';await writeFile(tmp,JSON.stringify(data,null,2));await rename(tmp,FILE)}
const key=(g,u)=>`${g}|${u}`;
export const xpForNextLevel=level=>Math.floor(100*Math.pow(Math.max(1,level),1.35));
export function rankForLevel(level){if(level>=100)return 'Mythic';if(level>=75)return 'Legend';if(level>=50)return 'Diamond';if(level>=30)return 'Platinum';if(level>=20)return 'Gold';if(level>=10)return 'Silver';if(level>=5)return 'Bronze';return 'Rookie'}
export function roleForFamiliarity(n){if(n>=90)return 'Sangat Dekat';if(n>=70)return 'Akrab';if(n>=45)return 'Teman';if(n>=20)return 'Mulai Kenal';return 'Pendatang'}
export async function getGroupLeveling(group){const d=await read();return d.groups[group]??false}
export async function setGroupLeveling(group,enabled,actor){const d=await read();d.groups[group]=Boolean(enabled);d.audit.push({at:Date.now(),type:'group-leveling',group,enabled:Boolean(enabled),actor:String(actor||'unknown')});d.audit=d.audit.slice(-5000);await save(d);return d.groups[group]}
export async function getProfile(group,user){const d=await read();return d.users[key(group,user)]||{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0}}
export async function updateProfile(group,user,patch,actor='system',consent=false){const d=await read(),k=key(group,user),old=d.users[k]||{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0};d.users[k]={...old,...patch};if(actor!=='system')d.audit.push({at:Date.now(),type:'profile-update',group,user,actor,consent:Boolean(consent),fields:Object.keys(patch)});d.audit=d.audit.slice(-5000);await save(d);return d.users[k]}
export async function awardMessageXP(group,user){if(!group||!user||!(await getGroupLeveling(group)))return null;const d=await read(),k=key(group,user),old=d.users[k]||{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0};const before=old.level||1;const gain=5+(Math.floor(Math.random()*4));const next={...old,xp:(old.xp||0)+gain,points:(old.points||0)+1,familiarity:Math.min(100,(old.familiarity||0)+0.05)};let needed=xpForNextLevel(next.level||1);while(next.xp>=needed){next.xp-=needed;next.level=(next.level||1)+1;needed=xpForNextLevel(next.level)};const leveled=next.level>before;d.users[k]=next;if(leveled)d.audit.push({at:Date.now(),type:'level-up',group,user,from:before,to:next.level});await save(d);return {profile:next,leveled,from:before,to:next.level,gain,needed}}
export async function setLevelNotifications(group,user,enabled){return updateProfile(group,user,{notifyLevelUp:Boolean(enabled)},'self',true)}
export async function auditLog(limit=30){const d=await read();return d.audit.slice(-limit).reverse()}

export async function getLeaderboard(group, limit = 10) {
 const d = await read();
 return Object.entries(d.users || {}).filter(([k]) => k.startsWith(`${group}|`)).map(([k,p]) => ({ user:k.slice(String(group).length+1), level:Number(p.level||1), xp:Number(p.xp||0), coin:Number(p.coin||0), points:Number(p.points||0) })).sort((a,b)=>b.level-a.level||b.xp-a.xp||b.points-a.points).slice(0,Math.max(1,Math.min(25,Number(limit)||10)));
}

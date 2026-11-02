import { mkdir, readFile, rename, stat, readdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { getGlobalMenuDefaults } from './menu-settings.js';
const gzipAsync=promisify(gzip), gunzipAsync=promisify(gunzip);
const PROJECT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const configuredRoot=process.env.WHISKAY_DATA_DIR;
const ROOT=configuredRoot?(path.isAbsolute(configuredRoot)?configuredRoot:path.resolve(PROJECT_ROOT,configuredRoot)):path.join(PROJECT_ROOT,'data');
const FILE=path.join(ROOT,'leveling.json');
const BACKUP=`${FILE}.bak`;
const ARCHIVE_DIR=path.join(ROOT,'archives','leveling');
const ARCHIVE_THRESHOLD=Math.max(1024*1024,Number(process.env.WHISKAY_DB_ARCHIVE_BYTES)||1024*1024*1024);
const defaults={schemaVersion:3,groups:{},users:{},quizStats:{},audit:[],updatedAt:null};
let writeQueue=Promise.resolve();
const LOCK_STALE_MS=10*60*1000;

async function lockOwnerIsAlive(lockFile){
 try{
  const [raw,info]=await Promise.all([readFile(lockFile,'utf8'),stat(lockFile)]);
  let pid=0;
  try{pid=Number(JSON.parse(raw).pid||0);}catch{}
  if(pid>0){
   try{process.kill(pid,0);return true;}catch(error){if(error?.code==='EPERM')return true;if(error?.code==='ESRCH')return false;}
  }
  return Date.now()-info.mtimeMs<LOCK_STALE_MS;
 }catch(error){return error?.code!=='ENOENT';}
}

async function withProcessLock(fn){
 await mkdir(ROOT,{recursive:true,mode:0o700});
 const lockFile=`${FILE}.lock`,started=Date.now();let handle;
 while(!handle){
  try{
   const candidate=await open(lockFile,'wx',0o600);
   try{await candidate.writeFile(JSON.stringify({pid:process.pid,at:Date.now()}));await candidate.sync();handle=candidate;}
   catch(error){await candidate.close().catch(()=>{});await unlink(lockFile).catch(()=>{});throw error;}
  }catch(error){
   if(error?.code!=='EEXIST')throw error;
   if(!(await lockOwnerIsAlive(lockFile))){await unlink(lockFile).catch(()=>{});continue;}
   if(Date.now()-started>30000)throw new Error('Database leveling sedang dikunci proses lain lebih dari 30 detik. Pastikan hanya satu writer aktif.');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
 }
 try{return await fn();}finally{try{await handle.close();}catch{}await unlink(lockFile).catch(()=>{});}
}
function withWriteLock(fn){const task=writeQueue.then(()=>withProcessLock(fn),()=>withProcessLock(fn));writeQueue=task.catch(()=>{});return task;}
const sha256=data=>createHash('sha256').update(data).digest('hex');
const isRecord=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
function validData(value){return Boolean(isRecord(value)&&isRecord(value.groups)&&isRecord(value.users)&&(value.quizStats===undefined||isRecord(value.quizStats))&&(value.audit===undefined||Array.isArray(value.audit)));}
function normaliseData(parsed){return {...structuredClone(defaults),...parsed,groups:parsed.groups||{},users:parsed.users||{},quizStats:parsed.quizStats||{},audit:Array.isArray(parsed.audit)?parsed.audit:[]};}
async function parseFile(file){try{const raw=await readFile(file);const parsed=JSON.parse(raw.toString('utf8'));if(!validData(parsed))throw new Error('invalid leveling schema: expected groups/users objects');return normaliseData(parsed);}catch(error){if(error?.code==='ENOENT')return null;throw error;}}
async function parseArchive(file){try{const compressed=await readFile(file);const sidecar=await readFile(`${file}.sha256`,'utf8');const expected=String(sidecar).trim().split(/\s+/)[0];if(!expected||sha256(compressed)!==expected)return null;const raw=await gunzipAsync(compressed);const parsed=JSON.parse(raw.toString('utf8'));if(!validData(parsed))return null;return normaliseData(parsed);}catch{return null;}}
async function recoverLatestArchive(){let names=[];try{names=(await readdir(ARCHIVE_DIR)).filter(n=>n.endsWith('.json.gz')).sort().reverse();}catch{return null;}for(const name of names){const file=path.join(ARCHIVE_DIR,name),data=await parseArchive(file);if(data)return {data,file};}return null;}

async function quarantineCorruptPrimary(){
 const target=`${FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`;
 try{await rename(FILE,target);return target;}
 catch(error){
  const wrapped=new Error(`Database leveling rusak, tetapi file utama tidak dapat diamankan ke ${path.basename(target)}. Tidak ada pemulihan yang ditulis agar data asli tidak tertimpa.`);
  wrapped.cause=error;
  throw wrapped;
 }
}

async function read(){
 await mkdir(ROOT,{recursive:true,mode:0o700});
 try{const primary=await parseFile(FILE);if(primary)return primary;}catch(primaryError){
  const backup=await parseFile(BACKUP).catch(()=>null);
  if(backup){await quarantineCorruptPrimary();return backup;}
  const archived=await recoverLatestArchive();
  if(archived){await quarantineCorruptPrimary();return archived.data;}
  const err=new Error(`Database leveling rusak dan tidak ada backup valid (${primaryError.message}). File asli dipertahankan untuk investigasi.`);err.cause=primaryError;throw err;
 }
 const backup=await parseFile(BACKUP).catch(()=>null);if(backup)return backup;
 const archived=await recoverLatestArchive();if(archived)return archived.data;
 return structuredClone(defaults);
}

async function atomicWrite(file,buffer){
 const tmp=`${file}.${process.pid}.${randomUUID()}.tmp`;
 let handle;
 try{
  handle=await open(tmp,'wx',0o600);
  await handle.writeFile(buffer);
  await handle.sync();
  await handle.close();handle=null;
  await rename(tmp,file);
 }catch(error){
  if(handle)await handle.close().catch(()=>{});
  await unlink(tmp).catch(()=>{});
  throw error;
 }
 try{const dir=await open(path.dirname(file),'r');await dir.sync();await dir.close();}catch{}
}
async function archiveIfNeeded(){
 let info;try{info=await stat(FILE);}catch{return null;}
 if(info.size<ARCHIVE_THRESHOLD)return null;
 await mkdir(ARCHIVE_DIR,{recursive:true,mode:0o700});
 const day=new Date().toISOString().slice(0,10);
 try{if((await readdir(ARCHIVE_DIR)).some(n=>n.startsWith(`leveling-${day}-`)&&n.endsWith('.json.gz')))return null;}catch{}
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const raw=await readFile(FILE),digest=sha256(raw),compressed=await gzipAsync(raw,{level:9});
 const archive=path.join(ARCHIVE_DIR,`leveling-${stamp}-${digest.slice(0,12)}.json.gz`);
 await atomicWrite(archive,compressed);
 await atomicWrite(`${archive}.sha256`,Buffer.from(`${sha256(compressed)}  ${path.basename(archive)}\n`));
 return archive;
}
async function save(data){
 await mkdir(ROOT,{recursive:true,mode:0o700});
 if(!validData(data))throw new Error('Penyimpanan leveling dibatalkan: payload database tidak valid.');
 const payload=Buffer.from(JSON.stringify({...normaliseData(data),schemaVersion:3,updatedAt:new Date().toISOString()}));

 // The previous primary must be valid and safely copied before the new primary
 // can replace it. A backup-write error is fatal to this save; never quarantine
 // or replace a healthy primary because a secondary backup operation failed.
 let previous;
 try{previous=await readFile(FILE);}catch(error){if(error?.code!=='ENOENT')throw error;}
 if(previous){
  let parsedPrevious;
  try{parsedPrevious=JSON.parse(previous.toString('utf8'));}catch(error){
   const wrapped=new Error(`Penyimpanan leveling dibatalkan: database utama tidak valid (${error.message}).`);wrapped.cause=error;throw wrapped;
  }
  if(!validData(parsedPrevious))throw new Error('Penyimpanan leveling dibatalkan: skema database utama tidak valid; file asli dipertahankan.');
  await atomicWrite(BACKUP,previous);
 }

 await atomicWrite(FILE,payload);
 try{await archiveIfNeeded();}catch(error){
  // Archives are supplemental recovery snapshots; a successfully committed
  // primary write must not be reported as failed only because archiving failed.
  console.warn(`[leveling] Snapshot arsip dilewati: ${error?.message||error}`);
 }
}
export async function getLevelingStorageStatus(){
 await mkdir(ROOT,{recursive:true,mode:0o700});
 const d=await read();
 let bytes=0,backupBytes=0,primaryStatus='MISSING',backupStatus='MISSING';
 try{bytes=(await stat(FILE)).size;primaryStatus=(await parseFile(FILE))?'VALID':'MISSING';}catch(error){primaryStatus=error?.code==='ENOENT'?'MISSING':'INVALID';}
 try{backupBytes=(await stat(BACKUP)).size;backupStatus=(await parseFile(BACKUP))?'VALID':'INVALID';}catch(error){backupStatus=error?.code==='ENOENT'?'MISSING':'INVALID';}
 let archives=[];try{archives=(await readdir(ARCHIVE_DIR)).filter(n=>n.endsWith('.json.gz'));}catch{}
 return {file:FILE,root:ROOT,bytes,primaryStatus,backupBytes,backupStatus,archiveThreshold:ARCHIVE_THRESHOLD,archiveCount:archives.length,users:Object.keys(d.users).length,groups:Object.keys(d.groups||{}).length,quizProfiles:Object.keys(d.quizStats||{}).length,xpTotal:Object.values(d.users||{}).reduce((n,p)=>n+Math.max(0,Number(p.xp)||0),0),schemaVersion:Number(d.schemaVersion||1),updatedAt:d.updatedAt||null};
}
export async function restoreLevelingFromBackup(){
 return withWriteLock(async()=>{
  const backup=await parseFile(BACKUP).catch(()=>null);
  const archived=backup?null:await recoverLatestArchive();
  const sourceData=backup||archived?.data;
  const source=backup?BACKUP:archived?.file||null;
  if(!sourceData)return {restored:false,source:null};

  // A restore is allowed to replace a corrupt primary only after the corrupt
  // bytes have been preserved under a unique quarantine name. A healthy current
  // primary is retained as the new .bak by save().
  let primaryExists=false;
  try{await readFile(FILE);primaryExists=true;}catch(error){if(error?.code!=='ENOENT')throw error;}
  if(primaryExists){
   const current=await parseFile(FILE).catch(()=>null);
   if(!current)await quarantineCorruptPrimary();
  }
  await save(sourceData);
  return {restored:true,source};
 });
}
const key=(g,u)=>`${g}|${u}`;
export const xpForNextLevel=level=>Math.floor(100*Math.pow(Math.max(1,level),1.35));
export function rankForLevel(level){if(level>=100)return 'Mythic';if(level>=75)return 'Legend';if(level>=50)return 'Diamond';if(level>=30)return 'Platinum';if(level>=20)return 'Gold';if(level>=10)return 'Silver';if(level>=5)return 'Bronze';return 'Rookie'}
export function roleForFamiliarity(n){if(n>=90)return 'Sangat Dekat';if(n>=70)return 'Akrab';if(n>=45)return 'Teman';if(n>=20)return 'Mulai Kenal';return 'Pendatang'}
export async function getGroupLeveling(group){const d=await read();return d.groups[group]??false}
export async function setGroupLeveling(group,enabled,actor){return withWriteLock(async()=>{const d=await read();d.groups[group]=Boolean(enabled);d.audit.push({at:Date.now(),type:'group-leveling',group,enabled:Boolean(enabled),actor:String(actor||'unknown')});d.audit=d.audit.slice(-5000);await save(d);return d.groups[group]})}
export async function getProfile(group,user){const d=await read();const defaults=await getGlobalMenuDefaults().catch(()=>({settings:{}}));const profile=d.users[key(group,user)];const profileImageMode=profile?.profileImageMode||defaults.settings?.profileCanvasMode||'official-v2';return profile?{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0,...profile,profileImageMode}:{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0,profileImageMode}}
export async function updateProfile(group,user,patch,actor='system',consent=false){return withWriteLock(async()=>{const d=await read(),k=key(group,user),old=d.users[k]||{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0};d.users[k]={...old,...patch};if(actor!=='system')d.audit.push({at:Date.now(),type:'profile-update',group,user,actor,consent:Boolean(consent),fields:Object.keys(patch)});d.audit=d.audit.slice(-5000);await save(d);return d.users[k]})}
export async function awardMessageXP(group,user){if(!group||!user||!(await getGroupLeveling(group)))return null;return withWriteLock(async()=>{const d=await read(),k=key(group,user),old=d.users[k]||{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0};const before=old.level||1;const gain=5+(Math.floor(Math.random()*4));const next={...old,xp:(old.xp||0)+gain,points:(old.points||0)+1,familiarity:Math.min(100,(old.familiarity||0)+0.05)};let needed=xpForNextLevel(next.level||1);while(next.xp>=needed){next.xp-=needed;next.level=(next.level||1)+1;needed=xpForNextLevel(next.level)};const leveled=next.level>before;d.users[k]=next;if(leveled)d.audit.push({at:Date.now(),type:'level-up',group,user,from:before,to:next.level});d.audit=d.audit.slice(-5000);await save(d);return {profile:next,leveled,from:before,to:next.level,gain,needed}})}

// Command XP is independent of group chat-message leveling. Every successfully
// executed user command grants XP; repeated identical commands are rate-limited
// to prevent XP farming.
export async function awardCommandXP(group,user,command='command',now=Date.now()){
 if(!group||!user)return null;
 return withWriteLock(async()=>{
  const d=await read(),k=key(group,user),old=d.users[k]||{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0};
  const recent=old.commandXpRecent&&typeof old.commandXpRecent==='object'?old.commandXpRecent:{};
  const commandKey=String(command||'command').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,32)||'command';
  if(Number(recent[commandKey]||0)>now-15000)return {profile:old,leveled:false,gain:0,needed:xpForNextLevel(old.level||1),cooldown:true};
  const before=Number(old.level||1);
  const day=new Date(now).toISOString().slice(0,10);
  const daily=old.commandXpDaily?.day===day?{...old.commandXpDaily}:{day,xp:0,commands:0};
  const category=/^(?:menu|help|ping|profile|leaderboard|setmenu)$/.test(commandKey)?'utility':/^(?:ai|ask|chat|nexora)$/.test(commandKey)?'conversation':/game|quiz|chess|catur|tebak|susun/.test(commandKey)?'game':'command';
  const base={utility:3,command:4,conversation:5,game:6}[category];
  const gain=Math.min(base,Math.max(0,300-Number(daily.xp||0)));
  if(gain<=0)return {profile:old,leveled:false,gain:0,needed:xpForNextLevel(old.level||1),dailyCap:true};
  daily.xp+=gain;daily.commands+=1;
  const next={...old,xp:Number(old.xp||0)+gain,points:Number(old.points||0)+1,familiarity:Math.min(100,Number(old.familiarity||0)+0.02),commandXpRecent:{...recent,[commandKey]:now},commandXpDaily:daily};
  for(const [name,at] of Object.entries(next.commandXpRecent))if(now-Number(at)>86400000)delete next.commandXpRecent[name];
  let needed=xpForNextLevel(next.level||1);while(next.xp>=needed){next.xp-=needed;next.level=(next.level||1)+1;needed=xpForNextLevel(next.level)}
  const leveled=next.level>before;d.users[k]=next;if(leveled)d.audit.push({at:now,type:'level-up',source:'command',group,user,from:before,to:next.level});d.audit=d.audit.slice(-5000);await save(d);return {profile:next,leveled,from:before,to:next.level,gain,needed,cooldown:false};
 });
}

/** Persist per-game quiz wins and grant XP into the same durable leveling store. */
export async function awardQuizWin(group, user, gameType, rewardXP = 0, rewardCoins = 0) {
 const scope=String(group||'global');
 const uid=String(user||'').replace(/:\d+(?=@)/,'').toLowerCase();
 const type=String(gameType||'quiz').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,32)||'quiz';
 if(!uid) throw new Error('Quiz reward membutuhkan identitas pemain.');
 const xp=Math.max(0,Math.floor(Number(rewardXP)||0)), coins=Math.max(0,Math.floor(Number(rewardCoins)||0));
 return withWriteLock(async()=>{
  const d=await read(); d.quizStats=d.quizStats||{};
  const k=`${type}|${uid}`,old=d.quizStats[k]||{game:type,user:uid,wins:0,xp:0,coins:0,streak:0};
  const stat={...old,wins:Number(old.wins||0)+1,xp:Number(old.xp||0)+xp,coins:Number(old.coins||0)+coins,streak:Number(old.streak||0)+1,lastWinAt:Date.now()};
  d.quizStats[k]=stat;
  // Credit the same group-scoped RPG profile used by .profile and .leaderboard.
  const profileKey=key(scope,uid),profile=d.users[profileKey]||{xp:0,level:1,coin:0,points:0,familiarity:0,premium:false,notifyLevelUp:true,balance:0};
  const before=Number(profile.level||1),next={...profile,xp:Number(profile.xp||0)+xp,coin:Number(profile.coin||0)+coins,points:Number(profile.points||0)+1};
  let needed=xpForNextLevel(next.level||1); while(next.xp>=needed){next.xp-=needed;next.level=(next.level||1)+1;needed=xpForNextLevel(next.level);}
  d.users[profileKey]=next;
  d.audit.push({at:Date.now(),type:'quiz-win',game:type,user:uid,xp,coins,wins:stat.wins,from:before,to:next.level});
  d.audit=d.audit.slice(-5000); await save(d);
  return {stat,profile:next,leveled:next.level>before,from:before,to:next.level,xp,coins,needed};
 });
}

export async function getQuizLeaderboard(gameType, limit=10) {
 const d=await read(),type=String(gameType||'').toLowerCase();
 return Object.values(d.quizStats||{}).filter(row=>row.game===type).sort((a,b)=>Number(b.wins||0)-Number(a.wins||0)||Number(b.xp||0)-Number(a.xp||0)||Number(b.lastWinAt||0)-Number(a.lastWinAt||0)).slice(0,Math.max(1,Math.min(25,Number(limit)||10)));
}

export async function setLevelNotifications(group,user,enabled){return updateProfile(group,user,{notifyLevelUp:Boolean(enabled)},'self',true)}
export async function auditLog(limit=30){const d=await read();return d.audit.slice(-limit).reverse()}

export async function getLeaderboard(group, limit = 10) {
 const d = await read();
 return Object.entries(d.users || {}).filter(([k]) => k.startsWith(`${group}|`)).map(([k,p]) => ({ user:k.slice(String(group).length+1), level:Number(p.level||1), xp:Number(p.xp||0), coin:Number(p.coin||0), points:Number(p.points||0) })).sort((a,b)=>b.level-a.level||b.xp-a.xp||b.points-a.points).slice(0,Math.max(1,Math.min(25,Number(limit)||10)));
}

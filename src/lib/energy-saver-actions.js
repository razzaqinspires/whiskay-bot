import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
const ROOT=process.env.WHISKAY_DATA_DIR?(path.isAbsolute(process.env.WHISKAY_DATA_DIR)?process.env.WHISKAY_DATA_DIR:path.resolve(process.cwd(),process.env.WHISKAY_DATA_DIR)):path.resolve('data');
const FILE=path.join(ROOT,'energy-saver-actions.json');let queue=Promise.resolve();
const norm=x=>String(x||'unknown').replace(/[^a-zA-Z0-9@._:-]/g,'').slice(0,180)||'unknown';
async function read(){try{const x=JSON.parse(await readFile(FILE,'utf8'));return x&&typeof x==='object'?{version:1,tokens:{},users:{},...x}:{version:1,tokens:{},users:{}};}catch(e){if(e?.code==='ENOENT')return {version:1,tokens:{},users:{}};throw e;}}
async function write(v){await mkdir(ROOT,{recursive:true});const tmp=`${FILE}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(v,null,2),{mode:0o600});await rename(tmp,FILE);}
function mutate(fn){const p=queue.then(async()=>{const db=await read();const result=await fn(db);await write(db);return result;});queue=p.catch(()=>{});return p;}
export async function createEnergySaverAction(owner){const token=randomBytes(12).toString('hex');await mutate(db=>{db.tokens[token]={owner:norm(owner),createdAt:Date.now(),expiresAt:Date.now()+7*86400000,used:false};});return token;}
export async function authorizeEnergySaverAction(token,actor,{isOwner=false}={}){const who=norm(actor);return mutate(db=>{const user=db.users[who]||(db.users[who]={violations:0,blocked:false,lastWarningAt:0});if(user.blocked&&!isOwner)return {ok:false,reason:'blocked'};const item=db.tokens[String(token||'')];if(!item||item.expiresAt<Date.now())return {ok:false,reason:'expired'};if(isOwner||item.owner===who){if(item.owner!==who&&!isOwner)return {ok:false,reason:'owner-mismatch'};return {ok:true,owner:item.owner};}user.violations=Number(user.violations||0)+1;if(user.violations===1){user.lastWarningAt=Date.now();return {ok:false,reason:'warning',violations:1};}user.blocked=true;user.blockedAt=Date.now();user.reason='repeated-unauthorized-energy-button-use';return {ok:false,reason:'blocked',violations:user.violations};});}
export async function getEnergySaverActionSecurity(user){const db=await read(),u=db.users[norm(user)]||{};return {blocked:Boolean(u.blocked),violations:Number(u.violations||0)};}

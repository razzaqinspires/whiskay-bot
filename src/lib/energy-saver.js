import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
const FILE=path.resolve('data/energy-saver.json');let queue=Promise.resolve();
async function read(){try{const v=JSON.parse(await readFile(FILE,'utf8'));return v&&typeof v==='object'?v:{users:{}};}catch(e){if(e?.code==='ENOENT')return {version:1,users:{}};if(e instanceof SyntaxError){await rename(FILE,`${FILE}.corrupt-${Date.now()}`).catch(()=>{});return {version:1,users:{}};}throw e;}}
async function write(v){await mkdir(path.dirname(FILE),{recursive:true});const tmp=`${FILE}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(v,null,2),{mode:0o600});await rename(tmp,FILE);}
const key=x=>String(x||'unknown').replace(/[^a-zA-Z0-9@._:-]/g,'').slice(0,180)||'unknown';
export async function getEnergySaver(user){const v=await read();return {enabled:Boolean(v.users?.[key(user)]?.enabled),updatedAt:Number(v.users?.[key(user)]?.updatedAt||0)};}
export async function setEnergySaver(user,enabled){const run=queue.then(async()=>{const v=await read();v.version=1;v.users=v.users||{};v.users[key(user)]={enabled:Boolean(enabled),updatedAt:Date.now()};await write(v);return v.users[key(user)];});queue=run.catch(()=>{});return run;}

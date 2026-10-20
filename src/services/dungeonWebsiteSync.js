import { createHash } from 'node:crypto';
import config from '../config/index.js';
export function dashboardPlayerId(chat, sender) {
  return createHash('sha256').update(`${String(chat||'')}|${String(sender||'')}`).digest('hex').slice(0,32);
}
export function dashboardUrl(chat, sender, pathName='/inventory') {
  const base=String(process.env.DUNGEON_WEBSITE_URL||config.website.baseUrl||'https://razzaq-ventures-platform.vercel.app').replace(/\/+$/,'');
  const id=dashboardPlayerId(chat,sender);
  return `${base}${pathName}${String(pathName).includes('?')?'&':'?'}player=${encodeURIComponent(id)}`;
}
export async function syncDashboardPlayer(chat,sender,payload) {
  const base=String(process.env.DUNGEON_WEBSITE_URL||config.website.baseUrl||'').replace(/\/+$/,'');
  const token=String(process.env.DUNGEON_SYNC_TOKEN||'');
  if(!base||!token)return {ok:false,skipped:true};
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),4000);
  try{
    const res=await fetch(`${base}/api/sync`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({playerId:dashboardPlayerId(chat,sender),payload}),signal:controller.signal});
    return {ok:res.ok,status:res.status};
  }catch{return {ok:false};}finally{clearTimeout(timer);}
}

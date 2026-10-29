import { listEnergyUsers } from '../../lib/energy-worker.js';
export default { name:'battery-dashboard', command:['batterydashboard'], menuCommands:['batterydashboard'], category:'owner', owner:true, description:'Dashboard baterai global dengan paginasi', async execute(ctx) {
 if(!ctx.isOwner)return ctx.reply('🔒 Dashboard baterai global hanya untuk owner.');
 const page=Math.max(1,Math.floor(Number(ctx.args?.[0])||1)),offset=(page-1)*100,data=await listEnergyUsers(5000,0);
 // Group JIDs are internal identifiers, not user battery accounts; never print them in this dashboard.
 const users=data.users.filter(u=>!String(u.user||'').endsWith('@g.us')&&!String(u.user||'').endsWith('@broadcast')&&!String(u.user||'').endsWith('@newsletter'));
 const total=users.length, pageUsers=users.slice(offset,offset+100);
 const lines=pageUsers.map((u,i)=>`${offset+i+1}. ${String(u.user||'').replace(/@s\.whatsapp\.net$/,'')} · ${u.energy.toFixed(2)}/${u.capacity}% · ${u.volts}V · ${u.isCharging?'⚡ charging':'idle'}`).join('\n')||'Tidak ada akun pengguna pada halaman ini.';
 const totalPages=Math.max(1,Math.ceil(total/100)),buttons=[];
 if(page>1)buttons.push({name:'quick_reply',title:`⬅️ Halaman ${page-1}`,id:`${ctx.prefix}batterydashboard ${page-1}`});
 if(page<totalPages)buttons.push({name:'quick_reply',title:`Next Halaman ${page+1} ➡️`,id:`${ctx.prefix}batterydashboard ${page+1}`});
 if(buttons.length)return ctx.sendInteractive({title:`🔋 GLOBAL BATTERY · ${page}/${totalPages}`,body:`Total akun pengguna: ${total}\nGrup/broadcast/newsletter dikecualikan dari tampilan.\n\n${lines}`,buttons});
 return ctx.reply(`🔋 GLOBAL BATTERY · ${page}/${totalPages}\nTotal akun pengguna: ${total}\nGrup/broadcast/newsletter dikecualikan dari tampilan.\n\n${lines}`);
} };

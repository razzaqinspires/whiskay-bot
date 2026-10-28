import { listEnergyUsers } from '../../lib/energy-worker.js';
export default { name:'battery-dashboard', command:['batterydashboard'], menuCommands:['batterydashboard'], category:'owner', owner:true, description:'Dashboard baterai global dengan paginasi', async execute(ctx) {
 if(!ctx.isOwner)return ctx.reply('🔒 Dashboard baterai global hanya untuk owner.');
 const page=Math.max(1,Math.floor(Number(ctx.args?.[0])||1)),offset=(page-1)*100,data=await listEnergyUsers(100,offset);
 const lines=data.users.map((u,i)=>`${offset+i+1}. ${u.user} · ${u.energy.toFixed(2)}/${u.capacity}% · ${u.volts}V · ${u.isCharging?'⚡ charging':'idle'}`).join('\n')||'Tidak ada data baterai pada halaman ini.';
 const totalPages=Math.max(1,Math.ceil(data.total/100)),buttons=[];
 if(page>1)buttons.push({name:'quick_reply',title:`⬅️ Halaman ${page-1}`,id:`${ctx.prefix}batterydashboard ${page-1}`});
 if(page<totalPages)buttons.push({name:'quick_reply',title:`Next Halaman ${page+1} ➡️`,id:`${ctx.prefix}batterydashboard ${page+1}`});
 if(buttons.length)return ctx.sendInteractive({title:`🔋 GLOBAL BATTERY · ${page}/${totalPages}`,body:`Total user: ${data.total}\n\n${lines}`,buttons});
 return ctx.reply(`🔋 GLOBAL BATTERY · ${page}/${totalPages}\nTotal user: ${data.total}\n\n${lines}`);
} };

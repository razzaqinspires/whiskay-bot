import config from '../../config/index.js';
import { registry } from '../../core/registry.js';
import { getMenuSettings, getNewCommandSet, getCommandRecommendations } from '../../lib/menu-settings.js';
import { readFile } from 'node:fs/promises';
import { getRazzaqWebsiteContent } from '../../services/razzaqWebsite.js';

function mapChars(text, upper, lower, digits = null) {
  return String(text).replace(/[A-Za-z0-9]/g, c => {
    const n = c.charCodeAt(0);
    if (n >= 65 && n <= 90) return upper ? String.fromCodePoint(upper + n - 65) : c;
    if (n >= 97 && n <= 122) return lower ? String.fromCodePoint(lower + n - 97) : c;
    if (n >= 48 && n <= 57) return digits ? String.fromCodePoint(digits + n - 48) : c;
    return c;
  });
}
const superscript = Object.fromEntries([...('abcdefghijklmnopqrstuvwxyz')].map((c,i)=>[c,[...'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ'][i] || c]));
const smallCaps = Object.fromEntries([...('abcdefghijklmnopqrstuvwxyz')].map((c,i)=>[c,[...'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ'][i] || c]));
const replaceMap = (s, source, target) => { const m = new Map([...source].map((c,i)=>[c,target[i]||c])); return [...String(s)].map(c=>m.get(c)||m.get(c.toLowerCase())||c).join(''); };
const fontFns = {
  normal: s => String(s),
  bold: s => mapChars(s,0x1D400,0x1D41A,0x1D7CE),
  sans: s => mapChars(s,0x1D5D4,0x1D5EE,0x1D7F6),
  mono: s => mapChars(s,0x1D670,0x1D68A,0x1D7F6),
  superscript: s => [...String(s)].map(c=>superscript[c.toLowerCase()] || c).join(''),
  double: s => mapChars(s,0x1D538,0x1D552,0x1D7D8),
  smallcaps: s => [...String(s)].map(c=>smallCaps[c.toLowerCase()] || c).join(''),
  fraktur: s => mapChars(s,0x1D56C,0x1D586),
  italicbold: s => mapChars(s,0x1D468,0x1D482),
  sansbold: s => mapChars(s,0x1D5D4,0x1D5EE,0x1D7F6),
  zalgo: s => String(s).split('').map(c=>c+'̙̥̀͡').join(''),
  mixed: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map(c=>({'A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'E','F':'ᖴ','G':'G','H':'ᕼ','I':'I','J':'ᒍ','K':'K','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'O','P':'ᑭ','Q':'ᑫ','R':'ᖇ','S':'ᔕ','T':'T','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'᙭','Y':'Y','Z':'ᘔ','a':'ᗩ','b':'ᗷ','c':'ᑕ','d':'ᗪ','e':'E','f':'ᖴ','g':'G','h':'ᕼ','i':'I','j':'ᒍ','k':'K','l':'ᒪ','m':'ᗰ','n':'ᑎ','o':'O','p':'ᑭ','q':'ᑫ','r':'ᖇ','s':'ᔕ','t':'T','u':'ᑌ','v':'ᐯ','w':'ᗯ','x':'᙭','y':'Y','z':'ᘔ'}[c])).join('')),
  cyrillic: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','АВCDЕFGНІЈКLМNOPQRSТUVWХYZаьсԁеfɡһіјκӏmnорԛгѕтцѵԝхуz'),
  greek: s => replaceMap(s,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz','ΑΒϹDΕFϜΗΙЈΚLΜΝΟΡϘRSΤՍVШΧΥΖαβϲδεζηιϳκλμνορςτυνχωყζ')
};
const FONT_LABELS = {
  normal: ['Normal','Teks standar, paling kompatibel','Type something to start'],
  bold: ['Bold Serif','Tebal dan formal','𝐓𝐲𝐩𝐞 𝐬𝐨𝐦𝐞𝐭𝐡𝐢𝐧𝐠 𝐭𝐨 𝐬𝐭𝐚𝐫𝐭'],
  sans: ['Sans Bold','Tebal modern','𝗧𝘆𝗽𝗲 𝘀𝗼𝗺𝗲𝘁𝗵𝗶𝗻𝗴 𝘁𝗼 𝘀𝘁𝗮𝗿𝘁'],
  mono: ['Monospace','Gaya terminal','𝚃𝚢𝚙𝚎 𝚜𝚘𝚖𝚎𝚝𝚑𝚒𝚗𝚐 𝚝𝚘 𝚜𝚝𝚊𝚛𝚝'],
  superscript: ['Superscript','Huruf kecil di atas; dukungan karakter terbatas','ᵀʸᵖᵉ ˢᵒᵐᵉᵗʰⁱⁿᵍ ᵗᵒ ˢᵗᵃʳᵗ'],
  double: ['Double-struck','Gaya matematika ganda','𝕋𝕪𝕡𝕖 𝕤𝕠𝕞𝕖𝕥𝕙𝕚𝕟𝕘 𝕥𝕠 𝕤𝕥𝕒𝕣𝕥'],
  smallcaps: ['Small Caps','Huruf kapital kecil','ᴛʏᴘᴇ ꜱᴏᴍᴇᴛʜɪɴɢ ᴛᴏ ꜱᴛᴀʀᴛ'],
  fraktur: ['Fraktur','Gaya gotik','𝔗𝔶𝔭𝔢 𝔰𝔬𝔪𝔢𝔱𝔥𝔦𝔫𝔤 𝔱𝔬 𝔰𝔱𝔞𝔯𝔱'],
  italicbold: ['Bold Italic','Miring dan tebal','𝑻𝒚𝒑𝒆 𝒔𝒐𝒎𝒆𝒕𝒉𝒊𝒏𝒈 𝒕𝒐 𝒔𝒕𝒂𝒓𝒕'],
  sansbold: ['Sans Bold','Sans-serif tebal','𝗧𝘆𝗽𝗲 𝘀𝗼𝗺𝗲𝘁𝗵𝗶𝗻𝗴 𝘁𝗼 𝘀𝘁𝗮𝗿𝘁'],
  zalgo: ['Zalgo','Efek glitch; dapat sulit dibaca','T̙̥̀͡ỳ̙̥͡p̙̥̀͡è̙̥͡']
};
const TEMPLATE = {
  corporate: { top: '╭━━━〔', mid: '┃', bottom: '╰━━━━━━━━━━━━━━━━' },
  minimal: { top: '┌─', mid: '│', bottom: '└────────────' },
  terminal: { top: '╔══[', mid: '║', bottom: '╚════════════' },
  elegant: { top: '┏━━━━━━━━', mid: '┃', bottom: '┗━━━━━━━━━━━━' }
};
const WIDGETS = new Set(['category','count','prefix','new','owner','footer','heading','intro','website','rank']);
const canonicalFor = p => Array.isArray(p.menuCommands) ? p.menuCommands : (Array.isArray(p.command) ? p.command.slice(0,1) : [p.command]);
function getCommandRows() {
  const rows=[];
  for (const group of registry.plugins.listByCategory().values()) for (const plugin of group) {
    const cmds = canonicalFor(plugin);
    for (const cmd of cmds) if (typeof cmd==='string' && cmd.trim()) rows.push({command:cmd.toLowerCase(),category:String(plugin.category||'general').toLowerCase(),description:String(plugin.menuDescriptions?.[cmd]||plugin.description||plugin.menuDescription||'').trim(),owner:Boolean(plugin.owner)});
  }
  const unique=new Map(); for(const row of rows) if(!unique.has(row.command)) unique.set(row.command,row);
  return [...unique.values()];
}
const style=(s,font)=> (fontFns[font]||fontFns.normal)(s);
const titleCase=s=>String(s||'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function isBold(settings,part){return (settings.boldParts||[]).includes(part);}
function emphasized(settings,text,part){return isBold(settings,part)?`*${text}*`:text;}
function line(settings, text, part='meta') { const raw=emphasized(settings,text,part); return `${settings.linePrefix ? (TEMPLATE[settings.template]||TEMPLATE.corporate).mid+' ' : ''}${style(raw,settings.font)}`; }
async function renderMenu(ctx) {
  const settings=await getMenuSettings(ctx.sender||ctx.chat);
  let rows=getCommandRows();
  const newSet=await getNewCommandSet(rows.map(r=>r.command));
  if(!settings.widgets.includes('owner')) rows=rows.filter(r=>!r.owner);
  if(settings.categories?.length) rows=rows.filter(r=>settings.categories.includes(r.category));
  rows.sort((a,b)=> settings.order==='category' ? a.category.localeCompare(b.category)||a.command.localeCompare(b.command) : (settings.order==='za'?-1:1)*a.command.localeCompare(b.command));
  const t=TEMPLATE[settings.template]||TEMPLATE.corporate;
  const lines=[];
  if(settings.widgets.includes('heading')) {
    if(settings.topBorder!==false) lines.push(style(emphasized(settings,`${t.top} ${config.botName} — MENU`,'border'),settings.font));
    else lines.push(style(emphasized(settings,`${config.botName} — MENU`,'heading'),settings.font));
  }
  if(settings.widgets.includes('intro')) lines.push(style(emphasized(settings,`${settings.order==='category'?'Daftar perintah berdasarkan kategori lalu A–Z':settings.order==='za'?'Daftar perintah Z–A':'Daftar perintah A–Z'}\n`,'intro'),settings.font));
  const gap='\n'.repeat(Math.max(0,Math.min(3,Number(settings.spacing)||0)));
  if(settings.widgets.includes('count')) lines.push(line(settings,`Total perintah: ${rows.length}`));
  if(settings.widgets.includes('prefix')) lines.push(line(settings,`Prefix: ${config.prefixes.join(' ')}`));
  if(settings.widgets.includes('new')) lines.push(line(settings,'🆕 = perintah baru selama 7 hari'));
  if(settings.widgets.includes('website')) lines.push(line(settings,`Website: ${config.website.baseUrl || 'belum dikonfigurasi'}`));
  if(settings.widgets.includes('rank')) lines.push(line(settings,`Profile / rank / engagement: ${ctx.prefix}profile`));
  if(settings.widgets.includes('websiteProducts')) { try { const content=await getRazzaqWebsiteContent(); const products=content.products||content.catalog?.products||content.items||content.data?.products||[]; lines.push(line(settings,`Produk website: ${Array.isArray(products)?products.length:'data tidak tersedia'}`)); } catch { lines.push(line(settings,'Produk website: data live tidak tersedia')); } }
  if(settings.widgets.includes('count')||settings.widgets.includes('prefix')||settings.widgets.includes('new')) lines.push('');
  let lastCategory='';
  rows.forEach((row,index)=>{
    if(settings.order==='category'&&settings.widgets.includes('category')&&row.category!==lastCategory){lastCategory=row.category;lines.push(line(settings,`〔 ${titleCase(lastCategory)} 〕`,'category'));}
    const mark=newSet.has(row.command)?' 🆕':'';
    const desc=settings.description&&row.description?` — ${row.description}`:'';
    const commandText=emphasized(settings,`${String(index+1).padStart(2,'0')}. ${ctx.prefix}${row.command}${mark}`,'command'); const descText=desc&&isBold(settings,'description')?` — *${row.description}*`:desc; lines.push(`${gap}${line(settings,`${commandText}${descText}`,'none')}`);
  });
  if(settings.widgets.includes('footer')) lines.push('',line(settings,`Atur tampilan: ${ctx.prefix}setmenu`,'footer'));
  if(settings.bottomBorder!==false) lines.push(style(emphasized(settings,t.bottom,'border'),settings.font));
  const text=lines.join('\n');
  if(settings.mode==='text') return ctx.reply(text);
  const user=ctx.sender||ctx.chat;
  const recommendations=await getCommandRecommendations(user,rows,1);
  const rec=recommendations[0];
  const buttons=[];
  if(rec) buttons.push({name:'quick_reply',title:`Rekomendasi: ${ctx.prefix}${rec.command} (${rec.percentage}%)`,id:`${ctx.prefix}${rec.command}`});
  else buttons.push({name:'quick_reply',title:'Lihat rekomendasi',id:`${ctx.prefix}setmenu recommendations`});
  buttons.push({name:'cta_url',title:'Website Official',url:config.website.baseUrl||'https://razzaq-ventures-platform.vercel.app',merchant_url:config.website.baseUrl||'https://razzaq-ventures-platform.vercel.app',webview_interaction:true});
  const rowsMenu=[{title:'Buka Pengaturan Utama Lengkap',description:'Font, widget, template, border, spasi, gambar, urutan dan ketebalan font',id:`${ctx.prefix}setmenu`}];
  buttons.push({name:'single_select',title:'Pengaturan Menu',sections:[{title:'Pengaturan Lengkap',rows:rowsMenu}]});
  let image=null;
  let imageWarning='';
  if(settings.imageMode==='manual'&&settings.imagePath){
    try { image=await readFile(settings.imagePath); }
    catch { imageWarning='Foto menu manual tidak ditemukan di penyimpanan bot. Pilih ulang melalui .setmenu image manual.'; }
  } else if(settings.imageMode==='official') {
    const officialUrl=String(config.website.menuImageUrl||'').trim();
    let validUrl=false;try{const parsed=new URL(officialUrl);validUrl=['http:','https:'].includes(parsed.protocol);}catch{}
    if(validUrl) image={url:officialUrl};
    else imageWarning='Gambar official belum tersedia: MENU_IMAGE_URL kosong atau tidak valid.';
  }
  // Send the image as a normal WhatsApp media message first. Native interactive
  // headers silently drop media on some Baileys/WhatsApp combinations.
  if(image){
    try {
      await ctx.send({image, caption:'Gambar menu WhiskayBot'});
    } catch (error) {
      imageWarning=`Gambar menu gagal dikirim (${String(error?.message||error).slice(0,180)}). Periksa URL publik atau file foto, lalu coba lagi.`;
    }
  }
  const finalText=imageWarning?`${text}\n\n⚠️ ${imageWarning}`:text;
  try { return await ctx.sendInteractive({title:'',subtitle:'',body:finalText,footer:style('Pengaturan menu tersimpan per pengguna.',settings.font),buttons}); }
  catch { return ctx.reply(`${finalText}\n\nGunakan ${ctx.prefix}setmenu untuk mengatur menu.`); }
}
export default {name:'menu',command:['menu','help'],menuCommands:['menu'],description:'Tampilkan daftar perintah dan pengaturan menu pribadi',category:'general',cooldown:3000,async execute(ctx){return renderMenu(ctx);}};

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
function run(args) { return new Promise((resolve,reject)=>{const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let err='';p.stderr.on('data',d=>{err=(err+d.toString()).slice(-3000)});const timer=setTimeout(()=>p.kill('SIGKILL'),30000);p.once('error',e=>{clearTimeout(timer);reject(e)});p.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(err.includes('ENOENT')?'FFmpeg belum terpasang':'FFmpeg gagal memproses gambar'))})})}
const filterText = value => String(value||'').slice(0,90).replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/%/g,'\\%').replace(/\[/g,'\\[').replace(/\]/g,'\\]');
export default { name:'meme', command:['meme','captionimg'], category:'media', description:'Tambahkan caption meme atas/bawah pada gambar yang direply', cooldown:5000, async execute(ctx) {
  const target=ctx.quoted || (ctx.media?.hasMedia?ctx.raw:null), raw=String(ctx.text||'').trim();
  if(!target||!raw)return ctx.reply('Balas sebuah gambar dengan `.meme TEKS ATAS | TEKS BAWAH`. Pastikan FFmpeg terpasang.');
  const [top='',bottom='']=raw.split('|').map(s=>s.trim());
  try { const input=await ctx.download(target); if(!input?.length)throw new Error('Gambar tidak bisa diunduh'); if(input.length>15*1024*1024)throw new Error('Gambar maksimal 15 MB');
    const dir=await mkdtemp(path.join(os.tmpdir(),'whiskay-meme-'));
    try { const src=path.join(dir,'input.img'),out=path.join(dir,'meme.jpg'); await writeFile(src,input);
      const vf=`scale='min(1200,iw)':-2,drawtext=text='${filterText(top)}':fontcolor=white:borderw=4:bordercolor=black:fontsize=h/12:x=(w-text_w)/2:y=12,drawtext=text='${filterText(bottom)}':fontcolor=white:borderw=4:bordercolor=black:fontsize=h/12:x=(w-text_w)/2:y=h-text_h-12`;
      await run(['-y','-i',src,'-frames:v','1','-vf',vf,'-q:v','3',out]); const output=await readFile(out); if(!output.length)throw new Error('Hasil kosong');
      return ctx.sock.sendMessage(ctx.chat,{image:output,caption:'✨ Meme berhasil dibuat.'},{quoted:ctx.raw});
    } finally { await rm(dir,{recursive:true,force:true}); }
  } catch(e) { return ctx.reply(`⚠️ Gagal membuat meme: ${String(e?.message||'media tidak valid').slice(0,150)}. Pastikan FFmpeg tersedia di server.`); }
}};

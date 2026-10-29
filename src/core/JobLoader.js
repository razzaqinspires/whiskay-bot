import {readdir,stat} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
/** Loads only explicit job contracts: {name, intervalMs, enabled?, run(context)}. */
export class JobLoader {
 constructor({root=path.resolve('src/jobs'),chronos,context=()=>({})}={}){if(!chronos)throw new TypeError('chronos is required');this.root=root;this.chronos=chronos;this.context=context;this.loaded=new Map();this.errors=[];}
 async load(){const files=await this.#walk(this.root);for(const file of files){try{const mod=await import(`${pathToFileURL(file).href}?jobload=${Date.now()}`);const candidate=mod.default||mod.job;if(!candidate||!candidate.name||typeof candidate.run!=='function'||!Number.isFinite(Number(candidate.intervalMs)))continue;if(this.loaded.has(candidate.name)||this.chronos.jobs.has(candidate.name))continue;this.chronos.register({...candidate,run:async(meta)=>candidate.run({...this.context(),...meta})});this.loaded.set(candidate.name,file);}catch(e){this.errors.push({file,message:String(e?.message||e).slice(0,200)});}}return {loaded:[...this.loaded.keys()],errors:[...this.errors]};}
 async #walk(dir){let entries=[];try{entries=await readdir(dir,{withFileTypes:true});}catch{return [];}const out=[];for(const e of entries){const full=path.join(dir,e.name);if(e.isDirectory())out.push(...await this.#walk(full));else if(e.isFile()&&e.name.endsWith('.js')&&!e.name.startsWith('_'))out.push(full);}return out;}
 status(){return {root:this.root,loaded:[...this.loaded.entries()].map(([name,file])=>({name,file})),errors:[...this.errors]};}
}
export default JobLoader;

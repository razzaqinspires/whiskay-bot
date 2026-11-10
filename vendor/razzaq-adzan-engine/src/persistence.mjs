import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ValidationError } from './errors.mjs';
/** Atomic JSON file store for a single process/device. Not a distributed lock or database. */
export class JsonStateStore {
  #path; #state;
  constructor(path) { if(typeof path!=='string'||!path)throw new ValidationError('A state file path is required.'); this.#path=path; this.#state={version:1,firedEvents:[],updatedAt:null}; }
  async load(){try{const parsed=JSON.parse(await readFile(this.#path,'utf8'));if(parsed.version!==1||!Array.isArray(parsed.firedEvents))throw new Error('Unsupported state schema');this.#state=parsed;}catch(e){if(e.code!=='ENOENT')throw e;}return structuredClone(this.#state);}
  hasFired(key){return this.#state.firedEvents.includes(key);}
  async markFired(key){if(typeof key!=='string'||!key)throw new ValidationError('Event key is required.');if(!this.hasFired(key))this.#state.firedEvents.push(key);this.#state.updatedAt=new Date().toISOString();await mkdir(dirname(this.#path),{recursive:true});const tmp=`${this.#path}.tmp`;await writeFile(tmp,JSON.stringify(this.#state,null,2),{mode:0o600});await rename(tmp,this.#path);return structuredClone(this.#state);}
}

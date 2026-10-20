import { readdir, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import Logger from './Logger.js';
export class Loader {
  constructor(root) { this.root = root; }
  async walk(dir) {
    const out = []; let e;
    try { e = await readdir(dir); } catch { return out; }
    for (const n of e) {
      const f = path.join(dir, n), s = await stat(f);
      if (s.isDirectory()) out.push(...await this.walk(f));
      else if (n.endsWith('.js')) out.push(f);
    }
    return out;
  }
  async loadAll() {
    const files = await this.walk(this.root), list = [];
    for (const f of files) {
      try {
        const mod = await import(pathToFileURL(f).href + '?t=' + Date.now());
        const p = mod.default || mod.plugin;
        if (!p) continue;
        const arr = Array.isArray(p) ? p : [p];
        for (const x of arr) if (x.command) list.push(x);
      } catch (err) { Logger.error({ f, err: err.message }, 'plugin fail'); }
    }
    return list;
  }
}

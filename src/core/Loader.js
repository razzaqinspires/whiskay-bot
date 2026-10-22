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
        const relative = path.relative(this.root, f).split(path.sep);
        const folderCategory = relative.length > 1 ? relative[0] : 'general';
        for (const x of arr) if (x.command) {
          // Normalize legacy plugin metadata before the command registry/menu compiler sees it.
          // Supported forms: category:'games', tags:['rpg'], category:['games','rpg'].
          const rawCategory = x.category;
          const rawTags = Array.isArray(x.tags) ? x.tags : [];
          const candidates = [...(Array.isArray(rawCategory) ? rawCategory : [rawCategory]), ...rawTags]
            .map(v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''))
            .filter(Boolean);
          x.category = candidates[0] || folderCategory;
          x.categories = [...new Set(candidates.length ? candidates : [folderCategory])];
          if (!Array.isArray(x.tags)) x.tags = x.categories;
          list.push(x);
        }
      } catch (err) { Logger.error({ f, err: err.message }, 'plugin fail'); }
    }
    return list;
  }
}

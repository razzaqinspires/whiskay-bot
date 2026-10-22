import { Loader } from './Loader.js';
import Logger from './Logger.js';

export class PluginManager {
  constructor(dir) {
    this._cmd = new Map();
    this._alias = new Map();
    this._all = new Map();
    this.loader = new Loader(dir);
  }

  async reload() {
    const list = await this.loader.loadAll();

    // Build new maps in isolation
    const newCmd = new Map();
    const newAlias = new Map();
    const newAll = new Map();

    for (const p of list) {
      const cmds = Array.isArray(p.command) ? p.command : [p.command];
      if (!cmds.length) continue;
      const stableId = (p.name || cmds[0]).toLowerCase();
      if (newAll.has(stableId)) continue; // dedupe
      newAll.set(stableId, p);
      for (const c of cmds) newCmd.set(c.toLowerCase(), p);
      for (const a of (p.aliases || [])) newAlias.set(a.toLowerCase(), p);
    }

    // Atomic swap — in-flight commands keep their old refs, no state loss
    this._cmd = newCmd;
    this._alias = newAlias;
    this._all = newAll;

    Logger.info(`📦 Plugins: ${newAll.size} loaded, ${newCmd.size} commands`);
    return newAll.size;
  }

  resolve(n) {
    if (!n) return null;
    const k = n.toLowerCase();
    return this._cmd.get(k) || this._alias.get(k) || null;
  }

  get plugins() { return this._all; }
  get commands() { return this._cmd; }

  listByCategory() {
    const m = new Map();
    for (const p of this._all.values()) {
      const candidates = [p.category, ...(Array.isArray(p.categories) ? p.categories : []), ...(Array.isArray(p.tags) ? p.tags : [])];
      const categories = [...new Set(candidates.map(v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean))];
      const resolved = categories.length ? categories : ['general'];
      for (const category of resolved) {
        if (!m.has(category)) m.set(category, []);
        if (!m.get(category).includes(p)) m.get(category).push(p);
      }
    }
    return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

import { Loader } from './Loader.js';
import Logger from './Logger.js';
import { buildPluginRegistry } from './PluginRegistry.js';

export class PluginManager {
  constructor(dir, { disposeTimeoutMs = 5000 } = {}) {
    this._cmd = new Map();
    this._alias = new Map();
    this._all = new Map();
    this._conflicts = [];
    this._loader = new Loader(dir);
    this.loader = this._loader;
    this._disposeTimeoutMs = Math.max(100, Number(disposeTimeoutMs) || 5000);
    this._leases = new Map();
    this._retired = new Set();
    this._retireReasons = new Map();
    this._disposed = new WeakSet();
    this._disposeErrors = [];
    this._pendingDisposals = new Set();
  }

  acquire(plugin) {
    if (!plugin || typeof plugin !== 'object') return () => {};
    this._leases.set(plugin, (this._leases.get(plugin) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = Math.max(0, (this._leases.get(plugin) || 0) - 1);
      if (remaining) this._leases.set(plugin, remaining);
      else {
        this._leases.delete(plugin);
        if (this._retired.has(plugin)) this.#disposePlugin(plugin, this._retireReasons.get(plugin) || 'plugin-reload').catch(() => {});
      }
    };
  }

  async #disposePlugin(plugin, reason) {
    if (!plugin || this._disposed.has(plugin) || this._leases.has(plugin)) return { disposed: false, reason: 'in-use-or-already-disposed' };
    this._disposed.add(plugin);
    this._retired.delete(plugin);
    this._retireReasons.delete(plugin);
    const disposer = typeof plugin.dispose === 'function' ? plugin.dispose
      : typeof plugin.onDispose === 'function' ? plugin.onDispose : null;
    if (!disposer) return { disposed: true, reason: 'no-disposer' };

    const name = String(plugin.name || plugin.__sourceFile || 'unknown-plugin');
    const task = Promise.resolve().then(() => disposer.call(plugin, {
      reason,
      plugin: name,
      sourceFile: plugin.__sourceFile || null,
      at: new Date().toISOString(),
    }));
    this._pendingDisposals.add(task);
    // Keep timed-out disposers visible until the underlying promise really settles.
    task.then(
      () => this._pendingDisposals.delete(task),
      () => this._pendingDisposals.delete(task),
    );
    let timer;
    try {
      await Promise.race([
        task,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error(`Plugin dispose timed out after ${this._disposeTimeoutMs}ms.`), { code: 'WHISKAY_PLUGIN_DISPOSE_TIMEOUT' })), this._disposeTimeoutMs);
          timer.unref?.();
        }),
      ]);
      return { disposed: true, name };
    } catch (error) {
      const entry = { name, reason, error: error?.message || String(error), at: new Date().toISOString() };
      this._disposeErrors.push(entry);
      this._disposeErrors = this._disposeErrors.slice(-100);
      Logger.warn({ plugin: name, err: entry.error }, 'Plugin disposal failed');
      return { disposed: false, name, error: entry.error };
    } finally {
      clearTimeout(timer);
      task.catch(() => {});
    }
  }

  async reload() {
    const list = await this._loader.loadAll();
    // Build the next command registry before changing the live pointers.
    const registry = buildPluginRegistry(list);
    const previous = [...new Set(this._all.values())];
    const nextPlugins = new Set(registry.all.values());

    this._cmd = registry.commands;
    this._alias = registry.aliases;
    this._all = registry.all;
    this._conflicts = registry.conflicts;

    // Retire old plugin instances only after the atomic registry swap. A command
    // already executing holds a lease and delays dispose() until its finally block.
    const disposalTasks = [];
    for (const plugin of previous) {
      if (nextPlugins.has(plugin)) continue;
      this._retired.add(plugin);
      this._retireReasons.set(plugin, 'plugin-reload');
      if (!this._leases.has(plugin)) disposalTasks.push(this.#disposePlugin(plugin, 'plugin-reload'));
    }
    const disposeResults = await Promise.all(disposalTasks);

    for (const conflict of this._conflicts) Logger.warn({ conflict }, 'Plugin command registry collision; later token registration skipped');
    Logger.info({ loaded: this._all.size, commands: this._cmd.size, disposed: disposeResults.filter(x => x.disposed).length }, 'Plugin registry swapped');
    return this._all.size;
  }

  async disposeAll({ reason = 'shutdown', timeoutMs = this._disposeTimeoutMs } = {}) {
    const previous = [...new Set(this._all.values())];
    this._cmd = new Map();
    this._alias = new Map();
    this._all = new Map();
    this._conflicts = [];
    const disposalTasks = [];
    for (const plugin of previous) {
      this._retired.add(plugin);
      this._retireReasons.set(plugin, reason);
      if (!this._leases.has(plugin)) disposalTasks.push(this.#disposePlugin(plugin, reason));
    }

    const results = await Promise.all(disposalTasks);
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (this._leases.size && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const remainingTasks = [];
    for (const plugin of [...this._retired]) {
      if (!this._leases.has(plugin)) remainingTasks.push(this.#disposePlugin(plugin, this._retireReasons.get(plugin) || reason));
    }
    results.push(...await Promise.all(remainingTasks));
    const pendingTasks = [...this._pendingDisposals];
    if (pendingTasks.length) {
      const remainingMs = Math.max(0, deadline - Date.now());
      if (remainingMs > 0) {
        let timer;
        await Promise.race([
          Promise.allSettled(pendingTasks),
          new Promise(resolve => { timer = setTimeout(resolve, remainingMs); timer.unref?.(); }),
        ]);
        clearTimeout(timer);
      }
    }
    return {
      disposed: results.filter(item => item.disposed).length,
      pending: this._retired.size,
      activeLeases: this._leases.size,
      pendingDisposals: this._pendingDisposals.size,
      errors: this._disposeErrors.slice(-20),
    };
  }

  resolve(n) {
    if (!n) return null;
    const k = n.toLowerCase();
    return this._cmd.get(k) || this._alias.get(k) || null;
  }

  get plugins() { return this._all; }
  get diagnostics() {
    return {
      loadedPlugins: this._all.size,
      commands: this._cmd.size,
      aliases: this._alias.size,
      conflicts: this._conflicts.map(item => ({ ...item })),
      activeLeases: this._leases.size,
      retiredPending: this._retired.size,
      pendingDisposals: this._pendingDisposals.size,
      disposalErrors: this._disposeErrors.slice(-20),
    };
  }
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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Logger from './Logger.js';

/**
 * Tiny persistent JSON store for runtime flags.
 * Writes atomically; never throws on read (returns defaults).
 */
export class RuntimeState {
  constructor(file) {
    this.file = file;
    this.dir = path.dirname(file);
    this._data = {};
    this._load();
  }

  _load() {
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
      if (existsSync(this.file)) {
        const raw = readFileSync(this.file, 'utf8');
        this._data = JSON.parse(raw || '{}');
      }
    } catch (e) {
      Logger.warn(`RuntimeState load: ${e.message}`);
      this._data = {};
    }
  }

  _save() {
    try {
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify(this._data, null, 2));
      // atomic rename
      writeFileSync(this.file, JSON.stringify(this._data, null, 2));
    } catch (e) {
      Logger.error(`RuntimeState save: ${e.message}`);
    }
  }

  get(key, def = null) {
    return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : def;
  }

  set(key, value) {
    this._data[key] = value;
    this._save();
    return value;
  }

  all() { return { ...this._data }; }
}

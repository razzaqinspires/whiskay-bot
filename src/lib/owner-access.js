import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';

const DATA_ROOT = path.resolve(process.env.WHISKAY_DATA_DIR || './data');
const FILE = path.join(DATA_ROOT, 'owner-access.json');
const normalize = value => {
  const raw = String(value || '').trim();
  if (/^\d{8,15}$/.test(raw)) return `${raw}@s.whatsapp.net`;
  if (/^\d{8,15}@s\.whatsapp\.net$/i.test(raw)) return raw;
  return '';
};
const primary = () => [...new Set((config.owners || []).map(normalize).filter(Boolean))];
function load() {
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
    if (!parsed || !Array.isArray(parsed.owners)) return [];
    return [...new Set(parsed.owners.map(normalize).filter(Boolean))];
  } catch { return []; }
}
let managed = load();
function persist() {
  mkdirSync(DATA_ROOT, { recursive: true, mode: 0o700 });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, owners: managed, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}
export function isPrimaryOwner(identity, cfg = config) {
  const list = (cfg.owners || []).filter(Boolean).map(value => String(value).trim());
  return (Array.isArray(identity) ? identity : [identity]).some(id => {
    const candidate = String(id || '').trim();
    if (!candidate) return false;
    const canonical = candidate.includes('@') ? candidate : `${candidate.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    return list.some(owner => owner === candidate || owner === canonical || owner.split('@')[0].split(':')[0] === canonical.split('@')[0].split(':')[0]);
  });
}
export function getManagedOwners() { return [...managed]; }
export function getAllOwners(cfg = config) { return [...new Set([...(cfg.owners || []), ...managed])]; }
export function addManagedOwner(value) {
  const jid = normalize(value);
  if (!jid) throw new Error('Target harus nomor WhatsApp PN yang valid; LID tidak diterima untuk pemberian hak owner.');
  if (primary().some(x => x === jid)) return { jid, changed: false, reason: 'primary' };
  if (managed.includes(jid)) return { jid, changed: false, reason: 'exists' };
  managed.push(jid); persist(); return { jid, changed: true };
}
export function removeManagedOwner(value) {
  const jid = normalize(value);
  if (!jid) throw new Error('Target harus nomor WhatsApp PN yang valid.');
  if (primary().some(x => x === jid)) return { jid, changed: false, reason: 'primary' };
  const before = managed.length;
  managed = managed.filter(x => x !== jid);
  const changed = before !== managed.length;
  if (changed) persist();
  return { jid, changed, reason: changed ? 'removed' : 'not-found' };
}
export function ownerAccessFilePath() { return FILE; }

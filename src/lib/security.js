import config from '../config/index.js';

export function digits(jid) {
  return String(jid || '').replace(/[^0-9]/g, '');
}

export function sameUser(a, b) {
  if (!a || !b) return false;
  const da = digits(a), db = digits(b);
  if (!da || !db) return false;
  return da === db;
}

export function isOwner(identity = [], cfg = {}) {
  const owners = cfg.owners || (cfg.security && cfg.security.owners) || [];
  const lids   = cfg.ownerLids || [];
  const all    = [...owners, ...lids];
  if (!all.length) return false;
  return identity.some(jid => all.some(o => sameUser(jid, o)));
}

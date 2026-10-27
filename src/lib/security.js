import config from '../config/index.js';

export function digits(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function namespace(jid) {
  const text = String(jid || '').trim();
  if (!text.includes('@')) return null;
  return text.slice(text.lastIndexOf('@') + 1).split(':')[0].toLowerCase();
}

function isPhoneNamespace(ns) {
  return ns === 's.whatsapp.net' || ns === 'whatsapp.net' || ns === 'c.us';
}

export function sameUser(a, b) {
  if (!a || !b) return false;
  const left = String(a).trim(), right = String(b).trim();
  if (left === right) return true;
  const da = digits(left), db = digits(right);
  if (!da || !db || da !== db) return false;
  const na = namespace(left), nb = namespace(right);
  // A bare number is the PN alias. Never infer identity by matching LID digits to a phone number.
  if (na === 'lid' || nb === 'lid') return false;
  if (na && nb && na !== nb && !(isPhoneNamespace(na) && isPhoneNamespace(nb))) return false;
  return true;
}

export function isOwner(identity = [], cfg = config) {
  const owners = cfg.owners || (cfg.security && cfg.security.owners) || [];
  const lids = cfg.ownerLids || [];
  if (!owners.length && !lids.length) return false;
  return identity.some(jid => owners.some(owner => sameUser(jid, owner)) || lids.some(lid => sameUser(jid, lid)));
}

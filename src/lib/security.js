export function digits(jid) { return String(jid || '').replace(/[^0-9]/g, ''); }

function canonical(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.endsWith('@s.whatsapp.net')) return `${digits(s)}@s.whatsapp.net`;
  if (s.endsWith('@lid')) return `${s.split('@')[0].split(':')[0]}@lid`;
  if (s.endsWith('@g.us') || s.endsWith('@newsletter')) return s;
  const d = digits(s);
  return d ? `${d}@s.whatsapp.net` : s;
}

export function sameUser(a, b) {
  const left = canonical(a), right = canonical(b);
  if (!left || !right) return false;
  // Never equate an anonymized LID with a PN merely because their digits match.
  return left === right;
}

export function isOwner(identity = [], cfg = {}) {
  const owners = cfg.owners || cfg.security?.owners || [];
  const lids = cfg.ownerLids || [];
  const all = [...owners, ...lids].map(canonical).filter(Boolean);
  return identity.some(jid => all.some(owner => sameUser(jid, owner)));
}

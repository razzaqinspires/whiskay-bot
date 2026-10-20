import { sameUser } from './security.js';
import { getState } from './state.js';

export function isPremium(identity = [], config = {}) {
  const list = [...(getState().premiumUsers || []), ...(config.premiumUsers || [])];
  if (!list.length) return false;
  return identity.some(jid => list.some(p => sameUser(jid, p)));
}

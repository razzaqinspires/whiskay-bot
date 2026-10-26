import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(process.env.WHISKAY_DATA_DIR || 'data', 'group-policy.json');
const DEFAULTS = { mutedGroups: [], onlyGroup: '', groups: {} };
let state;
function load() {
  if (state) return state;
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    state = existsSync(FILE) ? { ...DEFAULTS, ...JSON.parse(readFileSync(FILE, 'utf8')) } : { ...DEFAULTS };
  } catch { state = { ...DEFAULTS }; }
  state.mutedGroups = Array.isArray(state.mutedGroups) ? state.mutedGroups : [];
  state.groups = state.groups && typeof state.groups === 'object' ? state.groups : {};
  return state;
}
function save() {
  const s = load(); mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`; writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, FILE);
}
export function getGroupPolicy() { return structuredClone(load()); }
export function isGroupMuted(jid) {
  if (!String(jid || '').endsWith('@g.us')) return false;
  const s = load();
  return Boolean((s.onlyGroup && s.onlyGroup !== jid) || s.mutedGroups.includes(jid));
}
export function muteGroup(jid) { if (!String(jid).endsWith('@g.us')) throw new Error('group_jid_invalid'); const s=load(); s.mutedGroups=[...new Set([...s.mutedGroups,jid])]; save(); return getGroupPolicy(); }
export function unmuteGroup(jid) { const s=load(); s.mutedGroups=s.mutedGroups.filter(x=>x!==jid); if(s.onlyGroup===jid) s.onlyGroup=''; save(); return getGroupPolicy(); }
export function setOnlyGroup(jid) { if (!String(jid).endsWith('@g.us')) throw new Error('group_jid_invalid'); const s=load(); s.onlyGroup=jid; s.mutedGroups=[]; save(); return getGroupPolicy(); }
export function resetGroupMutePolicy() { const s=load(); s.mutedGroups=[]; s.onlyGroup=''; save(); return getGroupPolicy(); }
export function getGroupSettings(jid) { return { toxic: false, toxicWords: [], banWords: [], antiBanWord: false, textGuard: false, welcome: false, ...(load().groups[jid] || {}) }; }
export function updateGroupSettings(jid, patch) {
  if (!String(jid).endsWith('@g.us')) throw new Error('group_jid_invalid');
  const s=load(); s.groups[jid]={...getGroupSettings(jid),...patch};
  for (const k of ['toxicWords','banWords']) s.groups[jid][k]=[...new Set((s.groups[jid][k]||[]).map(v=>String(v).trim().toLowerCase()).filter(Boolean))].slice(0,100);
  save(); return getGroupSettings(jid);
}
export function listConfiguredGroups() { const s=load(); return [...new Set([...s.mutedGroups, ...Object.keys(s.groups), ...(s.onlyGroup?[s.onlyGroup]:[])])]; }
export function normalizeMessageText(value) {
  return String(value || '').normalize('NFKC').replace(/[\u200B-\u200F\uFEFF\u202A-\u202E\u2060]/g, '').replace(/\s+/g, ' ').trim();
}
const DEFAULT_TOXIC_WORDS = ['anjing','bangsat','bajingan','goblok','tolol','kontol','memek','ngentot','asu'];
export function inspectGroupText(jid, text) {
  const settings=getGroupSettings(jid), normalized=normalizeMessageText(text), lower=normalized.toLowerCase();
  if (!normalized) return { action:'allow', reason:'empty' };
  if (settings.textGuard) {
    const zeroWidthCount=(String(text||'').match(/[\u200B-\u200F\uFEFF\u202A-\u202E\u2060]/g)||[]).length;
    const repeatedChar=/(.)\1{79,}/su.test(normalized);
    const repeatedWord=/\b([\p{L}\p{N}_]{2,})\b(?:\s+\1\b){19,}/iu.test(normalized);
    if (String(text||'').length>3500 || zeroWidthCount>20 || repeatedChar || repeatedWord) return { action:'block', reason:'text_flood', normalized };
  }
  const words=[...(settings.toxic?DEFAULT_TOXIC_WORDS:[]),...(settings.toxic?settings.toxicWords||[]:[]),...(settings.antiBanWord?settings.banWords||[]:[])];
  for (const word of words) {
    const w=String(word||'').trim().toLowerCase(); if(!w) continue;
    const escaped=w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`,'iu').test(lower)) return { action:'block', reason:'blocked_word', word:w, normalized };
  }
  return { action:'allow', normalized };
}

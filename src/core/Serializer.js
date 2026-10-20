import { createRequire } from 'node:module';
import {
  downloadMediaMessage,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent
} from '@whiskeysockets/baileys';
import { isOwner, sameUser } from '../lib/security.js';
import { getState } from '../lib/state.js';
import { isPremium as isPremiumUser } from '../lib/access.js';
import { attachInteractive } from '../lib/interactive.js';

const require = createRequire(import.meta.url);
let compat = null;
try { compat = require('./serializer-compat.cjs'); } catch { /* optional */ }

// ─── Local JID helpers ───
const isJidGroup      = j => typeof j === 'string' && j.endsWith('@g.us');
const isJidNewsletter = j => typeof j === 'string' && j.endsWith('@newsletter');
const isLidUser       = j => typeof j === 'string' && j.endsWith('@lid');
const isPnUser        = j => typeof j === 'string' && j.endsWith('@s.whatsapp.net');

// ─── LID ↔ PN cache ───
const lidToPn = new Map();

function registerLidPair(lid, pn) {
  if (!lid || !pn) return;
  if (!isLidUser(lid) || !isPnUser(pn)) return;
  const bare = lid.split(':')[0].replace(/@lid$/, '');
  lidToPn.set(bare, pn);
  lidToPn.set(lid.split(':')[0], pn);
}

function lookupPn(lid) {
  if (!lid) return '';
  const a = lid.split(':')[0];
  const b = a.replace(/@lid$/, '');
  return lidToPn.get(a) || lidToPn.get(b) || '';
}

/**
 * Resolve LID → PN. Strategy (v7):
 *  1. Local cache
 *  2. Baileys v7 signalRepository.lidMapping.getPNForLID
 *  3. Bot's own creds
 *  4. onWhatsApp fallback (v6 compat)
 */
async function resolveLidToPn(sock, lid) {
  if (!lid || !isLidUser(lid)) return '';
  const cached = lookupPn(lid);
  if (cached) return cached;

  // 2. Baileys v7 internal lidMapping
  try {
    const map = sock?.signalRepository?.lidMapping;
    if (map && typeof map.getPNForLID === 'function') {
      const pn = await map.getPNForLID(lid);
      if (pn && isPnUser(pn)) { registerLidPair(lid, pn); return pn; }
    }
  } catch { /* silent */ }

  // 3. bot's own creds
  const meId  = sock?.authState?.creds?.me?.id  || sock?.user?.id  || '';
  const meLid = sock?.authState?.creds?.me?.lid || sock?.user?.lid || '';
  if (meId && meLid && isPnUser(meId)) {
    if (meLid.split(':')[0] === lid.split(':')[0]) {
      registerLidPair(lid, meId);
      return meId;
    }
  }

  // 4. v6 compat: onWhatsApp
  try {
    if (typeof sock.onWhatsApp === 'function') {
      const res = await sock.onWhatsApp(lid);
      const jid = res?.[0]?.jid;
      if (jid && isPnUser(jid)) { registerLidPair(lid, jid); return jid; }
    }
  } catch { /* silent */ }

  return '';
}

export async function serializeMessage(sock, msg, config = {}, bot = {}) {
  const key = msg?.key ?? {};
  const remoteJid = key.remoteJid || '';
  const group = isJidGroup(remoteJid);

  // ★ Pre-register pairs langsung dari key (v7 punya field ini!)
  if (key.remoteJid && isLidUser(key.remoteJid) && key.remoteJidAlt && isPnUser(key.remoteJidAlt)) {
    registerLidPair(key.remoteJid, key.remoteJidAlt);
  }
  if (key.participant && isLidUser(key.participant) && key.participantAlt && isPnUser(key.participantAlt)) {
    registerLidPair(key.participant, key.participantAlt);
  }

  const identity = await buildIdentity(sock, key, group);
  const sender = identity.primary || remoteJid;
  const isFromMe = Boolean(key.fromMe);
  const botJids = getBotJids(sock, bot);
  const isBot = isFromMe || identity.all.some(jid => botJids.some(b => sameUser(jid, b)));
  const groupInfo = group ? await buildGroupInfo(sock, remoteJid, sender, botJids) : null;
  const validation = validateMessageShape(msg, key, remoteJid, identity, groupInfo);
  const role = resolveRole(identity.all, sender, config, groupInfo);

  const normalizeContent = c => {
    if (c == null) return { text: '' };
    if (typeof c === 'string') return { text: c };
    if (Buffer.isBuffer(c) || c instanceof Uint8Array) return { document: c };
    if (typeof c !== 'object') return { text: String(c) };
    return c;
  };

  const reply = async (content, options = {}) =>
    sock.sendMessage(remoteJid, normalizeContent(content), { quoted: msg, ...options });
  const send = async (content, options = {}) =>
    sock.sendMessage(remoteJid, normalizeContent(content), options);
  const react = emoji => sock.sendMessage(remoteJid, { react: { text: String(emoji), key } });
  const remove = () => sock.sendMessage(remoteJid, { delete: key });
  const download = async (target = msg, options = {}) =>
    downloadMediaMessage(target, 'buffer', options, sock);

  const text = extractText(msg);
  const body = text;
  const premium = isPremiumUser(identity.all, config);
  const owner = isOwner(identity.all, config);
  const admin = owner || Boolean(groupInfo?.isSenderAdmin) || isConfiguredAdmin(identity.all, config);

  const senderNumber = identity.pn
    ? identity.pn.split('@')[0].split(':')[0]
    : (sender.includes('@') && !sender.endsWith('@lid') ? sender.split('@')[0].split(':')[0] : '');

  const contentType = getContentType(normalizeMessageContent(msg.message)) || '';
  const mentions = msg?.message?.[contentType]?.contextInfo?.mentionedJid || [];

  return {
    raw: msg, sock, validation, key,
    id: key.id || '',
    chat: remoteJid, chatId: remoteJid,
    sender, senderNumber,
    pushName: msg?.pushName || '',
    text, body,
    selectedButtonId: extractInteractiveId(msg),
    isGroup: group,
    isPrivate: !group,
    isNotGroup: !group,
    isNewsletter: isJidNewsletter(remoteJid),
    isFromMe,
    isBot, isSelf: isBot,
    isOwner: owner,
    isAdmin: admin,
    isPremium: premium,
    isNotOwner: !owner,
    isNotAdmin: !admin,
    isNotPremium: !premium,
    isGroupAdmin: Boolean(groupInfo?.isSenderAdmin),
    isBotAdmin: Boolean(groupInfo?.isBotAdmin),
    role, identity,
    media: detectMedia(msg),
    group: groupInfo,
    mentions,
    quoted: buildQuotedMessage(msg),
    reply, send, react,
    delete: remove,
    download,
    getQuotedMessage: () => buildQuotedMessage(msg),
    freply: compat?.freply || null,
    createFakeReply: (t, o = {}) => compat?.createFakeReply?.(t, o) || null,
    sendInteractive: (d = {}) => typeof sock.sendInteractive === 'function' ? sock.sendInteractive(remoteJid, d, msg) : Promise.reject(new Error('Interactive helper not attached')),
    sendRichMessage: (sub, o = {}) => sock.sendRichMessage?.(remoteJid, sub, msg, o),
    sendList: (title, items, o = {}) => sock.sendList?.(remoteJid, title, items, msg, o),
    airich: () => sock.airich?.(),
    rich: () => sock.richMessage?.() || sock.airich?.(),
    buttonBuilder: () => sock.buttonBuilder?.(),
    buttonV2Builder: () => sock.buttonV2Builder?.(),
    carouselBuilder: () => sock.carouselBuilder?.()
  };
}

async function buildIdentity(sock, key, isGroup) {
  // ★ v7: pakai remoteJidAlt / participantAlt
  const primary = isGroup ? key.participant : key.remoteJid;
  const alt     = isGroup ? key.participantAlt : key.remoteJidAlt;
  const pnAlt   = isGroup ? key.participantPn  : key.remoteJidPn;
  const lidAlt  = isGroup ? key.participantLid : key.remoteJidLid;

  const raw = [primary, alt, pnAlt, lidAlt, key.participant, key.remoteJid]
    .filter(Boolean);
  const all = uniqueJids(raw);

  // Resolve any LID yang belum punya PN
  const resolved = [];
  for (const jid of all) {
    if (isLidUser(jid)) {
      const pn = await resolveLidToPn(sock, jid);
      if (pn && !resolved.includes(pn)) resolved.push(pn);
    }
  }
  const merged = uniqueJids([...all, ...resolved]);

  const pn  = merged.find(isPnUser) || '';
  const lid = merged.find(isLidUser) || '';
  return { primary: pn || merged[0] || '', pn, lid, all: merged };
}

function getBotJids(sock, bot) {
  return uniqueJids([
    bot.userJid,
    sock?.user?.id,
    sock?.user?.lid,
    sock?.authState?.creds?.me?.id,
    sock?.authState?.creds?.me?.lid
  ]);
}

function uniqueJids(values) {
  return [...new Set(values.flatMap(v => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)))];
}

function isConfiguredAdmin(identity, config) {
  const adminJids = (config.security && config.security.adminJids) || [];
  return identity.some(jid => adminJids.some(a => sameUser(jid, a)));
}

function resolveRole(identity, sender, config, groupInfo) {
  if (isOwner(identity, config)) return 'owner';
  if (groupInfo?.isSenderAdmin || isConfiguredAdmin(identity, config)) return 'admin';
  if (getState().premiumUsers.some(jid => identity.some(c => sameUser(c, jid)))) return 'premium';
  return 'user';
}

async function buildGroupInfo(sock, groupJid, sender, botJids) {
  try {
    const md = await sock.groupMetadata(groupJid);
    const participants = md?.participants || [];
    const senderParticipant = participants.find(p => matches(p, sender));
    const botParticipant = participants.find(p => botJids.some(j => matches(p, j)));
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const ownerCandidates = [md?.owner, md?.ownerPn, md?.subjectOwner, md?.subjectOwnerPn].filter(Boolean);
    return {
      id: md?.id || groupJid, subject: md?.subject || '', description: md?.desc || '',
      size: md?.size ?? participants.length,
      owner: md?.owner || '', ownerPn: md?.ownerPn || '',
      subjectOwner: md?.subjectOwner || '', addressingMode: md?.addressingMode || '',
      announce: Boolean(md?.announce), restrict: Boolean(md?.restrict),
      participants, admins, ownerCandidates,
      isSenderAdmin: Boolean(senderParticipant?.admin),
      isSenderOwner: ownerCandidates.some(o => sameUser(o, sender)),
      isBotAdmin: Boolean(botParticipant?.admin),
      isBotOwner: ownerCandidates.some(o => botJids.some(j => sameUser(o, j))),
      senderParticipant: senderParticipant || null,
      botParticipant: botParticipant || null
    };
  } catch (e) {
    return { id: groupJid, subject: '', description: '', size: 0, participants: [], admins: [], metadataError: e.message, isSenderAdmin: false, isSenderOwner: false, isBotAdmin: false, isBotOwner: false };
  }
}

function matches(p, jid) {
  return [p?.id, p?.phoneNumber, p?.lid].filter(Boolean).some(v => sameUser(v, jid));
}

function buildQuotedMessage(source) {
  // Reply context may live on extendedTextMessage, image/video captions, or
  // inside ephemeral/view-once wrappers. Normalize first, then inspect each
  // message content type instead of assuming the command is always plain text.
  const normalized = normalizeMessageContent(source?.message) || {};
  let ctx = null;
  for (const value of Object.values(normalized)) {
    if (value && typeof value === 'object' && value.contextInfo?.quotedMessage) {
      ctx = value.contextInfo;
      break;
    }
  }
  if (!ctx?.quotedMessage) return null;
  return {
    key: {
      remoteJid: source.key?.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant || ctx.participantAlt,
      participantAlt: ctx.participantAlt
    },
    message: ctx.quotedMessage
  };
}

function detectMedia(msg) {
  const content = normalizeMessageContent(msg?.message);
  const type = getContentType(content) || '';
  const supported = ['imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage', 'audioMessage'];
  return { type, hasMedia: supported.includes(type), canUploadToInstagram: type === 'imageMessage' || type === 'videoMessage' };
}

function unwrapInteractiveMessage(msg) {
  let current = msg?.message || msg || {};
  for (let i = 0; i < 6 && current && typeof current === 'object'; i++) {
    const next = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.viewOnceMessageV2Extension?.message
      || current.documentWithCaptionMessage?.message
      || current.editedMessage?.message;
    if (!next) break;
    current = next;
  }
  return normalizeMessageContent(current) || {};
}

function parseNativeFlowParams(native) {
  const direct = [
    native?.buttonReply?.id, native?.buttonReply?.selectedId,
    native?.buttonReply?.selected_id, native?.selectedId,
    native?.selected_id, native?.rowId, native?.row_id
  ].find(v => typeof v === 'string' && v.trim());
  if (direct) return direct;
  if (typeof native?.paramsJson === 'string') {
    try {
      const p = JSON.parse(native.paramsJson);
      const id = p.id || p.row_id || p.rowId || p.selected_id || p.selectedId
        || p.selectedRowId || p.selected_row_id || p.selected_row || p.rowID
        || p.command || p.buttonId || p.button_id || p.action || p.selected;
      if (typeof id === 'string' && id.trim()) return id;
      for (const value of Object.values(p)) {
        if (value && typeof value === 'object') {
          const nested = value.id || value.row_id || value.rowId || value.selectedRowId
            || value.selected_row_id || value.selected_row || value.button_id || value.action;
          if (typeof nested === 'string' && nested.trim()) return nested;
        }
      }
    } catch {
      try {
        const decoded = JSON.parse(JSON.parse(native.paramsJson));
        const id = decoded?.id || decoded?.row_id || decoded?.rowId
          || decoded?.selected_row_id || decoded?.selectedRowId || decoded?.button_id;
        if (typeof id === 'string' && id.trim()) return id;
      } catch {}
    }
  }
  return '';
}

export function extractText(msg) {
  const m = unwrapInteractiveMessage(msg);
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
  if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;
  return parseNativeFlowParams(m.interactiveResponseMessage?.nativeFlowResponseMessage);
}

function extractInteractiveId(msg) {
  const m = unwrapInteractiveMessage(msg);
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
  if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;
  return parseNativeFlowParams(m.interactiveResponseMessage?.nativeFlowResponseMessage);
}

export function attachSerializerRuntime(sock) {
  if (!sock) return sock;
  try { compat?.extendSocket?.(sock); } catch { /* optional */ }
  try { attachInteractive(sock); } catch { /* optional */ }
  return sock;
}

export function validateMessageShape(msg = {}, key = {}, remoteJid = '', identity = { all: [] }, groupInfo = null) {
  const errors = [], warnings = [];
  if (!key.id) warnings.push('message key.id kosong');
  if (!remoteJid) errors.push('remoteJid kosong');
  if (!identity.all?.length) errors.push('identity tidak memiliki JID kandidat');
  if (isJidGroup(remoteJid) && !groupInfo) warnings.push('metadata grup tidak tersedia');
  if (key.remoteJid && isLidUser(key.remoteJid) && !key.remoteJidAlt && !key.remoteJidPn) warnings.push('remoteJid LID tanpa Alt/Pn');
  return { ok: errors.length === 0, errors, warnings };
}

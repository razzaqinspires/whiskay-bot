/** ESM facade over the project's CommonJS Baileys serializer compatibility layer. */
import compat from './serializer-compat.cjs';
export const sendInteractiveMessage = compat.sendInteractiveMessage;
export const serialize = compat.serialize;
import configDefault from '../config/index.js';
import { isOwner } from '../lib/security.js';
import { createMessageEnvelope } from '../lib/stage26-observability.js';
const groupMetaCache = new Map();
export async function serializeMessage(sock, raw, config = configDefault, bot = null) {
  const ctx = compat.serialize(sock, raw);
  if (!ctx) return ctx;
  ctx.sock = sock;
  ctx.bot = bot;
  // Stage 26: stable per-message correlation metadata for logs/events; message content is excluded.
  ctx.event = createMessageEnvelope(raw);
  ctx.correlationId = ctx.event.correlationId;
  ctx.receivedAt = ctx.event.receivedAt;
  // Stage 23+ bridge: reply is deliberately text-only; send is the flexible builder.
  // Keep serializer-compat.cjs untouched: its existing socket builders remain the source of truth.
  ctx.reply = async (text) => {
    if (!sock?.sendMessage || !ctx.chat) throw new TypeError('Socket/chat belum tersedia untuk reply.');
    return sock.sendMessage(ctx.chat, { text: String(text ?? '') }, { quoted: ctx });
  };
  ctx.send = async (options = {}) => {
    if (typeof options === 'string' || typeof options === 'number') options = { text: String(options) };
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('m.send menerima teks atau object options.');
    const quote = options.quote === false ? null : (options.quoted ?? ctx);
    const type = String(options.type || options.kind || '').toLowerCase();
    const has = key => Object.prototype.hasOwnProperty.call(options, key);
    // Delegate to helpers already attached by serializer-compat, so formatting stays consistent.
    if (type === 'table' || options.table) {
      const table = options.table || {};
      return ctx.sendTable(options.title || table.title || 'Informasi', options.headers || table.headers || [], options.rows || table.rows || [], { ...(options.tableOptions || {}), quoted: quote });
    }
    if (type === 'rich' || options.richMessage || options.submessages) {
      return ctx.sendRichMessage(options.submessages || options.richMessage || [], { ...(options.richOptions || {}), quoted: quote });
    }
    if (type === 'list' || options.list) {
      if (typeof ctx.sendList === 'function' && Array.isArray(options.items)) return ctx.sendList(options.title || 'Daftar', options.items, { ...options, quoted: quote });
      const sections = Array.isArray(options.list) ? options.list : options.list?.sections;
      if (typeof ctx.sendInteractive === 'function' && Array.isArray(sections)) return ctx.sendInteractive({ title: options.title || 'Daftar', subtitle: options.subtitle || '', body: options.text || '', footer: options.footer || '✧ ᴡʜɪꜱᴋᴀʏʙᴏᴛ', buttons: [{ name: 'single_select', title: options.listTitle || 'Pilih', sections }], quoted: quote });
      throw new TypeError('m.send list membutuhkan options.list/sections atau options.items.');
    }
    if (type === 'interactive' || options.buttons) {
      if (typeof ctx.sendInteractive === 'function') return ctx.sendInteractive({ title: options.title || '', subtitle: options.subtitle || '', body: options.text || options.body || '', footer: options.footer || '✧ ᴡʜɪꜱᴋᴀʏʙᴏᴛ', image: options.image, buttons: options.buttons || [], quoteMode: options.quoteMode, quoteExperiment: options.quoteExperiment, quoted: quote });
      throw new TypeError('Helper sendInteractive tidak tersedia pada socket ini.');
    }
    if (options.media) {
      const mediaType = ['image','video','audio','document','sticker'].includes(options.mediaType) ? options.mediaType : 'image';
      const payload = { [mediaType]: options.media };
      if (['image','video','document'].includes(mediaType) && options.text) payload.caption = String(options.text);
      if (mediaType === 'audio' && options.ptt !== undefined) payload.ptt = Boolean(options.ptt);
      return sock.sendMessage(ctx.chat, payload, quote ? { quoted: quote } : {});
    }
    if (has('text') || has('body')) return sock.sendMessage(ctx.chat, { text: String(options.text ?? options.body ?? '') }, quote ? { quoted: quote } : {});
    throw new TypeError('m.send membutuhkan text, media, table, richMessage, list, atau buttons.');
  };
  ctx.analyze = async (context = {}) => ({ chat: ctx.chat, sender: ctx.sender, isGroup: Boolean(ctx.isGroup), text: String(context.text || ctx.body || '').slice(0, 2000), dungeon: context.dungeon || null, energy: context.energy || null, passive: true });
  ctx.config = config;
  ctx.isBot = Boolean(ctx.fromMe || raw?.key?.fromMe);
  const candidates = [
    ctx.sender, raw?.key?.participant, raw?.key?.participantAlt, raw?.key?.participantPn,
    raw?.key?.remoteJid, raw?.key?.remoteJidAlt, raw?.key?.remoteJidPn
  ].filter(Boolean).map(String);
  const ownerCheck = isOwner(candidates, config);
  ctx.isOwner = ownerCheck;
  ctx.isAdmin = false;
  ctx.isBotAdmin = false;
  if (ctx.isGroup && typeof sock?.groupMetadata === 'function') {
    try {
      const now = Date.now();
      let cached = groupMetaCache.get(ctx.chat);
      if (!cached || now - cached.at > 30_000) {
        cached = { at: now, value: await sock.groupMetadata(ctx.chat) };
        groupMetaCache.set(ctx.chat, cached);
        if (groupMetaCache.size > 500) {
          for (const [jid, row] of groupMetaCache) if (now - row.at > 60_000) groupMetaCache.delete(jid);
        }
      }
      const participants = cached.value?.participants || [];
      const roleOf = jid => participants.find(p => [p.id, p.jid, p.lid].filter(Boolean).includes(jid));
      const senderRole = candidates.map(roleOf).find(Boolean);
      const botCandidates = [sock?.user?.id, sock?.user?.lid].filter(Boolean).map(String);
      const botRole = botCandidates.map(roleOf).find(Boolean);
      ctx.isAdmin = Boolean(senderRole?.admin || senderRole?.isAdmin || senderRole?.isSuperAdmin || senderRole?.role === 'admin' || senderRole?.role === 'superadmin');
      ctx.isBotAdmin = Boolean(botRole?.admin || botRole?.isAdmin || botRole?.isSuperAdmin || botRole?.role === 'admin' || botRole?.role === 'superadmin');
      ctx.groupMetadata = cached.value;
    } catch {}
  }
  ctx.download = async (target = ctx, options = {}) => compat.downloadMedia(target || ctx, sock, options);
  return ctx;
}
export const extendSocket = compat.extendSocket;
// Bot.js uses this compatibility name during socket initialization.
export const attachSerializerRuntime = compat.extendSocket;
export const unwrapMessage = compat.unwrapMessage;
export const downloadMedia = compat.downloadMedia;
export default compat;

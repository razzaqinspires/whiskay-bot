/** Whiskay Event Registry — explicit, isolated replacement for dynamic helper/Events patterns. */
const DEFAULTS = Object.freeze({ energy: 0, premium: false, args: false, badword: false, media: null, urls: null, isMention: false, isQuoted: false, onlyGame: [] });
const SAFE_NAME = /^[a-z0-9][a-z0-9:_-]{0,63}$/i;
export class EventRegistry {
  #events = new Map();
  #aliases = new Map();
  register(definition, handler) {
    if (!definition || typeof definition !== 'object' || typeof handler !== 'function') throw new TypeError('definition and handler are required');
    const commands = (Array.isArray(definition.cmd) ? definition.cmd : [definition.cmd]).map(x => String(x || '').trim().toLowerCase()).filter(Boolean);
    if (!commands.length || commands.some(x => !SAFE_NAME.test(x))) throw new TypeError('invalid event command');
    const normalized = Object.freeze({ ...DEFAULTS, ...definition, cmd: commands, listmenu: Array.isArray(definition.listmenu) ? [...definition.listmenu] : [], onlyGame: Array.isArray(definition.onlyGame) ? [...definition.onlyGame] : [] });
    for (const cmd of commands) { if (this.#events.has(cmd)) throw new Error(`event already registered: ${cmd}`); }
    for (const cmd of commands) this.#events.set(cmd, { definition: normalized, handler });
    return () => { for (const cmd of commands) this.#events.delete(cmd); };
  }
  has(command) { return this.#events.has(String(command || '').toLowerCase()); }
  describe() { return [...new Set([...this.#events.values()].map(x => x.definition))].map(d => ({ cmd: [...d.cmd], listmenu: [...d.listmenu], tag: d.tag || 'tools', energy: Number(d.energy) || 0, premium: Boolean(d.premium) })); }
  async emit(command, context = {}, { maxDepth = 4 } = {}) {
    const key = String(command || context.command || '').replace(/^[.,!/#]+/, '').trim().toLowerCase();
    if (!key || !this.#events.has(key)) return { ok: false, reason: 'not_found', command: key };
    const depth = Number(context.__eventDepth || 0);
    if (depth >= Math.max(1, Math.min(8, Number(maxDepth) || 4))) return { ok: false, reason: 'depth_limit', command: key };
    const { definition, handler } = this.#events.get(key);
    const checked = validateEventInput(definition, context);
    if (!checked.ok) return { ok: false, reason: checked.reason, detail: checked.detail, command: key };
    const safeContext = { ...context, command: key, __eventDepth: depth + 1, eventDefinition: definition, emitEvent: (next, patch = {}) => this.emit(next, { ...safeContext, ...patch, __eventDepth: depth + 1 }, { maxDepth }) };
    try { return { ok: true, command: key, result: await handler(safeContext) }; }
    catch (error) { return { ok: false, reason: 'handler_error', command: key, error: error?.message || String(error) }; }
  }
}
export function validateEventInput(definition = {}, ctx = {}) {
  const body = String(ctx.text ?? ctx.body ?? ctx.args?.join?.(' ') ?? '').trim();
  if (definition.args && !body) return { ok: false, reason: 'args_required' };
  if (definition.isMention && !(ctx.mentionedJid?.length || ctx.mentionedJids?.length || ctx.mentionedUser || ctx.quoted?.sender)) return { ok: false, reason: 'mention_required' };
  if (definition.isQuoted && !ctx.quoted) return { ok: false, reason: 'quote_required' };
  if (definition.premium && !ctx.isPremium && !ctx.isOwner) return { ok: false, reason: 'premium_required' };
  if (definition.onlyGame?.length && !definition.onlyGame.includes(ctx.activeGame)) return { ok: false, reason: 'game_required' };
  if (definition.badword && typeof ctx.containsBadword === 'function' && ctx.containsBadword(body)) return { ok: false, reason: 'badword_blocked' };
  if (definition.urls) {
    const urls = body.match(/https?:\/\/[^\s]+/gi) || [];
    if (!urls.length) return { ok: false, reason: 'url_required' };
    const formats = (definition.urls.formats || []).map(x => String(x).toLowerCase());
    if (formats.length && !urls.some(url => { try { const host = new URL(url).hostname.toLowerCase(); return formats.some(f => host === f || host.endsWith('.' + f)); } catch { return false; } })) return { ok: false, reason: 'url_format_invalid' };
  }
  if (definition.media) {
    const types = (definition.media.type || []).map(x => String(x).toLowerCase());
    const media = ctx.media || ctx.quoted?.media || ctx.quoted?.type;
    if (!media) return { ok: false, reason: 'media_required' };
    const type = String(media.type || media.mimetype || media).toLowerCase();
    if (types.length && !types.some(t => type.includes(t) || (t === 'image' && type.includes('image/')) || (t === 'audio' && type.includes('audio/')) || (t === 'video' && type.includes('video/')))) return { ok: false, reason: 'media_type_invalid' };
    const maxSeconds = Number(definition.media.etc?.seconds || 0);
    if (maxSeconds && Number(media.seconds || media.duration || 0) > maxSeconds) return { ok: false, reason: 'media_too_long' };
  }
  return { ok: true };
}

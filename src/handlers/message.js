import Logger from '../core/Logger.js';
import { serializeMessage } from '../core/serializer.js';
import { awardMessageXP, getProfile } from '../lib/leveling.js';
import { observeUser, getUser } from '../lib/app-database.js';
import aiChatPlugin from '../plugins/tools/ai-chat.js';
import { relayAnonymousMessage } from '../plugins/general/anonymous.js';
import { getGroupSettings } from '../lib/group-settings.js';
import { updateUser } from '../lib/app-database.js';

export const createMessageHandler = ({ sock, bot, config, commandHandler, eventBus }) => async upsert => {
  if (upsert.type !== 'notify') return;
  for (const raw of upsert.messages) {
    if (!raw.message) continue;
    try {
      const ctx = await serializeMessage(sock, raw, config, bot);
      if (!ctx) continue;
      eventBus.emit('message', ctx);
      // Anti-link targets only WhatsApp group invite links; ordinary website URLs are allowed.
      if (ctx.isGroup && !ctx.isBot && ctx.sender && !ctx.isAdmin && !ctx.isOwner && /chat\.whatsapp\.com\/[\w-]{10,}/i.test(String(ctx.body || ''))) {
        const groupSettings = await getGroupSettings(ctx.chat).catch(() => ({ antilink: false }));
        if (groupSettings.antilink) {
          let deleted = false;
          if (ctx.isBotAdmin && typeof ctx.delete === 'function') { try { await ctx.delete(); deleted = true; } catch {} }
          const observed = await getUser(ctx.sender).catch(() => null);
          const warnings = Math.max(0, Number(observed?.warnings || 0)) + 1;
          await updateUser(ctx.sender, { warnings, lastAntiLinkAt: Date.now() }).catch(() => {});
          const kickEnabled = String(process.env.ANTILINK_AUTO_KICK || 'false').toLowerCase() === 'true';
          if (kickEnabled && warnings >= Math.max(2, Number(process.env.ANTILINK_KICK_AFTER || 3)) && ctx.isBotAdmin && typeof ctx.sock?.groupParticipantsUpdate === 'function') {
            try { await ctx.sock.groupParticipantsUpdate(ctx.chat, [ctx.sender], 'remove'); } catch {}
          } else if (ctx.isBotAdmin) {
            await ctx.sock.sendMessage(ctx.chat, { text: `🛡️ @${String(ctx.sender).split('@')[0]} tautan undangan grup dihapus. Peringatan ${warnings}.`, mentions: [ctx.sender] }).catch(() => {});
          } else {
            await ctx.sock.sendMessage(ctx.chat, { text: '⚠️ Anti-link mendeteksi tautan undangan, tetapi bot perlu menjadi admin untuk menghapus pesan.' }).catch(() => {});
          }
          if (deleted) continue;
        }
      }
      // Record every observed sender (DM or group) without silently registering them.
      if (ctx.sender && !ctx.isBot) {
        await observeUser({ jid: ctx.sender, pushName: ctx.pushName, chat: ctx.chat, isGroup: ctx.isGroup }).catch(err => Logger.warn({ err: err.message }, 'user observation skipped'));
      }
      // XP progresses only in groups whose leveling mode is enabled.
      if (ctx.isGroup && !ctx.isBot && ctx.sender) {
        try {
          const award = await awardMessageXP(ctx.chat, ctx.sender);
          if (award?.leveled) {
            const profile = await getProfile(ctx.chat, ctx.sender);
            if (profile.notifyLevelUp !== false) {
              const next = Math.floor(100 * Math.pow(Math.max(1, profile.level), 1.35));
              const percent = Math.min(100, Math.round((profile.xp || 0) / Math.max(1, next) * 100));
              await ctx.sendInteractive({ title: 'LEVEL UP!', subtitle: `Level ${award.from} → ${award.to}`, body: `Selamat! Kamu naik ke level ${award.to}.\n\nProgress: ${profile.xp || 0}/${next} XP (${percent}%)\n${'█'.repeat(Math.round(percent/5))}${'░'.repeat(20-Math.round(percent/5))}`, footer: 'XP hanya digunakan untuk level. Atur notifikasi melalui tombol di bawah.', buttons: [{ name: 'quick_reply', title: 'Matikan Notifikasi', id: '.levelnotify off' }, { name: 'quick_reply', title: 'Lihat Profil', id: '.profile' }] });
            }
          }
        } catch (levelError) { Logger.warn({ err: levelError.message }, 'leveling event skipped'); }
      }
      // Native-flow/list replies may be exposed only as selectedButtonId.
      const interactiveCommand = String(ctx.selectedButtonId || '').trim();
      if (interactiveCommand && /^[.,!/#]/.test(interactiveCommand) &&
          !/^[.,!/#]/.test(String(ctx.body || '').trim())) {
        ctx.body = interactiveCommand;
        ctx.text = interactiveCommand;
      }
      if (!ctx.body) continue;
      const incoming = ctx.body.trim();
      const isCommand = /^[.,!/#]/.test(incoming);
      const isOwnerConsoleOperator = /^(?:>>|=>|>|\$)\s*/.test(incoming);
      if (isCommand || isOwnerConsoleOperator) {
        await commandHandler.handle(ctx);
        continue;
      }
      if (ctx.isBot || !ctx.sender || !incoming) continue;
      // Anonymous relay gets first refusal in private chats; do not also feed the message to AI.
      if (!ctx.isGroup && await relayAnonymousMessage(ctx).catch(() => false)) continue;
      const user = await getUser(ctx.sender).catch(() => null);
      if (!user?.registered) continue;
      // Safe allow-listed natural-language intent routing. Never auto-execute admin,
      // payment, destructive, or external actions from an AI guess.
      if (/\b(?:buka|tampilkan|jalankan|pakai|gunakan|mau)\b.*\b(?:kalkulator telur|hitung telur|kalkulator penjualan telur)\b/i.test(incoming)) {
        const egg = commandHandler._pm?.resolve?.('telur');
        if (egg?.execute) {
          ctx.prefix = config.prefixes?.[0] || '.';
          ctx.command = 'telur'; ctx.args = []; ctx.text = ''; ctx.plugin = egg;
          await egg.execute(ctx);
          continue;
        }
      }
      // Nexora's conversational layer: private DM defaults to auto-chat; groups require
      // an explicit mention or a reply to the bot to avoid unsolicited group replies.
      const mode = String(process.env.AI_CHAT_MODE || 'auto-private-mention-group').toLowerCase();
      const botJids = [ctx.sock?.user?.id, ctx.sock?.user?.lid, ctx.bot?.user?.id].filter(Boolean).map(value => String(value).split(':')[0]);
      const mentionsBot = (ctx.mentionedJid || []).some(jid => botJids.includes(String(jid).split(':')[0])) ||
        /(?:@nexora|@whiskay)\b/i.test(incoming);
      const quotedBot = Boolean(ctx.quoted?.fromMe || ctx.quoted?.key?.fromMe);
      const isPrivateAuto = !ctx.isGroup && ['auto','auto-private-mention-group','all'].includes(mode);
      const shouldAI = mode !== 'off' && (isPrivateAuto || (mode !== 'mention-only' && (mentionsBot || quotedBot)) || (mode === 'mention-only' && mentionsBot));
      if (!shouldAI) continue;
      if (mode === 'mention-only' && !mentionsBot) continue;
      const prompt = incoming.replace(/@(?:nexora|whiskay)\b/ig, '').trim();
      if (!prompt) { await ctx.reply('🤖 Nexora siap. Tulis pertanyaan setelah mention.').catch(() => {}); continue; }
      const aiCtx = { ...ctx, args: [prompt], command: 'ai', prefix: '', text: prompt };
      try { await aiChatPlugin.execute(aiCtx); }
      catch (aiError) { Logger.warn({ err: aiError.message }, 'passive AI skipped'); }
    } catch (e) {
      Logger.error({ err: e.message }, 'message handler error');
    }
  }
};

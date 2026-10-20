import Logger from '../core/Logger.js';
import { serializeMessage } from '../core/Serializer.js';
import { awardMessageXP, getProfile } from '../lib/leveling.js';

export const createMessageHandler = ({ sock, bot, config, commandHandler, eventBus }) => async upsert => {
  if (upsert.type !== 'notify') return;
  for (const raw of upsert.messages) {
    if (!raw.message) continue;
    try {
      const ctx = await serializeMessage(sock, raw, config, bot);
      if (!ctx) continue;
      eventBus.emit('message', ctx);
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
      if (!isCommand && !isOwnerConsoleOperator) continue;
      await commandHandler.handle(ctx);
    } catch (e) {
      Logger.error({ err: e.message }, 'message handler error');
    }
  }
};

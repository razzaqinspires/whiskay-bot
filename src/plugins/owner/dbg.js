import { registry } from '../../core/registry.js';

export default {
  name: 'dbg',
  command: 'dbg',
  category: 'owner',
  owner: true,
  cooldown: 1000,
  async execute(ctx) {
    const sock = registry.sock;
    const hasFn = typeof sock?.sendInteractive === 'function';
    const lines = [
      '*Registry Debug*',
      '',
      'watcherLog     : ' + (registry.watcherLog ? 'OK' : 'MISSING'),
      'autoCleaner    : ' + (registry.autoCleaner ? 'OK' : 'MISSING'),
      'reloadQueue    : ' + (registry.reloadQueue ? 'OK' : 'MISSING'),
      'watcher        : ' + (registry.watcher ? 'OK' : 'MISSING'),
      'sourceWatcher  : ' + (registry.sourceWatcher ? 'OK' : 'MISSING'),
      'restartManager : ' + (registry.restartManager ? 'OK' : 'MISSING'),
      'runtimeState   : ' + (registry.runtimeState ? 'OK' : 'MISSING'),
      'bot            : ' + (registry.bot ? 'OK' : 'MISSING'),
      '',
      '*Socket Methods*',
      'sendMessage    : ' + (typeof sock?.sendMessage === 'function' ? 'OK' : 'MISSING'),
      'relayMessage   : ' + (typeof sock?.relayMessage === 'function' ? 'OK' : 'MISSING'),
      'sendInteractive: ' + (hasFn ? 'OK' : 'MISSING'),
      '',
      '*Context Methods*',
      'ctx.sendInteractive: ' + (typeof ctx.sendInteractive === 'function' ? 'OK' : 'MISSING'),
      'ctx.reply          : ' + (typeof ctx.reply === 'function' ? 'OK' : 'MISSING'),
      'ctx.airich         : ' + (typeof ctx.airich === 'function' ? 'OK' : 'MISSING')
    ];
    await ctx.reply(lines.join('\n'));
  }
};

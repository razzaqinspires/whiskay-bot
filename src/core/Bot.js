import { rm as rmAsync, access } from 'node:fs/promises';
import makeWASocket, {
  useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore, Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import path from 'node:path';
import Logger from './Logger.js';
import EventBus from './EventBus.js';
import { attachSerializerRuntime } from './serializer.js';
import { PluginManager } from './PluginManager.js';
import { AutoCleaner } from './AutoCleaner.js';
import { CommandHandler } from './CommandHandler.js';
import { ReloadQueue } from './ReloadQueue.js';
import { PluginWatcher } from './PluginWatcher.js';
import { RuntimeState } from './RuntimeState.js';
import { SourceWatcher } from './SourceWatcher.js';
import { RestartManager } from './RestartManager.js';
import { WatcherLog } from './WatcherLog.js';
import { createMessageHandler } from '../handlers/message.js';
import { baseMiddlewares } from '../middlewares/index.js';
import { registry } from './registry.js';
import config from '../config/index.js';
import { getGroupSettings } from '../lib/group-settings.js';
import { renderGroupMemberCardV2 } from '../services/canvas-v2.js';
import { ChronosCortex } from './ChronosCortex.js';
import { JobLoader } from './JobLoader.js';

export class Bot {
  constructor() {
    this._pm = new PluginManager(config.pluginDir);
    this._cmd = new CommandHandler(this._pm);
    this._restart = false;
    this._chronos = new ChronosCortex({ concurrency: 2 });
    this._jobLoader = new JobLoader({ chronos: this._chronos, context: () => ({ sock: this._sock }) });
    this._botInfo = {};
    this._watcher = null;
    this._sourceWatcher = null;

    // Serialized plugin reload queue
    // Event log — captured from watcher & reload queue
    this._log = new WatcherLog({
      file: path.join(config.sessionDir, 'watcher-log.jsonl'),
      watchDir: config.pluginDir,
      maxEntries: 1000,
      maxBytes: 4 * 1024 * 1024
    });

    this._reloadQueue = new ReloadQueue(
      async (reason) => this._pm.reload(),
      { name: 'plugins' }
    );

    // Persistent runtime state
    this._state = new RuntimeState(path.join(config.sessionDir, 'runtime.json'));

    // Background auto-cleanup for .bak/.tmp/etc
    this._cleaner = new AutoCleaner({
      paths: config.cleanup.paths,
      intervalMs: config.cleanup.intervalMs,
      onEvent: (e) => this._log.push(e)
    });

    registry.bot = this;
    registry.plugins = this._pm;
    registry.config = config;
    registry.reloadQueue = this._reloadQueue;
    registry.runtimeState = this._state;
    registry.watcherLog = this._log;
    registry.autoCleaner = this._cleaner;
    registry.sourceWatcher = null;
    this._restartMgr = new RestartManager({
      onBeforeRestart: async () => {
        Logger.warn('Pre-restart cleanup...');
        try { await this.stop(); } catch (e) { Logger.warn(`stop: ${e.message}`); }
      }
    });
    registry.restartManager = this._restartMgr;
  }

  get sock() { return this._sock; }
  get reloadQueue() { return this._reloadQueue; }
  get watcher() { return this._watcher; }
  get watcherActive() { return Boolean(this._watcher); }
  get state() { return this._state; }
  get log() { return this._log; }
  get autoCleaner() { return this._cleaner; }
  get autoCleanActive() { return Boolean(this._cleaner && this._cleaner.active); }
  get sourceWatcher() { return this._sourceWatcher; }
  get sourceWatcherActive() { return Boolean(this._sourceWatcher); }
  get restartManager() { return this._restartMgr; }

  // ─────────────────────────────────────────────
  //  Dynamic watcher control
  // ─────────────────────────────────────────────

  /**
   * Enable hot-reload watcher at runtime.
   * Idempotent — calling twice is a no-op.
   */
  async enableWatcher({ persist = true } = {}) {
    if (this._watcher) return { ok: true, already: true };

    this._watcher = new PluginWatcher(config.pluginDir, {
      onEvent: (kind, rel) => this._log.push({ kind, file: rel }),
      onReload: (batch) => {
        this._log.push({ kind: 'batch', count: batch.length, files: batch.slice(0, 10) });
        this._reloadQueue.push('watcher').catch(() => {});
      }
    }).start();

    registry.watcher = this._watcher;
    if (persist) this._state.set('watchPlugins', true);
    Logger.info('👁️  Hot-reload: ENABLED');
    return { ok: true, already: false };
  }

  /**
   * Disable hot-reload watcher at runtime.
   * Safe to call when already stopped.
   */
  async disableWatcher({ persist = true } = {}) {
    if (!this._watcher) return { ok: true, already: true };

    await this._watcher.stop();
    this._watcher = null;
    this._sourceWatcher = null;
    registry.watcher = null;
    if (persist) this._state.set('watchPlugins', false);
    Logger.info('🚫 Hot-reload: DISABLED');
    return { ok: true, already: false };
  }

  async toggleWatcher() {
    if (this._watcher) {
      await this.disableWatcher();
      return { active: false };
    } else {
      await this.enableWatcher();
      return { active: true };
    }
  }

  // ─────────────────────────────────────────────

  async enableAutoClean({ persist = true } = {}) {
    if (this._cleaner.active) return { ok: true, already: true };
    this._cleaner.start();
    if (persist) this._state.set('autoClean', true);
    this._log.push({ kind: 'autoclean-enabled' });
    return { ok: true, already: false };
  }

  async disableAutoClean({ persist = true } = {}) {
    if (!this._cleaner.active) return { ok: true, already: true };
    this._cleaner.stop();
    if (persist) this._state.set('autoClean', false);
    this._log.push({ kind: 'autoclean-disabled' });
    return { ok: true, already: false };
  }

  async toggleAutoClean() {
    if (this._cleaner.active) { await this.disableAutoClean(); return { active: false }; }
    await this.enableAutoClean(); return { active: true };
  }

  async enableSourceWatcher({ persist = true } = {}) {
    if (this._sourceWatcher) return { ok: true, already: true };

    this._sourceWatcher = new SourceWatcher({
      dir: config.sourceDir,
      ignore: [/[\\/]src[\\/]plugins[\\/]/],
      onEvent: (kind, rel) => this._log.push({ kind: `src-${kind}`, file: rel }),
      onReload: async (batch) => {
        const files = batch
          .map(b => b.split(':').slice(1).join(':'))
          .map(f => path.resolve(config.sourceDir, f));
        this._log.push({ kind: 'src-batch', count: batch.length, files: batch.slice(0, 10) });
        const r = await this._restartMgr.restart({ reason: 'source-watch', files });
        if (!r.ok) {
          this._log.push({
            kind: 'src-restart-blocked',
            reason: r.reason,
            error: r.errors?.[0]?.error || r.error || ''
          });
        }
      }
    }).start();

    registry.sourceWatcher = this._sourceWatcher;
    if (persist) this._state.set('sourceReload', true);
    this._log.push({ kind: 'source-watcher-enabled' });
    Logger.info('👁️  Source hot-reload: ENABLED');
    return { ok: true, already: false };
  }

  async disableSourceWatcher({ persist = true } = {}) {
    if (!this._sourceWatcher) return { ok: true, already: true };
    await this._sourceWatcher.stop();
    this._sourceWatcher = null;
    registry.sourceWatcher = null;
    if (persist) this._state.set('sourceReload', false);
    this._log.push({ kind: 'source-watcher-disabled' });
    Logger.info('🚫 Source hot-reload: DISABLED');
    return { ok: true, already: false };
  }

  async toggleSourceWatcher() {
    if (this._sourceWatcher) { await this.disableSourceWatcher(); return { active: false }; }
    await this.enableSourceWatcher(); return { active: true };
  }

  async start() {
    await this._reloadQueue.push('boot');
    const jobs = await this._jobLoader.load();
    Logger.info({ jobs: jobs.loaded, errors: jobs.errors.length }, 'Background jobs loaded');
    for (const mw of baseMiddlewares) this._cmd.use(mw);

    // Decide initial watcher state:
    //   1. runtime.json (kalau user sudah pernah toggle)
    //   2. fallback ke .env WATCH_PLUGINS
    const persisted = this._state.get('watchPlugins', null);
    const wantWatch = persisted === null ? config.watchPlugins : Boolean(persisted);

    if (wantWatch) {
      await this.enableWatcher({ persist: false });
    } else {
      Logger.info('👁️  Hot-reload: disabled (runtime toggle or .env)');
    }

    const persistedClean = this._state.get('autoClean', null);
    const wantAutoClean = persistedClean === null
      ? Boolean(config.cleanup && config.cleanup.enabled)
      : Boolean(persistedClean);
    if (wantAutoClean) await this.enableAutoClean({ persist: false });
    else Logger.info('🧹 AutoCleaner: disabled (runtime toggle or .env)');

    await this.connect();
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const browserTuple = this._parseBrowser(config.pairing.browser);

    const sock = makeWASocket({
      version,
      logger: Logger.child({ module: 'sock' }),
      browser: browserTuple,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Logger)
      },
      markOnlineOnConnect: true,
      syncFullHistory: false,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: true,
      getMessage: async () => ({ conversation: '' })
    });

    this._sock = sock;
    this._chronos.start();
    this._pairingRequested = false;

    attachSerializerRuntime(sock);
    registry.sock = sock;
    this._botInfo = { userJid: sock.user?.id, userLid: sock.user?.lid };

    const isRegistered = Boolean(state.creds?.registered);
    const wantsPairing = Boolean(config.pairing.enabled) && !isRegistered;

    Logger.info('Pairing mode: ' + (wantsPairing ? 'YES' : 'NO') +
      ' (enabled=' + config.pairing.enabled +
      ', number=' + (config.pairing.number || 'empty') +
      ', registered=' + isRegistered + ')');

    if (wantsPairing && config.pairing.number && !this._pairingRequested) {
      this._pairingRequested = true;
      setTimeout(async () => {
        try {
          const code = config.pairing.customCode
            ? await sock.requestPairingCode(config.pairing.number, config.pairing.customCode)
            : await sock.requestPairingCode(config.pairing.number);
          const pretty = code ? code.match(/.{1,4}/g).join('-') : code;
          Logger.info('');
          Logger.info('╔════════════════════════════════════════╗');
          Logger.info('║        📱 PAIRING CODE                 ║');
          Logger.info('║                                        ║');
          Logger.info('║        ' + pretty + '                       ║');
          Logger.info('║                                        ║');
          Logger.info('║   Nomor: ' + config.pairing.number);
          Logger.info('║                                        ║');
          Logger.info('║   1. WhatsApp > Perangkat Tertaut     ║');
          Logger.info('║   2. Tautkan dengan nomor telepon     ║');
          Logger.info('║   3. Ketik kode di atas               ║');
          Logger.info('╚════════════════════════════════════════╝');
          Logger.info('');
          if (this._log) this._log.push({ kind: 'pairing-code-issued', number: config.pairing.number });
        } catch (e) {
          Logger.error('❌ requestPairingCode gagal: ' + e.message);
          this._pairingRequested = false;
        }
      }, 2500);
    } else if (wantsPairing && !config.pairing.number) {
      Logger.error('❌ PAIRING_CODE aktif tapi PAIRING_NUMBER kosong!');
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('lid-mapping.update', ({ lid, pn }) => {
      if (lid && pn) {
        registry.lidMap = registry.lidMap || new Map();
        registry.lidMap.set(lid.split(':')[0], pn);
      }
    });

    let attempt = 0;
    const MAX_ATTEMPTS = 10;
    const BACKOFF = [1000, 2000, 4000, 8000, 15000];

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;

      if (qr && !wantsPairing) {
        try {
          const qrcode = (await import('qrcode-terminal')).default;
          qrcode.generate(qr, { small: true });
        } catch {}
      }

      if (connection === 'open') {
        attempt = 0;
        this._restart = false;
        this._botInfo = { userJid: sock.user?.id, userLid: sock.user?.lid };
        Logger.info('✅ Online: ' + sock.user?.id);
        if (this._log) this._log.push({ kind: 'connection-open', user: sock.user?.id });
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'unknown';
        Logger.warn({ code: statusCode, reason, attempt }, 'Connection closed');

        if (statusCode === DisconnectReason.loggedOut) {
          Logger.error('🚪 Logged out (device unlinked).');
          if (config.pairing.autoClearSessionOnLogout) {
            try { await rmAsync(config.sessionDir, { recursive: true, force: true }); } catch {}
            Logger.warn('🧹 Session cleared. Restart untuk pairing ulang.');
          }
          process.exit(1);
        }

        if (statusCode === DisconnectReason.badSession ||
            statusCode === DisconnectReason.multideviceMismatch ||
            /Connection Failure/i.test(reason)) {
          Logger.error('💥 Sesi rusak. Hapus sessions/ dan restart.');
          if (config.pairing.autoClearSessionOnLogout) {
            try { await rmAsync(config.sessionDir, { recursive: true, force: true }); } catch {}
            Logger.warn('🧹 Session cleared. Restart untuk pairing ulang.');
          }
          process.exit(1);
        }

        if (statusCode === DisconnectReason.restartRequired) {
          try { await this.connect(); } catch (e) { Logger.error(e.message); }
          return;
        }

        if (attempt < MAX_ATTEMPTS) {
          attempt++;
          const wait = BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)];
          Logger.info('🔁 Reconnect ' + attempt + '/' + MAX_ATTEMPTS + ' in ' + (wait / 1000) + 's');
          setTimeout(async () => {
            try { await this.connect(); } catch (e) { Logger.error(e.message); }
          }, wait);
        } else {
          Logger.fatal('❌ Reconnect menyerah setelah ' + MAX_ATTEMPTS + ' percobaan');
          process.exit(1);
        }
      }

      if (isNewLogin) Logger.info('🆕 Device baru login');
    });

    sock.ev.on('messages.upsert', createMessageHandler({
      sock,
      bot: this._botInfo,
      config,
      commandHandler: this._cmd,
      eventBus: EventBus
    }));

    // Canvas V2 join/leave cards are opt-in per group through .welcome on.
    sock.ev.on('group-participants.update', async update => {
      const groupId = String(update?.id || '');
      if (!groupId.endsWith('@g.us') || !Array.isArray(update?.participants)) return;
      const action = String(update.action || '').toLowerCase();
      if (!['add', 'remove', 'leave'].includes(action)) return;
      const settings = await getGroupSettings(groupId).catch(() => ({ welcome: false }));
      if (!settings.welcome) return;
      let groupName = 'WhatsApp Group';
      try { groupName = String((await sock.groupMetadata(groupId))?.subject || groupName); } catch {}
      for (const item of update.participants.slice(0, 10)) {
        const jid = String(typeof item === 'string' ? item : item?.id || item?.jid || '');
        if (!jid || !jid.includes('@') || jid.endsWith('@g.us')) continue;
        const joining = action === 'add';
        const memberName = `@${jid.split('@')[0].split(':')[0]}`;
        let avatarBuffer = null, avatarMime = 'image/jpeg';
        try {
          const url = await sock.profilePictureUrl(jid, 'image');
          if (url) {
            const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
            if (res.ok) {
              const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
              const ab = await res.arrayBuffer();
              if (ab.byteLength > 0 && ab.byteLength <= 2_000_000) {
                avatarBuffer = Buffer.from(ab);
                if (['image/jpeg', 'image/png', 'image/webp'].includes(mime)) avatarMime = mime;
              }
            }
          }
        } catch {}
        try {
          const image = await renderGroupMemberCardV2({ type: joining ? 'welcome' : 'leave', groupName, memberName, avatarBuffer, avatarMime });
          const text = joining ? String(settings.welcomeText || '👋 Selamat datang {user} di {group}!').replaceAll('{user}', memberName).replaceAll('{group}', groupName) : String(settings.leaveText || '👋 {user} telah meninggalkan grup.').replaceAll('{user}', memberName).replaceAll('{group}', groupName);
          await sock.sendMessage(groupId, { image, caption: text, mentions: [jid] });
        } catch (error) { Logger.warn({ err: error?.message || String(error), groupId }, 'group member canvas card skipped'); }
      }
    });

    return sock;
  }

  _parseBrowser(name) {
    const preset = {
      ubuntu:  ['Ubuntu', 'Chrome', '20.0.04'],
      macos:   ['Mac OS', 'Desktop', '14.4.1'],
      windows: ['Windows', 'Chrome', '10.0'],
      chrome:  ['Chrome', 'Chrome', '10.0'],
      safari:  ['Safari', 'Safari', '10.0']
    };
    const key = String(name || 'Ubuntu').toLowerCase();
    return preset[key] || preset.ubuntu;
  }

  async stop() {
    this._chronos?.stop();
    if (this._watcher) await this._watcher.stop();
    if (this._sock) this._sock.end(undefined);
  }
}

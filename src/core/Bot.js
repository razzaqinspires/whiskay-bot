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
import { attachSerializerRuntime, extractPollUpdateEvents } from './serializer.js';
import compatSerializer from './serializer-compat.cjs';
import { PluginManager } from './PluginManager.js';
import { AutoCleaner } from './AutoCleaner.js';
import { CommandHandler } from './CommandHandler.js';
import { ReloadQueue } from './ReloadQueue.js';
import { PluginWatcher } from './PluginWatcher.js';
import { RuntimeState } from './RuntimeState.js';
import { SourceWatcher } from './SourceWatcher.js';
import { RestartManager } from './RestartManager.js';
import { planJavaScriptReload } from './JavaScriptModulePolicy.js';
import { WatcherLog } from './WatcherLog.js';
import { createMessageHandler } from '../handlers/message.js';
import { handleClassicQuizPollUpdates } from '../plugins/games/classic-quiz.js';
import { baseMiddlewares } from '../middlewares/index.js';
import { registry } from './registry.js';
import config from '../config/index.js';
import { getGroupSettings } from '../lib/group-settings.js';
import { runGroupSchedules } from '../lib/group-scheduler.js';
import { groupMetadataStore, loadGroupMetadataStore } from '../services/groupMetadataStore.js';
import { renderGroupMemberCardV2 } from '../services/canvas-v2.js';
import { ChronosCortex } from './ChronosCortex.js';
import { JobLoader } from './JobLoader.js';
import { outboundTrafficGuard, runWithOutboundContext } from './OutboundTrafficGuard.js';
import { workloadTracker } from './WorkloadTracker.js';
import { registerLevelingIdentityAlias } from '../lib/leveling.js';
import { messageRepository } from '../services/message-repository/MessageRepository.js';

export class Bot {
  constructor() {
    this._pm = new PluginManager(config.pluginDir);
    this._cmd = new CommandHandler(this._pm);
    this._restart = false;
    this._connectPromise = null;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._connectionState = 'starting';
    this._socketGeneration = 0;
    this._stopping = false;
    this._chronos = new ChronosCortex({ concurrency: 2 });
    this._jobLoader = new JobLoader({ chronos: this._chronos, context: () => ({ sock: this._sock }) });
    this._chronos.register({ name: 'group-schedule-check', intervalMs: 30000, initialDelayMs: 5000, run: async ({ now }) => runWithOutboundContext({ source: 'schedule:group-schedule-check', command: 'group-schedule-check' }, async () => {
      await runGroupSchedules({ sock: this._sock, now, onError: (error, context) => Logger.warn({ ...context, err: error?.message || String(error) }, 'group scheduled setting failed') });
    }) });
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
      onEvent: (kind, rel) => this._log.push({ kind: `src-${kind}`, file: rel }),
      onReload: async (batch) => {
        const plan = planJavaScriptReload(batch, config.sourceDir);
        if (!plan.eligible) return;
        this._log.push({
          kind: 'src-batch', count: plan.items.length, strategy: plan.strategy,
          files: plan.items.slice(0, 12).map(item => `${item.kind}:${item.file}`)
        });
        // Conservative by design: Node ESM import cache and captured references
        // make arbitrary in-process replacement unsafe until lifecycle stages.
        const result = await this._restartMgr.restart({
          reason: `source-watch:${plan.strategy}`,
          files: plan.syntaxFiles,
          changedFiles: plan.items.map(item => ({ file: item.file, kind: item.kind, strategy: item.strategy }))
        });
        if (!result.ok) this._log.push({
          kind: 'src-restart-blocked', reason: result.reason,
          error: result.errors?.[0]?.error || result.error || '',
          files: plan.items.map(item => item.file)
        });
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

    const persistedSource = this._state.get('sourceReload', null);
    const wantSourceWatch = persistedSource === null ? Boolean(config.sourceReload) : Boolean(persistedSource);
    if (wantSourceWatch) await this.enableSourceWatcher({ persist: false });
    else Logger.info('Universal JavaScript watcher: disabled (runtime toggle or .env)');

    const persistedClean = this._state.get('autoClean', null);
    const wantAutoClean = persistedClean === null
      ? Boolean(config.cleanup && config.cleanup.enabled)
      : Boolean(persistedClean);
    if (wantAutoClean) await this.enableAutoClean({ persist: false });
    else Logger.info('🧹 AutoCleaner: disabled (runtime toggle or .env)');

    await this.connect();
  }

  async connect() {
    if (this._stopping) return null;
    if (this._connectPromise) return this._connectPromise;
    this._connectPromise = this._connectOnce();
    try { return await this._connectPromise; }
    finally { this._connectPromise = null; }
  }

  async _connectOnce() {
    if (this._stopping) return null;
    const generation = ++this._socketGeneration;
    this._connectionState = 'connecting';
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    await loadGroupMetadataStore();
    await messageRepository.init();
    compatSerializer.setMessageRepository?.(messageRepository);
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
      cachedGroupMetadata: async jid => groupMetadataStore.get(jid) || undefined,
      getMessage: async key => {
        // Baileys retry/poll decryption requires the exact original message.
        // Never return a placeholder or fall back to a message-ID-only lookup.
        const stored = await compatSerializer.getStoredMessageAsync?.(key);
        return stored?.message;
      }
    });

    // Load persisted risk history before enabling outbound traffic. Serializer setup
    // wraps sendMessage/relayMessage for message-ID tracking, so the policy guard
    // must be attached LAST or those wrappers would bypass the guard.
    await workloadTracker.load();
    attachSerializerRuntime(sock);
    outboundTrafficGuard.attach(sock);
    workloadTracker.startThreatMonitoring({
      queueProvider: () => {
        const outbound = outboundTrafficGuard.stats();
        return { queueDepth: outbound.queueDepth, activeWorkers: outbound.active };
      },
    });
    this._sock = sock;
    registry.sock = sock;
    // Chronos starts only after the socket reaches `open`; jobs must never
    // execute against a merely-constructed or reconnecting socket.
    this._pairingRequested = false;
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
        registerLevelingIdentityAlias(lid, pn, 'lid-mapping.update').catch(error => Logger.warn({ err: error?.message || String(error) }, 'leveling identity alias persistence failed'));
      }
    });

    let initialGroupSnapshotAttempted = false;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;

      if (qr && !wantsPairing) {
        try {
          const qrcode = (await import('qrcode-terminal')).default;
          qrcode.generate(qr, { small: true });
        } catch {}
      }

      if (generation !== this._socketGeneration || sock !== this._sock) return;

      if (connection === 'open') {
        this._connectionState = 'open';
        this._chronos.resume();
        this._reconnectAttempt = 0;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this._restart = false;
        this._botInfo = { userJid: sock.user?.id, userLid: sock.user?.lid };
        Logger.info('✅ Online: ' + sock.user?.id);
        if (this._log) this._log.push({ kind: 'connection-open', user: sock.user?.id });
        if (!initialGroupSnapshotAttempted && !groupMetadataStore.hasInitialSnapshot() && typeof sock.groupFetchAllParticipating === 'function') {
          initialGroupSnapshotAttempted = true;
          try {
            // One initial snapshot only. Future metadata changes are maintained from socket events.
            const snapshot = await sock.groupFetchAllParticipating();
            for (const [jid, metadata] of Object.entries(snapshot || {})) groupMetadataStore.upsert(metadata, jid);
            groupMetadataStore.markInitialSnapshot();
            await groupMetadataStore.flush();
            Logger.info({ groups: groupMetadataStore.count() }, 'Group metadata initial snapshot stored');
          } catch (error) {
            Logger.warn({ err: error?.message || String(error) }, 'Initial group metadata snapshot failed; cache remains available');
          }
        }
      }

      if (connection === 'close') {
        this._connectionState = 'closed';
        this._chronos.pause({ wait: true, timeoutMs: 3000 }).catch(() => {});
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'unknown';
        Logger.warn({ code: statusCode, reason, attempt: this._reconnectAttempt }, 'Connection closed');
        if (this._sock === sock) this._sock = null;
        if (registry.sock === sock) registry.sock = null;

        if (statusCode === DisconnectReason.loggedOut) {
          Logger.error('🚪 Logged out (device unlinked).');
          if (config.pairing.autoClearSessionOnLogout) {
            try { await rmAsync(config.sessionDir, { recursive: true, force: true }); } catch {}
            Logger.warn('🧹 Session cleared. Restart untuk pairing ulang.');
          }
          this._connectionState = 'logged-out';
          return;
        }

        if (statusCode === DisconnectReason.badSession ||
            statusCode === DisconnectReason.multideviceMismatch ||
            /Connection Failure/i.test(reason)) {
          Logger.error('💥 Sesi rusak. Hapus sessions/ dan restart.');
          if (config.pairing.autoClearSessionOnLogout) {
            try { await rmAsync(config.sessionDir, { recursive: true, force: true }); } catch {}
            Logger.warn('🧹 Session cleared. Restart untuk pairing ulang.');
          }
          this._connectionState = 'auth-error';
          return;
        }

        const immediate = statusCode === DisconnectReason.restartRequired;
        this._scheduleReconnect({ immediate, reason, statusCode });
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

    sock.ev.on('messages.update', updates => {
      runWithOutboundContext({ source: 'game:quiz-poll', command: 'quiz-poll-update' }, () =>
        handleClassicQuizPollUpdates(sock, updates)).catch(error => Logger.warn({ err: error?.message || String(error) }, 'quiz poll update handling skipped'));
    });

    // Baileys may deliver a vote as a pollUpdateMessage in messages.upsert,
    // rather than only as messages.update. Normalize it in serializer.js.
    sock.ev.on('messages.upsert', upsert => {
      const pollEvents = extractPollUpdateEvents(upsert);
      if (pollEvents.length) runWithOutboundContext({ source: 'game:quiz-poll', command: 'quiz-poll-upsert' }, () =>
        handleClassicQuizPollUpdates(sock, pollEvents)).catch(error => Logger.warn({ err: error?.message || String(error) }, 'quiz poll upsert handling skipped'));
    });

    // Persist group metadata incrementally; never refetch per participant event.
    sock.ev.on('groups.upsert', async updates => {
      try { groupMetadataStore.applyGroupUpdates(updates); }
      catch (error) { Logger.warn({ err: error?.message || String(error) }, 'groups.upsert cache update failed'); }
    });
    sock.ev.on('groups.update', async updates => {
      try { groupMetadataStore.applyGroupUpdates(updates); }
      catch (error) { Logger.warn({ err: error?.message || String(error) }, 'groups.update cache update failed'); }
    });
    sock.ev.on('group-participants.update', async update => {
      try {
        groupMetadataStore.applyParticipantUpdate(update, [sock.user?.id, sock.user?.lid]);
      } catch (error) { Logger.warn({ err: error?.message || String(error), groupId: update?.id }, 'group participant cache update failed'); }
    });
    sock.ev.on('chats.delete', async ids => {
      try {
        for (const jid of Array.isArray(ids) ? ids : []) if (String(jid).endsWith('@g.us')) groupMetadataStore.remove(jid);
      } catch (error) { Logger.warn({ err: error?.message || String(error) }, 'group cache cleanup failed'); }
    });

    // Canvas V2 join/leave cards are opt-in per group through .welcome on.
    sock.ev.on('group-participants.update', update => runWithOutboundContext({ source: 'group:welcome-leave', command: 'participant-update' }, async () => {
      const groupId = String(update?.id || '');
      if (!groupId.endsWith('@g.us') || !Array.isArray(update?.participants)) return;
      const action = String(update.action || '').toLowerCase();
      if (!['add', 'remove', 'leave'].includes(action)) return;
      const settings = await getGroupSettings(groupId).catch(() => ({ welcome: false }));
      if (!settings.welcome) return;
      const groupName = String(groupMetadataStore.get(groupId)?.subject || 'WhatsApp Group');
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
    }));

    return sock;
  }

  _scheduleReconnect({ immediate = false, reason = 'connection closed', statusCode = null } = {}) {
    if (this._stopping || this._reconnectTimer) return;
    this._reconnectAttempt += 1;
    const base = immediate ? 250 : Math.min(60000, 1000 * (2 ** Math.min(this._reconnectAttempt - 1, 6)));
    const jitter = immediate ? 0 : Math.floor(Math.random() * Math.min(1500, base * 0.25));
    const wait = base + jitter;
    this._connectionState = 'reconnecting';
    Logger.warn({ attempt: this._reconnectAttempt, delayMs: wait, statusCode, reason }, 'WhatsApp reconnect scheduled');
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      if (this._stopping || this._sock) return;
      try { await this.connect(); }
      catch (error) {
        Logger.error({ err: error?.message || String(error) }, 'WhatsApp reconnect attempt failed');
        this._scheduleReconnect({ reason: error?.message || 'socket creation failed' });
      }
    }, wait);
    this._reconnectTimer.unref?.();
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
    if (this._stopPromise) return this._stopPromise;
    this._stopping = true;
    this._connectionState = 'stopping';
    this._stopPromise = (async () => {
      const failures = [];
      const attempt = async (name, fn) => {
        try { await fn(); }
        catch (error) {
          failures.push({ name, error: error?.message || String(error) });
          Logger.warn({ component: name, err: error?.message || String(error) }, 'Shutdown component failed');
        }
      };
      if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
      await attempt('chronos', async () => { await this._chronos?.stop({ wait: true, timeoutMs: 5000 }); });
      await attempt('plugin-watcher', async () => { if (this._watcher) await this._watcher.stop(); this._watcher = null; registry.watcher = null; });
      await attempt('source-watcher', async () => { if (this._sourceWatcher) await this._sourceWatcher.stop(); this._sourceWatcher = null; registry.sourceWatcher = null; });
      await attempt('auto-cleaner', async () => { if (this._cleaner?.active) this._cleaner.stop(); await this._cleaner?.waitForIdle?.({ timeoutMs: 5000 }); });
      await attempt('reload-queue', async () => { await this._reloadQueue?.close?.({ cancelPending: true }); });
      await attempt('plugin-disposal', async () => { await this._pm?.disposeAll?.({ reason: 'bot-shutdown', timeoutMs: 5000 }); });
      await attempt('outbound-guard', async () => { await outboundTrafficGuard.close(); await outboundTrafficGuard.waitForIdle({ timeoutMs: 3000 }); });
      await attempt('workload-tracker', async () => { await workloadTracker.close(); });
      await attempt('socket', async () => { if (this._sock) this._sock.end(undefined); });
      await attempt('group-metadata', async () => { await groupMetadataStore.flush(); });
      await attempt('message-repository', async () => { await messageRepository.flush(); });
      this._sock = null;
      registry.sock = null;
      this._connectionState = failures.length ? 'stopped-with-errors' : 'stopped';
      this._shutdownReport = { completedAt: new Date().toISOString(), failures };
      return this._shutdownReport;
    })();
    return this._stopPromise;
  }
}

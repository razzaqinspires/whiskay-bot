import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkloadTracker } from '../src/core/WorkloadTracker.js';
import { WorkloadScheduler } from '../src/core/WorkloadScheduler.js';
import { OutboundTrafficGuard, runWithOutboundContext } from '../src/core/OutboundTrafficGuard.js';
import { createBroadcastPlugin } from '../src/plugins/owner/broadcast.js';

function makeTracker(options = {}) {
  let now = 1_800_000_000_000;
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'whiskay-stage58-tracker-'));
  const tracker = new WorkloadTracker({
    now: () => now,
    storageFile: path.join(tempRoot, 'telemetry.json'),
    sharedPolicyFile: path.join(tempRoot, 'outbound-policy.json'),
    outboundGlobalMaxPerMinute: 20,
    outboundRecipientMaxPerMinute: 4,
    outboundDuplicateWindowMs: 30_000,
    outboundMinIntervalMs: 0,
    ...options,
  });
  // Keep tests isolated from the real project data directory.
  tracker.persist = async () => {};
  tracker.advance = ms => { now += ms; };
  tracker.dispose = () => { tracker.delay.disable(); rmSync(tempRoot, { recursive: true, force: true }); };
  return tracker;
}

function makeSocket() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content, options) => {
      sent.push({ method: 'sendMessage', jid, content, options });
      return { key: { id: `message-${sent.length}` } };
    },
    relayMessage: async (jid, message, options) => {
      sent.push({ method: 'relayMessage', jid, content: message, options });
      return { key: { id: `relay-${sent.length}` } };
    },
  };
}

function makeContext({ args = [], sock, groups = {}, owner = true } = {}) {
  const replies = [];
  const interactive = [];
  return {
    replies,
    interactive,
    ctx: {
      isOwner: owner,
      args,
      prefix: '.',
      sender: '628111111111@s.whatsapp.net',
      chat: '628111111111@s.whatsapp.net',
      sock,
      reply: async message => { replies.push(String(message)); return true; },
      sendInteractive: async payload => { interactive.push(payload); return true; },
    },
  };
}

test('outbound guard wraps Baileys sendMessage and native relayMessage', async () => {
  const tracker = makeTracker();
  const scheduler = new WorkloadScheduler({ concurrency: 2, perLaneConcurrency: 1, minIntervalMs: 0, maxQueue: 20, sleep: async () => {} });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  const sock = makeSocket();
  guard.attach(sock);
  try {
    await runWithOutboundContext({ source: 'command:ping' }, () => sock.sendMessage('628111111111@s.whatsapp.net', { text: 'pong' }));
    await runWithOutboundContext({ source: 'command:menu' }, () => sock.relayMessage('628222222222@s.whatsapp.net', { extendedTextMessage: { text: 'menu native flow' } }));
    assert.equal(sock.sent.length, 2);
    assert.deepEqual(sock.sent.map(item => item.method), ['sendMessage', 'relayMessage']);
    assert.equal(tracker.outboundStats().counters.accepted, 2);
    assert.deepEqual(tracker.outboundStats().recentSources, { 'command:ping': 1, 'command:menu': 1 });
  } finally {
    await guard.close();
    tracker.dispose();
  }
});


test('runtime boot order keeps the outbound guard as the outermost socket wrapper', async () => {
  const bot = await readFile(new URL('../src/core/Bot.js', import.meta.url), 'utf8');
  const jadibot = await readFile(new URL('../src/plugins/general/jadibot.js', import.meta.url), 'utf8');
  for (const source of [bot, jadibot]) {
    const serializerIndex = source.indexOf('attachSerializerRuntime(sock)');
    const guardIndex = source.indexOf('outboundTrafficGuard.attach(sock)');
    assert.ok(serializerIndex >= 0 && guardIndex > serializerIndex, 'outbound guard must be attached after serializer wrappers');
  }
});

test('outbound guard blocks identical content across different sources to the same recipient', async () => {
  const tracker = makeTracker();
  const scheduler = new WorkloadScheduler({ concurrency: 1, perLaneConcurrency: 1, minIntervalMs: 0, maxQueue: 20, sleep: async () => {} });
  const guard = new OutboundTrafficGuard({ tracker, scheduler });
  const sock = makeSocket();
  guard.attach(sock);
  try {
    const send = source => runWithOutboundContext({ source }, () => sock.sendMessage('628111111111@s.whatsapp.net', { text: 'status normal' }));
    await send('command:status');
    await assert.rejects(send('background:reminder'), error => error.code === 'WHISKAY_OUTBOUND_POLICY_BLOCKED' && error.policy.reason === 'duplicate-payload-window');
    assert.equal(sock.sent.length, 1);
    assert.equal(tracker.outboundStats().counters.duplicatesBlocked, 1);
  } finally {
    await guard.close();
    tracker.dispose();
  }
});

test('outbound risk tracker applies per-recipient limits without retaining JIDs or message bodies', async () => {
  const tracker = makeTracker({ outboundRecipientMaxPerMinute: 2 });
  const recipient = 'a'.repeat(24);
  try {
    const first = await tracker.reserveOutbound({ recipientKey: recipient, fingerprint: 'a'.repeat(24), source: 'test' });
    await tracker.completeOutbound(first.id, 'sent');
    const second = await tracker.reserveOutbound({ recipientKey: recipient, fingerprint: 'b'.repeat(24), source: 'test' });
    await tracker.completeOutbound(second.id, 'sent');
    const third = await tracker.reserveOutbound({ recipientKey: recipient, fingerprint: 'c'.repeat(24), source: 'test' });
    assert.equal(third.allowed, false);
    assert.equal(third.reason, 'recipient-rate-limit');
    const snapshot = JSON.stringify(tracker.outboundStats());
    assert.doesNotMatch(snapshot, /628111111111|confidential message text/);
    assert.equal(tracker.outboundStats().counters.blocked, 1);
  } finally {
    tracker.dispose();
  }
});

test('broadcast requires explicit allowlist and preview confirmation before any send', async () => {
  const sock = makeSocket();
  sock.groupFetchAllParticipating = async () => ({ '12345-67890@g.us': { id: '12345-67890@g.us' } });
  const plugin = createBroadcastPlugin({
    getAllowedGroups: () => ['12345-67890@g.us'],
    getAllowedUsers: () => [],
    isEnabled: () => true,
    sleepFn: async () => {},
  });
  const preview = makeContext({ args: ['--groups', 'Pengumuman pemeliharaan'], sock });
  await plugin.execute(preview.ctx);
  assert.equal(sock.sent.length, 0);
  assert.match(preview.interactive[0].title, /PREVIEW/);
  const token = preview.interactive[0].body.match(/Token konfirmasi: ([A-Z0-9]+)/)?.[1];
  assert.ok(token);

  const confirm = makeContext({ args: ['confirm', token], sock });
  await plugin.execute(confirm.ctx);
  for (let i = 0; i < 20 && confirm.replies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(sock.sent.length, 1);
  assert.match(confirm.replies[0], /Broadcast terkonfirmasi/);
  assert.match(confirm.replies[1], /COMPLETED/);
});

test('broadcast confirmation remains disabled unless a separate operator opt-in is enabled', async () => {
  const sock = makeSocket();
  sock.groupFetchAllParticipating = async () => ({ '12345-67890@g.us': { id: '12345-67890@g.us' } });
  const plugin = createBroadcastPlugin({ getAllowedGroups: () => ['12345-67890@g.us'], isEnabled: () => false });
  const preview = makeContext({ args: ['--groups', 'Approved notice'], sock });
  await plugin.execute(preview.ctx);
  const token = preview.interactive[0].body.match(/Token konfirmasi: ([A-Z0-9]+)/)?.[1];
  assert.ok(token);
  const confirm = makeContext({ args: ['confirm', token], sock });
  await plugin.execute(confirm.ctx);
  assert.equal(sock.sent.length, 0);
  assert.match(confirm.replies[0], /WHISKAY_BROADCAST_ENABLED=true/);
});

test('broadcast refuses to infer consent from group membership or registered-users data', async () => {
  const sock = makeSocket();
  sock.groupFetchAllParticipating = async () => ({ '12345-67890@g.us': { id: '12345-67890@g.us' } });
  const plugin = createBroadcastPlugin({ getAllowedGroups: () => [], getAllowedUsers: () => [] });
  const preview = makeContext({ args: ['--groups', 'Announcement'], sock });
  await plugin.execute(preview.ctx);
  assert.equal(sock.sent.length, 0);
  assert.match(preview.replies[0], /WHISKAY_BROADCAST_ALLOWED_GROUPS/);
});

test('broadcast stops immediately when Threat Agent quarantines its outbound source', async () => {
  const sock = makeSocket();
  const targets = [
    '12345-67890@g.us',
    '22345-67890@g.us',
    '32345-67890@g.us',
  ];
  sock.groupFetchAllParticipating = async () => Object.fromEntries(targets.map(id => [id, { id }]));
  let attempts = 0;
  sock.sendMessage = async () => {
    attempts++;
    const error = new Error('source quarantined');
    error.code = 'WHISKAY_OUTBOUND_SOURCE_QUARANTINED';
    throw error;
  };
  const plugin = createBroadcastPlugin({
    getAllowedGroups: () => targets,
    getAllowedUsers: () => [],
    isEnabled: () => true,
    sleepFn: async () => {},
  });
  const preview = makeContext({ args: ['--groups', 'Approved maintenance notice'], sock });
  await plugin.execute(preview.ctx);
  const token = preview.interactive[0].body.match(/Token konfirmasi: ([A-Z0-9]+)/)?.[1];
  assert.ok(token);
  const confirm = makeContext({ args: ['confirm', token], sock });
  await plugin.execute(confirm.ctx);
  for (let i = 0; i < 20 && confirm.replies.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(attempts, 1, 'remaining recipients must not be probed after source quarantine');
  assert.match(confirm.replies.at(-1), /BLOCKED_BY_THREAT_QUARANTINE/);
});

test('message handler never dispatches self-authored messages and removes direct natural-language plugin execution', async () => {
  const source = await readFile(new URL('../src/handlers/message.js', import.meta.url), 'utf8');
  assert.match(source, /if \(ctx\.isBot\) continue;/);
  assert.ok(source.indexOf('if (ctx.isBot) continue;') < source.indexOf("eventBus.emit('message', ctx)"), 'self-authored messages must be dropped before feature/plugin events');
  assert.doesNotMatch(source, /egg\.execute\(ctx\)/);
  assert.match(source, /AI_CHAT_MODE \|\| 'mention-only'/);
  assert.match(source, /WHISKAY_AI_PRIVATE_AUTO_ENABLED \|\| 'false'/);
  const handler = await readFile(new URL('../src/core/CommandHandler.js', import.meta.url), 'utf8');
  assert.match(handler, /!ctx\.suppressPostCommandXp && !ctx\.isBot/);
  assert.match(handler, /if \(!ctx \|\| ctx\.isBot \|\| ctx\.fromMe \|\| ctx\.raw\?\.key\?\.fromMe\) return true;/);
  const cooldown = await readFile(new URL('../src/middlewares/cooldown.js', import.meta.url), 'utf8');
  assert.match(cooldown, /plugin\.skipCooldown===true/);
});

test('primary and Jadibot sockets both attach the outbound safety guard', async () => {
  const bot = await readFile(new URL('../src/core/Bot.js', import.meta.url), 'utf8');
  const jadibot = await readFile(new URL('../src/plugins/general/jadibot.js', import.meta.url), 'utf8');
  assert.match(bot, /outboundTrafficGuard\.attach\(sock\)/);
  assert.match(jadibot, /outboundTrafficGuard\.attach\(sock\)/);
  assert.ok(bot.indexOf('attachSerializerRuntime(sock)') < bot.indexOf('outboundTrafficGuard.attach(sock)'));
  assert.ok(jadibot.indexOf('attachSerializerRuntime(sock)') < jadibot.indexOf('outboundTrafficGuard.attach(sock)'));
  assert.match(jadibot, /subCtx\.isBot/);
});

test('World Boss webhook fails closed without an explicit group allowlist', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /target_allowlist_missing/);
  assert.match(source, /WHISKAY_BOSS_WEBHOOK_ENABLED \|\| 'false'/);
  assert.match(source, /source: 'webhook:world-boss'/);
  assert.match(source, /source: 'webhook:teamdrop'/);
  assert.doesNotMatch(source, /configuredTargets\.length \? participating\.filter[\s\S]{0,100}: participating/);
  assert.match(source, /eventId\)\) \{ recordWebhookRejected\('invalid_event_id'\)/);
  const runtime = await readFile(new URL('../src/services/webhookRuntime.js', import.meta.url), 'utf8');
  assert.match(runtime, /disabled-no-allowlist/);
});


test('outbound rate and duplicate reservations survive process restart using hashes only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-outbound-ledger-'));
  const storageFile = path.join(root, 'workload-tracker.json');
  let now = 1_800_000_000_000;
  const options = {
    now: () => now,
    outboundGlobalMaxPerMinute: 20,
    outboundRecipientMaxPerMinute: 4,
    outboundDuplicateWindowMs: 30_000,
    storageFile,
  };
  const first = new WorkloadTracker(options);
  try {
    const reservation = await first.reserveOutbound({
      recipientKey: 'a'.repeat(24),
      fingerprint: 'b'.repeat(24),
      source: 'broadcast',
    });
    assert.equal(reservation.allowed, true);
    await first.completeOutbound(reservation.id, 'sent');
    await first.flush();
    const raw = await readFile(storageFile, 'utf8');
    assert.doesNotMatch(raw, /628111111111|confidential announcement text/);

    const restarted = new WorkloadTracker(options);
    try {
      await restarted.load();
      const duplicate = await restarted.reserveOutbound({
        recipientKey: 'a'.repeat(24),
        fingerprint: 'b'.repeat(24),
        source: 'broadcast',
      });
      assert.equal(duplicate.allowed, false);
      assert.equal(duplicate.reason, 'duplicate-payload-window');
      now += 31_000;
      const afterWindow = await restarted.reserveOutbound({
        recipientKey: 'a'.repeat(24),
        fingerprint: 'b'.repeat(24),
        source: 'broadcast',
      });
      assert.equal(afterWindow.allowed, true);
    } finally {
      restarted.delay.disable();
    }
  } finally {
    await first.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('broadcast acknowledgement failure never leaves a running campaign or sends to targets', async () => {
  const sock = makeSocket();
  sock.groupFetchAllParticipating = async () => ({ '12345-67890@g.us': { id: '12345-67890@g.us' } });
  const plugin = createBroadcastPlugin({ getAllowedGroups: () => ['12345-67890@g.us'], isEnabled: () => true, sleepFn: async () => {} });
  const preview = makeContext({ args: ['--groups', 'Maintenance'], sock });
  await plugin.execute(preview.ctx);
  const token = preview.interactive[0].body.match(/Token konfirmasi: ([A-Z0-9]+)/)?.[1];
  assert.ok(token);
  const confirm = makeContext({ args: ['confirm', token], sock });
  confirm.ctx.reply = async () => { throw new Error('WhatsApp transport unavailable'); };
  await assert.rejects(plugin.execute(confirm.ctx), /transport unavailable/);
  assert.equal(sock.sent.length, 0);
  const status = makeContext({ args: ['status'], sock });
  await plugin.execute(status.ctx);
  assert.match(status.replies[0], /Tidak ada preview atau kampanye/);
});

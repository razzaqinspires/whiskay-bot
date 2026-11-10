const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const cleanSource = value => String(value || 'background:unattributed').toLowerCase().replace(/[^a-z0-9:_-]/g, '_').slice(0, 80);

/**
 * Privacy-preserving threat feature scorer. It receives aggregate counters and
 * irreversible short hashes only. It never receives message bodies, JIDs,
 * command arguments, tokens, or provider credentials.
 */
export function analyzeThreatSnapshot(snapshot = {}) {
  const outbound = snapshot.outbound || {};
  const commands = snapshot.commands || {};
  const runtime = snapshot.runtime || {};
  const limits = snapshot.limits || {};
  const maxGlobal = Math.max(1, Number(limits.globalMaxPerMinute) || 20);
  const maxRecipient = Math.max(1, Number(limits.recipientMaxPerMinute) || 4);
  const source10 = Object.entries(outbound.bySource10 || {})
    .map(([source, count]) => [cleanSource(source), Math.max(0, Number(count) || 0)])
    .sort((a, b) => b[1] - a[1]);
  const topSource = source10[0] || ['background:unattributed', 0];
  const outbound10 = Math.max(0, Number(outbound.count10s) || 0);
  const outboundBuckets = Array.isArray(outbound.buckets10s) ? outbound.buckets10s.slice(0, 30).map(value => Math.max(0, Number(value) || 0)) : [];
  const commandBuckets = Array.isArray(commands.buckets10s) ? commands.buckets10s.slice(0, 30).map(value => Math.max(0, Number(value) || 0)) : [];
  const outboundBaseline = outboundBuckets.length > 1 ? outboundBuckets.slice(1).reduce((sum, value) => sum + value, 0) / (outboundBuckets.length - 1) : 0;
  const commandBaseline = commandBuckets.length > 1 ? commandBuckets.slice(1).reduce((sum, value) => sum + value, 0) / (commandBuckets.length - 1) : 0;
  const commandCurrent = commandBuckets[0] || 0;
  const outbound60 = Math.max(0, Number(outbound.count60s) || 0);
  const recipientMax = Math.max(0, Number(outbound.recipientMax60s) || 0);
  const failureRatio = clamp(outbound.failureRatio60s, 0, 1);
  const duplicates = Math.max(0, Number(outbound.duplicateBlocks60s) || 0);
  const actorMax = Math.max(0, Number(commands.maxPerActor60s) || 0);
  const cpu = clamp(runtime.cpuPercent, 0, 100);
  const heap = clamp(runtime.heapPercent, 0, 100);
  const loopDelay = clamp(runtime.eventLoopDelayMs, 0, 60000);
  const queueDepth = Math.max(0, Number(runtime.queueDepth) || 0);
  const factors = [];
  let score = 0;

  if (outbound10 >= 7) { score += 25; factors.push({ key: 'outbound_burst_10s', weight: 25, value: outbound10 }); }
  else if (outbound10 >= 5) { score += 15; factors.push({ key: 'outbound_burst_10s', weight: 15, value: outbound10 }); }
  else if (outbound10 >= 3) { score += 7; factors.push({ key: 'outbound_burst_10s', weight: 7, value: outbound10 }); }
  const outboundDeviation = outbound10 / Math.max(0.25, outboundBaseline);
  if (outbound10 >= 5 && outboundDeviation >= 3) { score += 8; factors.push({ key: 'outbound_velocity_deviation', weight: 8, value: Math.round(outboundDeviation * 10) / 10 }); }
  const commandDeviation = commandCurrent / Math.max(0.25, commandBaseline);
  if (commandCurrent >= 8 && commandDeviation >= 3) { score += 8; factors.push({ key: 'command_velocity_deviation', weight: 8, value: Math.round(commandDeviation * 10) / 10 }); }

  const globalRatio = outbound60 / maxGlobal;
  if (globalRatio >= 1) { score += 20; factors.push({ key: 'global_rate_pressure', weight: 20, value: outbound60 }); }
  else if (globalRatio >= 0.75) { score += 12; factors.push({ key: 'global_rate_pressure', weight: 12, value: outbound60 }); }
  else if (globalRatio >= 0.5) { score += 6; factors.push({ key: 'global_rate_pressure', weight: 6, value: outbound60 }); }

  const recipientRatio = recipientMax / maxRecipient;
  if (recipientRatio >= 1) { score += 15; factors.push({ key: 'recipient_concentration', weight: 15, value: recipientMax }); }
  else if (recipientRatio >= 0.75) { score += 8; factors.push({ key: 'recipient_concentration', weight: 8, value: recipientMax }); }

  if (topSource[1] >= 7) { score += 18; factors.push({ key: 'source_burst_10s', weight: 18, value: topSource[1] }); }
  else if (topSource[1] >= 5) { score += 10; factors.push({ key: 'source_burst_10s', weight: 10, value: topSource[1] }); }

  if (failureRatio >= 0.5 && Number(outbound.failureCount60s) >= 4) { score += 10; factors.push({ key: 'outbound_failure_ratio', weight: 10, value: failureRatio }); }
  else if (failureRatio >= 0.25 && Number(outbound.failureCount60s) >= 3) { score += 6; factors.push({ key: 'outbound_failure_ratio', weight: 6, value: failureRatio }); }

  if (duplicates >= 5) { score += 8; factors.push({ key: 'duplicate_retry_pressure', weight: 8, value: duplicates }); }
  else if (duplicates >= 3) { score += 5; factors.push({ key: 'duplicate_retry_pressure', weight: 5, value: duplicates }); }

  if (actorMax >= 25) { score += 10; factors.push({ key: 'command_actor_burst', weight: 10, value: actorMax }); }
  else if (actorMax >= 15) { score += 6; factors.push({ key: 'command_actor_burst', weight: 6, value: actorMax }); }

  const runtimePressure = Math.max(cpu, heap * 0.9, loopDelay / 2, queueDepth * 2);
  if (runtimePressure >= 85) { score += 10; factors.push({ key: 'runtime_pressure', weight: 10, value: Math.round(runtimePressure) }); }
  else if (runtimePressure >= 65) { score += 5; factors.push({ key: 'runtime_pressure', weight: 5, value: Math.round(runtimePressure) }); }

  score = Math.round(clamp(score, 0, 100));
  const state = score >= 85 ? 'CRITICAL' : score >= 65 ? 'HIGH' : score >= 40 ? 'ELEVATED' : 'NORMAL';
  const recommendations = [];
  if (outbound10 >= 5) recommendations.push('Inspect the outbound source that generated the recent burst.');
  if (globalRatio >= 0.75) recommendations.push('Keep outbound admission closed until the rolling window falls below policy limits.');
  if (recipientRatio >= 0.75) recommendations.push('Review repeated delivery attempts to the same destination.');
  if (failureRatio >= 0.25) recommendations.push('Stop retry loops and inspect transport errors before retrying.');
  if (actorMax >= 15) recommendations.push('Review command invocation volume and possible automation loops.');
  if (runtimePressure >= 65) recommendations.push('Reduce nonessential background workload until runtime pressure recovers.');
  if (!recommendations.length) recommendations.push('No high-confidence anomaly detected; continue passive monitoring.');

  // Auto-quarantine is narrowly scoped to a source with a hard burst signature.
  // The model cannot authorize messaging, broaden recipients, or change send limits.
  const quarantineSources = score >= 60 && topSource[1] >= 7 ? [topSource[0]] : [];
  return {
    generatedAt: Number(snapshot.generatedAt) || Date.now(),
    score,
    state,
    factors,
    recommendations,
    quarantineSources,
    evidence: {
      outbound10s: outbound10,
      outboundBaseline10s: Math.round(outboundBaseline * 100) / 100,
      commandCurrent10s: commandCurrent,
      commandBaseline10s: Math.round(commandBaseline * 100) / 100,
      outbound60s: outbound60,
      recipientMax60s: recipientMax,
      failureRatio60s: Math.round(failureRatio * 100) / 100,
      duplicateBlocks60s: duplicates,
      maxCommandsPerActor60s: actorMax,
      topSource: topSource[0],
      topSourceCount10s: topSource[1],
      runtimePressure: Math.round(runtimePressure),
    },
    engine: 'local-feature-agent-v1',
    externalModelUsed: false,
  };
}

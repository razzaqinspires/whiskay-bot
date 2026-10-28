import { readFile } from 'node:fs/promises';
const index = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/webhookRuntime.js', import.meta.url), 'utf8');
const plugin = await readFile(new URL('../src/plugins/owner/ops-center.js', import.meta.url), 'utf8');
const checks = [
 ['public health endpoint', index.includes("req.url === '/healthz'")],
 ['constant-time secret comparison', index.includes('timingSafeEqual')],
 ['request rate limit', index.includes('WHISKAY_WEBHOOK_RATE_LIMIT')],
 ['event deduplication', index.includes('wasEventSeen(eventId)')],
 ['configurable target allowlist', index.includes('WHISKAY_BOSS_TARGET_GROUPS')],
 ['ops commands registered', ['opsstatus','webhookstats','tunnelhealth','webhookdryrun'].every(x=>plugin.includes(x))],
 ['metrics service exports', service.includes('getWebhookRuntimeStats')]
];
let failed=false; for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed=true; }
if(failed) process.exitCode=1;

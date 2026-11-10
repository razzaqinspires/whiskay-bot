import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMenuCardV1, renderMenuCardV2 } from '../src/services/canvas-v2.js';

test('official menu Canvas V1 and V2 render distinct landscape PNG designs', async () => {
  const [v1, v2] = await Promise.all([
    renderMenuCardV1({ botName: 'WHISKAYBOT' }),
    renderMenuCardV2({ botName: 'WHISKAYBOT' })
  ]);
  assert.ok(Buffer.isBuffer(v1) && Buffer.isBuffer(v2));
  assert.equal(v1.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(v2.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.notDeepEqual(v1, v2);
  assert.ok(v1.length > 1000 && v2.length > 1000);
});

test('reply image to the saved upload prompt applies Canvas V2 avatar automatically', async () => {
  const { mkdtemp, readFile, stat, rm } = await import('node:fs/promises');
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await mkdtemp(path.join(os.tmpdir(), 'whiskay-avatar-upload-'));
  try {
    const moduleUrl = new URL('../src/services/menu-avatar-upload.js', import.meta.url).href;
    const settingsUrl = new URL('../src/lib/menu-settings.js', import.meta.url).href;
    const code = `
      const settings=await import(${JSON.stringify(settingsUrl)});
      const service=await import(${JSON.stringify(moduleUrl)});
      await settings.updateMenuSettings('tester@s.whatsapp.net',{canvasAvatarPendingId:'PROMPT-123',canvasAvatarPendingAt:Date.now()});
      const ctx={sender:'tester@s.whatsapp.net',type:'imageMessage',quoted:{key:{id:'PROMPT-123'}},message:{imageMessage:{mimetype:'image/png'}},msg:{mimetype:'image/png'},download:async()=>Buffer.from('89504e470d0a1a0a','hex'),reply:async()=>{},sendInteractive:async()=>({key:{id:'ok'}})};
      const consumed=await service.consumePendingMenuAvatar(ctx);
      const saved=await settings.getMenuSettings('tester@s.whatsapp.net');
      if(!consumed||!saved.canvasAvatarPath||saved.canvasAvatarPendingId)process.exit(4);
      console.log(saved.canvasAvatarPath);
    `;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: path.resolve('.'), encoding: 'utf8', env: { ...process.env, WHISKAY_DATA_DIR: root } });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const savedPath = run.stdout.trim();
    assert.ok(savedPath.includes(path.join(root, 'menu-images')));
    assert.equal((await readFile(savedPath)).subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    await stat(savedPath);
  } finally { await rm(root, { recursive: true, force: true }); }
});

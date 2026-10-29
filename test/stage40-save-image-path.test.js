import test from 'node:test';
import assert from 'node:assert/strict';
import plugin, { saveImagePathInternals } from '../src/plugins/owner/save-image-path.js';

const { unwrapMessage, extensionFor, safeFilename } = saveImagePathInternals;

test('owner save-image-path plugin registers owner-only aliases', () => {
  assert.equal(plugin.owner, true);
  for (const command of ['saveimg', 'saveimage', 'saveimagepath']) assert.ok(plugin.command.includes(command));
  assert.ok(plugin.aliases.includes('imgsave'));
});

test('save-image-path unwraps ephemeral and view-once image messages', () => {
  const image = { mimetype: 'image/png' };
  assert.deepEqual(unwrapMessage({ message: { ephemeralMessage: { message: { imageMessage: image } } } }), { imageMessage: image });
  assert.deepEqual(unwrapMessage({ message: { viewOnceMessageV2: { message: { imageMessage: image } } } }), { imageMessage: image });
});

test('save-image-path maps supported MIME types and rejects unknown types', () => {
  assert.equal(extensionFor('image/jpeg'), 'jpg');
  assert.equal(extensionFor('image/png'), 'png');
  assert.equal(extensionFor('image/webp'), 'webp');
  assert.equal(extensionFor('image/gif'), 'gif');
  assert.equal(extensionFor('application/pdf'), '');
});

test('save-image-path sanitizes filenames and strips path traversal', () => {
  assert.equal(safeFilename('../../../../my logo.png', 'png'), 'my-logo.png');
  assert.equal(safeFilename('portrait final.jpg', 'jpg'), 'portrait-final.jpg');
  assert.throws(() => safeFilename('....', 'jpg'), /Nama file tidak valid/);
});

test('save-image-path rejects non-owner before attempting media download', async () => {
  let message = '';
  let downloadCalled = false;
  await plugin.execute({
    isOwner: false,
    reply: async value => { message = value; },
    download: async () => { downloadCalled = true; throw new Error('should not run'); },
  });
  assert.match(message, /khusus owner/i);
  assert.equal(downloadCalled, false);
});

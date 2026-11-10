import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, chmod, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { synchronizeEnvTemplate } from '../src/config/EnvTemplateSynchronizer.js';

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-env-sync-'));
  return {
    dir,
    envFile: path.join(dir, '.env'),
    templateFile: path.join(dir, '.env.example'),
    stateFile: path.join(dir, '.env.sync-state'),
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

test('template adds missing keys without overwriting existing values', async () => {
  const f = await fixture();
  try {
    await writeFile(f.templateFile, '# template\nBOT_NAME=Whiskay\nTEST_URL=\nTIMEOUT=5000\n');
    await writeFile(f.envFile, 'BOT_NAME=My Custom Bot\nCUSTOM_LOCAL=value\n');
    const result = await synchronizeEnvTemplate(f);
    const env = await readFile(f.envFile, 'utf8');
    assert.deepEqual(result.addedKeys.sort(), ['TEST_URL', 'TIMEOUT']);
    assert.match(env, /BOT_NAME=My Custom Bot/);
    assert.match(env, /TEST_URL=/);
    assert.match(env, /TIMEOUT=5000/);
    assert.match(env, /CUSTOM_LOCAL=value/);
  } finally { await f.cleanup(); }
});

test('keys removed from template are pruned only when previously managed', async () => {
  const f = await fixture();
  try {
    await writeFile(f.templateFile, 'KEEP=value\nREMOVE_ME=old\n');
    await writeFile(f.envFile, 'KEEP=custom\nREMOVE_ME=secret\nUNMANAGED=preserve\n');
    await synchronizeEnvTemplate(f);
    await writeFile(f.templateFile, 'KEEP=value\nNEW_KEY=\n');
    const result = await synchronizeEnvTemplate(f);
    const env = await readFile(f.envFile, 'utf8');
    assert.deepEqual(result.removedKeys, ['REMOVE_ME']);
    assert.doesNotMatch(env, /^REMOVE_ME=/m);
    assert.match(env, /^KEEP=custom$/m);
    assert.match(env, /^UNMANAGED=preserve$/m);
    assert.match(env, /^NEW_KEY=$/m);
  } finally { await f.cleanup(); }
});

test('quoted multiline values are preserved when unrelated keys are pruned', async () => {
  const f = await fixture();
  try {
    await writeFile(f.templateFile, 'KEEP=one\nOBSOLETE=old\n');
    await writeFile(f.envFile, 'KEEP="first line\nsecond line"\nOBSOLETE=old\n');
    await synchronizeEnvTemplate(f);
    await writeFile(f.templateFile, 'KEEP=one\n');
    await synchronizeEnvTemplate(f);
    const env = await readFile(f.envFile, 'utf8');
    assert.match(env, /KEEP="first line\nsecond line"/);
    assert.doesNotMatch(env, /^OBSOLETE=/m);
  } finally { await f.cleanup(); }
});

test('pruning can be disabled to protect legacy or externally managed keys', async () => {
  const f = await fixture();
  try {
    await writeFile(f.templateFile, 'OLD_KEY=1\n');
    await writeFile(f.envFile, 'OLD_KEY=2\n');
    await synchronizeEnvTemplate(f);
    await writeFile(f.templateFile, 'NEW_KEY=\n');
    const result = await synchronizeEnvTemplate({ ...f, prune: false });
    const env = await readFile(f.envFile, 'utf8');
    assert.deepEqual(result.removedKeys, []);
    assert.match(env, /^OLD_KEY=2$/m);
    assert.match(env, /^NEW_KEY=$/m);
  } finally { await f.cleanup(); }
});

test('sync state is plain text and env file permissions remain private', async () => {
  const f = await fixture();
  try {
    await writeFile(f.templateFile, 'API_TOKEN=\n');
    await writeFile(f.envFile, 'API_TOKEN=\n', { mode: 0o600 });
    await chmod(f.envFile, 0o600);
    await synchronizeEnvTemplate(f);
    const state = await readFile(f.stateFile, 'utf8');
    assert.equal(state.trim(), 'API_TOKEN');
    assert.equal(state.trim().startsWith('{'), false);
  } finally { await f.cleanup(); }
});


test('symbolic-link env files are rejected instead of mutating an external target', async () => {
  const f = await fixture();
  try {
    const external = path.join(f.dir, 'external.env');
    await writeFile(f.templateFile, 'SAFE_KEY=value\n');
    await writeFile(external, 'OUTSIDE=keep\n');
    await symlink(external, f.envFile);
    await assert.rejects(() => synchronizeEnvTemplate(f), /symbolic-link/);
    assert.equal(await readFile(external, 'utf8'), 'OUTSIDE=keep\n');
  } finally { await f.cleanup(); }
});

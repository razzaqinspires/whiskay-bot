import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveCloudflaredExecutable } from '../src/services/worldBossTunnel.js';

test('cloudflared resolver falls back when CLOUDFLARED_BIN points to missing file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'whiskay-cloudflared-'));
  const executable = path.join(dir, 'cloudflared');
  const old = { configured: process.env.CLOUDFLARED_BIN, binDir: process.env.JADIBOT_BIN_DIR, path: process.env.PATH };
  try {
    await writeFile(executable, '#!/bin/sh\necho cloudflared version test\n', { mode: 0o755 });
    await chmod(executable, 0o755);
    process.env.CLOUDFLARED_BIN = path.join(dir, 'missing-cloudflared');
    process.env.JADIBOT_BIN_DIR = path.join(dir, 'empty');
    process.env.PATH = dir;
    assert.equal(resolveCloudflaredExecutable(), 'cloudflared');
  } finally {
    if (old.configured === undefined) delete process.env.CLOUDFLARED_BIN; else process.env.CLOUDFLARED_BIN = old.configured;
    if (old.binDir === undefined) delete process.env.JADIBOT_BIN_DIR; else process.env.JADIBOT_BIN_DIR = old.binDir;
    if (old.path === undefined) delete process.env.PATH; else process.env.PATH = old.path;
    await rm(dir, { recursive: true, force: true });
  }
});

test('cloudflared resolver reports actionable error when no candidate is runnable', () => {
  const old = { configured: process.env.CLOUDFLARED_BIN, binDir: process.env.JADIBOT_BIN_DIR, path: process.env.PATH };
  try {
    process.env.CLOUDFLARED_BIN = '/definitely/missing/cloudflared';
    process.env.JADIBOT_BIN_DIR = '/definitely/missing/bin';
    process.env.PATH = '/definitely/missing/path';
    assert.throws(() => resolveCloudflaredExecutable(), /cloudflared tidak ditemukan untuk linux\//);
  } finally {
    if (old.configured === undefined) delete process.env.CLOUDFLARED_BIN; else process.env.CLOUDFLARED_BIN = old.configured;
    if (old.binDir === undefined) delete process.env.JADIBOT_BIN_DIR; else process.env.JADIBOT_BIN_DIR = old.binDir;
    if (old.path === undefined) delete process.env.PATH; else process.env.PATH = old.path;
  }
});

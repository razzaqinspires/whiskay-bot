import { open, mkdir, readFile, rename, unlink, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hostname = os.hostname();

function makeStoreError(message, code, cause) {
  const error = new Error(message, { cause });
  error.code = code;
  return error;
}

/** Read JSON without treating corruption or permission errors as an empty database. */
export async function readJsonFile(file, fallback) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw makeStoreError(`Persistent JSON is corrupt: ${file}`, 'WHISKAY_DATA_CORRUPT', error);
  }
}

async function writeRawAtomic(file, raw) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(raw);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
    try {
      const directory = await open(path.dirname(file), 'r');
      await directory.sync();
      await directory.close();
    } catch {
      // Some filesystems do not support directory fsync. The file itself was synced.
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

/** Atomic JSON replacement. Optional backup is only made from a valid prior JSON file. */
export async function writeJsonAtomic(file, value, { backup = false } = {}) {
  if (backup) {
    try {
      const previous = await readFile(file);
      try {
        JSON.parse(previous.toString('utf8'));
      } catch (error) {
        throw makeStoreError(`Refusing to replace corrupt JSON without recovery: ${file}`, 'WHISKAY_DATA_CORRUPT', error);
      }
      await writeRawAtomic(`${file}.bak`, previous);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  await writeRawAtomic(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function removeStaleLock(lockFile, staleMs) {
  try {
    const [raw, info] = await Promise.all([readFile(lockFile, 'utf8').catch(() => ''), stat(lockFile)]);
    const age = Date.now() - info.mtimeMs;
    let metadata = null;
    try { metadata = JSON.parse(raw); } catch {}
    if (age < staleMs) return false;
    // A malformed/partially-written lock has no trustworthy owner identity.
    // Fail closed rather than deleting a potentially live lock during creation.
    if (!metadata || typeof metadata !== 'object' || !metadata.token || !Number.isInteger(Number(metadata.pid)) || !metadata.hostname) return false;
    if (metadata.hostname !== hostname) return false;
    if (processIsAlive(Number(metadata.pid))) return false;
    await unlink(lockFile);
    return true;
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

/**
 * Local-host, cross-process advisory lock for PM2/forked workers sharing one data directory.
 * This is not a distributed lock for network filesystems or multiple hosts.
 */
export async function withFileLock(lockFile, fn, {
  timeoutMs = 30000,
  staleMs = 10000,
  retryMs = 35,
} = {}) {
  await mkdir(path.dirname(lockFile), { recursive: true, mode: 0o700 });
  const token = randomUUID();
  const deadline = Date.now() + timeoutMs;
  let handle = null;
  while (!handle) {
    let created = false;
    try {
      handle = await open(lockFile, 'wx', 0o600);
      created = true;
      await handle.writeFile(JSON.stringify({ pid: process.pid, hostname, token, createdAt: Date.now() }));
      await handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      handle = null;
      if (created) await unlink(lockFile).catch(() => {});
      if (error?.code !== 'EEXIST') throw error;
      await removeStaleLock(lockFile, staleMs);
      if (Date.now() >= deadline) {
        throw makeStoreError(`Timed out acquiring persistent lock: ${lockFile}`, 'WHISKAY_LOCK_TIMEOUT');
      }
      await sleep(retryMs + Math.floor(Math.random() * retryMs));
    }
  }

  try {
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    try {
      const current = JSON.parse(await readFile(lockFile, 'utf8'));
      if (current.token === token) await unlink(lockFile);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

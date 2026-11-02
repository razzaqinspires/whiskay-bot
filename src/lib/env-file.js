import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const fileQueues = new Map();

/** Atomically merge environment entries without clobbering concurrent tunnel writers. */
export async function updateEnvFileValues(filePath, entries) {
  const file = path.resolve(filePath);
  const previous = fileQueues.get(file) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    let source = '';
    try { source = await readFile(file, 'utf8'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const lines = source ? source.split(/\r?\n/) : [];
    for (const [key, rawValue] of Object.entries(entries || {})) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new TypeError(`Invalid environment key: ${key}`);
      const value = String(rawValue ?? '');
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const line = `${key}="${escaped}"`;
      const matcher = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
      const index = lines.findIndex(row => matcher.test(row));
      if (index >= 0) lines[index] = line;
      else lines.push(line);
    }
    const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(tmp, `${lines.join('\n').replace(/\n*$/, '\n')}`, { mode: 0o600 });
    await rename(tmp, file);
    for (const [key, value] of Object.entries(entries || {})) process.env[key] = String(value ?? '');
    return { file, keys: Object.keys(entries || {}) };
  });
  fileQueues.set(file, operation);
  try { return await operation; }
  finally { if (fileQueues.get(file) === operation) fileQueues.delete(file); }
}

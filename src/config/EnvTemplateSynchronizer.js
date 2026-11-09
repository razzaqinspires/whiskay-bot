import { readFile, writeFile, rename, stat, lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as nodeUtil from 'node:util';
const parseEnv = typeof nodeUtil.parseEnv === 'function'
  ? nodeUtil.parseEnv
  : (await import('dotenv')).default.parse;
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROTECTED_KEYS = new Set(['ENV_FILE', 'ENV_TEMPLATE_SYNC_ENABLED', 'ENV_TEMPLATE_SYNC_PRUNE', 'ENV_TEMPLATE_SYNC_STATE_FILE', 'ENV_TEMPLATE_FILE']);
const enabled = (value, fallback = true) => value == null || value === '' ? fallback : !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
export const resolveEnvPath = (file = process.env.ENV_FILE) => path.resolve(file || path.join(ROOT, '.env'));
export const resolveTemplatePath = (file = process.env.ENV_TEMPLATE_FILE) => path.resolve(file || path.join(ROOT, '.env.example'));
export const resolveStatePath = envPath => path.resolve(process.env.ENV_TEMPLATE_SYNC_STATE_FILE || `${envPath}.sync-state`);

async function readText(file, optional = false) {
  try {
    const linkInfo = await lstat(file);
    if (linkInfo.isSymbolicLink()) throw new Error(`Refusing symbolic-link environment file: ${file}`);
    const info = await stat(file);
    if (!info.isFile()) throw new Error(`Expected regular file: ${file}`);
    return await readFile(file, 'utf8');
  } catch (error) {
    if (optional && error.code === 'ENOENT') return '';
    throw error;
  }
}
function declarations(source) {
  const lines = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) || [];
  const result = [];
  for (let i = 0; i < lines.length;) {
    const match = lines[i].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) { i++; continue; }
    const key = match[1];
    const value = lines[i].slice(lines[i].indexOf('=') + 1).trimStart();
    const quote = ['"', "'", '`'].includes(value[0]) ? value[0] : null;
    let end = i + 1;
    const closed = (line, q) => {
      for (let n = 0; n < line.length; n++) if (line[n] === q && line[n - 1] !== '\\') return true;
      return false;
    };
    if (quote && !closed(value.slice(1), quote)) {
      while (end < lines.length && !closed(lines[end++], quote)) {}
    }
    result.push({ key, raw: lines.slice(i, end).join('') });
    i = end;
  }
  return result;
}
function removeKeys(source, remove) {
  if (!remove.size) return source;
  const lines = source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) || [];
  const output = [];
  for (let i = 0; i < lines.length;) {
    const match = lines[i].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !remove.has(match[1])) { output.push(lines[i++]); continue; }
    const value = lines[i].slice(lines[i].indexOf('=') + 1).trimStart();
    const quote = ['"', "'", '`'].includes(value[0]) ? value[0] : null;
    let end = i + 1;
    const closed = line => {
      for (let n = 0; n < line.length; n++) if (line[n] === quote && line[n - 1] !== '\\') return true;
      return false;
    };
    if (quote && !closed(value.slice(1))) {
      while (end < lines.length && !closed(lines[end])) end++;
      if (end < lines.length) end++;
    }
    i = end;
  }
  return output.join('');
}
async function atomicWrite(file, content, mode = 0o600) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { encoding: 'utf8', mode });
  await rename(temp, file);
}

export async function synchronizeEnvTemplate({ envFile = resolveEnvPath(), templateFile = resolveTemplatePath(), stateFile = resolveStatePath(envFile), prune = enabled(process.env.ENV_TEMPLATE_SYNC_PRUNE, true) } = {}) {
  if (!enabled(process.env.ENV_TEMPLATE_SYNC_ENABLED, true)) return { enabled: false, addedKeys: [], removedKeys: [], preservedKeys: [] };
  if (envFile === templateFile || envFile === stateFile || templateFile === stateFile) throw new Error('Environment, template, and sync-state paths must be different');
  const [templateSource, envSource, stateSource] = await Promise.all([readText(templateFile), readText(envFile, true), readText(stateFile, true)]);
  const template = parseEnv(templateSource);
  const current = parseEnv(envSource);
  const templateKeys = new Set(Object.keys(template));
  for (const key of templateKeys) if (!KEY_RE.test(key)) throw new Error(`Invalid .env.example key: ${key}`);
  const previouslyManaged = new Set(stateSource.split(/\r?\n/).map(v => v.trim()).filter(v => KEY_RE.test(v)));
  const removedKeys = prune ? [...previouslyManaged].filter(key => !templateKeys.has(key) && !PROTECTED_KEYS.has(key)) : [];
  const addedKeys = Object.keys(template).filter(key => !Object.hasOwn(current, key));
  const preservedKeys = Object.keys(template).filter(key => Object.hasOwn(current, key));
  let nextEnv = removeKeys(envSource, new Set(removedKeys));
  const rawBlocks = new Map(declarations(templateSource).map(({ key, raw }) => [key, raw]));
  if (addedKeys.length) {
    if (nextEnv && !nextEnv.endsWith('\n')) nextEnv += '\n';
    if (nextEnv && !nextEnv.endsWith('\n\n')) nextEnv += '\n';
    nextEnv += '# --- Added automatically from .env.example; preserve and fill values as needed. ---\n';
    for (const key of addedKeys) nextEnv += rawBlocks.get(key) || `${key}=${template[key]}\n`;
  }
  if (nextEnv !== envSource) {
    let mode = 0o600;
    try { mode = ((await stat(envFile)).mode & 0o600) || 0o600; } catch {}
    await atomicWrite(envFile, nextEnv, mode);
  }
  const nextState = [...templateKeys].sort().join('\n') + '\n';
  if (stateSource !== nextState) await atomicWrite(stateFile, nextState, 0o600);
  return { enabled: true, envFile, templateFile, addedKeys, removedKeys, preservedKeys, changed: nextEnv !== envSource };
}

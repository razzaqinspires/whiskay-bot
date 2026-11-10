import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ENV_SETTING_MAP, ENV_GROUPS } from '../config/settings.js';
import { getEnvFilePath, reloadConfigFromEnvFile } from '../config/index.js';

const pendingInputs = new Map();
const MAX_PENDING = 100;
const PENDING_TTL_MS = 10 * 60 * 1000;

export function getEnvGroups() { return ENV_GROUPS; }
export function getEnvSettings(group) {
  return [...ENV_SETTING_MAP.values()].filter(item => !group || item.group === group);
}
export function getEnvSetting(key) { return ENV_SETTING_MAP.get(String(key || '').trim()); }

export function describeEnvValue(setting) {
  const value = process.env[setting.key];
  if (setting.secret) return value ? '•••••••• (sudah diatur)' : 'Belum diatur';
  if (value == null || value === '') return 'Belum diatur / memakai default';
  return String(value).length > 110 ? `${String(value).slice(0, 107)}…` : String(value);
}

function normalizeValue(setting, raw) {
  const value = String(raw ?? '').trim();
  if (/[\r\n\0]/.test(value)) throw new Error('Nilai harus satu baris dan tidak boleh mengandung karakter kontrol.');
  if (value === '__EMPTY__') return '';
  if (value.length > (setting.maxLength || 2000)) throw new Error(`Maksimum ${setting.maxLength || 2000} karakter.`);
  if (setting.enum && value) {
    const normalized = value.toLowerCase();
    if (!setting.enum.includes(normalized)) throw new Error(`Pilihan valid: ${setting.enum.join(' | ')}.`);
    return normalized;
  }
  if (setting.type === 'boolean') {
    if (!value) return '';
    const lower = value.toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(lower)) throw new Error('Gunakan true atau false.');
    return ['true', '1', 'yes', 'on'].includes(lower) ? 'true' : 'false';
  }
  if (setting.type === 'number') {
    if (!value) return '';
    const number = Number(value);
    if (!Number.isFinite(number) || number < (setting.min ?? -Infinity) || number > (setting.max ?? Infinity)) {
      throw new Error(`Masukkan angka antara ${setting.min ?? '-∞'} dan ${setting.max ?? '∞'}.`);
    }
    return String(Math.trunc(number));
  }
  if (setting.type === 'url' && value) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('URL tidak valid. Sertakan https:// atau http://.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Hanya URL HTTP/HTTPS yang didukung.');
  }
  if (setting.key === 'WHISKAY_GITHUB_REPO' || setting.key === 'WHISKAY_RPG_GITHUB_REPO') {
    if (value && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('Format repository harus owner/repository.');
  }
  if (setting.key === 'OWNER_LIDS' && value) {
    const parts = value.split(',').map(item => item.trim()).filter(Boolean);
    if (parts.some(item => !/^(?:[0-9]{8,20}@lid|[0-9]{8,20})$/.test(item))) throw new Error('OWNER_LIDS harus berupa ID numerik @lid, dipisahkan koma.');
  }
  if (setting.key === 'OWNERS' || setting.key === 'OWNER_PHONE' || setting.key === 'BOT_WHATSAPP_NUMBER' || setting.key === 'PAIRING_NUMBER') {
    const parts = value.split(',').map(item => item.trim()).filter(Boolean);
    if (parts.some(item => !/^\+?[0-9]{8,16}(?:@s\.whatsapp\.net)?$/.test(item))) throw new Error('Nomor WhatsApp harus angka internasional 8–16 digit; beberapa nomor dipisahkan koma.');
  }
  return value;
}

const quoteEnv = value => JSON.stringify(String(value));

export async function setEnvSetting(key, rawValue) {
  const setting = getEnvSetting(key);
  if (!setting) throw new Error('Key tidak termasuk daftar konfigurasi yang diizinkan.');
  const value = normalizeValue(setting, rawValue);
  const file = getEnvFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  let source = '';
  try { source = await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const matcher = new RegExp(`^\\s*(?:export\\s+)?${setting.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  const nextLine = `${setting.key}=${quoteEnv(value)}`;
  let replaced = false;
  const output = [];
  for (const line of lines) {
    if (matcher.test(line)) {
      if (!replaced) output.push(nextLine);
      replaced = true;
    } else output.push(line);
  }
  if (!replaced) output.push(nextLine);
  const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tmp, `${output.join('\n').replace(/\n*$/, '\n')}`, { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, file);
  const reload = await reloadConfigFromEnvFile({ file });
  return { key: setting.key, secret: setting.secret, hotReloadable: setting.hotReloadable, reload };
}

export function setPendingEnvInput({ sender, chat, promptId, key }) {
  const normalizedSender = String(sender || '');
  const normalizedChat = String(chat || '');
  const normalizedPrompt = String(promptId || '');
  if (!normalizedSender || !normalizedChat || !normalizedPrompt || !getEnvSetting(key)) return false;
  const now = Date.now();
  for (const [id, item] of pendingInputs) if (item.expiresAt <= now) pendingInputs.delete(id);
  while (pendingInputs.size >= MAX_PENDING) pendingInputs.delete(pendingInputs.keys().next().value);
  pendingInputs.set(`${normalizedSender}|${normalizedChat}`, { sender: normalizedSender, chat: normalizedChat, promptId: normalizedPrompt, key, expiresAt: now + PENDING_TTL_MS });
  return true;
}

export async function consumePendingEnvReply(ctx) {
  const sender = String(ctx?.sender || '');
  const chat = String(ctx?.chat || '');
  if (!sender || !chat || !ctx?.quoted?.key?.id) return false;
  const id = `${sender}|${chat}`;
  const pending = pendingInputs.get(id);
  if (!pending || pending.expiresAt <= Date.now() || pending.promptId !== String(ctx.quoted.key.id)) return false;
  if (!ctx.isOwner || pending.sender !== sender) return false;
  let input = String(ctx.body || '').trim();
  if (!input) { await ctx.reply('Nilai kosong tidak disimpan. Balas ulang pesan permintaan dengan nilai yang ingin diatur.'); return true; }
  if (/^(?:cancel|batal|\.config\s+cancel)$/i.test(input)) {
    pendingInputs.delete(id);
    await ctx.reply('✅ Permintaan pengaturan dibatalkan. Tidak ada perubahan pada .env.');
    return true;
  }
  if (input === '__EMPTY__') input = '';
  try {
    const result = await setEnvSetting(pending.key, input);
    pendingInputs.delete(id);
    const status = result.hotReloadable ? '✅ Perubahan diterapkan ke konfigurasi runtime tanpa restart.' : '✅ .env diperbarui. Perubahan ini memerlukan restart agar semua service menggunakannya.';
    await ctx.sendInteractive({
      title: '⚙️ Konfigurasi Diperbarui',
      body: `Key: ${result.key}\nNilai: ${result.secret ? '•••••••• (disembunyikan)' : input.slice(0, 180)}\n\n${status}\nFile: .env (izin file dibatasi ke owner proses).`,
      buttons: [
        { name: 'quick_reply', title: 'Kembali ke Config', id: '.config' },
        { name: 'quick_reply', title: 'Lihat Status', id: '.config status' }
      ]
    });
    return true;
  } catch (error) {
    const prompt = await ctx.reply(`⚠️ Nilai untuk ${pending.key} belum disimpan: ${error.message}\nBalas pesan ini dengan nilai yang benar, atau ketik BATAL.`);
    if (prompt?.key?.id) setPendingEnvInput({ sender, chat, promptId: prompt.key.id, key: pending.key });
    return true;
  }
}

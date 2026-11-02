import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIO_DIR = process.env.ADZAN_AUDIO_DIR
  ? (path.isAbsolute(process.env.ADZAN_AUDIO_DIR) ? process.env.ADZAN_AUDIO_DIR : path.resolve(ROOT, process.env.ADZAN_AUDIO_DIR))
  : path.join(ROOT, 'media', 'adzan');
const FILES = Object.freeze({ fajr: 'subuh.mp3', dhuhr: 'umum.mp3', asr: 'umum.mp3', maghrib: 'umum.mp3', isha: 'umum.mp3' });
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export function getAdzanAudioPath(prayer, { pack = 'default' } = {}) {
  const base = FILES[prayer];
  const file = pack === 'custom' && base ? (prayer === 'fajr' ? 'custom-subuh.mp3' : 'custom-umum.mp3') : base;
  return file ? path.join(AUDIO_DIR, file) : null;
}

export async function getAdzanAudioStatus() {
  const result = {};
  for (const [prayer, file] of Object.entries({ fajr: 'subuh.mp3', others: 'umum.mp3' })) {
    const full = path.join(AUDIO_DIR, file);
    try {
      const info = await stat(full);
      result[prayer] = { available: info.isFile() && info.size > 0 && info.size <= MAX_AUDIO_BYTES, file, sizeBytes: info.size };
    } catch { result[prayer] = { available: false, file, sizeBytes: 0 }; }
  }
  const custom = {};
  for (const [prayer, file] of Object.entries({ fajr: 'custom-subuh.mp3', others: 'custom-umum.mp3' })) {
    const full = path.join(AUDIO_DIR, file);
    try { const info = await stat(full); custom[prayer] = { available: info.isFile() && info.size > 0 && info.size <= MAX_AUDIO_BYTES, file, sizeBytes: info.size }; }
    catch { custom[prayer] = { available: false, file, sizeBytes: 0 }; }
  }
  return { directory: AUDIO_DIR, files: result, customFiles: custom };
}

export async function loadAdzanAudio(prayer, options = {}) {
  const full = getAdzanAudioPath(prayer, options);
  if (!full) return null;
  try {
    await access(full);
    const info = await stat(full);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_AUDIO_BYTES) throw new Error(`Audio adzan tidak valid atau melebihi batas 20 MB: ${path.basename(full)}`);
    return { audio: await readFile(full), mimetype: 'audio/mpeg', fileName: path.basename(full), ptt: false };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export default { getAdzanAudioPath, getAdzanAudioStatus, loadAdzanAudio };

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const root = process.cwd();
const configPath = path.join(root, 'data', 'log-preferences.json');
const themes = {
  1: { name: 'Minimalist', time: '\x1b[37m', command: '\x1b[37m', group: '\x1b[37m', private: '\x1b[37m', success: '\x1b[37m', error: '\x1b[37m' },
  2: { name: 'Cyberpunk', time: '\x1b[90m', command: '\x1b[95m', group: '\x1b[96m', private: '\x1b[93m', success: '\x1b[92m', error: '\x1b[91m' },
  3: { name: 'Matrix', time: '\x1b[32m', command: '\x1b[92m', group: '\x1b[32m', private: '\x1b[32m', success: '\x1b[92m', error: '\x1b[91m' },
  4: { name: 'Corporate', time: '\x1b[90m', command: '\x1b[36m', group: '\x1b[34m', private: '\x1b[35m', success: '\x1b[32m', error: '\x1b[31m' },
  5: { name: 'RGB Gaming', time: '\x1b[96m', command: '\x1b[95m', group: '\x1b[94m', private: '\x1b[93m', success: '\x1b[92m', error: '\x1b[91m' }
};
const reset = '\x1b[0m';
function readPrefs() { try { return JSON.parse(readFileSync(configPath, 'utf8')); } catch { return { theme: 2 }; } }
export function setLogTheme(value) {
  const theme = Number(value);
  if (!themes[theme]) throw new RangeError('Tema log harus 1–5.');
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ theme }, null, 2));
  return themes[theme].name;
}
const pad = (value, n) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 160).padEnd(n).slice(0, n);
function emit(type, label, message, colorKey = type) {
  const prefs = readPrefs(); // hot reload: read persisted preference on every log
  const theme = themes[prefs.theme] || themes[2];
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const id = randomUUID().slice(0, 8);
  const body = `[${time}] [${pad(label, 8)}] ${String(message ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 500)}`;
  if (prefs.theme === 4) console.log(`┌─ ${body}\n└─ ID ${id}`);
  else if (prefs.theme === 3) console.log(`${theme[colorKey] || theme.time}${body} [${id}]${reset}`);
  else console.log(`${theme.time}[${time}]${reset} ${theme[colorKey] || theme.time}[${pad(label, 8)}]${reset} ${String(message ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 500)}`);
}
export const logger = {
  command(user, cmd) { emit('command', 'COMMAND', `${user}: ${cmd}`, 'command'); },
  group(groupName, sender, text) { emit('group', 'GROUP', `[${groupName}] ${sender}: ${text}`, 'group'); },
  private(sender, text) { emit('private', 'PRIVATE', `${sender}: ${text}`, 'private'); },
  error(error) { emit('error', 'ERROR', error?.stack || error?.message || String(error), 'error'); },
  success(message) { emit('success', 'SUCCESS', message, 'success'); },
  info(message) { emit('time', 'INFO', message, 'time'); },
  setTheme: setLogTheme,
  themes: Object.fromEntries(Object.entries(themes).map(([id, t]) => [id, t.name]))
};
export default logger;

import path from 'node:path';
import { readJsonFile, writeJsonAtomic, withFileLock } from '../utils/PersistentJsonStore.js';

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${label} store root is invalid; refusing to replace it.`);
    error.code = 'WHISKAY_DATA_CORRUPT';
    throw error;
  }
  return value;
}

/** Cross-process rental/settings store. Reads are atomic; mutations use persistent locks. */
export function createJadibotStore(root = path.resolve(process.env.JADIBOT_DATA_DIR || './data/jadibot')) {
  const base = path.resolve(root);
  const rentalsFile = path.join(base, 'rentals.json');
  const settingsFile = path.join(base, 'settings.json');
  const rentalsLock = `${rentalsFile}.lock`;
  const settingsLock = `${settingsFile}.lock`;
  let writes = Promise.resolve();

  async function readRentals() {
    return assertRecord(await readJsonFile(rentalsFile, {}), 'Jadibot rental');
  }

  async function changeRentals(mutator) {
    if (typeof mutator !== 'function') throw new TypeError('Jadibot store mutator must be a function.');
    const run = writes.then(() => withFileLock(rentalsLock, async () => {
      const data = await readRentals();
      const result = await mutator(data);
      await writeJsonAtomic(rentalsFile, data, { backup: true });
      return result;
    }));
    writes = run.catch(() => {});
    return run;
  }

  async function readSettings(fallback = {}) {
    return assertRecord(await readJsonFile(settingsFile, fallback), 'Jadibot settings');
  }

  async function writeSettings(value) {
    assertRecord(value, 'Jadibot settings');
    return withFileLock(settingsLock, () => writeJsonAtomic(settingsFile, value));
  }

  return Object.freeze({ root: base, rentalsFile, settingsFile, readRentals, changeRentals, readSettings, writeSettings });
}

export const jadibotStore = createJadibotStore();

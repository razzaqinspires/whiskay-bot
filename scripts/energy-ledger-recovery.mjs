import { inspectEnergyLedger, restoreEnergyLedgerBackup } from '../src/lib/energy-worker.js';

const args = new Set(process.argv.slice(2));
const status = await inspectEnergyLedger();
if (args.has('--status') || process.argv.length <= 2) {
  console.log(JSON.stringify(status, null, 2));
  if (status.primary.exists && !status.primary.valid && !status.recoveryAvailable) process.exitCode = 2;
} else if (args.has('--restore-backup')) {
  if (!args.has('--confirm')) {
    console.error('Restore requires explicit confirmation: --restore-backup --confirm');
    process.exitCode = 2;
  } else {
    const result = await restoreEnergyLedgerBackup({ confirm: true });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 2;
  }
} else {
  console.error('Usage: node scripts/energy-ledger-recovery.mjs --status | --restore-backup --confirm');
  process.exitCode = 2;
}

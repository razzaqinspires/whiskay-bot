#!/usr/bin/env node
import { synchronizeEnvTemplate } from '../src/config/EnvTemplateSynchronizer.js';

try {
  const result = await synchronizeEnvTemplate();
  console.log(JSON.stringify({
    enabled: result.enabled,
    changed: result.changed,
    addedKeys: result.addedKeys,
    removedKeys: result.removedKeys,
    preservedKeys: result.preservedKeys.length
  }, null, 2));
} catch (error) {
  console.error(`[env-sync] ${error.message}`);
  process.exitCode = 1;
}

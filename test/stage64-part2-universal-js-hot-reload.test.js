import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyJavaScriptChange, normalizeSourcePath, planJavaScriptReload } from '../src/core/JavaScriptModulePolicy.js';

test('normalizes Windows paths and accepts JavaScript files only', () => {
  assert.equal(normalizeSourcePath('core\\Bot.js'), 'core/Bot.js');
  assert.equal(normalizeSourcePath('services/worker.mjs'), null);
  assert.equal(normalizeSourcePath('lib/config.json'), null);
});

test('rejects traversal paths and empty paths', () => {
  assert.equal(normalizeSourcePath('../outside.js'), null);
  assert.equal(normalizeSourcePath('core/../../outside.js'), null);
  assert.equal(normalizeSourcePath(''), null);
});

test('plugin files remain owned by PluginWatcher', () => {
  assert.equal(classifyJavaScriptChange('plugins/owner/menu.js').eligible, false);
});

test('core and service modules require graceful restart', () => {
  assert.equal(classifyJavaScriptChange('core/Bot.js').strategy, 'graceful-restart');
  assert.equal(classifyJavaScriptChange('services/ai.js').strategy, 'graceful-restart');
});

test('jobs and workers are detected as runtime JavaScript', () => {
  assert.equal(classifyJavaScriptChange('jobs/cleanup.js').eligible, true);
  assert.equal(classifyJavaScriptChange('workers/queue.js').eligible, true);
});

test('unknown source roots fail safely to graceful restart', () => {
  assert.equal(classifyJavaScriptChange('experimental/new-module.js').strategy, 'graceful-restart');
});

test('reload plan excludes deleted files from syntax preflight but preserves deletion event', () => {
  const plan = planJavaScriptReload([
    { file: 'core/removed.js', kind: 'unlink' },
    { file: 'services/current.js', kind: 'change' }
  ], '/app/src');
  assert.equal(plan.items.length, 2);
  assert.equal(plan.syntaxFiles.length, 1);
  assert.equal(plan.deletedFiles.length, 1);
  assert.match(plan.syntaxFiles[0], /services[\\/]current\.js$/);
});

test('mixed batches select the conservative graceful restart strategy', () => {
  const plan = planJavaScriptReload([
    { file: 'lib/helper.js', kind: 'change' },
    { file: 'core/Bot.js', kind: 'change' },
    { file: 'plugins/fun/test.js', kind: 'change' },
    { file: 'docs/readme.md', kind: 'change' }
  ], '/app/src');
  assert.equal(plan.items.length, 2);
  assert.equal(plan.strategy, 'graceful-restart');
});

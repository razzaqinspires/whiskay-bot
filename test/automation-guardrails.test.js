import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const workflowsDir = join(root, '.github', 'workflows');

test('legacy metrics and history workflows cannot write to repository contents', () => {
  for (const name of ['github-metrics.yml', 'repo-update-history.yml']) {
    const content = readFileSync(join(workflowsDir, name), 'utf8');
    assert.match(content, /contents:\s*read/);
    assert.doesNotMatch(content, /git push origin|git-auto-commit-action/);
  }
});

test('autopilot pushes only automation and has scheduled/manual triggers', () => {
  const content = readFileSync(join(workflowsDir, 'automation-autopilot.yml'), 'utf8');
  assert.match(content, /schedule:/);
  assert.match(content, /workflow_dispatch:/);
  assert.match(content, /HEAD:automation/);
  assert.doesNotMatch(content, /HEAD:main|git push origin main/);
});

test('autopilot guardrail checks only explicit main destinations, not read-only main checkout', () => {
  const script = readFileSync(join(root, '.github', 'scripts', 'automation_autopilot.py'), 'utf8');
  assert.match(script, /workflow-main-write-ban/);
  assert.match(script, /automation\/ only|automation\//);
  assert.match(script, /git push origin main/);
});

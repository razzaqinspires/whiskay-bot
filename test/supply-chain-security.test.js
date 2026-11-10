import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cacheable transitive dependencies are pinned to unaffected 2.5.0 artifacts', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const cacheable = lock.packages['node_modules/cacheable'];
  const utils = lock.packages['node_modules/@cacheable/utils'];

  assert.equal(pkg.overrides?.cacheable, '2.5.0');
  assert.equal(pkg.overrides?.['@cacheable/utils'], '2.5.0');
  assert.equal(cacheable.version, '2.5.0');
  assert.equal(utils.version, '2.5.0');
  assert.equal(cacheable.resolved, 'https://registry.npmjs.org/cacheable/-/cacheable-2.5.0.tgz');
  assert.equal(cacheable.integrity, 'sha512-60cyAOytib/OzBw1JNSoSV/boK1AtHryDIjvVBk7XbN4ugfkM3+Sry7fEjNgPMGgOjuaZPAp8ruZ0Cxafwyq9g==');
  assert.equal(utils.resolved, 'https://registry.npmjs.org/@cacheable/utils/-/utils-2.5.0.tgz');
  assert.equal(utils.integrity, 'sha512-buipgOVDkkPXNR5+xBpDw7Zk2n1EvU7qBJCNUcL7rhQ//kfpOXPAvQ511Os0vpLYJ1pZnvudNytkQt2hst3wqA==');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});

test('pull-request CI enforces the high/critical npm audit gate', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.match(workflow, /AUDIT_RESULT/);
  assert.match(workflow, /steps\.audit\.outputs\.result/);
});

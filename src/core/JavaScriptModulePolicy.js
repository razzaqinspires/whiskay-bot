import path from 'node:path';

const HOT_SAFE_ROOTS = new Set(['lib', 'utils']);
const RESTART_ROOTS = new Set(['core', 'services', 'jobs', 'handlers', 'middlewares', 'workers', 'cognitive', 'config']);

export function normalizeSourcePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..')) return null;
  if (!parts.at(-1).toLowerCase().endsWith('.js') && !parts.at(-1).toLowerCase().endsWith('.cjs')) return null;
  return parts.join('/');
}

export function classifyJavaScriptChange(relativePath) {
  const file = normalizeSourcePath(relativePath);
  if (!file || file.startsWith('plugins/') || file.startsWith('lib/external/')) return { eligible: false, strategy: 'ignore', reason: 'protected-third-party-library' };
  const root = file.split('/')[0];
  if (HOT_SAFE_ROOTS.has(root)) {
    return { eligible: true, strategy: 'restart-required', reason: 'module-lifecycle-not-yet-managed', file, root };
  }
  if (RESTART_ROOTS.has(root)) return { eligible: true, strategy: 'graceful-restart', reason: 'runtime-state-or-import-graph', file, root };
  return { eligible: true, strategy: 'graceful-restart', reason: 'unknown-module-boundary', file, root };
}

export function planJavaScriptReload(changes = [], sourceDir = 'src') {
  const items = changes.map(change => {
    const file = typeof change === 'string' ? change : change?.file;
    const kind = typeof change === 'string' ? 'change' : (change?.kind || 'change');
    const classification = classifyJavaScriptChange(file);
    return { ...classification, kind, absolutePath: classification.file ? path.resolve(sourceDir, classification.file) : null };
  }).filter(item => item.eligible);
  const syntaxFiles = items.filter(item => item.kind !== 'unlink').map(item => item.absolutePath);
  return {
    eligible: items.length > 0,
    strategy: items.some(item => item.strategy === 'graceful-restart') ? 'graceful-restart' : 'restart-required',
    items, syntaxFiles,
    deletedFiles: items.filter(item => item.kind === 'unlink').map(item => item.absolutePath)
  };
}

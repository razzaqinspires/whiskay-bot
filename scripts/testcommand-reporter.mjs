// Machine-readable Node.js test reporter for Whiskay QA progress and diagnostics.
// Uses the stable TestsStream event API; structured failure details are retained in JSONL.
function serializableError(error, depth = 0) {
  if (error === null || error === undefined) return null;
  if (typeof error === 'string') return error.slice(0, 30000);
  if (typeof error !== 'object') return error;
  if (depth > 4) return '[maximum error detail depth reached]';
  const keys = ['name', 'message', 'stack', 'code', 'failureType', 'operator', 'expected', 'actual', 'cause', 'errors'];
  const result = {};
  for (const key of keys) {
    if (!(key in error)) continue;
    const value = error[key];
    if (value === undefined || typeof value === 'function') continue;
    if (key === 'cause') result[key] = serializableError(value, depth + 1);
    else if (key === 'errors' && Array.isArray(value)) result[key] = value.slice(0, 20).map(item => serializableError(item, depth + 1));
    else if (typeof value === 'string') result[key] = value.slice(0, 30000);
    else {
      try { result[key] = JSON.parse(JSON.stringify(value)); }
      catch { result[key] = String(value); }
    }
  }
  return Object.keys(result).length ? result : String(error).slice(0, 30000);
}

export default async function* whiskayProgressReporter(source) {
  const counts = { discovered: 0, completed: 0, passed: 0, failed: 0, skipped: 0 };
  const emit = event => JSON.stringify({ source: 'whiskay-node-test', ...event }) + '\n';

  for await (const event of source) {
    const data = event?.data || {};
    if (event.type === 'test:enqueue') {
      // Node also enqueues a synthetic file wrapper; it is not counted in `# tests`.
      const fileName = String(data.file || '').split(/[\\/]/).pop();
      const isFileWrapper = (data.name === fileName || String(data.file || '').replaceAll('\\', '/').endsWith(`/${data.name}`)) && Number(data.line) === 1 && Number(data.column) === 1;
      if (!isFileWrapper) {
        counts.discovered += 1;
        yield emit({ type: 'discovered', counts: { ...counts }, name: data.name, file: data.file, line: data.line, column: data.column });
      }
      continue;
    }
    if (event.type === 'test:diagnostic' || event.type === 'test:stdout' || event.type === 'test:stderr') {
      yield emit({ type: 'diagnostic', message: String(data.message || ''), file: data.file, line: data.line, column: data.column });
      continue;
    }
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      counts.completed += 1;
      if (event.type === 'test:pass') counts.passed += 1;
      else counts.failed += 1;
      if (data.details?.skip) counts.skipped += 1;
      yield emit({
        type: event.type === 'test:pass' ? 'pass' : 'fail',
        counts: { ...counts },
        name: data.name,
        file: data.file,
        line: data.line,
        column: data.column,
        durationMs: data.details?.duration_ms ?? null,
        details: data.details ? {
          skip: data.details.skip || false,
          todo: data.details.todo || false,
          failureType: data.details.type || data.details.failureType || null,
        } : null,
        error: event.type === 'test:fail' ? serializableError(data.details?.error || data.error) : undefined,
      });
    }
  }

  yield emit({ type: 'summary', counts: { ...counts }, tests: counts.completed, passed: counts.passed, failed: counts.failed, skipped: counts.skipped });
}

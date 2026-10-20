/**
 * Simple line-based diff using multiset matching.
 * Returns: { added: [{line,text}], removed: [{line,text}], addedCount, removedCount }
 */
export function diffLines(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  const oldMap = new Map();
  oldLines.forEach((l, i) => {
    if (!oldMap.has(l)) oldMap.set(l, []);
    oldMap.get(l).push(i + 1);
  });

  const added = [];
  newLines.forEach((line, i) => {
    const positions = oldMap.get(line);
    if (positions && positions.length) {
      positions.shift();          // matched → consume
    } else {
      added.push({ line: i + 1, text: line });
    }
  });

  const removed = [];
  for (const [text, positions] of oldMap.entries()) {
    for (const ln of positions) removed.push({ line: ln, text });
  }

  return {
    added, removed,
    addedCount: added.length,
    removedCount: removed.length
  };
}

/** Compact unified-ish preview string */
export function diffPreview(diff, { maxLines = 20 } = {}) {
  const out = [];
  for (const a of diff.added.slice(0, maxLines)) out.push(`+ ${a.line}: ${a.text}`);
  for (const r of diff.removed.slice(0, Math.max(0, maxLines - out.length))) out.push(`- ${r.line}: ${r.text}`);
  const total = diff.addedCount + diff.removedCount;
  if (total > out.length) out.push(`… +${total - out.length} more`);
  return out.join('\n');
}

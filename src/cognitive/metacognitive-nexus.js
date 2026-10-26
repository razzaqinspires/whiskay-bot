/**
 * Lightweight metacognitive request planner. This is a bounded heuristic scaffold,
 * not a claim of sentience. It classifies task shape and adds an explicit self-check
 * instruction while keeping runtime memory proportional to the prompt limit.
 */
const MAX_INPUT = 3500;
export function planCognitiveRequest(input) {
  const prompt = String(input || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_INPUT);
  const tokens = prompt.match(/[\p{L}\p{N}_]+/gu) || [];
  const math = /[=+*/^]|\b(hitung|solve|integral|persamaan|rumus)\b/i.test(prompt);
  const multiStep = /\b(rencana|langkah|analisis|bandingkan|debug|implementasi|desain)\b/i.test(prompt) || tokens.length > 70;
  const mode = math ? 'structured-math' : multiStep ? 'multi-step' : 'conversational';
  return { prompt, mode, tokenCount: Math.min(tokens.length, 500), systemSuffix: `\nMode kognitif: ${mode}. Susun rencana internal singkat untuk tugas multi-langkah, cek ulang konsistensi hasil, bedakan fakta dari asumsi, nyatakan ketidakpastian yang relevan, dan jangan mengklaim telah melakukan tindakan eksternal. Ini adalah heuristik perangkat lunak; jangan mengklaim memiliki kesadaran atau AGI yang telah terbukti.` };
}

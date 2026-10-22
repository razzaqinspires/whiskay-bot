const MAX_PROMPT = 3500;
const DEFAULT_SYSTEM = 'Kamu adalah WHISKAY AI, asisten virtual yang ramah, ringkas, membantu, dan menjawab dalam Bahasa Indonesia kecuali pengguna meminta bahasa lain. Jangan mengarang fakta jika tidak yakin.';
function clean(value, max = 5000) { return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max); }
async function requestOpenAI(prompt, system) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY belum disetel.');
  const response = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.7, max_tokens: 700, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  return data?.choices?.[0]?.message?.content;
}
async function requestGemini(prompt, system) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY belum disetel.');
  const model = encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-2.0-flash');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 800 } }),
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n');
}
export default {
  name: 'ai-chat', command: ['ask', 'ai'], category: 'tools', cooldown: 2500,
  description: 'Percakapan asisten AI melalui OpenAI atau Gemini',
  async execute(ctx) {
    const prompt = clean(ctx.args?.join(' ') || '', MAX_PROMPT);
    if (!prompt) return ctx.reply(`🤖 *WHISKAY AI*\nGunakan: ${ctx.prefix}ask pertanyaan kamu\nContoh: ${ctx.prefix}ai bantu buat rencana belajar 7 hari.`);
    const provider = String(process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'gemini')).toLowerCase();
    const system = clean(process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM, 1200);
    try {
      const answer = provider === 'gemini' ? await requestGemini(prompt, system) : await requestOpenAI(prompt, system);
      const text = clean(answer, 6000);
      if (!text) throw new Error('AI tidak mengembalikan jawaban.');
      return ctx.reply(`🤖 *WHISKAY AI* · ${provider.toUpperCase()}\n\n${text}${text.length >= 5900 ? '…' : ''}`);
    } catch (error) {
      console.error('[AI CHAT] request failed:', error?.message || error);
      const missing = /API_KEY belum disetel/.test(String(error?.message || ''));
      return ctx.reply(missing ? '⚙️ API key AI belum disetel. Isi OPENAI_API_KEY atau GEMINI_API_KEY di `.env`, lalu restart bot.' : '⚠️ Asisten AI sedang tidak tersedia atau batas API tercapai. Coba lagi sebentar.');
    }
  }
};

import { planCognitiveRequest } from '../../cognitive/metacognitive-nexus.js';
import { getConversation, appendConversation } from '../../cognitive/short-term-memory.js';
const MAX_PROMPT = 3500;
const DEFAULT_SYSTEM = 'Kamu adalah Nexora, AI dari Razzaq Ventures yang ramah, jernih, teliti, adaptif, dan menjawab dalam Bahasa Indonesia kecuali diminta bahasa lain. Gunakan penalaran bertahap secara internal, bedakan fakta dari asumsi, nyatakan ketidakpastian, dan jangan mengarang fakta. Kamu bukan makhluk sadar dan jangan mengklaim memiliki kesadaran, perasaan biologis, atau AGI. Gunakan tool/command hanya jika memang tersedia dan minta konfirmasi untuk tindakan berdampak.';
function clean(value, max = 5000) { return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max); }
function parseKeyValue(raw) { const value=String(raw||'').trim(); if(!value)return []; try { const parsed=JSON.parse(value); if(Array.isArray(parsed)) return parsed.map(x=>String(x).trim()).filter(Boolean).slice(0,12); } catch {} return value.split(/[;,\n]/).map(x=>x.trim()).filter(Boolean).slice(0,12); }
function parseKeys(name, legacy) { const primary=parseKeyValue(process.env[name]); return primary.length ? primary : parseKeyValue(process.env[legacy]); }
async function requestOpenAI(messages, system, keyOverride) {
  const key = keyOverride || parseKeys('OPENAI_API_KEYS','OPENAI_API_KEY')[0];
  if (!key) throw new Error('OPENAI_API_KEY belum disetel.');
  const response = await fetch(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.7, max_tokens: 700, messages: [{ role: 'system', content: system }, ...messages] }),
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  return data?.choices?.[0]?.message?.content;
}
async function requestGemini(messages, system, keyOverride) {
  const key = keyOverride || parseKeys('GEMINI_API_KEYS','GEMINI_API_KEY')[0];
  if (!key) throw new Error('GEMINI_API_KEY belum disetel.');
  const model = encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-2.0-flash');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: 0.7, maxOutputTokens: 800 } }),
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini HTTP ${response.status}`);
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n');
}
export default {
  name: 'ai-chat', command: ['ask', 'ai'], category: 'tools', cooldown: 2500, workload: 'ai',
  description: 'Percakapan asisten AI melalui OpenAI atau Gemini',
  async execute(ctx) {
    const rawPrompt = clean(ctx.args?.join(' ') || '', MAX_PROMPT);
    const cognitive = planCognitiveRequest(rawPrompt);
    const prompt = cognitive.prompt;
    if (cognitive.requiresClarification) { const labels={download:'Unduh',donation:'Donasi',code:'Kode/Debug',translation:'Terjemahan',weather:'Cuaca',game:'Game/RPG'}; return ctx.sendInteractive({title:'🧭 Klarifikasi Intent',body:`Saya belum cukup yakin dengan maksud pesan ini (confidence ${Math.round(cognitive.confidence*100)}%). Pilih topik yang dimaksud sebelum saya memprosesnya.`,buttons:cognitive.clarify.map(name=>({name:'quick_reply',title:labels[name]||name,id:`${ctx.prefix}ask ${labels[name]||name}: ${prompt}`}))}); }
    if (!prompt) return ctx.reply(`🧠 *NEXORA · RAZZAQ VENTURES*\nGunakan: ${ctx.prefix}ask pertanyaan kamu\nContoh: ${ctx.prefix}ai bantu buat rencana belajar 7 hari.`);
    const memoryUser = String(ctx.sender || ctx.chat || 'anonymous');
    const history = getConversation(memoryUser).slice(-8).map(({role,content,weight=1})=>({role,content:weight<0.25?`[MEMORI LAMA · relevansi rendah] ${content}`:content}));
    const messages = [...history, { role: 'user', content: prompt }];
    const preferred = String(process.env.AI_PROVIDER || (process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY ? 'openai' : 'gemini')).toLowerCase();
    const system = clean((process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM) + cognitive.systemSuffix, 1600);
    const providers = preferred === 'gemini' ? ['gemini','openai'] : ['openai','gemini'];
    const attempts=[];
    for (const provider of providers) {
      const keys = provider==='openai' ? parseKeys('OPENAI_API_KEYS','OPENAI_API_KEY') : parseKeys('GEMINI_API_KEYS','GEMINI_API_KEY');
      for (const key of keys) {
        try {
          const answer = provider === 'gemini' ? await requestGemini(messages, system, key) : await requestOpenAI(messages, system, key);
          const text = clean(answer, 6000);
          if (!text) throw new Error('AI tidak mengembalikan jawaban.');
          appendConversation(memoryUser, 'user', prompt);
          appendConversation(memoryUser, 'assistant', text);
          return ctx.reply(`🧠 *NEXORA* · ${provider.toUpperCase()}\n\n${text}${text.length >= 5900 ? '…' : ''}`);
        } catch (error) { attempts.push(`${provider}:${String(error?.message||'error').slice(0,90)}`); }
      }
    }
    console.error('[AI CHAT] all providers exhausted:', attempts.join(' | '));
    return ctx.reply(attempts.length ? '⚠️ Semua jalur AI sedang gagal atau mencapai limit. Coba lagi beberapa saat.' : '⚙️ Isi OPENAI_API_KEYS / GEMINI_API_KEYS (array JSON atau daftar dipisah koma) di `.env`, lalu restart bot.');
  }
};

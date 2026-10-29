/** Bounded heuristic planner; this is not a claim of sentience or a probabilistic model. */
const MAX_INPUT=3500;
const INTENTS=[
 {name:'download',terms:/\b(download|unduh|unduhan|ambil video|save video)\b/i},
 {name:'donation',terms:/\b(donasi|donation|donate|sumbang|pembayaran)\b/i},
 {name:'code',terms:/\b(kode|coding|debug|bug|program|script|implementasi)\b/i},
 {name:'translation',terms:/\b(terjemah|translate|bahasa|translatekan)\b/i},
 {name:'weather',terms:/\b(cuaca|weather|hujan|suhu)\b/i},
 {name:'game',terms:/\b(game|rpg|dungeon|quest|gacha|boss)\b/i}
];
export function planCognitiveRequest(input){
 const prompt=String(input||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,MAX_INPUT);
 const tokens=prompt.match(/[\p{L}\p{N}_]+/gu)||[],math=/[=+*/^]|\b(hitung|solve|integral|persamaan|rumus)\b/i.test(prompt),multiStep=/\b(rencana|langkah|analisis|bandingkan|debug|implementasi|desain)\b/i.test(prompt)||tokens.length>70;
 const mode=math?'structured-math':multiStep?'multi-step':'conversational';
 const candidates=INTENTS.filter(i=>i.terms.test(prompt)).map(i=>i.name);const ambiguous=candidates.length>1;
 const confidence=prompt.length<3?0.2:ambiguous?0.62:(tokens.length<3?0.68:Math.min(.96,.72+Math.min(tokens.length,24)*.01));
 const clarify=ambiguous?candidates.slice(0,3):[];
 return {prompt,mode,tokenCount:Math.min(tokens.length,500),intentCandidates:candidates,confidence,requiresClarification:confidence<.7&&clarify.length>0,clarify,systemSuffix:`\nMode kognitif: ${mode}. Periksa konsistensi jawaban, sebutkan asumsi penting, dan jangan mengklaim telah melakukan tindakan eksternal. Estimasi confidence intent: ${Math.round(confidence*100)}%; jika intent ambigu, tanyakan klarifikasi sebelum tindakan eksternal.`};
}

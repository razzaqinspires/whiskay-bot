export const GACHA_RATES = Object.freeze({ SSR: 0.03, SR: 0.17, R: 0.80, hardPity: 50 });
export const GACHA_POOL = Object.freeze([
  { id:'spirit-lyra', name:'Lyra, Starbound Oracle', rarity:'SSR', type:'spirit', power:18, description:'Oracle bintang yang meningkatkan serangan sihir.' },
  { id:'spirit-kael', name:'Kael, Ember Knight', rarity:'SSR', type:'spirit', power:16, description:'Ksatria bara dengan daya serang tinggi.' },
  { id:'spirit-mira', name:'Mira, Verdant Warden', rarity:'SR', type:'spirit', power:10, description:'Penjaga hutan yang memperkuat pertahanan.' },
  { id:'spirit-oren', name:'Oren, Rune Smith', rarity:'SR', type:'spirit', power:9, description:'Pandai besi rune untuk ekspedisi panjang.' },
  { id:'spirit-wisp', name:'Azure Wisp', rarity:'R', type:'spirit', power:4, description:'Spirit kecil yang menyimpan energi Aether.' },
  { id:'spirit-mote', name:'Amber Mote', rarity:'R', type:'spirit', power:3, description:'Mote berwarna amber untuk koleksi spirit.' },
]);

export function getGachaRarity(roll, pity = 0) {
  if (Number(pity) >= GACHA_RATES.hardPity - 1 || roll < GACHA_RATES.SSR) return 'SSR';
  if (roll < GACHA_RATES.SSR + GACHA_RATES.SR) return 'SR';
  return 'R';
}

export function rollGacha(count = 1, startingPity = 0, random = Math.random) {
  const pulls = [];
  let pity = Math.max(0, Number(startingPity) || 0);
  for (let i = 0; i < count; i++) {
    const rarity = getGachaRarity(random(), pity);
    const candidates = GACHA_POOL.filter(item => item.rarity === rarity);
    const item = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    pulls.push(item);
    pity = rarity === 'SSR' ? 0 : pity + 1;
  }
  return { pulls, pity };
}

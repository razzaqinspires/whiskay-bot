const clampText = (value, max = 160) => String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const archetypes = [
  ['Vanguard', 'Frontliner seimbang', 'Pedang baja', 'Menahan garis depan dan melindungi party'],
  ['Arcanist', 'Pengendali sihir', 'Grimoire tua', 'Mengurai rune dan menyerang dari jarak aman'],
  ['Ranger', 'Penjelajah jarak jauh', 'Busur komposit', 'Membaca jejak, mengintai, dan menyerang presisi'],
  ['Warden', 'Penjaga alam', 'Tombak kayu hidup', 'Mengendalikan medan dan memulihkan rekan'],
  ['Shadow', 'Infiltrator lincah', 'Belati kembar', 'Menyelinap, menghindar, dan mencari celah']
];
export default {
  name: 'character', command: ['character', 'karakter'], menuCommands: ['character'], category: 'games', cooldown: 2500,
  description: 'Buat konsep karakter RPG yang dapat dikembangkan ke profil pemain',
  async execute(ctx) {
    const idea = clampText((ctx.args || []).join(' '), 400);
    const index = Math.abs([...String(idea || ctx.sender || 'whiskay')].reduce((n, c) => n * 31 + c.charCodeAt(0), 7)) % archetypes.length;
    const [className, role, weapon, ability] = archetypes[index];
    const name = clampText(idea.split(/\s+/).slice(0, 3).join(' '), 40) || 'The Wayfarer';
    const body = `WHISKAY RPG · CHARACTER CONCEPT\nNama konsep: ${name}\nArketipe: ${className}\nPeran: ${role}\nSenjata: ${weapon}\nKemampuan khas: ${ability}\n\nAtribut awal (konsep, belum mengubah database pemain):\nSTR ${8 + index} · AGI ${12 - index} · INT ${9 + index * 2} · VIT ${10 + index}\n\nIni adalah generator konsep lokal deterministik, bukan klaim bahwa karakter sudah disimpan ke RPG. Gunakan .profile untuk melihat progres pemain.`;
    return ctx.sendInteractive({ title: '🧙 Character Forge', subtitle: 'Konsep karakter Whiskay', body, buttons: [
      { name: 'quick_reply', title: 'Buat variasi', id: `${ctx.prefix}character ${idea || 'adventurer'}` },
      { name: 'quick_reply', title: 'Imagine karakter', id: `${ctx.prefix}imagine anime RPG character ${name}, ${className}, fantasy concept art` },
      { name: 'quick_reply', title: 'Profile', id: `${ctx.prefix}profile` }
    ] });
  }
};

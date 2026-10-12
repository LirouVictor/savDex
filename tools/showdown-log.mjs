// Leitura do registro de uma partida do Pokémon Showdown (o "log" de replay.pokemonshowdown.com/<id>.json): o que
// apareceu de cada jogador. Usado por build-tourteams.mjs; só os campos que o importador transforma em dados derivados.

// O que apareceu de cada lado num jogo: as 6 espécies e, de cada Pokémon, golpes usados, item, habilidade e megaevolução
export function parseLog(log) {
  const side = { p1: { name: null, preview: [], mons: new Map() }, p2: { name: null, preview: [], mons: new Map() } };
  let winner = null;
  const nick = new Map(); // "p1a: Nome" → registro
  const monOf = (ref, details) => {
    const m = /^(p[12])[a-z]?: (.*)$/.exec(ref || '');
    if (!m) return null;
    const key = `${m[1]}: ${m[2]}`;
    if (!nick.has(key) && details) {
      const species = details.split(',')[0].trim();
      const s = side[m[1]];
      const base = species.replace(/-.*$/, '');
      let rec = s.mons.get(species) || [...s.mons.values()].find(x => x.preview.replace(/-\*$/, '') === base && !x.seen);
      if (!rec) { rec = { preview: species, species, moves: new Set(), item: null, ability: null, mega: null, tricked: false, seen: false }; s.mons.set(species, rec); }
      rec.species = species; rec.seen = true;
      nick.set(key, rec);
    }
    return nick.get(key) || null;
  };
  const zpower = new Set();
  for (const line of log.split('\n')) {
    const a = line.split('|');
    const cmd = a[1];
    if (cmd === 'player' && a[3]) side[a[2]].name = a[3];
    else if (cmd === 'poke') {
      const species = a[3].split(',')[0].trim();
      side[a[2]].preview.push(species);
      side[a[2]].mons.set(species, { preview: species, species, moves: new Set(), item: null, ability: null, mega: null, tricked: false, seen: false });
    } else if (cmd === 'switch' || cmd === 'drag' || cmd === 'replace') monOf(a[2], a[3]);
    else if (cmd === 'detailschange') {
      const r = monOf(a[2]);
      if (r) { const sp = a[3].split(',')[0].trim(); if (/-Mega|-Primal/.test(sp)) r.mega = sp; }
    } else if (cmd === '-mega') {
      const r = monOf(a[2]);
      if (r && a[4]) { r.item = r.item || a[4]; }
    } else if (cmd === '-zpower') zpower.add(a[2].slice(0, 2));
    else if (cmd === 'move') {
      const r = monOf(a[2]);
      const p = a[2].slice(0, 2);
      if (zpower.has(p)) { zpower.delete(p); continue; }
      if (r && !a.slice(5).some(x => x.startsWith('[from]')) && a[3] !== 'Struggle') r.moves.add(a[3]);
      if (r && (a[3] === 'Trick' || a[3] === 'Switcheroo')) { r.tricked = true; const t = monOf(a[4]); if (t) t.tricked = true; }
    } else if (cmd === '-item' || cmd === '-enditem') {
      // O item é do Pokémon da linha, menos quando chegou por troca ou roubo (Trick, Thief…)
      const r = monOf(a[2]);
      const from = a.find(x => x.startsWith('[from]')) || '';
      if (r && !r.tricked && !r.item && !/Trick|Switcheroo|Thief|Covet|Bestow|Pickpocket|Magician|Symbiosis/.test(from)) r.item = a[3];
    } else if (cmd === '-activate' && /^(ability|item): /.test(a[3] || '')) {
      const r = monOf(a[2]);
      const [, kind, val] = /^(ability|item): (.*)$/.exec(a[3]);
      if (r && kind === 'ability' && !r.ability) r.ability = val;
      if (r && kind === 'item' && !r.item && !r.tricked) r.item = val;
    } else if (cmd === '-ability') {
      const r = monOf(a[2]);
      const from = a.find(x => x.startsWith('[from]')) || '';
      if (r && !r.ability && !/Trace|Skill Swap|Role Play|Entrainment|Receiver|Power of Alchemy|Doodle/.test(from)) r.ability = a[3];
    } else if (cmd === 'win') winner = a[2];
    // Item e habilidade revelados por outro efeito: "[from] item: X" / "[from] ability: X" (do "[of]" ou do primeiro alvo)
    if (cmd !== '-ability' && cmd !== '-item' && cmd !== '-enditem') {
      const from = a.find(x => /^\[from\] (item|ability): /.test(x));
      if (from) {
        const of = a.find(x => x.startsWith('[of] '));
        const r = monOf(of ? of.slice(5) : a[2]);
        const [, kind, val] = /^\[from\] (item|ability): (.*)$/.exec(from);
        if (r && kind === 'item' && !r.item && !r.tricked) r.item = val;
        if (r && kind === 'ability' && !r.ability) r.ability = val;
      }
    }
  }
  return { side, winner };
}

// Um set com o que apareceu, para o derivador comum (member)
export function seenSet(rec) {
  const species = rec.species.replace(/-\*$/, '');
  return { species: rec.mega ? species.replace(/-Mega.*|-Primal$/, '') : species, item: rec.item, ability: rec.ability, moves: [...rec.moves] };
}


// Estratégias (clima, terreno, Trick Room) e papéis de cada Pokémon, calculados pelo app a partir dos tipos,
// habilidades, golpes, item e stats base. A IA recebe isso pronto: não depende da memória dela sobre a espécie.
// Base: guias de montagem de times (Smogon, VGC): um plano por time; num time de clima, quem põe, 2 ou mais
// que aproveitam, quem o clima protege e quem segura o que ameaça o clima.

import { t } from '../i18n.js';

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Habilidades que põem clima/terreno
export const FIELD = {
  Drizzle: 'chuva', Drought: 'sol', 'Sand Stream': 'tempestade de areia', 'Snow Warning': 'neve/granizo',
  'Electric Surge': 'Electric Terrain', 'Psychic Surge': 'Psychic Terrain', 'Grassy Surge': 'Grassy Terrain', 'Misty Surge': 'Misty Terrain',
};
// Habilidades que aproveitam
export const ABUSERS = {
  'Swift Swim': 'chuva', 'Rain Dish': 'chuva', Hydration: 'chuva', 'Dry Skin': 'chuva',
  Chlorophyll: 'sol', 'Solar Power': 'sol', 'Flower Gift': 'sol', Protosynthesis: 'sol', 'Orichalcum Pulse': 'sol',
  'Sand Rush': 'tempestade de areia', 'Sand Force': 'tempestade de areia', 'Sand Veil': 'tempestade de areia',
  'Slush Rush': 'neve/granizo', 'Ice Body': 'neve/granizo', 'Snow Cloak': 'neve/granizo',
  'Surge Surfer': 'Electric Terrain', 'Quark Drive': 'Electric Terrain', 'Hadron Engine': 'Electric Terrain', 'Grass Pelt': 'Grassy Terrain',
};
// Golpes que ficam mais fortes, mais certeiros, curam mais ou ganham prioridade com o clima/terreno
export const MOVE_ABUSERS = {
  'Grassy Glide': ['Grassy Terrain'], 'Rising Voltage': ['Electric Terrain'], 'Expanding Force': ['Psychic Terrain'], 'Misty Explosion': ['Misty Terrain'],
  'Solar Beam': ['sol'], 'Solar Blade': ['sol'], 'Hydro Steam': ['sol'], Moonlight: ['sol'], 'Morning Sun': ['sol'], Synthesis: ['sol'],
  Thunder: ['chuva'], Hurricane: ['chuva'], 'Electro Shot': ['chuva'], 'Bleakwind Storm': ['chuva'], 'Wildbolt Storm': ['chuva'], 'Sandsear Storm': ['chuva'],
  Blizzard: ['neve/granizo'], 'Aurora Veil': ['neve/granizo'], 'Shore Up': ['tempestade de areia'],
  'Weather Ball': ['chuva', 'sol', 'tempestade de areia', 'neve/granizo'],
};
export const FIELD_MOVES = {
  'Rain Dance': 'chuva', 'Sunny Day': 'sol', Sandstorm: 'tempestade de areia', Hail: 'neve/granizo', Snowscape: 'neve/granizo',
  'Electric Terrain': 'Electric Terrain', 'Psychic Terrain': 'Psychic Terrain', 'Grassy Terrain': 'Grassy Terrain', 'Misty Terrain': 'Misty Terrain',
};
// Megapedras cuja megaevolução põe ou aproveita um clima (habilidade da forma mega)
export const MEGA_FIELD = { 'Charizardite Y': 'sol', Tyranitarite: 'tempestade de areia', Abomasite: 'neve/granizo' };
export const MEGA_ABUSERS = { Houndoominite: 'sol', Swampertite: 'chuva', Garchompite: 'tempestade de areia' };

// O que cada clima fortalece e enfraquece (dano dos golpes desse tipo, dos dois lados)
const WEATHER = { sol: { boosts: 'fire', weakens: 'water' }, chuva: { boosts: 'water', weakens: 'fire' } };
// Habilidades que seguram o que ameaça o clima (absorvem o tipo que costuma bater nos membros)
const ANSWERS = {
  chuva: ['Lightning Rod', 'Volt Absorb', 'Motor Drive', 'Sap Sipper'],
  sol: ['Storm Drain', 'Water Absorb', 'Flash Fire'],
};

/** Põe e aproveita clima, terreno ou Trick Room: habilidade (e as trocáveis no modo livre), golpe ou megapedra. */
export function strategyOf(m, alts = []) {
  const set = new Set(), use = new Set();
  for (const ab of [m.ability && m.ability.name, ...alts]) {
    if (ab && FIELD[ab]) set.add(FIELD[ab]);
    if (ab && ABUSERS[ab]) use.add(ABUSERS[ab]);
  }
  const item = m.item && m.item.name;
  if (item && MEGA_FIELD[item]) set.add(MEGA_FIELD[item]);
  if (item && MEGA_ABUSERS[item]) use.add(MEGA_ABUSERS[item]);
  for (const mv of m.moves) {
    if (FIELD_MOVES[mv.name]) set.add(FIELD_MOVES[mv.name]);
    if (mv.name === 'Trick Room') set.add('Trick Room');
    for (const f of MOVE_ABUSERS[mv.name] || []) use.add(f);
  }
  return { set, use };
}

// Papéis pelos golpes (nomes dos golpes em inglês, como no save)
const MOVE_ROLES = {
  setup: ['Swords Dance', 'Dragon Dance', 'Nasty Plot', 'Calm Mind', 'Quiver Dance', 'Shell Smash', 'Bulk Up', 'Coil', 'Shift Gear',
    'Victory Dance', 'Growth', 'Agility', 'Rock Polish', 'Tail Glow', 'Belly Drum', 'Geomancy', 'No Retreat', 'Clangorous Soul',
    'Tidy Up', 'Fillet Away', 'Work Up', 'Hone Claws', 'Curse', 'Autotomize', 'Trailblaze', 'Flame Charge', 'Power-Up Punch'],
  pivô: ['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport', 'Chilly Reception', 'Shed Tail', 'Baton Pass'],
  prioridade: ['Extreme Speed', 'Aqua Jet', 'Bullet Punch', 'Ice Shard', 'Mach Punch', 'Quick Attack', 'Shadow Sneak', 'Sucker Punch',
    'Vacuum Wave', 'Accelerock', 'Jet Punch', 'Grassy Glide', 'First Impression', 'Fake Out', 'Water Shuriken', 'Thunderclap', 'Feint'],
  'controle de velocidade': ['Tailwind', 'Trick Room', 'Thunder Wave', 'Icy Wind', 'Electroweb', 'Sticky Web', 'Glare', 'Nuzzle',
    'Bulldoze', 'Rock Tomb', 'Scary Face', 'Cotton Spore', 'String Shot', 'Low Sweep'],
  recuperação: ['Recover', 'Roost', 'Slack Off', 'Soft-Boiled', 'Moonlight', 'Morning Sun', 'Synthesis', 'Milk Drink', 'Shore Up',
    'Wish', 'Rest', 'Strength Sap', 'Lunar Blessing', 'Jungle Healing', 'Heal Order'],
  status: ['Will-O-Wisp', 'Thunder Wave', 'Toxic', 'Spore', 'Sleep Powder', 'Yawn', 'Hypnosis', 'Glare', 'Stun Spore', 'Nuzzle'],
  hazards: ['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web', 'Stone Axe', 'Ceaseless Edge'],
  'tira hazards': ['Rapid Spin', 'Defog', 'Mortal Spin', 'Court Change', 'Tidy Up'],
  telas: ['Reflect', 'Light Screen', 'Aurora Veil'],
};
const ROLE_OF_MOVE = new Map();
for (const [role, moves] of Object.entries(MOVE_ROLES)) for (const mv of moves) ROLE_OF_MOVE.set(mv, [...(ROLE_OF_MOVE.get(mv) || []), role]);
const SPE = 5; // stats base na ordem HP/Atk/Def/SpA/SpD/Spe

/** Papéis de um Pokémon pelos golpes que ele tem e pelos stats base (lento para Trick Room, tanque). */
export function rolesOf(m) {
  const roles = new Set();
  for (const mv of m.moves) for (const r of ROLE_OF_MOVE.get(mv.name) || []) roles.add(r);
  const b = m.species.baseStats;
  if (b) {
    if (b[SPE] <= 50) roles.add('lento (Trick Room)');
    if (b[0] + b[2] + b[4] >= 270 && Math.max(b[1], b[3]) <= 105) roles.add('tanque');
  }
  return [...roles];
}

const isWeak = (T, idx, atk, types) => types.length && types.reduce((x, d) => x * (idx.has(d) ? T.typechart[idx.get(atk)][idx.get(d)] : 1), 1) > 1;
const names = (list, ref, max = 8) => list.slice(0, max).map(ref).join(', ') + (list.length > max ? ` (+${list.length - max})` : '');

/**
 * Pistas por estratégia entre os disponíveis: quem põe, quem aproveita, quem o clima protege, quem segura o que
 * ameaça o clima; Trick Room com os lentos. Mais forte (mais Pokémon que aproveitam) primeiro.
 * @param {object[]} pool
 * @param {(m: object) => string} ref referência do Pokémon (E1, C3-12)
 * @param {(m: object) => {name: string, item: string}[]} altsOf habilidades trocáveis (modo livre)
 */
export function strategyReport(pool, T, ref, altsOf = () => []) {
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const fields = new Map();
  const get = f => fields.get(f) || fields.set(f, { set: [], use: new Map() }).get(f);
  const room = [];
  for (const m of pool) {
    const ab = m.ability && m.ability.name, item = m.item && m.item.name;
    if (ab && FIELD[ab]) get(FIELD[ab]).set.push(`${ref(m)} (${ab})`);
    if (item && MEGA_FIELD[item]) get(MEGA_FIELD[item]).set.push(`${ref(m)} (${item})`);
    const use = (f, why) => { const u = get(f).use; if (!u.has(m)) u.set(m, why); };
    if (ab && ABUSERS[ab]) use(ABUSERS[ab], ab);
    if (item && MEGA_ABUSERS[item]) use(MEGA_ABUSERS[item], item);
    for (const a of altsOf(m)) {
      const how = `${a.name}, ${t('com {item}', { item: a.item })}`;
      if (FIELD[a.name]) get(FIELD[a.name]).set.push(`${ref(m)} (${how})`);
      if (ABUSERS[a.name]) use(ABUSERS[a.name], how);
    }
    for (const mv of m.moves) {
      for (const f of MOVE_ABUSERS[mv.name] || []) use(f, mv.name);
      if (FIELD_MOVES[mv.name] && !(ab && FIELD[ab] === FIELD_MOVES[mv.name])) get(FIELD_MOVES[mv.name]).set.push(`${ref(m)} (${mv.name})`);
      if (mv.name === 'Trick Room' && !room.includes(m)) room.push(m);
    }
  }
  const out = [...fields].filter(([, x]) => x.set.length).sort((a, b) => b[1].use.size - a[1].use.size).map(([f, x]) => {
    const parts = [t('põem {list}', { list: x.set.join(', ') }),
      x.use.size ? t('aproveitam ({n}): {list}', { n: x.use.size, list: names([...x.use], ([m, why]) => `${ref(m)} (${why})`) }) : t('ninguém aproveita (habilidade ou golpe)')];
    const w = WEATHER[f];
    if (w) {
      const covered = pool.filter(m => isWeak(T, idx, w.weakens, m.species.types));
      if (covered.length) parts.push(t('o clima corta a fraqueza a {type} de {list}', { type: cap(w.weakens), list: names(covered, ref, 6) }));
      const answers = pool.filter(m => m.ability && (ANSWERS[f] || []).includes(m.ability.name));
      if (answers.length) parts.push(t('seguram o que ameaça o clima: {list}', { list: names(answers, m => `${ref(m)} (${m.ability.name})`, 6) }));
    }
    return `- ${t(f)}: ${parts.join('; ')}.`;
  });
  if (room.length) {
    const slow = pool.filter(m => m.species.baseStats && m.species.baseStats[SPE] <= 50);
    out.push(`- Trick Room: ${t('põem {list}', { list: room.map(ref).join(', ') })}; ${slow.length ? t('lentos que aproveitam ({n}): {list}', { n: slow.length, list: names(slow, ref) }) : t('nenhum lento para aproveitar')}.`);
  }
  return out;
}

/**
 * Alertas de sinergia da equipe escolhida (o app confere; a IA não precisa contar): climas diferentes postos na
 * mesma equipe, quem põe o clima com menos de 2 que aproveitam, e membros com a fraqueza que o clima fortalece.
 */
export function synergyWarnings(team, T, ref) {
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const roles = team.map(m => strategyOf(m));
  const weathers = ['sol', 'chuva', 'tempestade de areia', 'neve/granizo'];
  const set = new Map();
  team.forEach((m, i) => { for (const f of roles[i].set) { if (!set.has(f)) set.set(f, []); set.get(f).push(m); } });
  const out = [];
  const onTeam = [...set.keys()].filter(f => weathers.includes(f));
  if (onTeam.length > 1) out.push(t('climas diferentes na mesma equipe ({list}): um apaga o outro', { list: onTeam.map(f => t(f)).join(', ') }));
  for (const [f, setters] of set) {
    if (f === 'Trick Room') continue;
    const users = team.filter((m, i) => roles[i].use.has(f));
    if (users.length < 2) out.push(t('{who} põe {field}, mas só {n} membro(s) aproveita(m)', { who: setters.map(ref).join(', '), field: t(f), n: users.length }));
    const w = WEATHER[f];
    if (w) {
      const hurt = team.filter(m => isWeak(T, idx, w.boosts, m.species.types));
      if (hurt.length) out.push(t('com {field}, {type} fica mais forte, e é fraqueza de {list}', { field: t(f), type: cap(w.boosts), list: hurt.map(ref).join(', ') }));
      const weakened = mv => mv.type === w.weakens && (mv.category === 0 || mv.category === 1) && !(MOVE_ABUSERS[mv.name] || []).includes(f);
      const lose = team.filter(m => m.species.types.includes(w.weakens) && m.moves.some(weakened));
      if (lose.length) out.push(t('com {field}, golpes {type} perdem metade da força: {list}', { field: t(f), type: cap(w.weakens), list: lose.map(ref).join(', ') }));
    }
  }
  return out;
}

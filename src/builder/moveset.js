// Moveset de cada Pokémon no montador: os 4 golpes que ele usaria, entre os que já sabe e os que pode aprender. No
// Quetzal, o menu do Pokémon (NOVO MOV.) ensina na hora e por ₽0 qualquer golpe do tutor (TUTOR) e os golpes por nível
// até o nível atual (NÍVEL; conferido no jogo: um Tyranitar Nv. 47 lista até o Rock Blast do Nv. 40, sem o Hyper Beam
// do 48). Os golpes por nível acima do nível atual precisam de treino. No SoulGold, os golpes da lista de TM/tutor da
// ROM (TM) precisam do item ou de achar o tutor no jogo: custam mais que os do menu do Quetzal.
//
// A escolha não depende do plano: dano contra cada tipo (o melhor golpe contra cada um dos 18 tipos puros, na média;
// isso já soma golpe do próprio tipo, cobertura e poder sem contar duas vezes golpes do mesmo tipo), mais o que os
// golpes de efeito valem (setup em quem ataca forte, recuperação em quem aguenta, hazards, pivô, status…), cada grupo
// uma vez. Golpes que só põem clima ou terreno (Rain Dance…) e o Trick Room ficam de fora: o plano decide quem põe
// (build.js). Com pouca diferença, fica o que ele já sabe.

import { PRIORITY_MOVES } from '../ai/strategy.js';

/** De onde vem o golpe do moveset. */
export const SRC = { known: 'known', now: 'now', tutor: 'tutor', tm: 'tm', level: 'level' };

// Poder de quem não tem poder fixo, ou bate mais (ou menos) do que o número diz
const EST = {
  'Seismic Toss': 75, 'Night Shade': 75, 'Super Fang': 50, Ruination: 55, 'Low Kick': 75, 'Grass Knot': 75, 'Heavy Slam': 75, 'Heat Crash': 75,
  'Gyro Ball': 70, 'Electro Ball': 70, 'Hard Press': 70, 'Crush Grip': 70, 'Wring Out': 70, Magnitude: 70, Return: 100, Frustration: 100,
  'Hidden Power': 60, 'Stored Power': 60, 'Power Trip': 60, Punishment: 60, Flail: 50, Reversal: 50, Eruption: 110, 'Water Spout': 110,
  'Dragon Energy': 110, Endeavor: 30, Psywave: 50, 'Trump Card': 50, 'Beat Up': 40, Fling: 30, Present: 25, 'Natural Gift': 0, 'Spit Up': 0,
  Counter: 40, 'Mirror Coat': 40, 'Metal Burst': 40, Bide: 20, 'Final Gambit': 0, Acrobatics: 80, 'Weather Ball': 60, 'Knock Off': 90,
  'Storm Throw': 90, 'Last Respects': 80, 'Rage Fist': 80, Facade: 75, Hex: 75, Venoshock: 70, Payback: 60, Avalanche: 60, Revenge: 60,
  Assurance: 60, 'Bolt Beak': 100, 'Fishious Rend': 100, Brine: 70, 'Grav Apple': 80, Pursuit: 50, 'Dragon Rage': 30, 'Sonic Boom': 20,
};
// Vários acertos: o poder é por acerto (Skill Link: 5)
const HITS = {
  'Bullet Seed': 3, 'Icicle Spear': 3, 'Rock Blast': 3, 'Pin Missile': 3, 'Tail Slap': 3, 'Bone Rush': 3, 'Scale Shot': 3, 'Arm Thrust': 3,
  'Water Shuriken': 3, 'Double Hit': 2, 'Dual Wingbeat': 2, 'Dual Chop': 2, 'Double Kick': 2, 'Bonemerang': 2, 'Dragon Darts': 2,
  'Twin Beam': 2, 'Gear Grind': 2, 'Double Iron Bash': 2, 'Tachyon Cutter': 2, 'Surging Strikes': 3, 'Triple Dive': 3, 'Triple Axel': 5,
  'Triple Kick': 5, 'Population Bomb': 6, 'Fury Attack': 3, 'Comet Punch': 3, 'Double Slap': 3, 'Spike Cannon': 3, 'Barrage': 3,
};
const MULTI = new Set(['Bullet Seed', 'Icicle Spear', 'Rock Blast', 'Pin Missile', 'Tail Slap', 'Bone Rush', 'Scale Shot', 'Arm Thrust', 'Water Shuriken',
  'Fury Attack', 'Comet Punch', 'Double Slap', 'Spike Cannon', 'Barrage']);
// O que o golpe perde na prática: para um turno ou carrega (Hyper Beam, Solar Beam), derruba quem usa, falha às vezes,
// prende o Pokémon, baixa os próprios stats, dano de volta…
const PEN = {
  'Hyper Beam': 0.5, 'Giga Impact': 0.5, 'Blast Burn': 0.5, 'Hydro Cannon': 0.5, 'Frenzy Plant': 0.5, 'Rock Wrecker': 0.5, 'Roar of Time': 0.5,
  'Prismatic Laser': 0.5, Eternabeam: 0.5, 'Meteor Assault': 0.5, 'Solar Beam': 0.5, 'Solar Blade': 0.5, 'Sky Attack': 0.5, 'Skull Bash': 0.5,
  'Razor Wind': 0.5, 'Freeze Shock': 0.5, 'Ice Burn': 0.5, 'Meteor Beam': 0.7, 'Electro Shot': 0.6, Dig: 0.75, Fly: 0.75, Bounce: 0.75,
  Dive: 0.75, 'Phantom Force': 0.75, 'Shadow Force': 0.75, Explosion: 0.25, 'Self-Destruct': 0.25, 'Misty Explosion': 0.25, 'Focus Punch': 0.4,
  'Dream Eater': 0.1, Belch: 0.3, 'Last Resort': 0.2, Synchronoise: 0.3, 'Future Sight': 0.7, 'Doom Desire': 0.7, 'Fake Out': 0.3,
  'First Impression': 0.6, 'Steel Beam': 0.6, 'Mind Blown': 0.6, 'Chloroblast': 0.7, Outrage: 0.85, 'Petal Dance': 0.85, Thrash: 0.85,
  'Raging Fury': 0.85, Uproar: 0.7, 'Draco Meteor': 0.85, Overheat: 0.85, 'Leaf Storm': 0.85, 'Psycho Boost': 0.85, 'Fleur Cannon': 0.85,
  'Make It Rain': 0.9, 'Close Combat': 0.95, Superpower: 0.9, 'V-create': 0.9, 'Headlong Rush': 0.95, 'Steel Roller': 0.3, Rollout: 0.4,
  'Ice Ball': 0.4, 'Fury Cutter': 0.4, 'Echoed Voice': 0.6, Snore: 0, Struggle: 0, 'Sucker Punch': 0.85, 'Burn Up': 0.85, 'Double Shock': 0.85,
  'Glaive Rush': 0.85, 'Hyper Drill': 1, 'Gigaton Hammer': 0.75, 'Blood Moon': 0.8, 'Head Smash': 0.85, 'Brave Bird': 0.9, 'Flare Blitz': 0.9,
  'Double-Edge': 0.9, 'Wood Hammer': 0.9, 'Wild Charge': 0.9, 'Wave Crash': 0.9, 'Volt Tackle': 0.9, 'Head Charge': 0.9, 'Light of Ruin': 0.85,
  'Take Down': 0.9, Submission: 0.85, 'High Jump Kick': 0.9, 'Jump Kick': 0.9,
};
const RECOIL = new Set(['Head Smash', 'Brave Bird', 'Flare Blitz', 'Double-Edge', 'Wood Hammer', 'Wild Charge', 'Wave Crash', 'Volt Tackle',
  'Head Charge', 'Light of Ruin', 'Take Down', 'Submission', 'High Jump Kick', 'Jump Kick', 'Steel Beam', 'Mind Blown', 'Chloroblast']);
const DROP = new Set(['Close Combat', 'Leaf Storm', 'Draco Meteor', 'Overheat', 'Superpower', 'V-create', 'Psycho Boost', 'Fleur Cannon',
  'Make It Rain', 'Hammer Arm', 'Clanging Scales', 'Spin Out', 'Armor Cannon', 'Headlong Rush', 'Ice Hammer', 'Dragon Ascent']);
// Golpes que usam outro stat: Body Press (Defesa), Foul Play (o Ataque do alvo)
const STAT_OF = { 'Body Press': 2 };
const FIXED = new Set(['Seismic Toss', 'Night Shade', 'Super Fang', 'Ruination', 'Endeavor', 'Psywave', 'Final Gambit', 'Counter', 'Mirror Coat',
  'Metal Burst', 'Bide', 'Dragon Rage', 'Sonic Boom', 'Foul Play']);

// Golpes de efeito (e o efeito extra de alguns de dano), por grupo: cada grupo conta uma vez (o melhor). Valor na mesma
// escala do dano (poder × golpe do próprio tipo); o setup multiplica pela força do ataque, a recuperação soma o quanto aguenta
const SETUP = {
  'Swords Dance': [50, 'p'], 'Dragon Dance': [55, 'p'], 'Bulk Up': [40, 'p'], Coil: [40, 'p'], 'Victory Dance': [50, 'p'], 'Belly Drum': [40, 'p'],
  'No Retreat': [45, 'b'], 'Tidy Up': [50, 'p'], Curse: [30, 'p'], 'Shift Gear': [55, 'p'],
  'Clangorous Soul': [50, 'b'], 'Fillet Away': [45, 'b'], 'Shell Smash': [60, 'b'], Agility: [20, 'b'], 'Rock Polish': [20, 'b'], Autotomize: [20, 'b'],
  'Nasty Plot': [50, 's'], 'Calm Mind': [40, 's'], 'Quiver Dance': [55, 's'], 'Tail Glow': [50, 's'], Geomancy: [35, 's'], 'Take Heart': [40, 's'],
};
const RECOVER = { Recover: 30, Roost: 30, 'Slack Off': 30, 'Soft-Boiled': 30, 'Milk Drink': 30, 'Shore Up': 28, 'Heal Order': 30, 'Strength Sap': 32,
  'Lunar Blessing': 28, 'Jungle Healing': 25, Moonlight: 24, 'Morning Sun': 24, Synthesis: 24, Wish: 20 };
// Cura sem somar o quanto aguenta (Rest dorme 2 turnos; Pain Split depende do HP do outro)
const FLAT_RECOVER = { 'Pain Split': 10, Rest: 5 };
// O efeito que vale menos em quem ataca forte (o turno rende mais atacando): status, hazards, telas…
const SUPPORT_CUT = { status: 0.6, hazard: 0.5, screen: 0.5, other: 0.5, speed: 0.5 };
// O dano conta em dobro (média contra os 18 tipos): o 2º golpe de dano vale mais que um golpe de efeito, o 4º, menos
const DMG_W = 2;
const GROUPS = {
  pivot: { 'U-turn': 15, 'Volt Switch': 15, 'Flip Turn': 15, 'Parting Shot': 20, Teleport: 6, 'Chilly Reception': 10, 'Shed Tail': 14 },
  hazard: { 'Stealth Rock': 30, Spikes: 22, 'Toxic Spikes': 14, 'Sticky Web': 18, 'Stone Axe': 15, 'Ceaseless Edge': 15 },
  clear: { 'Rapid Spin': 12, Defog: 12, 'Mortal Spin': 14, 'Court Change': 8 },
  status: { 'Will-O-Wisp': 22, Toxic: 20, 'Thunder Wave': 18, Spore: 35, 'Sleep Powder': 25, Hypnosis: 10, Yawn: 14, Glare: 22, 'Stun Spore': 12,
    'Toxic Thread': 8, Nuzzle: 8 },
  screen: { Reflect: 14, 'Light Screen': 14, 'Aurora Veil': 16 },
  speed: { Tailwind: 18, 'Icy Wind': 6, Electroweb: 6 },
  other: { 'Leech Seed': 16, Taunt: 10, Encore: 10, Substitute: 8, 'Knock Off': 8, Haze: 8, Whirlwind: 8, Roar: 8, 'Dragon Tail': 6, 'Circle Throw': 6,
    'Healing Wish': 10, 'Destiny Bond': 6, Trick: 0, Protect: 5 },
};
const GROUP_IDS = ['recover', ...Object.keys(GROUPS)];
const GROUP_OF = new Map();
for (const [g, list] of Object.entries(GROUPS)) for (const [name, v] of Object.entries(list)) GROUP_OF.set(name, [g, v]);
// Referência competitiva: a fração dos sets do Smogon que leva o golpe (smogon.js) soma até SMOGON_W (90% dos sets: +54).
// Um golpe que quase todo set da espécie usa ganha de um que as contas acham um pouco melhor; sem dados (Pokémon sem
// evoluir, próprios do hack, pouco usados), só as contas decidem
const SMOGON_W = 60;
// Golpe de efeito sem grupo nas contas (Protect, Trick…) entra quando o competitivo usa em 15% ou mais dos sets
const SMOGON_STATUS = 0.15;
const DUP_CUT = 0.8; // quanto do peso do Smogon some num segundo golpe de dano do mesmo tipo
const moveId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Moveset do plano (o campo dele em ctx.pf; o tipo em ctx.pkind): o que o clima, o terreno, o Trick Room e a Hiperofensiva
// mudam nos golpes. Sem plano (equilibrada), a escolha de sempre
const SURE_HIT = { Thunder: 'chuva', Hurricane: 'chuva', 'Bleakwind Storm': 'chuva', 'Wildbolt Storm': 'chuva', 'Sandsear Storm': 'chuva', Blizzard: 'neve/granizo' };
const NO_CHARGE = { 'Solar Beam': 'sol', 'Solar Blade': 'sol', 'Electro Shot': 'chuva' };
const WEATHER_BALL = { sol: 'fire', chuva: 'water', 'tempestade de areia': 'rock', 'neve/granizo': 'ice' };
const SUN_HEAL = new Set(['Moonlight', 'Morning Sun', 'Synthesis']);
const SPEED_SETUP = new Set(['Agility', 'Rock Polish', 'Autotomize']);
const TERRAIN_TYPE = { 'Electric Terrain': 'electric', 'Grassy Terrain': 'grass', 'Psychic Terrain': 'psychic' };
const TERRAIN_MOVE = { 'Rising Voltage': ['Electric Terrain', 2], 'Expanding Force': ['Psychic Terrain', 1.5] };
/** O que o campo do plano faz com o dano do golpe: clima (1,5× ou metade), terreno (1,3× no tipo; golpes próprios). */
function fieldMult(name, type, ctx) {
  const pf = ctx.pf;
  if (!pf) return 1;
  if (pf === 'chuva') return type === 'water' ? 1.5 : type === 'fire' ? 0.5 : 1;
  if (pf === 'sol') return name === 'Hydro Steam' ? 1.5 : type === 'fire' ? 1.5 : type === 'water' ? 0.5 : 1;
  if (pf === 'Misty Terrain') return type === 'dragon' ? 0.5 : 1;
  let k = 1;
  if (TERRAIN_TYPE[pf] === type && ctx.grounded) k *= 1.3;
  if (TERRAIN_MOVE[name] && TERRAIN_MOVE[name][0] === pf) k *= TERRAIN_MOVE[name][1];
  return k;
}

// Força do ataque (Ataque ou Ataque Especial base): 80 ou menos não aproveita setup; 115 ou mais, tudo
const strength = s => Math.max(0, Math.min(1, (s - 80) / 35));
const DAMAGING = mv => (mv.category === 0 || mv.category === 1) && !!mv.type;

/**
 * O valor de um golpe para o Pokémon: dano (poder efetivo: com a habilidade, golpe do próprio tipo, o ataque que ele usa
 * e a precisão) e o grupo de efeito. `x.boosted` já vem com a habilidade (boostMove em build.js).
 */
function rate(x, ctx) {
  const name = x.name;
  const k = desc(name);
  const pf = ctx.pf; // o campo do plano (chuva, sol, Electric Terrain…) ou null
  const out = { x, dmg: 0, phys: x.category === 0, group: null, gi: -1, util: 0, setup: null, side: null, prio: false, prioV: 0, type: null, vals: null, bonus: 0 };
  let acc = ctx.noGuard || !x.accuracy ? 1 : Math.min(1, x.accuracy / 100 * ctx.accK * (ctx.hustle && x.category === 0 ? 0.8 : 1));
  // No clima: Thunder e Hurricane não erram na chuva (e erram mais no sol); Blizzard não erra na neve
  if (pf && SURE_HIT[name] === pf) acc = 1;
  if (pf === 'sol' && SURE_HIT[name] === 'chuva') acc = Math.min(acc, 0.5);
  const dmging = DAMAGING(x);
  if (dmging) {
    let bx = x.boosted || x;
    let p = k.est != null ? k.est : x.power || 60;
    // Weather Ball no clima: 100 de poder e o tipo do clima
    if (name === 'Weather Ball' && WEATHER_BALL[pf]) { bx = { ...bx, type: WEATHER_BALL[pf] }; p = 100; }
    if (bx !== x && bx.power && x.power) p *= bx.power / x.power; // a habilidade (Technician, Strong Jaw…)
    if (k.hits) p *= ctx.skillLink && k.multi ? 5 : k.hits;
    if (name === 'Gyro Ball' && ctx.b[5] <= 50) p = 110;
    if (name === 'Electro Ball' && ctx.b[5] >= 110) p = 100;
    let pen = k.pen;
    if (pf && NO_CHARGE[name] === pf) pen = 1; // Solar Beam no sol, Electro Shot na chuva
    if (k.recoil && ctx.noRecoil) pen = Math.max(pen, 0.97);
    if (ctx.contrary && k.drop) { pen = 1.1; out.setup = 40; } // Leaf Storm no Serperior: sobe o Ataque Especial
    const stab = !k.fixed && (ctx.protean || ctx.types.includes(bx.type)) ? 1.5 : 1;
    const cat = k.fixed ? 1 : k.statOf != null ? ctx.catOf(ctx.b[k.statOf]) : x.category === 0 ? ctx.catP : ctx.catS;
    out.type = bx.type;
    out.dmg = ctx.eff[bx.type] ? p * stab * cat * acc * pen * fieldMult(name, bx.type, ctx) : 0;
    // Prioridade que bate de verdade (com o próprio tipo ou forte); no Psychic Terrain ela falha (contra quem está no chão)
    if (k.prio && pf !== 'Psychic Terrain') { out.prio = true; out.prioV = name === 'Fake Out' ? 10 : stab > 1 || p >= 70 ? 20 * cat : 5; }
    // Grassy Glide tem prioridade no Grassy Terrain
    if (name === 'Grassy Glide' && pf === 'Grassy Terrain' && ctx.grounded) { out.prio = true; out.prioV = 20 * cat; }
  }
  if (k.setup) {
    out.setup = k.setup * (ctx.pkind === 'offense' ? 1.3 : 1);
    out.side = k.side;
    // No Trick Room, subir a velocidade atrapalha (Agility, Rock Polish…)
    if (ctx.pkind === 'room' && SPEED_SETUP.has(name)) out.setup = null;
  }
  if (k.recover != null) {
    out.group = 'recover';
    // Moonlight, Morning Sun e Synthesis curam mais no sol e menos nos outros climas; Shore Up cura mais na areia
    const w = SUN_HEAL.has(name) ? (pf === 'sol' ? 12 : WEATHER_BALL[pf] ? -12 : 0) : name === 'Shore Up' && pf === 'tempestade de areia' ? 10 : 0;
    out.util = k.recover + ctx.bulk + w;
  }
  if (k.flat != null) { out.group = 'recover'; out.util = k.flat; }
  if (k.group) {
    // Golpe de dano com efeito (U-turn, Knock Off…): o efeito soma ao dano; os de status dependem da precisão
    let u = k.gv * (dmging ? 1 : acc) * (ctx.prankster && !dmging ? 1.4 : 1) * (1 - (SUPPORT_CUT[k.group] || 0) * ctx.att);
    // Aurora Veil só funciona na neve (lá vale mais que as duas telas); Tailwind atrapalha no Trick Room; na Hiperofensiva,
    // hazards e telas abrem o caminho
    if (name === 'Aurora Veil') u = pf === 'neve/granizo' ? 30 : 0;
    if (name === 'Tailwind' && ctx.pkind === 'room') u = 0;
    if (ctx.pkind === 'offense' && (k.group === 'hazard' || k.group === 'screen')) u *= 1.4;
    if (!out.group || u > out.util) { out.group = k.group; out.util = u; }
  }
  return out;
}

// O que não depende do Pokémon, uma vez por golpe
const DESC = new Map();
function desc(name) {
  let k = DESC.get(name);
  if (k) return k;
  const g = GROUP_OF.get(name);
  k = {
    est: EST[name] != null ? EST[name] : null, hits: HITS[name] || 0, multi: MULTI.has(name), pen: PEN[name] != null ? PEN[name] : 1,
    recoil: RECOIL.has(name), drop: DROP.has(name), fixed: FIXED.has(name), statOf: STAT_OF[name] != null ? STAT_OF[name] : null,
    prio: PRIORITY_MOVES.has(name), setup: SETUP[name] ? SETUP[name][0] : null, side: SETUP[name] ? SETUP[name][1] : null,
    recover: RECOVER[name] != null ? RECOVER[name] : null, flat: FLAT_RECOVER[name] != null ? FLAT_RECOVER[name] : null,
    group: g ? g[0] : null, gv: g ? g[1] : 0,
  };
  DESC.set(name, k);
  return k;
}

/**
 * O que o conjunto vale além do dano (os `n` primeiros de `set`, avaliados com rate): setup, os grupos de efeito, a
 * prioridade e o bônus de quem já sabe. É a conta repetida da escolha (centenas de vezes por Pokémon, para centenas de
 * Pokémon): sem criar listas.
 */
function extras(set, n, ctx) {
  // Setup: o melhor, pela força do ataque do lado que ele sobe, e só com golpes de dano desse lado
  let nP = 0, nS = 0;
  for (let i = 0; i < n; i++) { const r = set[i]; if (r.dmg && !r.prio) { if (r.phys) nP++; else nS++; } }
  let v = 0, setup = 0, prio = 0;
  // Os grupos de efeito: o melhor de cada (numa lista reaproveitada)
  const g = ctx.groupBest;
  g.fill(0);
  for (let i = 0; i < n; i++) {
    const r = set[i];
    if (r.setup) {
      const side = r.side || (r.phys ? 'p' : 's');
      const k = side === 'p' ? nP : side === 's' ? nS : Math.max(nP, nS);
      const sv = r.setup * (side === 'p' ? ctx.stP : side === 's' ? ctx.stS : ctx.att) * Math.min(k, 2) / 2;
      if (sv > setup) setup = sv;
    }
    if (r.group && r.util > g[r.gi]) g[r.gi] = r.util;
    if (r.prio && r.prioV > prio) prio = r.prioV;
    v += r.bonus;
  }
  v += setup + prio;
  for (let k = 0; k < g.length; k++) v += g[k];
  // Dois golpes de dano do mesmo tipo: o peso do Smogon do mais fraco quase não conta (cada set do competitivo leva um
  // dos três golpes Ice do Vanilluxe; somar os três enchia o moveset de Ice)
  for (let i = 0; i < n; i++) {
    const r = set[i];
    if (!r.use || !r.dmg) continue;
    for (let j = 0; j < n; j++) {
      const o = set[j];
      if (j !== i && o.dmg && o.type === r.type && (o.use > r.use || (o.use === r.use && j < i))) { v -= DUP_CUT * SMOGON_W * r.use; break; }
    }
  }
  return v;
}

/** Soma, nos tipos, o melhor entre `base` (o que os outros golpes já tiram de cada tipo) e o golpe `r`. */
function dmgWith(base, r, N) {
  let s = 0;
  const vs = r.vals;
  if (!vs) { for (let d = 0; d < N; d++) s += base[d]; return s; }
  for (let d = 0; d < N; d++) s += vs[d] > base[d] ? vs[d] : base[d];
  return s;
}

// Golpes que o moveset genérico não escolhe: pôr clima ou terreno e o Trick Room são decisão do plano (build.js)
const PLAN_ONLY = new Set(['Rain Dance', 'Sunny Day', 'Sandstorm', 'Hail', 'Snowscape', 'Electric Terrain', 'Psychic Terrain', 'Grassy Terrain',
  'Misty Terrain', 'Trick Room']);

/**
 * Os 4 golpes do Pokémon.
 * @param {object[]} cands golpes possíveis: { name, type, power, category, accuracy, src, level, boosted }
 * @param {{ b: number[], types: string[], abs: string[], eff: object, N: number }} ctx stats base, tipos e habilidades da
 *   forma de batalha; eff[tipo][d] = multiplicador contra o tipo puro d
 * @returns {object[]} os golpes escolhidos (os objetos de cands), na ordem: dano primeiro
 */
export function pickMoveset(cands, ctx) {
  const b = ctx.b, abs = ctx.abs;
  ctx.bulk = Math.max(0, Math.min(35, (b[0] + b[2] + b[4] - 240) / 4));
  ctx.att = strength(Math.max(b[1], b[3]));
  // Habilidades e stats que o rate consulta, uma vez por Pokémon
  ctx.noGuard = abs.includes('No Guard');
  ctx.accK = abs.includes('Compound Eyes') ? 1.3 : 1;
  ctx.hustle = abs.includes('Hustle');
  ctx.skillLink = abs.includes('Skill Link');
  ctx.noRecoil = abs.includes('Rock Head') || abs.includes('Magic Guard');
  ctx.contrary = abs.includes('Contrary');
  ctx.protean = abs.includes('Protean') || abs.includes('Libero');
  ctx.prankster = abs.includes('Prankster');
  // O plano: o campo (clima/terreno) e o tipo; quem voa ou levita não recebe o terreno
  ctx.pf = ctx.plan && ctx.plan.kind !== 'room' ? ctx.plan.field || null : null;
  ctx.pkind = ctx.plan ? ctx.plan.kind : null;
  ctx.grounded = !ctx.types.includes('flying') && !abs.includes('Levitate');
  // O ataque que o golpe usa contra o maior dos dois (golpe especial num atacante físico rende menos)
  const hi = Math.max(b[1], b[3]);
  ctx.catOf = st => Math.pow((st + 20) / (Math.max(hi, st) + 20), 1.3);
  ctx.catP = ctx.catOf(b[1]); ctx.catS = ctx.catOf(b[3]);
  // Golpes que o plano pede (Trick Room, Thunder na chuva…): entram de qualquer jeito, e a escolha completa o resto
  const force = ctx.force || null;
  const rated = [], forced = [];
  const usage = ctx.usage || null; // golpes do Smogon da espécie (Map ID → fração dos sets)
  for (const x of cands) {
    const use = usage && x.name ? usage.get(moveId(x.name)) || 0 : 0;
    if (force && force.has(x.name)) { if (!forced.some(r => r.x.name === x.name)) forced.push(Object.assign(rate(x, ctx), { bonus: 0 })); continue; }
    if (!x.name || PLAN_ONLY.has(x.name)) continue;
    if (x.name === 'Aurora Veil' && ctx.pf !== 'neve/granizo') continue; // falha fora da neve
    const plain = x.category === 2 && !SETUP[x.name] && RECOVER[x.name] == null && !GROUP_OF.has(x.name);
    if (plain && x.src !== SRC.known && use < SMOGON_STATUS) continue;
    const r = rate(x, ctx);
    if (!r.dmg && !r.setup && !r.group && !use) { if (x.src !== SRC.known) continue; }
    // O que já sabe vale um pouco mais (não precisa ensinar); o que precisa de treino, um pouco menos; o que o competitivo
    // usa, bem mais
    r.bonus = (x.src === SRC.known ? (r.dmg || r.setup || r.group ? 4 : 0) : x.src === SRC.level ? -6 : x.src === SRC.tm ? -3 : -1) + SMOGON_W * use;
    r.use = use;
    rated.push(r);
  }
  // Menos contas: de cada tipo (e lado), só o golpe de dano puro mais forte; de cada grupo de efeito e de setup, o melhor
  // (os que já sabe ficam todos)
  const keep = [], top = new Map();
  for (const r of rated.sort((p, q) => q.dmg - p.dmg || (q.util || 0) + (q.setup || 0) - (p.util || 0) - (p.setup || 0))) {
    if (r.x.src === SRC.known || r.prio || r.use) { keep.push(r); continue; }
    const k = r.setup ? 'setup' + (r.side || '') : r.group ? 'g' + r.group + (r.dmg ? r.type : '') : r.type + (r.phys ? 'p' : 's');
    const n = top.get(k);
    if (!n) { top.set(k, 1); keep.push(r); }
  }
  for (const r of forced) keep.push(r);
  for (const r of keep) if (r.dmg) { r.vals = new Float64Array(ctx.N); const e = ctx.eff[r.type]; for (let d = 0; d < ctx.N; d++) r.vals[d] = r.dmg * e[d]; }
  ctx.groupBest = new Float64Array(GROUP_IDS.length);
  for (const r of keep) if (r.group) r.gi = GROUP_IDS.indexOf(r.group);
  ctx.stP = strength(b[1]); ctx.stS = strength(b[3]);
  // Escolha gulosa (o que mais soma a cada vaga) e depois uma passada de trocas de um golpe. O dano é o melhor golpe contra
  // cada tipo, na média (DMG_W): guardado tipo a tipo, para cada candidato só somar o que ele acrescenta
  const N = ctx.N, K = DMG_W / N;
  const cur = new Float64Array(N);
  const add = r => { if (r.vals) for (let d = 0; d < N; d++) if (r.vals[d] > cur[d]) cur[d] = r.vals[d]; };
  const set = forced.slice(0, 4);
  for (const r of set) add(r);
  const used = new Set(set);
  const fixed = set.length;
  while (set.length < 4) {
    const n = set.length;
    let bv = 0;
    for (let d = 0; d < N; d++) bv += cur[d];
    bv = K * bv + extras(set, n, ctx);
    let best = null;
    for (const r of keep) {
      if (used.has(r)) continue;
      set[n] = r;
      const v = K * dmgWith(cur, r, N) + extras(set, n + 1, ctx);
      if (v > bv + 1e-9) { bv = v; best = r; }
    }
    set.length = n;
    if (!best) break;
    set.push(best);
    used.add(best);
    add(best);
  }
  const ex = new Float64Array(N);
  for (let i = fixed; i < set.length; i++) {
    // O que os outros golpes tiram de cada tipo, sem o da vaga i
    ex.fill(0);
    for (let j = 0; j < set.length; j++) if (j !== i && set[j].vals) { const vs = set[j].vals; for (let d = 0; d < N; d++) if (vs[d] > ex[d]) ex[d] = vs[d]; }
    const own = set[i];
    let bv = K * dmgWith(ex, own, N) + extras(set, set.length, ctx), best = null;
    for (const r of keep) {
      if (used.has(r)) continue;
      set[i] = r;
      const v = K * dmgWith(ex, r, N) + extras(set, set.length, ctx);
      if (v > bv + 1e-9) { bv = v; best = r; }
    }
    set[i] = best || own;
    if (best) { used.delete(own); used.add(best); }
  }
  const out = set.sort((p, q) => (q.dmg ? 1 : 0) - (p.dmg ? 1 : 0) || q.dmg - p.dmg).map(r => r.x);
  // Sem 4 golpes que valham algo, completa com os que já sabe (a vaga não muda nada)
  for (const x of cands) if (out.length < 4 && x.src === SRC.known && !out.includes(x)) out.push(x);
  return out;
}

/**
 * O plano muda algo nos golpes possíveis deste Pokémon? (para não refazer a escolha à toa: num PC grande, centenas de
 * Pokémon por plano)
 */
export function planSensitive(cands, plan) {
  const pf = plan.kind === 'room' ? null : plan.field;
  for (const x of cands) {
    const n = x.name;
    if (plan.kind === 'room') { if (SPEED_SETUP.has(n) || n === 'Tailwind') return true; continue; }
    if (plan.kind === 'offense') { if (SETUP[n] || (GROUP_OF.get(n) && ['hazard', 'screen'].includes(GROUP_OF.get(n)[0]))) return true; continue; }
    if (!pf) continue;
    if (SURE_HIT[n] || NO_CHARGE[n] || n === 'Weather Ball' || n === 'Aurora Veil' || SUN_HEAL.has(n) || n === 'Shore Up' || n === 'Hydro Steam') return true;
    if (DAMAGING(x)) {
      if ((pf === 'chuva' || pf === 'sol') && (x.type === 'water' || x.type === 'fire')) return true;
      if (TERRAIN_TYPE[pf] === x.type || (TERRAIN_MOVE[n] && TERRAIN_MOVE[n][0] === pf) || (pf === 'Misty Terrain' && x.type === 'dragon')) return true;
      if (pf === 'Grassy Terrain' && n === 'Grassy Glide') return true;
      if (pf === 'Psychic Terrain' && desc(n).prio) return true;
    }
  }
  return false;
}

/** A tabela de eficácia contra os tipos puros (para pickMoveset), uma vez por jogo. */
export function effTable(types, mult) {
  const eff = {};
  for (const a of types) eff[a] = types.map(d => mult(a, [d]));
  return eff;
}

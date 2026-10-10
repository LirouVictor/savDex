// Montador de equipes do app, sem IA. Para cada plano que o save comporta (clima, terreno, Trick Room ou
// equilibrado), procura no PC inteiro a melhor equipe de 6 por uma nota feita só de contas: fraquezas em comum
// (descontando o que o clima da equipe corta), cobertura ofensiva, papéis (pivô, prioridade, recuperação…),
// atacantes físicos × especiais, stats base e quem põe/aproveita o plano. A busca é em feixe (beam search):
// começa do núcleo do plano e vai completando uma vaga de cada vez, guardando as melhores equipes parciais.
// O nível não conta (o jogador pode treinar depois); quem ainda não evoluiu conta pela forma evoluída final e quem
// segura a própria megapedra conta com os tipos, stats e habilidade da mega. Nos jogos com golpes por nível da ROM,
// os golpes que o Pokémon aprende e ainda não sabe também contam (para pôr o plano, aproveitá-lo e para os papéis),
// com peso menor, e a tela diz o que ensinar.

import { strategyOf, rolesOf, weatherConflict, PRIORITY_MOVES, WEATHER, FIELD, MEGA_FIELD, ABUSERS, MOVE_ABUSERS, MEGA_ABUSERS, FIELD_MOVES } from '../ai/strategy.js';
import { isMegaStone, speciesKey, MAX_MEGAS } from '../ai/prompt.js';
import { evolvedVersions, megaForm } from '../ai/evolve.js';
import { moveInfo } from '../parser/describe.js';
import speciesData from '../data/species.json';

// Lendários e míticos (PokeAPI), pelo nome sem pontuação: o mesmo em todos os jogos (Ho-Oh → hooh)
const LEGENDARY = new Set(speciesData.legendary);
/** Lendário ou mítico (as formas e megas contam pela espécie: Mewtwo Mega X, Calyrex Shadow…). */
export const isLegendary = m => LEGENDARY.has(String(m.species.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''));

export const WEATHERS = ['sol', 'chuva', 'tempestade de areia', 'neve/granizo'];
const TERRAINS = ['Electric Terrain', 'Psychic Terrain', 'Grassy Terrain', 'Misty Terrain'];
const SPE = 5; // stats base na ordem HP/Atk/Def/SpA/SpD/Spe
const SLOW = 50, FAST = 90;
const BEAM = 24; // equipes parciais guardadas a cada vaga
const CANDS = 110; // candidatos por plano (os melhores para ele)

// Peso de cada papel (o primeiro membro com o papel conta; repetir não soma)
const ROLE_W = { pivô: 5, prioridade: 5, recuperação: 4, 'controle de velocidade': 4, setup: 4, tanque: 3, hazards: 3, 'tira hazards': 3, status: 2, telas: 2 };
const ROLES = Object.keys(ROLE_W);
const KEY_ROLES = ['prioridade', 'recuperação', 'controle de velocidade', 'pivô'];

// Habilidades que anulam um tipo de ataque (o Pokémon entra no golpe e não sofre nada; Lightning Rod numa equipe
// de chuva, que tem muitos fracos a Electric) e as que o cortam pela metade
const ABILITY_IMMUNE = {
  Levitate: ['ground'], 'Earth Eater': ['ground'], 'Lightning Rod': ['electric'], 'Volt Absorb': ['electric'], 'Motor Drive': ['electric'],
  'Storm Drain': ['water'], 'Water Absorb': ['water'], 'Dry Skin': ['water'], 'Flash Fire': ['fire'], 'Well-Baked Body': ['fire'], 'Sap Sipper': ['grass'],
};
const ABILITY_HALVE = { 'Thick Fat': ['fire', 'ice'], Heatproof: ['fire'], 'Water Bubble': ['fire'], 'Purifying Salt': ['ghost'] };
// Item que faz o clima durar 8 turnos em vez de 5 (vale em quem põe o clima do plano)
const WEATHER_ROCK = { 'Heat Rock': 'sol', 'Damp Rock': 'chuva', 'Smooth Rock': 'tempestade de areia', 'Icy Rock': 'neve/granizo' };

// Habilidades que dobram a velocidade no clima/terreno: são elas que definem o arquétipo (Swift Swim na chuva…)
const SPEED_ABILITIES = new Set(['Swift Swim', 'Chlorophyll', 'Sand Rush', 'Slush Rush', 'Surge Surfer']);

// Habilidades que atrapalham o próprio Pokémon (ataca um turno sim, outro não; metade do Ataque por 5 turnos…)
const BAD_ABILITIES = { Truant: 20, 'Slow Start': 20, Defeatist: 6, Klutz: 4, Stall: 4 };

// Papéis que vale a pena ganhar ensinando um golpe, e golpes fracos demais para sugerir
const TEACH_ROLES = ['pivô', 'prioridade', 'recuperação', 'controle de velocidade', 'setup', 'hazards', 'tira hazards'];
const TEACH_SKIP = new Set(['String Shot', 'Scary Face', 'Cotton Spore', 'Low Sweep', 'Bulldoze', 'Rock Tomb', 'Nuzzle', 'Growth', 'Work Up',
  'Hone Claws', 'Flame Charge', 'Power-Up Punch', 'Trailblaze', 'Quick Attack', 'Feint', 'Teleport', 'Baton Pass', 'Rest', 'Autotomize']);

// Papel que só vem de golpe a ensinar vale menos que o de golpe que o Pokémon já sabe (ocupa um espaço de golpe)
const LEARN_ROLE = 0.6;

// Golpes de dano que contam: os fracos do começo do jogo (Tackle, Ember, Water Pulse…) não seguram uma batalha.
// Contam poder 70+, poder variável, os que batem mais do que o número diz (vários acertos, poder que cresce…)
// e os de prioridade com STAB (Aqua Jet no Basculegion conta; Quick Attack no Dreepy, não).
const STRONG_LOW = new Set(['Acrobatics', 'Weather Ball', 'Last Respects', 'Rage Fist', 'Dual Wingbeat', 'Triple Axel', 'Bonemerang',
  'Double Iron Bash', 'Tachyon Cutter', 'Surging Strikes', 'Population Bomb', 'Icicle Spear', 'Bullet Seed', 'Rock Blast', 'Scale Shot',
  'Pin Missile', 'Tail Slap', 'Bone Rush', 'Dragon Darts', 'Twin Beam', 'Gear Grind', 'Dual Chop', 'Triple Dive', 'Water Shuriken',
  'Knock Off', 'Facade', 'Hex', 'Venoshock', 'Storm Throw', 'Grassy Glide', 'Stored Power', 'Power Trip', 'Brine', 'Payback',
  'Avalanche', 'Revenge', 'Stomping Tantrum', 'Lash Out', 'Rising Voltage', 'Expanding Force', 'Terrain Pulse']);
const realMove = (mv, types) => damaging(mv) && (PRIORITY_MOVES.has(mv.name)
  ? types.includes(mv.type) || mv.power >= 70
  : !mv.power || mv.power >= 70 || STRONG_LOW.has(mv.name));

const popcount = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
const damaging = mv => (mv.category === 0 || mv.category === 1) && !!mv.type;

/** Tipos de ataque considerados (os da tabela do jogo; sem Stellar). */
export function attackTypes(T) {
  return T.types.filter(ty => ty && ty !== 'stellar');
}

/**
 * Golpes por nível do Pokémon (tabela da ROM: `dex.learn[ID do jogo] = [versão, nível, golpe, nível, golpe…]`),
 * com o nível em que aprende (0 = ao evoluir). [] sem a tabela.
 */
export function levelMoves(m, dex, T) {
  const raw = dex && dex.rom ? dex.learn[m.speciesId] : null;
  if (!raw) return [];
  const out = [];
  for (let i = 2; i < raw.length; i += 2) {
    const info = typeof raw[i] === 'number' ? moveInfo(raw[i], T) : null;
    const name = info ? (info.known ? info.name : null) : String(raw[i]);
    if (name && !out.some(x => x.name === name)) out.push({ name, level: raw[i - 1], type: info && info.type, power: info && info.power, category: info && info.category });
  }
  return out;
}

/**
 * Os Pokémon que o montador pode usar: um por espécie (o de nível mais alto, depois o de mais IVs), sem ovos,
 * mais a forma evoluída final de quem ainda não evoluiu (Quetzal, Unbound e SoulGold). Cada entrada já leva as
 * contas que a nota usa, na forma de batalha (a mega, se segura a própria megapedra).
 * @param {object|null} [dex] golpes por nível da ROM (os que o Pokémon aprende também contam)
 */
export function prepare(all, T, dex = null) {
  const types = attackTypes(T);
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const mult = (atk, def) => def.reduce((x, d) => x * (idx.has(d) ? T.typechart[idx.get(atk)][idx.get(d)] : 1), 1);
  const ivSum = m => (m.ivs ? Object.values(m.ivs).reduce((a, b) => a + (b || 0), 0) : 0);
  const best = new Map();
  const better = (a, b) => (a.level || 0) - (b.level || 0) || ivSum(a) - ivSum(b);
  const add = m => {
    if (!m.species.types.length || !m.species.baseStats) return;
    const k = speciesKey(m);
    const cur = best.get(k);
    if (!cur || better(m, cur) > 0) best.set(k, m);
  };
  for (const m of all) {
    if (m.egg || m.species.form === 'ovo') continue;
    add(m);
    for (const e of evolvedVersions(m, T)) add(e);
  }
  return [...best.values()].map((m, id) => {
    const known = new Set(m.moves.map(mv => mv.name));
    const learn = levelMoves(m, dex, T).filter(x => !known.has(x.name));
    return Object.assign(entry(m, megaForm(m, T) || m, T, types, mult, learn), { id });
  });
}

/**
 * Contas de um Pokémon. `m` é o que a tela mostra (o do save, ou a forma evoluída); `bf`, a forma de batalha
 * (a mega, se segura a própria megapedra): tipos, stats base e habilidade vêm dela. `learn`: golpes por nível
 * que ele ainda não sabe.
 */
function entry(m, bf, T, types, mult, learn = []) {
  const b = bf.species.baseStats;
  const moves = m.moves.filter(mv => realMove(mv, bf.species.types));
  // Os golpes fracos ficam de fora das contas (cobertura, clima); os de efeito (Icy Wind, Nuzzle…) continuam
  const useful = m.moves.filter(mv => !damaging(mv) || moves.includes(mv) || (!PRIORITY_MOVES.has(mv.name) && rolesOf({ species: {}, moves: [mv] }).length) || mv.name === 'Fake Out');
  const ab = bf.ability && bf.ability.name;
  // Defesa: 2 = 4×, 1 = 2×, 0 neutro, -1 resiste ou imune pelo tipo, -2 anula pela habilidade (Lightning Rod…)
  const def = types.map(a => {
    if ((ABILITY_IMMUNE[ab] || []).includes(a)) return -2; // anula pela habilidade: entra no golpe no lugar dos outros
    const x = mult(a, bf.species.types) * ((ABILITY_HALVE[ab] || []).includes(a) ? 0.5 : 1);
    return x >= 4 ? 2 : x > 1 ? 1 : x < 1 ? -1 : 0;
  });
  // Cobertura: tipos (puros) que algum golpe de dano acerta em cheio
  let cov = 0;
  types.forEach((d, i) => { if (moves.some(mv => mult(mv.type, [d]) > 1)) cov |= 1 << i; });
  const roles = rolesOf({ ...m, moves: useful });
  let roleMask = 0;
  ROLES.forEach((r, i) => { if (roles.includes(r)) roleMask |= 1 << i; });
  const phys = moves.filter(mv => mv.category === 0).length, spec = moves.length - phys;
  // Põe o campo sozinho, sem gastar turno (habilidade ou megapedra), ou só pelo golpe (Sunny Day…)
  const auto = new Set([FIELD[ab], MEGA_FIELD[m.item && m.item.name]].filter(Boolean));
  // Aproveita de verdade: habilidade (Swift Swim, Chlorophyll…), megapedra ou golpe próprio do clima (Thunder,
  // Solar Beam…). Weather Ball e os golpes Fire/Water só ficam mais fortes: contam menos (e mais com STAB).
  const strong = new Set([ABUSERS[ab], MEGA_ABUSERS[m.item && m.item.name]].filter(Boolean));
  for (const mv of useful) if (mv.name !== 'Weather Ball') for (const f of MOVE_ABUSERS[mv.name] || []) strong.add(f);
  const stab = new Set();
  for (const [f, w] of Object.entries(WEATHER)) if (bf.species.types.includes(w.boosts) && moves.some(mv => mv.type === w.boosts)) stab.add(f);
  // Quanto aproveita cada campo: habilidade de velocidade 16, outra habilidade ou megapedra 11, golpe do próprio
  // clima ou golpe com STAB fortalecido 6, outro golpe fortalecido (ou Weather Ball) 3
  const strat = strategyOf({ ...bf, moves: useful });
  // Golpes a ensinar: põem o campo (Trick Room, Rain Dance…), aproveitam (Thunder, Solar Beam…) ou dão um papel
  const teach = new Map(); // golpe → nível em que aprende
  const learnSet = new Set(), learnUse = new Set();
  for (const x of learn) {
    const f = FIELD_MOVES[x.name] || (x.name === 'Trick Room' ? 'Trick Room' : null);
    if (f && !strat.set.has(f)) { learnSet.add(f); teach.set(x.name, x.level); }
    if (x.name !== 'Weather Ball') for (const g of MOVE_ABUSERS[x.name] || []) if (!strong.has(g)) { learnUse.add(g); teach.set(x.name, x.level); }
  }
  // Prioridade só de golpe que bate de verdade; setup só em quem ataca forte (Agility no Pelipper não ajuda)
  const teachable = learn.filter(x => !TEACH_SKIP.has(x.name) && (!PRIORITY_MOVES.has(x.name) || realMove(x, bf.species.types))
    && (Math.max(b[1], b[3]) >= 100 || !rolesOf({ species: {}, moves: [x] }).includes('setup')));
  const learnRoles = rolesOf({ ...bf, moves: teachable.map(x => ({ name: x.name })) }).filter(r => TEACH_ROLES.includes(r) && !roles.includes(r));
  let learnRoleMask = 0;
  ROLES.forEach((r, i) => { if (learnRoles.includes(r)) learnRoleMask |= 1 << i; });
  const roleMoves = new Map(); // papel → golpe a ensinar que o dá
  for (const r of learnRoles) {
    const x = teachable.find(l => rolesOf({ ...bf, moves: [{ name: l.name }] }).includes(r));
    if (x) roleMoves.set(r, x);
  }
  const value = {};
  for (const f of [...WEATHERS, ...TERRAINS]) {
    const sig = useful.some(mv => mv.name !== 'Weather Ball' && (MOVE_ABUSERS[mv.name] || []).includes(f));
    value[f] = Math.max(ABUSERS[ab] === f ? (SPEED_ABILITIES.has(ab) ? 16 : 11) : 0, MEGA_ABUSERS[m.item && m.item.name] === f ? 11 : 0,
      sig || stab.has(f) ? 6 : 0, learnUse.has(f) ? 5 : 0, strat.use.has(f) || strat.boost.has(f) ? 3 : 0);
  }
  const typeIdx = bf.species.types.map(ty => types.indexOf(ty)).filter(i => i >= 0);
  const baseBst = m.species.baseStats.reduce((x, y) => x + y, 0);
  return {
    m, bf, real: m.evolvedFrom || m, key: speciesKey(m), types: bf.species.types, typeIdx, def, cov, roles, roleMask,
    learnSet, learnUse, learnRoles, learnRoleMask, roleMoves, teach,
    megaGain: bf !== m ? (b.reduce((x, y) => x + y, 0) - baseBst) / 12 : 0,
    bad: BAD_ABILITIES[ab] || 0, rock: WEATHER_ROCK[m.item && m.item.name] || null,
    strat, auto, strong, stab, value, bst: b.reduce((x, y) => x + y, 0), spe: b[SPE], dmg: moves.length,
    lean: b[1] >= b[3] ? (phys ? 'phys' : spec ? 'spec' : '') : (spec ? 'spec' : phys ? 'phys' : ''),
    mega: isMegaStone(m.item), megaKnown: bf !== m,
  };
}

/** Põe o campo: pela habilidade/megapedra/golpe que já sabe, ou por um golpe que aprende. */
export const sets = (e, f) => e.strat.set.has(f) || e.learnSet.has(f);

// Habilidades que seguram o que costuma ameaçar o clima (Electric/Grass na chuva, Water/Fire no sol)
const ANSWERS = { chuva: ['Lightning Rod', 'Volt Absorb', 'Motor Drive', 'Sap Sipper'], sol: ['Storm Drain', 'Water Absorb', 'Flash Fire', 'Dry Skin'] };
const benefits = (e, f) => e.strat.use.has(f) || e.strat.boost.has(f);

/**
 * Planos que o save comporta: clima ou terreno com quem ponha e 2 ou mais que aproveitem; Trick Room com quem
 * ponha e 3 ou mais lentos que atacam; e o equilibrado, sempre.
 */
export function plans(pool) {
  const out = [];
  for (const f of [...WEATHERS, ...TERRAINS]) {
    const setters = pool.filter(e => sets(e, f));
    const users = pool.filter(e => benefits(e, f) || e.learnUse.has(f));
    if (setters.length && users.length >= 2) out.push({ kind: WEATHERS.includes(f) ? 'weather' : 'terrain', field: f, setters });
  }
  const room = pool.filter(e => sets(e, 'Trick Room'));
  if (room.length && pool.filter(e => e.spe <= SLOW && e.dmg >= 2).length >= 3) out.push({ kind: 'room', field: 'Trick Room', setters: room });
  out.push({ kind: 'balance', field: null, setters: [] });
  return out;
}

/** Tipo de ataque que o clima do plano corta pela metade (Water no sol, Fire na chuva): não conta como fraqueza. */
function halvedIndex(plan, types) {
  return plan.kind === 'weather' && WEATHER[plan.field] ? types.indexOf(WEATHER[plan.field].weakens) : -1;
}

/** Nota da equipe (também das parciais, durante a busca). Maior é melhor. */
export const score = (team, plan, types) => scoreParts(team, plan, types).total;

/**
 * A nota por partes (a tela mostra de onde ela vem): defesa (fraquezas em comum), ataque (cobertura), papéis,
 * Pokémon (stats base, megapedra, golpes de dano, habilidade ruim), equilíbrio (físicos × especiais, tipos
 * repetidos, velocidade) e plano (quem põe e quem aproveita).
 */
export function scoreParts(team, plan, types) {
  const n = team.length;
  const halved = halvedIndex(plan, types);
  const p = { defense: 0, offense: 0, roles: 0, members: 0, balance: 0, plan: 0, total: 0 };
  // Fraquezas em comum: 3 ou mais fracos ao mesmo tipo pesa muito; mais fracos que resistentes, um pouco
  for (let a = 0; a < types.length; a++) {
    if (a === halved) continue;
    let w = 0, r = 0, q = 0, absorb = false;
    for (const e of team) { const v = e.def[a]; if (v > 0) { w++; if (v > 1) q++; } else if (v < 0) { r++; if (v < -1) absorb = true; } }
    // Com quem anula o tipo pela habilidade (Lightning Rod num time fraco a Electric), a fraqueza em comum pesa metade
    p.defense -= (absorb ? 6 : 12) * Math.max(0, w - 2) + 4 * Math.max(0, w - r - 1) + 2 * q;
  }
  // Cobertura ofensiva e papéis (cada um conta uma vez)
  let cov = 0, roles = 0, learnRoles = 0;
  for (const e of team) { cov |= e.cov; roles |= e.roleMask; learnRoles |= e.learnRoleMask; }
  p.offense = 2.5 * popcount(cov);
  // Papel que ninguém tem mas alguém aprende vale menos (é preciso ensinar o golpe)
  ROLES.forEach((r, i) => { if (roles & (1 << i)) p.roles += ROLE_W[r]; else if (learnRoles & (1 << i)) p.roles += ROLE_W[r] * LEARN_ROLE; });
  // Cada membro: stats base; quem tem menos de 2 golpes de dano rende pouco
  let phys = 0, spec = 0, fast = 0, slow = 0, megas = 0, gains = [];
  const typeCount = new Int8Array(types.length);
  for (const e of team) {
    p.members += (e.bst - 350) / 12 - e.bad; // 300 → −4, 450 → +8, 600 → +21
    // A megaevolução sobe os stats (já contados na forma mega, quando o app a conhece); só uma por batalha
    if (e.mega) { if (e.megaKnown) gains.push(e.megaGain); else p.members += megas ? 3 : 8; megas++; }
    if (e.dmg < 2) p.members -= 6 * (2 - e.dmg); // sem golpes de dano que contam, ele não segura uma batalha
    if (e.lean === 'phys') phys++; else if (e.lean === 'spec') spec++;
    if (e.spe >= FAST) fast++;
    if (e.spe <= SLOW && e.dmg >= 2) slow++;
    for (const i of e.typeIdx) typeCount[i]++;
  }
  // Com 2 megas da forma conhecida, só uma megaevolui por batalha: metade do ganho da menor não conta
  if (gains.length > 1) p.members -= Math.min(...gains) / 2;
  // Físicos × especiais (só faz sentido com a equipe quase pronta), tipos repetidos, velocidade
  if (n >= 4) p.balance -= 4 * Math.max(0, 2 - phys) + 4 * Math.max(0, 2 - spec);
  for (const c of typeCount) if (c > 1) p.balance -= 6 * Math.max(0, c - 2) + 1.5 * (c - 1);
  if (plan.kind === 'room') p.plan += 5 * Math.min(slow, 4) - 4 * fast;
  else p.balance += 2 * Math.min(fast, 3);
  if (plan.kind === 'weather' || plan.kind === 'terrain') {
    const f = plan.field;
    // Quem aproveita pela habilidade, golpe próprio ou megapedra vale mais que quem só tem golpe Fire/Water
    let auto = false, conflicts = 0, risks = 0, answer = false;
    const vals = [];
    for (const e of team) {
      if (e.value[f]) vals.push(e.value[f]);
      if (e.auto.has(f)) auto = true;
      if (e.rock === f && sets(e, f)) p.plan += 4;
      if (e.conflict) conflicts++;
      if (e.risk) risks++;
      if ((ANSWERS[f] || []).includes(e.m.ability && e.m.ability.name)) answer = true;
    }
    if (answer) p.plan += 5;
    // O núcleo do plano: os 4 que mais aproveitam
    p.plan += vals.sort((a, b) => b - a).slice(0, 4).reduce((x, y) => x + y, 0);
    // Quem põe sem gastar turno (Drought, Charizardite Y…) é mais confiável que o golpe (Sunny Day)
    if (auto) p.plan += 16;
    if (plan.kind === 'weather') p.plan -= 10 * conflicts + 4 * risks;
  }
  p.total = p.defense + p.offense + p.roles + p.members + p.balance + p.plan;
  return p;
}

/** Pode entrar: não repete Pokémon nem espécie, até 2 megapedras e, num plano de clima, nenhum outro clima. */
function allowed(team, e, plan) {
  if (team.some(x => x.real === e.real || x.key === e.key)) return false;
  if (e.mega && team.filter(x => x.mega).length >= MAX_MEGAS) return false;
  if (plan.kind === 'weather' && [...e.strat.set].some(f => WEATHERS.includes(f) && f !== plan.field)) return false;
  return true;
}

/** Valor de um Pokémon sozinho para o plano (para escolher os candidatos da busca). */
function solo(e, plan) {
  let v = (e.bst - 350) / 12 - e.bad + popcount(e.cov) * 0.8 + e.roles.filter(r => ROLE_W[r]).length * 1.5 - 6 * Math.max(0, 2 - e.dmg);
  if (plan.field && plan.kind !== 'room') {
    if (sets(e, plan.field)) v += e.auto.has(plan.field) ? 40 : e.strat.set.has(plan.field) ? 30 : 24;
    v += (e.value[plan.field] || 0) * 1.2;
  }
  if (plan.kind === 'room') v += sets(e, 'Trick Room') ? (e.strat.set.has('Trick Room') ? 30 : 24) : e.spe <= SLOW && e.dmg >= 2 ? 12 : e.spe >= FAST ? -8 : 0;
  return v;
}

/**
 * A melhor equipe para um plano.
 * @param {object[]} pool resultado de prepare
 * @param {object} plan um item de plans()
 * @param {object[]} forced entradas que o jogador quer na equipe
 * @returns {{ plan, team: object[], score: number } | null}
 */
export function bestTeam(pool, plan, types, forced = []) {
  // Num plano de clima: fora quem tem a fraqueza que o clima fortalece ou depende de golpes que ele enfraquece
  // (e.conflict, marcado em buildTeams); quem o jogador pediu entra mesmo assim
  const usable = pool.filter(e => forced.includes(e) || !e.conflict);
  const cands = usable.filter(e => !forced.includes(e))
    .map(e => [e, solo(e, plan)]).sort((a, b) => b[1] - a[1]).slice(0, CANDS).map(([e]) => e);
  // Sementes: o que o jogador pediu, mais quem põe o plano (até 2 opções de quem põe, uma busca para cada)
  const seeds = [];
  if (plan.setters.length) {
    const setters = plan.setters.filter(e => usable.includes(e))
      .sort((a, b) => solo(b, plan) - solo(a, plan)).slice(0, 2);
    for (const st of setters) {
      if (forced.includes(st)) seeds.push([...forced]);
      else if (allowed(forced, st, plan)) seeds.push([...forced, st]);
    }
  } else seeds.push([...forced]);
  let best = null;
  for (const seed of seeds) {
    if (seed.length > 6) continue;
    let beam = [{ team: seed, s: score(seed, plan, types) }];
    while (beam[0].team.length < 6) {
      const next = new Map();
      for (const st of beam) {
        for (const c of cands) {
          if (!allowed(st.team, c, plan)) continue;
          const team = [...st.team, c];
          const key = team.map(e => e.id).sort((a, b) => a - b).join(',');
          if (next.has(key)) continue;
          next.set(key, { team, s: score(team, plan, types) });
        }
      }
      if (!next.size) break;
      beam = [...next.values()].sort((a, b) => b.s - a.s).slice(0, BEAM);
    }
    const top = beam[0];
    if (top && (!best || top.s > best.score)) best = { plan, team: top.team, score: top.s };
  }
  return best;
}

/**
 * O plano vale na equipe final: quem põe e, além dele, 2 ou mais que aproveitam (clima/terreno) ou 3 lentos
 * que atacam (Trick Room). Senão a equipe é só "equilibrada" com um golpe de clima, e não aparece como plano.
 */
export function planHolds(team, plan) {
  if (plan.kind === 'balance') return true;
  const setters = team.filter(e => sets(e, plan.field));
  if (!setters.length) return false;
  if (plan.kind === 'room') return team.filter(e => e.spe <= SLOW && e.dmg >= 2).length >= 3;
  return team.filter(e => (benefits(e, plan.field) || e.learnUse.has(plan.field)) && !(setters.length === 1 && e === setters[0] && !e.strat.use.has(plan.field))).length >= 2;
}

/**
 * Equipes para todos os planos do save, da melhor nota para a pior, sem repetir a mesma equipe.
 * @param {object[]} all Pokémon do save (equipe + PC)
 * @param {object} T tabelas do jogo
 * @param {{ want?: object[], dex?: object|null, noLegends?: boolean }} [opts] Pokémon que o jogador quer na equipe
 *   (do save), os golpes por nível da ROM (os que aprendem também contam) e se deixa de fora lendários e míticos
 *   (menos os que o jogador pediu)
 */
export function buildTeams(all, T, { want = [], dex = null, noLegends = false } = {}) {
  const types = attackTypes(T);
  if (noLegends) {
    const asked = new Set(want.map(speciesKey));
    all = all.filter(m => !isLegendary(m) || asked.has(speciesKey(m)));
  }
  const pool = prepare(all, T, dex);
  for (const e of pool) {
    e.conflictBy = {};
    for (const f of WEATHERS) e.conflictBy[f] = weatherConflict(e.bf, f, T);
  }
  const forced = want.map(m => pool.find(e => e.real === m || e.m === m) || pool.find(e => e.key === speciesKey(m))).filter(Boolean)
    .filter((e, i, a) => a.indexOf(e) === i).slice(0, 6);
  const out = [];
  for (const plan of plans(pool)) {
    // Quem atrapalha o clima fica de fora; mas quem aproveita de verdade (Chlorophyll, Swift Swim…) vale o risco
    // de ser fraco ao tipo que o clima fortalece (Venusaur no sol): entra, com uma pena menor
    for (const e of pool) {
      const c = plan.kind === 'weather' ? e.conflictBy[plan.field] : null;
      e.conflict = !!c && !(c === 'weak' && e.strong.has(plan.field));
      e.risk = c === 'weak' && e.strong.has(plan.field);
    }
    const r = bestTeam(pool, plan, types, forced);
    if (r && r.team.length === 6 && planHolds(r.team, plan)) out.push(r);
  }
  out.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return out.filter(r => {
    const k = r.team.map(e => pool.indexOf(e)).sort((a, b) => a - b).join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


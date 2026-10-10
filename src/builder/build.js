// Montador de equipes do app, sem IA. Para cada plano que o save comporta (clima, terreno, Trick Room ou
// equilibrado), procura no PC inteiro a melhor equipe de 6 por uma nota feita só de contas: fraquezas em comum
// (descontando o que o clima da equipe corta), cobertura ofensiva, papéis (pivô, prioridade, recuperação…),
// atacantes físicos × especiais, stats base e quem põe/aproveita o plano. A busca é em feixe (beam search):
// começa do núcleo do plano e vai completando uma vaga de cada vez, guardando as melhores equipes parciais.
// O nível não conta (o jogador pode treinar depois); quem ainda não evoluiu conta pela forma evoluída final.

import { strategyOf, rolesOf, weatherConflict, WEATHER, FIELD, MEGA_FIELD, ABUSERS, MOVE_ABUSERS, MEGA_ABUSERS } from '../ai/strategy.js';
import { isMegaStone, speciesKey, MAX_MEGAS } from '../ai/prompt.js';
import { evolvedVersions } from '../ai/evolve.js';

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

const popcount = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
const damaging = mv => (mv.category === 0 || mv.category === 1) && !!mv.type;

/** Tipos de ataque considerados (os da tabela do jogo; sem Stellar). */
export function attackTypes(T) {
  return T.types.filter(ty => ty && ty !== 'stellar');
}

/**
 * Os Pokémon que o montador pode usar: um por espécie (o de nível mais alto, depois o de mais IVs), sem ovos,
 * mais a forma evoluída final de quem ainda não evoluiu (Quetzal, Unbound e SoulGold). Cada entrada já leva as
 * contas que a nota usa.
 */
export function prepare(all, T) {
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
  return [...best.values()].map((m, id) => Object.assign(entry(m, T, types, mult), { id }));
}

function entry(m, T, types, mult) {
  const b = m.species.baseStats;
  const moves = m.moves.filter(damaging);
  const ab = m.ability && m.ability.name;
  // Defesa: 2 = 4×, 1 = 2×, 0 neutro, -1 resiste ou imune pelo tipo, -2 anula pela habilidade (Lightning Rod…)
  const def = types.map(a => {
    if ((ABILITY_IMMUNE[ab] || []).includes(a)) return -2; // anula pela habilidade: entra no golpe no lugar dos outros
    const x = mult(a, m.species.types) * ((ABILITY_HALVE[ab] || []).includes(a) ? 0.5 : 1);
    return x >= 4 ? 2 : x > 1 ? 1 : x < 1 ? -1 : 0;
  });
  // Cobertura: tipos (puros) que algum golpe de dano acerta em cheio
  let cov = 0;
  types.forEach((d, i) => { if (moves.some(mv => mult(mv.type, [d]) > 1)) cov |= 1 << i; });
  const roles = rolesOf(m);
  let roleMask = 0;
  ROLES.forEach((r, i) => { if (roles.includes(r)) roleMask |= 1 << i; });
  const phys = moves.filter(mv => mv.category === 0).length, spec = moves.length - phys;
  // Põe o campo sozinho, sem gastar turno (habilidade ou megapedra), ou só pelo golpe (Sunny Day…)
  const auto = new Set([FIELD[m.ability && m.ability.name], MEGA_FIELD[m.item && m.item.name]].filter(Boolean));
  // Aproveita de verdade: habilidade (Swift Swim, Chlorophyll…), megapedra ou golpe próprio do clima (Thunder,
  // Solar Beam…). Weather Ball e os golpes Fire/Water só ficam mais fortes: contam menos (e mais com STAB).
  const strong = new Set([ABUSERS[m.ability && m.ability.name], MEGA_ABUSERS[m.item && m.item.name]].filter(Boolean));
  for (const mv of m.moves) if (mv.name !== 'Weather Ball') for (const f of MOVE_ABUSERS[mv.name] || []) strong.add(f);
  const stab = new Set();
  for (const [f, w] of Object.entries(WEATHER)) if (m.species.types.includes(w.boosts) && moves.some(mv => mv.type === w.boosts)) stab.add(f);
  // Quanto aproveita cada campo: habilidade de velocidade 16, outra habilidade ou megapedra 11, golpe do próprio
  // clima ou golpe com STAB fortalecido 6, outro golpe fortalecido (ou Weather Ball) 3
  const strat = strategyOf(m);
  const value = {};
  for (const f of [...WEATHERS, ...TERRAINS]) {
    const sig = m.moves.some(mv => mv.name !== 'Weather Ball' && (MOVE_ABUSERS[mv.name] || []).includes(f));
    value[f] = Math.max(ABUSERS[ab] === f ? (SPEED_ABILITIES.has(ab) ? 16 : 11) : 0, MEGA_ABUSERS[m.item && m.item.name] === f ? 11 : 0,
      sig || stab.has(f) ? 6 : 0, strat.use.has(f) || strat.boost.has(f) ? 3 : 0);
  }
  const typeIdx = m.species.types.map(ty => types.indexOf(ty)).filter(i => i >= 0);
  return {
    m, real: m.evolvedFrom || m, key: speciesKey(m), types: m.species.types, typeIdx, def, cov, roles, roleMask,
    bad: BAD_ABILITIES[ab] || 0, rock: WEATHER_ROCK[m.item && m.item.name] || null,
    strat, auto, strong, stab, value, bst: b.reduce((x, y) => x + y, 0), spe: b[SPE], dmg: moves.length,
    lean: b[1] >= b[3] ? (phys ? 'phys' : spec ? 'spec' : '') : (spec ? 'spec' : phys ? 'phys' : ''),
    mega: isMegaStone(m.item),
  };
}

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
    const setters = pool.filter(e => e.strat.set.has(f));
    const users = pool.filter(e => benefits(e, f));
    if (setters.length && users.length >= 2) out.push({ kind: WEATHERS.includes(f) ? 'weather' : 'terrain', field: f, setters });
  }
  const room = pool.filter(e => e.strat.set.has('Trick Room'));
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
  let cov = 0, roles = 0;
  for (const e of team) { cov |= e.cov; roles |= e.roleMask; }
  p.offense = 2.5 * popcount(cov);
  ROLES.forEach((r, i) => { if (roles & (1 << i)) p.roles += ROLE_W[r]; });
  // Cada membro: stats base; quem tem menos de 2 golpes de dano rende pouco
  let phys = 0, spec = 0, fast = 0, slow = 0, megas = 0;
  const typeCount = new Int8Array(types.length);
  for (const e of team) {
    p.members += (e.bst - 350) / 12 - e.bad; // 300 → −4, 450 → +8, 600 → +21
    if (e.mega) p.members += megas++ ? 3 : 8; // a megaevolução sobe os stats; a 2ª é a opção para outra batalha
    if (e.dmg < 2) p.members -= 6;
    if (e.lean === 'phys') phys++; else if (e.lean === 'spec') spec++;
    if (e.spe >= FAST) fast++;
    if (e.spe <= SLOW && e.dmg >= 2) slow++;
    for (const i of e.typeIdx) typeCount[i]++;
  }
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
      if (e.rock === f && e.strat.set.has(f)) p.plan += 4;
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
  let v = (e.bst - 350) / 12 - e.bad + popcount(e.cov) * 0.8 + e.roles.filter(r => ROLE_W[r]).length * 1.5 - (e.dmg < 2 ? 6 : 0);
  if (plan.field && plan.kind !== 'room') {
    if (e.strat.set.has(plan.field)) v += e.auto.has(plan.field) ? 40 : 30;
    v += (e.value[plan.field] || 0) * 1.2;
  }
  if (plan.kind === 'room') v += e.strat.set.has('Trick Room') ? 30 : e.spe <= SLOW && e.dmg >= 2 ? 12 : e.spe >= FAST ? -8 : 0;
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
  const setters = team.filter(e => e.strat.set.has(plan.field));
  if (!setters.length) return false;
  if (plan.kind === 'room') return team.filter(e => e.spe <= SLOW && e.dmg >= 2).length >= 3;
  return team.filter(e => benefits(e, plan.field) && !(setters.length === 1 && e === setters[0] && !e.strat.use.has(plan.field))).length >= 2;
}

/**
 * Equipes para todos os planos do save, da melhor nota para a pior, sem repetir a mesma equipe.
 * @param {object[]} all Pokémon do save (equipe + PC)
 * @param {object} T tabelas do jogo
 * @param {{ want?: object[] }} [opts] Pokémon que o jogador quer na equipe (do save)
 */
export function buildTeams(all, T, { want = [] } = {}) {
  const types = attackTypes(T);
  const pool = prepare(all, T);
  for (const e of pool) {
    e.conflictBy = {};
    for (const f of WEATHERS) e.conflictBy[f] = weatherConflict(e.m, f, T);
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


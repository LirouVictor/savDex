// Ameaças concretas: os Pokémon fortes que existem no jogo do save, com tipos, stats e habilidades do próprio jogo
// (ROM no Quetzal, no Unbound e no SoulGold), e como cada membro da equipe se sai contra cada um.
//
// Três coisas separadas:
// - cobertura de tipos: algum golpe acerta a ameaça em cheio (só a tabela de tipos);
// - dano potencial: o quanto o melhor golpe tira dela (estimativa pela fórmula de dano);
// - resposta: o membro entra no campo (aguenta o golpe da ameaça na troca) e vence o 1 contra 1, ou ao menos vence
//   vindo de graça (depois que um aliado cai). Golpe super efetivo sozinho não é resposta.
//
// Estimativa, não simulação: os dois lados no mesmo nível (50), IVs 31, sem EVs, natureza neutra, sem itens, sem
// mudança de stats, sem críticos e com o dano médio. A ameaça usa o golpe mais forte contra o membro entre um golpe de
// 80 de poder de cada tipo dela (o que costuma ter por TM) e os golpes de dano que aprende por nível (tabela da ROM;
// sem ela, 90 de poder). O app não sabe os times dos treinadores do jogo nem os golpes de TM.
import { ABILITY_IMMUNE, ABILITY_HALVE, isLegendary, levelMoves } from './build.js';
import { WEATHER } from '../ai/strategy.js';

export const THREAT_BST = 500; // stats base somados: as ameaças fortes (Garchomp 600, Scizor 500…)
const LEVEL = 50;
const STAB_ROM = 80, STAB_GUESS = 90; // golpe do próprio tipo suposto (com e sem a tabela de golpes da ROM)
const SPEED_ABILITY = { 'Swift Swim': 'chuva', Chlorophyll: 'sol', 'Sand Rush': 'tempestade de areia', 'Slush Rush': 'neve/granizo' };
// Fora: megas e Gigantamax (vêm de outra forma), formas que só aparecem no meio da batalha (Palafin-Hero, Greninja-Ash,
// Darmanitan-Zen, Aegislash-Blade, Minior-Core, Mimikyu-Busted) e quem tem só habilidade que o trava (Slaking: Truant)
const SKIP_FORM = /Mega|Primal|Giga|Gmax|Eternamax|Ultra|^Hero$|^Ash$|Zen|^Blade$|^Core$|^Busted$|^Complete$/;
const CRIPPLED = new Set(['Truant', 'Slow Start']);
// Golpes que não entram na estimativa: derrubam quem usa (Explosion), param um turno depois (Hyper Beam), carregam
// um turno (Solar Beam fora do sol, Sky Attack…) ou dependem de outra coisa (Focus Punch, Dream Eater, Future Sight)
const SKIP_MOVES = new Set(['Explosion', 'Self-Destruct', 'Misty Explosion', 'Final Gambit', 'Hyper Beam', 'Giga Impact', 'Rock Wrecker',
  'Blast Burn', 'Hydro Cannon', 'Frenzy Plant', 'Roar of Time', 'Eternabeam', 'Prismatic Laser', 'Meteor Assault', 'Sky Attack', 'Skull Bash',
  'Razor Wind', 'Meteor Beam', 'Freeze Shock', 'Ice Burn', 'Focus Punch', 'Dream Eater', 'Future Sight', 'Doom Desire', 'Last Resort',
  'Belch', 'Synchronoise', 'Shell Trap', 'Steel Roller', 'Fake Out', 'First Impression']);
const CHARGE = { 'Solar Beam': 'sol', 'Solar Blade': 'sol', 'Electro Shot': 'chuva' }; // só no clima, sem carregar
// Gen 3: a categoria vem do tipo do golpe
const SPECIAL_G3 = new Set(['fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon', 'dark']);

const stat = b => b + 20; // nível 50, IV 31, sem EVs, natureza neutra
const hp = b => b + 75;

/**
 * As ameaças de referência do jogo: espécies (e formas de batalha, sem megas) com stats base 500+, não lendárias,
 * que existem no jogo: Dex Nacional e formas da ROM no Quetzal; a tabela da ROM no Unbound; a Pokédex de Johto no
 * SoulGold; 1–386 na Gen 3; 1–493 / 1–649 nos jogos de DS (stats e tipos da época).
 * @param {object} T tabelas do jogo do save
 * @param {{ id: string, gen?: number }} game
 * @param {object|null} dex golpes por nível da ROM (os da ameaça também contam)
 */
export function threatList(T, game, dex = null) {
  const out = [];
  const typeName = i => T.types[i] || null;
  const add = (id, name, form, types, stats, abilities) => {
    if (!stats || !types.length) return;
    const bst = stats.reduce((a, b) => a + b, 0);
    if (bst < THREAT_BST || isLegendary({ species: { name } })) return;
    const abs = abilities.filter(Boolean);
    if (abs.length && abs.every(a => CRIPPLED.has(a))) return;
    out.push({ id, name, form: form || null, types, stats, abilities: abs, bst });
  };
  if (T.unbound || T.soulgold) {
    const D = T.unbound || T.soulgold;
    const only = T.soulgold ? new Set(D.johto) : null;
    D.species.forEach((row, id) => {
      if (!row || (only && !only.has(id)) || SKIP_FORM.test(row[1] || '')) return;
      const [name, form0, , , , t1, t2, a1, a2, ha, , , ...base] = row;
      // SoulGold: a forma regional às vezes só aparece no nome do Showdown (Goodra-Hisui)
      const sd = T.soulgold && D.showdown[id];
      const form = form0 || (sd && sd.startsWith(name + '-') ? sd.slice(name.length + 1) : null);
      add(id, name, form, [t1, t2].filter(Boolean).map(typeName).filter(Boolean), base, [D.abilities[a1], D.abilities[a2], D.abilities[ha]]);
    });
  } else if (T.gen3) {
    T.gen3.species.forEach((row, id) => {
      if (!row || row[0] > 386) return;
      const [national, t1, t2, a1, a2, , , ...base] = row;
      add(id, T.species[national][0], null, [t1, t2].filter(Boolean).map(typeName).filter(Boolean), base, [T.gen3.abilities[a1], T.gen3.abilities[a2]]);
    });
  } else if (T.nds) {
    const gen = (game && game.gen) || 4;
    T.nds.species[gen].forEach((row, n) => {
      if (!row || !T.species[n]) return;
      const [t1, t2, , ...base] = row;
      // Habilidades: as da PokeAPI (podem ter mudado depois da época)
      add(n, T.species[n][0], null, [t1, t2].filter(Boolean).map(typeName).filter(Boolean), base, (T.speciesAbilities[n] || []).slice(0, 2).map(a => T.abilityNames[a]));
    });
  } else {
    // Quetzal (e, sem tabelas próprias, a Dex Nacional): até 898 a PokeAPI (igual à ROM), depois a tabela da ROM
    const Q = T.quetzal;
    const last = Q ? 898 : T.species.length - 1;
    for (let n = 1; n <= last; n++) {
      if (!T.species[n]) continue;
      const [name, ...ty] = T.species[n];
      add(n, name, null, ty.map(typeName).filter(Boolean), T.baseStats[n], (T.speciesAbilities[n] || []).map(a => T.abilityNames[a]));
    }
    if (Q) {
      for (const [k, row] of Object.entries(Q.species)) {
        const id = +k;
        if (id <= 898 || !row || row[11] || SKIP_FORM.test(row[9] || '')) continue;
        add(id, row[0], row[9], row[1].map(typeName).filter(Boolean), row[2], row[3]);
      }
    }
  }
  // Formas iguais na batalha (Unown, Vivillon…) contam uma vez
  const seen = new Set();
  const list = out.filter(x => {
    const k = x.types.join('/') + ':' + x.stats.join(',') + ':' + x.abilities.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Golpes de cada ameaça: um de 80 (90 sem a tabela da ROM) de cada tipo dela, mais os de dano que aprende por nível
  const gen3 = !!T.gen3;
  for (const x of list) {
    const learned = dex && dex.rom ? levelMoves({ speciesId: x.id }, dex, T) : [];
    const physical = x.stats[1] >= x.stats[3];
    const stab = learned.length || dex ? STAB_ROM : STAB_GUESS;
    const moves = x.types.map(ty => ({ name: null, type: ty, power: stab, category: gen3 ? (SPECIAL_G3.has(ty) ? 1 : 0) : physical ? 0 : 1 }));
    for (const mv of learned) {
      if ((mv.category === 0 || mv.category === 1) && mv.type && mv.power >= 60) moves.push({ name: mv.name, type: mv.type, power: mv.power, category: mv.category });
    }
    x.moves = moves;
    x.learned = learned.length > 0;
  }
  list.sort((a, b) => b.bst - a.bst || a.name.localeCompare(b.name));
  return list;
}

/** Multiplicador de tipo (tabela do jogo). */
export function typeMult(T) {
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  return (atk, defs) => (idx.has(atk) ? defs.reduce((x, d) => x * (idx.has(d) ? T.typechart[idx.get(atk)][idx.get(d)] : 1), 1) : 1);
}

/** Variante das contas pelo plano: clima (Water/Fire e as habilidades de velocidade), Trick Room ou nenhum. */
export const variantOf = plan => (plan.kind === 'room' ? 'room' : plan.kind === 'weather' ? plan.field : 'none');

// Dano médio em % do HP do alvo (fórmula das gerações 5+, nível 50, sem itens): poder, ataque, defesa, STAB,
// multiplicador (tipo, habilidade, clima) e HP do alvo, já nos stats do nível 50
function pct(P, A, D, stab, k, HP) {
  const base = Math.floor(Math.floor((Math.floor((2 * LEVEL) / 5) + 2) * P * A / D) / 50) + 2;
  return (100 * base * stab * k * 0.925) / HP;
}

// O que não muda entre as contas de um mesmo Pokémon (ameaça ou membro): os stats no nível 50, os golpes que contam e
// quanto cada tipo de golpe tira dele (tabela de tipos e habilidades que anulam ou cortam pela metade). Guardado por
// tabela de tipos (`mult`), para as dezenas de milhares de contas da busca não refazerem isso
function side(o, mult, stats, types, abilities, moves) {
  if (o._side && o._side.mult === mult) return o._side;
  const immune = new Set(abilities.flatMap(a => ABILITY_IMMUNE[a] || [])), halve = new Set(abilities.flatMap(a => ABILITY_HALVE[a] || []));
  const k = {}, se = {};
  const into = ty => {
    if (!(ty in k)) { const m = mult(ty, types); se[ty] = m > 1; k[ty] = immune.has(ty) ? 0 : m * (halve.has(ty) ? 0.5 : 1); }
    return k[ty];
  };
  return (o._side = {
    mult, into, se, abilities,
    hp: hp(stats[0]), def: stat(stats[2]), spd: stat(stats[4]), spe: stats[5],
    moves: strongest(moves.filter(mv => !SKIP_MOVES.has(mv.name)).map(mv => ({
      mv, type: mv.type, power: mv.power, A: stat(mv.category === 0 ? stats[1] : stats[3]), phys: mv.category === 0,
      stab: types.includes(mv.type) ? 1.5 : 1, charge: CHARGE[mv.name] || null,
    }))),
  });
}

// Do mesmo tipo e categoria, só o mais forte importa (o resultado é o mesmo, com menos contas). Golpes de poder
// variável (Low Kick…) contam só para a cobertura; os que carregam fora do clima (Solar Beam) ficam à parte
function strongest(list) {
  const out = [], at = new Map();
  for (const m of list) {
    if (m.charge) { out.push(m); continue; }
    const key = m.type + (m.phys ? 'p' : 's');
    const i = at.get(key);
    if (i === undefined) { at.set(key, out.length); out.push(m); } else if ((m.power || 0) * m.A > (out[i].power || 0) * out[i].A) out[i] = m;
  }
  return out;
}
const threatSide = (x, mult) => side(x, mult, x.stats, x.types, x.abilities, x.moves);
// O membro na troca ainda tem a habilidade da forma comum (Lightning Rod no Raichu); a mega, a dela
const memberSide = (e, mult) => side(e, mult, e.bf.species.baseStats, e.types, [e.abBase, e.bf.ability && e.bf.ability.name].filter(Boolean), e.atk);

// O clima muda o dano só de alguns golpes: Water e Fire (1,5× ou metade) e os que carregam fora do clima (Solar Beam
// no sol, Electro Shot na chuva). Por isso o melhor golpe de cada classe é calculado uma vez por par (membro × ameaça),
// e cada plano só ajusta: 0 os outros, 1 Water, 2 Fire, 3 só no sol, 4 só na chuva
const CLASSES = 5;
const classOf = m => (m.charge === 'sol' ? 3 : m.charge === 'chuva' ? 4 : m.type === 'water' ? 1 : m.type === 'fire' ? 2 : 0);

/** O melhor golpe de `a` contra `d` em cada classe: dano em % (sem o clima) em dmg[o + c], o golpe em by[c]. */
function bestByClass(a, d, dmg, o, by = null, se = null) {
  for (const m of a.moves) {
    const k0 = d.into(m.type);
    if (!k0) continue;
    const c = classOf(m);
    if (se && d.se[m.type]) se[c] = true;
    if (!m.power) continue;
    const v = pct(m.power, m.A, m.phys ? d.def : d.spd, m.stab, k0, d.hp);
    if (v > dmg[o + c]) { dmg[o + c] = v; if (by) by[c] = m.mv; }
  }
}

/** O dano no plano: o melhor das classes que valem nele, com o clima. [dano, classe] */
function pick(dmg, o, variant) {
  const w = WEATHER[variant];
  let out = dmg[o], c = 0;
  const water = dmg[o + 1] * (!w ? 1 : w.boosts === 'water' ? 1.5 : w.weakens === 'water' ? 0.5 : 1);
  const fire = dmg[o + 2] * (!w ? 1 : w.boosts === 'fire' ? 1.5 : w.weakens === 'fire' ? 0.5 : 1);
  if (water > out) { out = water; c = 1; }
  if (fire > out) { out = fire; c = 2; }
  if (variant === 'sol' && dmg[o + 3] > out) { out = dmg[o + 3]; c = 3; }
  if (variant === 'chuva' && dmg[o + 4] > out) { out = dmg[o + 4]; c = 4; }
  return [out, c];
}

/** Vence vindo de graça / entra na troca e vence, pelo dano dos dois lados e pela velocidade. */
function verdict(me, them, out, inn, variant) {
  // Velocidade: stats base (mesmo nível); no clima, as habilidades de velocidade dobram; no Trick Room, inverte
  const spe = (s, list) => s * (list.some(a => SPEED_ABILITY[a] === variant) ? 2 : 1);
  const vMe = spe(me.spe, me.abilities), vThem = spe(them.spe, them.abilities);
  const faster = variant === 'room' ? vMe < vThem : vMe > vThem;
  const nT = out > 0 ? Math.ceil(100 / out) : Infinity; // golpes para derrubar a ameaça
  const nM = inn > 0 ? Math.ceil(100 / inn) : Infinity; // golpes que o membro aguenta
  // Vindo de graça: o mais rápido bate primeiro. Entrando na troca, leva um golpe a mais
  return { faster, wins: nT < Infinity && (faster ? nT <= nM : nT < nM), safe: nT < Infinity && (faster ? nT < nM : nT + 1 < nM) };
}

/**
 * Um membro (entrada de prepare) contra uma ameaça.
 * @returns {{ out: number, in: number, se: boolean, faster: boolean, wins: boolean, safe: boolean, by: object|null, with: object|null }}
 *   out/in: dano estimado em % (do membro na ameaça / da ameaça no membro); wins: vence o 1 contra 1 vindo de graça;
 *   safe: também entra no campo (aguenta um golpe na troca) e vence
 */
export function matchup(e, x, mult, variant = 'none') {
  const me = memberSide(e, mult), them = threatSide(x, mult);
  const dmg = new Float64Array(2 * CLASSES), byO = [], byI = [], se = [];
  bestByClass(me, them, dmg, 0, byO, se);
  bestByClass(them, me, dmg, CLASSES, byI);
  const [out, co] = pick(dmg, 0, variant), [inn, ci] = pick(dmg, CLASSES, variant);
  return {
    out, in: inn, by: byO[co] || null, with: byI[ci] || null,
    // Acerta em cheio com algum golpe que vale no plano
    se: se[0] || se[1] || se[2] || (variant === 'sol' && !!se[3]) || (variant === 'chuva' && !!se[4]),
    ...verdict(me, them, out, inn, variant),
  };
}

/**
 * Quais ameaças o membro vence (wins) e quais ele também segura na troca (safe), em bits, no plano. O dano de cada
 * par é calculado uma vez (`e._dmg`); cada plano só ajusta o clima e a velocidade.
 * @param {{ threats: object[], mult: Function, words: number }} c
 */
export function threatBits(e, c, variant) {
  const n = c.threats.length;
  if (!e._dmg || e._dmg.mult !== c.mult) {
    const me = memberSide(e, c.mult), dmg = new Float64Array(n * 2 * CLASSES);
    c.threats.forEach((x, i) => {
      const them = threatSide(x, c.mult);
      bestByClass(me, them, dmg, i * 2 * CLASSES);
      bestByClass(them, me, dmg, i * 2 * CLASSES + CLASSES);
    });
    e._dmg = { mult: c.mult, dmg };
  }
  const me = memberSide(e, c.mult), dmg = e._dmg.dmg;
  const safe = new Uint32Array(c.words), wins = new Uint32Array(c.words);
  for (let i = 0; i < n; i++) {
    const o = i * 2 * CLASSES;
    const r = verdict(me, threatSide(c.threats[i], c.mult), pick(dmg, o, variant)[0], pick(dmg, o + CLASSES, variant)[0], variant);
    if (r.wins) wins[i >>> 5] |= 1 << (i & 31);
    if (r.safe) safe[i >>> 5] |= 1 << (i & 31);
  }
  return { safe, wins };
}

/**
 * A equipe contra as ameaças, separando cobertura, dano e resposta.
 * @returns {{ n: number, se: number, hit2: number, safe: number, wins: number, none: object[], onlyWins: object[], per: object[] }}
 */
export function teamThreats(team, threats, mult, variant = 'none') {
  const per = threats.map(x => {
    const ms = team.map(e => ({ e, r: matchup(e, x, mult, variant) }));
    const best = ms.reduce((a, b) => (b.r.out > a.r.out ? b : a));
    return {
      x, se: ms.some(m => m.r.se), hit2: best.r.out >= 50, best: best.r.out,
      safe: ms.filter(m => m.r.safe).map(m => m.e), wins: ms.filter(m => m.r.wins).map(m => m.e),
    };
  });
  return {
    n: threats.length,
    se: per.filter(p => p.se).length,
    hit2: per.filter(p => p.hit2).length,
    safe: per.filter(p => p.safe.length).length,
    wins: per.filter(p => p.wins.length).length,
    none: per.filter(p => !p.wins.length).map(p => p.x),
    onlyWins: per.filter(p => p.wins.length && !p.safe.length).map(p => p.x),
    // Golpe super efetivo sem resposta: a cobertura sozinha enganaria
    seNoAnswer: per.filter(p => p.se && !p.wins.length).length,
    per,
  };
}


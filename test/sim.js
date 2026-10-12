// Simulador de batalhas para o teste de comparação do montador (test/builder-sim.test.js). Não entra no app.
// Usa o simulador do Pokémon Showdown (MIT), instalado à parte: `npm i --no-save pokemon-showdown@0.11.11`.
// As equipes do app jogam contra times do random battle da geração do save (conjuntos competitivos feitos pelo
// Showdown, independentes da nota do app). Os dois lados usam o mesmo jogador automático: o golpe que tira mais HP,
// hazards e telas uma vez, setup quando é seguro, recuperação com pouca vida, status quando o dano é baixo, a troca quando
// cairia no próximo golpe e alguém do banco aguenta, e a troca pelo melhor confronto quando alguém cai. O lado do app também usa o plano da equipe: põe o clima, o terreno ou o Trick Room
// quando ele não está ativo e começa com quem o põe. Todos no nível 100, IVs 31, 85 EVs em cada stat, natureza neutra:
// mede a composição da equipe, não o treino.

import { createRequire } from 'node:module';
import { FIELD, FIELD_MOVES, MEGA_FIELD } from '../src/ai/strategy.js';
import { finalMoveset } from '../src/builder/build.js';

const require = createRequire(import.meta.url);
let PS = null;
/** O Showdown, se estiver instalado (null senão). */
export function showdown() {
  if (PS === null) {
    try { PS = require('pokemon-showdown'); } catch { PS = false; }
  }
  return PS || null;
}

// Formato da batalha e dos adversários por jogo do save
export function formatsFor(game) {
  const g = game.id, gen = game.gen;
  if (g === 'quetzal' || g === 'soulgold') return { battle: 'gen9nationaldexag', opp: 'gen9randombattle' };
  if (g === 'unbound') return { battle: 'gen9nationaldexag', opp: 'gen8randombattle' };
  if (gen === 3 || ['emerald', 'frlg', 'rs'].includes(g)) return { battle: 'gen3customgame', opp: 'gen3randombattle' };
  if (gen === 4 || ['dp', 'pt', 'hgss'].includes(g)) return { battle: 'gen4customgame', opp: 'gen4randombattle' };
  return { battle: 'gen5customgame', opp: 'gen5randombattle' };
}

const toID = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const EV85 = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
const IV31 = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

const HAZARDS = new Set(['stealthrock', 'spikes', 'toxicspikes', 'stickyweb']);
const SCREENS = new Set(['reflect', 'lightscreen', 'auroraveil']);
const SETUP = new Set(['swordsdance', 'dragondance', 'nastyplot', 'calmmind', 'quiverdance', 'shellsmash', 'bulkup', 'coil', 'shiftgear',
  'tailglow', 'geomancy', 'victorydance', 'tidyup', 'filletaway', 'clangoroussoul', 'noretreat', 'agility', 'rockpolish', 'curse', 'growth',
  'workup', 'honeclaws', 'cottonguard', 'irondefense', 'amnesia', 'bellydrum']);
const RECOVER = new Set(['recover', 'roost', 'softboiled', 'slackoff', 'moonlight', 'synthesis', 'morningsun', 'shoreup', 'milkdrink',
  'strengthsap', 'junglehealing', 'lunarblessing', 'healorder', 'rest']);
const STATUS = new Set(['toxic', 'willowisp', 'thunderwave', 'spore', 'sleeppowder', 'hypnosis', 'yawn', 'glare', 'stunspore', 'nuzzle']);
// Clima/terreno do plano → condição do Showdown
const WEATHER_ID = { chuva: ['raindance', 'primordialsea'], sol: ['sunnyday', 'desolateland'], 'tempestade de areia': ['sandstorm'],
  'neve/granizo': ['hail', 'snowscape', 'snow'] };
const TERRAIN_ID = { 'Electric Terrain': 'electricterrain', 'Psychic Terrain': 'psychicterrain', 'Grassy Terrain': 'grassyterrain', 'Misty Terrain': 'mistyterrain' };
const FIELD_MOVE_ID = Object.fromEntries(Object.entries(FIELD_MOVES).map(([k, v]) => [toID(k), v]));

/**
 * O conjunto do Showdown de uma entrada do montador: a espécie que a tela mostra (a evoluída, se for o caso), a
 * habilidade do save, o item (a megapedra a dar, se houver) e até 4 golpes: os que o app manda ensinar primeiro e
 * depois os que ele já sabe, os de dano mais fortes antes. null se o Showdown não conhece a espécie.
 */
export function toSet(e, plan, dex) {
  const m = e.m;
  const sp = dex.species.get(m.species.showdown || m.species.name);
  if (!sp.exists) return null;
  const teach = [...(e.teachAtk || []).map(x => x.name)];
  if (plan.field && e.teach) {
    for (const name of e.teach.keys()) {
      if (name === 'Trick Room' ? plan.field === 'Trick Room' : FIELD_MOVES[name] === plan.field) teach.push(name);
    }
  }
  if (plan.kind === 'offense') {
    if (e.sweep && e.sweep < 1 && e.sweepMove) teach.push(e.sweepMove.name);
    if (e.hoSup && e.hoSup < 1 && e.supMove) teach.push(e.supMove.name);
  }
  // Moveset do montador (Quetzal): os 4 golpes escolhidos, com os que o plano pede no lugar dos que menos fazem falta
  if (e.set) {
    const ids = finalMoveset(e, teach.filter(n => e.mcands && e.mcands.some(x => x.name === n))).map(mv => dex.moves.get(mv.name)).filter(mv => mv.exists).map(mv => mv.id);
    if (!ids.length) return null;
    const itemName = e.given || (m.item && m.item.name);
    const item = itemName && dex.items.get(itemName).exists ? dex.items.get(itemName).name : '';
    const ab = m.ability && m.ability.name && dex.abilities.get(m.ability.name).exists ? dex.abilities.get(m.ability.name).name : sp.abilities[0];
    return { name: sp.name, species: sp.name, item, ability: ab, moves: [...new Set(ids)].slice(0, 4), nature: 'Serious', evs: EV85, ivs: IV31, level: 100, gender: '' };
  }
  const known = m.moves.map(mv => dex.moves.get(mv.name)).filter(mv => mv.exists);
  const rank = mv => {
    if (mv.category === 'Status') return HAZARDS.has(mv.id) || SCREENS.has(mv.id) || SETUP.has(mv.id) || RECOVER.has(mv.id)
      || mv.id === 'trickroom' || FIELD_MOVE_ID[mv.id] ? 300 : 40;
    return (mv.basePower || 70) * (sp.types.includes(mv.type) ? 1.5 : 1);
  };
  const moves = [];
  for (const name of teach) { const mv = dex.moves.get(name); if (mv.exists && !moves.includes(mv.id)) moves.push(mv.id); }
  for (const mv of known.sort((a, b) => rank(b) - rank(a))) { if (moves.length >= 4) break; if (!moves.includes(mv.id)) moves.push(mv.id); }
  if (!moves.length) return null;
  const itemName = e.given || (m.item && m.item.name);
  const item = itemName && dex.items.get(itemName).exists ? dex.items.get(itemName).name : '';
  const ab = m.ability && m.ability.name && dex.abilities.get(m.ability.name).exists ? dex.abilities.get(m.ability.name).name : sp.abilities[0];
  return { name: sp.name, species: sp.name, item, ability: ab, moves: moves.slice(0, 4), nature: 'Serious', evs: EV85, ivs: IV31, level: 100, gender: '' };
}

/** Quem põe o plano vai na frente (o clima, o terreno, o Trick Room ou os hazards desde o 1º turno). */
export function leadOrder(team, plan) {
  const sets = e => {
    if (plan.kind === 'offense') return e.hoSup ? 1 : 0;
    if (!plan.field) return 0;
    const ab = e.m.ability && e.m.ability.name;
    if (FIELD[ab] === plan.field || MEGA_FIELD[e.given || (e.m.item && e.m.item.name)] === plan.field) return 2;
    return e.strat && (e.strat.set.has(plan.field) || (e.learnSet && e.learnSet.has(plan.field))) ? 1 : 0;
  };
  return team.slice().sort((a, b) => sets(b) - sets(a));
}

// Dano esperado (fração aproximada pela fórmula; sem itens nem a maioria das habilidades)
function damage(battle, att, def, moveId) {
  const dex = battle.dex;
  const mv = dex.moves.get(moveId);
  if (!mv.exists || mv.category === 'Status') return 0;
  if (mv.id === 'seismictoss' || mv.id === 'nightshade') return att.level;
  if (mv.ohko) return 0;
  const types = def.getTypes();
  if (!dex.getImmunity(mv.type, types)) return 0;
  const ab = def.ability;
  if ((ab === 'levitate' && mv.type === 'Ground') || (ab === 'flashfire' && mv.type === 'Fire')
    || (['waterabsorb', 'stormdrain', 'dryskin'].includes(ab) && mv.type === 'Water')
    || (['voltabsorb', 'lightningrod', 'motordrive'].includes(ab) && mv.type === 'Electric')
    || (ab === 'sapsipper' && mv.type === 'Grass')) return 0;
  const eff = 2 ** dex.getEffectiveness(mv.type, types);
  if (ab === 'wonderguard' && eff <= 1) return 0;
  let bp = mv.basePower || 60;
  const hits = Array.isArray(mv.multihit) ? 3 : mv.multihit || 1;
  const phys = mv.category === 'Physical';
  const A = att.getStat(phys ? 'atk' : 'spa', false, true), D = def.getStat(phys ? 'def' : 'spd', false, true); // sem os eventos de habilidade
  const stab = att.getTypes().includes(mv.type) ? (att.ability === 'adaptability' ? 2 : 1.5) : 1;
  const w = battle.field.effectiveWeather();
  let wx = 1;
  if (['raindance', 'primordialsea'].includes(w)) wx = mv.type === 'Water' ? 1.5 : mv.type === 'Fire' ? 0.5 : 1;
  if (['sunnyday', 'desolateland'].includes(w)) wx = mv.type === 'Fire' ? 1.5 : mv.type === 'Water' ? 0.5 : 1;
  if (mv.id === 'solarbeam' || mv.id === 'solarblade') bp = ['sunnyday', 'desolateland'].includes(w) ? bp : bp / 2;
  const acc = mv.accuracy === true ? 1 : mv.accuracy / 100;
  return ((2 * att.level / 5 + 2) * bp * A / D / 50 + 2) * stab * eff * wx * hits * acc * 0.925;
}

const bestDamage = (battle, att, def) => Math.max(0, ...att.moveSlots.filter(s => s.pp > 0).map(s => damage(battle, att, def, s.id)));

function planActive(battle, side, plan) {
  if (!plan || !plan.field) return true;
  if (plan.field === 'Trick Room') return !!battle.field.pseudoWeather.trickroom;
  if (TERRAIN_ID[plan.field]) return battle.field.terrain === TERRAIN_ID[plan.field];
  return (WEATHER_ID[plan.field] || []).includes(battle.field.effectiveWeather());
}

const lastSwitch = new WeakMap(); // lado → turno da última troca voluntária

/** A escolha do jogador automático para um lado. */
function decide(battle, side, plan) {
  const req = side.activeRequest;
  if (!req || req.wait) return null;
  if (req.teamPreview) return 'default';
  const me = side.active[0], foe = side.foe.active[0];
  if (req.forceSwitch) {
    let best = null, bestV = -Infinity;
    side.pokemon.forEach((p, i) => {
      if (p.fainted || p.isActive) return;
      const v = foe && !foe.fainted ? bestDamage(battle, p, foe) / foe.hp - bestDamage(battle, foe, p) / p.hp : p.hp / p.maxhp;
      if (v > bestV) { bestV = v; best = i + 1; }
    });
    return best ? `switch ${best}` : 'pass';
  }
  const opts = req.active[0].moves.map((m, i) => ({ id: m.id, i: i + 1, ok: !m.disabled && (m.pp === undefined || m.pp > 0) })).filter(m => m.ok);
  if (!opts.length || !foe) return 'default';
  const mega = me.canMegaEvo ? ' mega' : '';
  const pick = o => `move ${o.i}${mega}`;
  const has = id => opts.find(o => o.id === id);
  // O plano: põe o campo quando ele não está ativo
  if (plan && plan.field && !planActive(battle, side, plan)) {
    const o = opts.find(x => (plan.field === 'Trick Room' ? x.id === 'trickroom' : FIELD_MOVE_ID[x.id] === plan.field));
    if (o) return pick(o);
  }
  const foeAlive = side.foe.pokemon.filter(p => !p.fainted).length;
  const taken = bestDamage(battle, foe, me) / me.hp; // quanto da vida atual o adversário tira
  const dealt = Math.max(0, ...opts.map(o => damage(battle, me, foe, o.id)));
  // Troca: cairia no próximo golpe sem derrubar antes (ou mais lento), e alguém do banco aguenta o golpe e bate melhor.
  // No máximo uma troca a cada 3 turnos por lado (sem ficar trocando sem parar)
  const room = !!battle.field.pseudoWeather.trickroom;
  const spe = p => p.getStat('spe', false, true) * (room ? -1 : 1);
  const first = spe(me) > spe(foe);
  if (taken >= 1 && !(first && dealt >= foe.hp) && !req.active[0].trapped && (lastSwitch.get(side) ?? -9) + 3 <= battle.turn) {
    let best = null, bestV = 0;
    side.pokemon.forEach((p, i) => {
      if (p.fainted || p.isActive) return;
      const tk = bestDamage(battle, foe, p) / p.hp;
      if (tk >= 0.5) return;
      const v = bestDamage(battle, p, foe) / foe.hp - tk;
      if (v > bestV) { bestV = v; best = i + 1; }
    });
    if (best) { lastSwitch.set(side, battle.turn); return `switch ${best}`; }
  }
  for (const o of opts) if (HAZARDS.has(o.id) && foeAlive >= 3 && !side.foe.sideConditions[o.id] && taken < 0.6) return pick(o);
  for (const o of opts) if (SCREENS.has(o.id) && !side.sideConditions[o.id] && taken < 0.6) return pick(o);
  if (me.hp / me.maxhp < 0.5 && taken < 0.5) for (const o of opts) if (RECOVER.has(o.id)) return pick(o);
  if (me.hp / me.maxhp > 0.7 && taken < 0.4 && dealt < foe.hp) {
    for (const o of opts) if (SETUP.has(o.id) && Math.max(me.boosts.atk, me.boosts.spa, me.boosts.def, me.boosts.spe) < 2) return pick(o);
  }
  if (!foe.status && dealt / foe.hp < 0.25) for (const o of opts) if (STATUS.has(o.id)) return pick(o);
  let best = opts[0], bv = -1;
  for (const o of opts) { const v = damage(battle, me, foe, o.id); if (v > bv) { bv = v; best = o; } }
  return pick(best);
}

/**
 * Uma batalha: `p1` (a equipe do app, com o plano) contra `p2` (um time do random battle ou, com `plan2`, outra equipe
 * do app). Devolve 1 se p1 venceu, 0 se perdeu, 0,5 no empate ou se passar de 300 turnos.
 */
export function battle(format, p1, p2, plan, seed, plan2 = null) {
  const { Battle } = showdown();
  const b = new Battle({ formatid: format, seed });
  b.setPlayer('p1', { name: 'app', team: p1 });
  b.setPlayer('p2', { name: 'rnd', team: p2 });
  // p2 com plano = outra equipe do app (torneio entre as equipes do save)
  let guard = 0;
  while (!b.ended && guard++ < 1200) {
    let acted = false;
    for (const [side, pl] of [[b.p1, plan], [b.p2, plan2]]) {
      const c = decide(b, side, pl);
      if (c === null) continue;
      acted = true;
      if (!b.choose(side.id, c)) b.choose(side.id, 'default');
    }
    if (!acted || b.turn > 300) break;
  }
  if (!b.ended) return 0.5;
  return b.winner === 'app' ? 1 : b.winner === 'rnd' ? 0 : 0.5;
}

/** Times adversários fixos (mesma semente para todas as equipes do save: comparação pareada), todos no nível 100. */
export function opponents(format, n, seed = 1) {
  const { Teams } = showdown();
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Teams.generate(format, { seed: [seed, i + 1, 7, 11] });
    out.push(t.map(s => ({ ...s, level: 100 })));
  }
  return out;
}

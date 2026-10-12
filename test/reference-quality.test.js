// Qualidade das equipes adaptadas às referências (reference.js), no modo moveset do Quetzal (lista do tutor): quem fica
// preserva o papel que tinha na original quando consegue, as perdas são as reais e a fidelidade cai quando a adaptação não
// reproduz a estratégia. Casos determinísticos, com o comportamento esperado explícito.
import { describe, it, expect } from 'vitest';
import T from '../src/data/tables.js';
import { prepareBuild, freeTeams, scoreParts } from '../src/builder/build.js';
import { referenceTeams, refPlan, fidelity, FID_W } from '../src/builder/reference.js';
import { runBuilder, resultsHtml } from '../src/builder/index.js';
import { setRoleKeys, refRoleBits, roleKeysOf } from '../src/builder/strategies.js';

const id = name => T.moves.findIndex(r => r && r[0] === name);
const info = name => { const i = id(name); const det = T.moveDetails[i]; return { name, type: T.types[T.moves[i][1]], power: det[0], accuracy: det[1], category: det[3] }; };
let slot = 0;
// Um Pokémon do save (sid = Dex Nacional) e a lista do tutor dele
const mon = (sp, sid, ty, base, ab, tutor, known = ['Tackle']) => ({
  m: { location: 'pc', where: 'BOX1', boxIndex: 0, slot: ++slot, speciesId: sid, nickname: sp, hasNickname: false, level: 60,
    species: { name: sp, form: null, types: ty, baseStats: base, hasIcon: false, spriteId: sid, abilities: [ab] },
    ability: { num: 0, name: ab }, item: null, nature: { name: 'Adamant' }, ivs: {}, evs: {},
    moves: known.map(n => ({ ...info(n), id: id(n) })), shiny: false, gender: null },
  tutor });
const MONS = {
  Pelipper: () => mon('Pelipper', 279, ['water', 'flying'], [60, 50, 100, 95, 70, 65], 'Drizzle', ['Hurricane', 'Scald', 'U-turn', 'Roost', 'Surf', 'Ice Beam']),
  Politoed: () => mon('Politoed', 186, ['water'], [90, 75, 75, 90, 100, 70], 'Drizzle', ['Scald', 'Ice Beam', 'Hypnosis', 'Encore', 'Surf', 'Focus Blast']),
  Kingdra: () => mon('Kingdra', 230, ['water', 'dragon'], [75, 95, 95, 95, 95, 85], 'Swift Swim', ['Hydro Pump', 'Draco Meteor', 'Ice Beam', 'Surf', 'Flash Cannon']),
  Ludicolo: () => mon('Ludicolo', 272, ['water', 'grass'], [80, 70, 70, 90, 100, 70], 'Swift Swim', ['Hydro Pump', 'Giga Drain', 'Ice Beam', 'Surf', 'Focus Blast']),
  Corviknight: () => mon('Corviknight', 823, ['flying', 'steel'], [98, 87, 105, 53, 85, 67], 'Pressure', ['Brave Bird', 'Body Press', 'Iron Head', 'Roost', 'Defog', 'U-turn', 'Bulk Up', 'Drill Run']),
  CorviknightNoDefog: () => mon('Corviknight', 823, ['flying', 'steel'], [98, 87, 105, 53, 85, 67], 'Pressure', ['Brave Bird', 'Body Press', 'Iron Head', 'Roost', 'Bulk Up', 'Drill Run']),
  Ferrothorn: () => mon('Ferrothorn', 598, ['grass', 'steel'], [74, 94, 131, 54, 116, 20], 'Iron Barbs', ['Power Whip', 'Gyro Ball', 'Stealth Rock', 'Spikes', 'Leech Seed', 'Knock Off']),
  Raichu: () => mon('Raichu', 26, ['electric'], [60, 90, 55, 90, 80, 110], 'Lightning Rod', ['Thunder', 'Volt Switch', 'Grass Knot', 'Focus Blast', 'Thunderbolt']),
  Garchomp: () => mon('Garchomp', 445, ['dragon', 'ground'], [108, 130, 95, 80, 85, 102], 'Rough Skin', ['Earthquake', 'Outrage', 'Swords Dance', 'Stone Edge', 'Fire Fang']),
  Scizor: () => mon('Scizor', 212, ['bug', 'steel'], [70, 130, 100, 55, 80, 65], 'Technician', ['Bullet Punch', 'U-turn', 'Swords Dance', 'Close Combat', 'Knock Off']),
  Clefable: () => mon('Clefable', 36, ['fairy'], [95, 70, 73, 95, 90, 60], 'Magic Guard', ['Moonblast', 'Moonlight', 'Flamethrower', 'Thunder Wave', 'Calm Mind']),
  Lucario: () => mon('Lucario', 448, ['fighting', 'steel'], [70, 110, 70, 115, 70, 90], 'Inner Focus', ['Aura Sphere', 'Flash Cannon', 'Nasty Plot', 'Vacuum Wave', 'Dark Pulse']),
};
const save = names => {
  slot = 0;
  const list = names.map(n => MONS[n]());
  const dex = { rom: true, learn: {}, tutor: {} };
  for (const x of list) { dex.learn[x.m.speciesId] = [0, 1, id('Tackle')]; dex.tutor[x.m.speciesId] = x.tutor.map(id); }
  return { all: list.map(x => x.m), dex };
};
// Um membro como o importador grava (só o que o set faz)
const set = (s, moves, o = {}) => {
  const mv = moves.map(info);
  const hits = mv.filter(m => m.category < 2);
  const x = { s, r: setRoleKeys({ abs: o.ab ? [o.ab] : [], item: o.item || null, moves: mv, types: [], b: null }), at: [...new Set(hits.map(m => m.type))].sort(), dmg: hits.length, cat: 'S' };
  for (const k of ['set', 'auto', 'use']) if (o[k]) x[k] = o[k];
  return x;
};
// Chuva: Pelipper põe e é pivô; Corviknight tira hazards e é pivô; Ferrothorn põe hazards
const RAIN = [
  set('Pelipper', ['Hurricane', 'Scald', 'U-turn', 'Roost'], { ab: 'Drizzle', set: ['chuva'], auto: ['chuva'], use: ['chuva'] }),
  set('Barraskewda', ['Liquidation', 'Close Combat', 'Flip Turn', 'Aqua Jet'], { ab: 'Swift Swim', use: ['chuva'] }),
  set('Kingdra', ['Hydro Pump', 'Draco Meteor', 'Ice Beam'], { ab: 'Swift Swim', use: ['chuva'] }),
  set('Ferrothorn', ['Power Whip', 'Stealth Rock', 'Spikes', 'Leech Seed']),
  set('Corviknight', ['Brave Bird', 'Body Press', 'Defog', 'U-turn']),
  set('Raichu', ['Thunder', 'Volt Switch', 'Grass Knot'], { use: ['chuva'] }),
];
const table = teams => [{ format: 'gen9test', name: 'Gen 9 Test', gen: 9, mode: 'singles', kind: 'sample_team',
  source: { thread: 'https://www.smogon.com/forums/threads/x/', dataset: 'https://github.com/pkmn/smogon/blob/main/data/teams/x.json', retrieved: '2026-10-12' },
  teams: teams.map((members, i) => ({ id: `t${i}`, verification: 'unverified', members })), results: [] }];
const game = { id: 'quetzal' };
const adapt = (names, members, opts) => {
  const { all, dex } = save(names);
  const ctx = prepareBuild(all, T, { dex });
  return { ctx, r: referenceTeams(ctx, table([members]), T, game, opts)[0], all, dex };
};
const corvOf = r => r.adapted.team.find(e => e.m.species.name === 'Corviknight');
const BASE = ['Pelipper', 'Kingdra', 'Ferrothorn', 'Raichu', 'Garchomp', 'Scizor', 'Clefable', 'Lucario', 'Ludicolo'];
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('qualidade das equipes adaptadas', () => {
  it('quem fica preserva o papel essencial da original (Corviknight tira hazards com Defog); antes, o moveset o perdia', () => {
    const before = adapt([...BASE, 'Corviknight'], RAIN, { roleMoves: false }).r;
    expect(roleKeysOf(corvOf(before).sbits)).not.toContain('removal');
    const { r } = adapt([...BASE, 'Corviknight'], RAIN);
    const corv = corvOf(r);
    expect(roleKeysOf(corv.sbits)).toContain('removal');
    expect(corv.set.map(x => x.name)).toContain('Defog');
    // A fidelidade sobe com o papel preservado
    expect(r.adapted.fidelity).toBeGreaterThan(before.adapted.fidelity);
  });

  it('a tela diz o que o mantido preserva (com o golpe) e mostra o golpe no card', () => {
    const { all, dex } = save([...BASE, 'Corviknight']);
    const res = runBuilder(all, T, '', dex, { saveGame: game, refs: table([RAIN]) });
    const html = text(resultsHtml(res, 0, T));
    expect(html).toMatch(/Corviknight mantém o papel da original \([^)]*tira hazards[^)]*\), com [^.]*Defog/);
    // O moveset mostrado (card, Showdown) leva o golpe do papel
    const corv = res[0].showdown.find(m => m.species.name === 'Corviknight');
    expect(corv.moves.map(x => x.name)).toContain('Defog');
  });

  it('quem fica mas não aprende o golpe do papel: a perda aparece como perda real ("não aprende o golpe neste jogo")', () => {
    const { all, dex } = save([...BASE, 'CorviknightNoDefog']);
    const res = runBuilder(all, T, '', dex, { saveGame: game, refs: table([RAIN]) });
    const corv = corvOf(res[0].ref);
    expect(roleKeysOf(corv.sbits)).not.toContain('removal');
    const html = text(resultsHtml(res, 0, T));
    expect(html).toMatch(/Corviknight perde [^:]*tira hazards[^:]*: não aprende o golpe neste jogo/);
    expect(html).not.toMatch(/Corviknight mantém o papel da original \([^)]*tira hazards/);
  });

  it('falta o integrante fundamental (quem põe a chuva): outro que põe a chuva entra e o plano fica; sem nenhum, o plano se perde', () => {
    const noPeli = BASE.filter(n => n !== 'Pelipper');
    const a = adapt([...noPeli, 'Politoed', 'Corviknight'], RAIN).r;
    expect(a.adapted.planKept && a.adapted.holds).toBe(true);
    expect(a.adapted.team.map(e => e.m.species.name)).toContain('Politoed');
    const peli = a.swaps.find(s => s.orig.x.s === 'Pelipper');
    expect(peli.sub.m.species.name).toBe('Politoed');
    const b = adapt([...noPeli, 'Corviknight'], RAIN).r;
    expect(b.adapted.plan.kind).toBe('balance');
    expect(b.adapted.fidelity).toBeLessThan(a.adapted.fidelity);
    const { all, dex } = save([...noPeli, 'Corviknight']);
    expect(text(resultsHtml(runBuilder(all, T, '', dex, { saveGame: game, refs: table([RAIN]) }), 0, T))).toContain('Plano da original (Chuva) perdido');
  });

  it('a fidelidade cai quando a adaptação não reproduz a estratégia (ninguém tira hazards)', () => {
    const full = adapt([...BASE, 'Corviknight'], RAIN).r;
    const none = adapt([...BASE, 'CorviknightNoDefog'], RAIN).r;
    expect(full.orig.strategies).toContain('hazards');
    let u = 0;
    for (const e of none.adapted.team) u |= e.sbits;
    expect(roleKeysOf(u)).not.toContain('removal');
    expect(none.adapted.fidelity).toBeLessThan(full.adapted.fidelity);
  });

  it('save pequeno: a referência com 2 membros no save troca os outros 4, cada um com substituto', () => {
    const { r } = adapt(['Pelipper', 'Kingdra', 'Garchomp', 'Scizor', 'Clefable', 'Lucario', 'Ludicolo'], RAIN);
    expect(r.kept.map(e => e.m.species.name).sort()).toEqual(['Kingdra', 'Pelipper']);
    expect(r.swaps).toHaveLength(4);
    expect(r.swaps.every(s => s.sub)).toBe(true);
  });

  it('a nota da adaptada é a do app (nada herdado), e a montagem livre pode achar uma equipe tão boa ou melhor', () => {
    const { ctx, r } = adapt([...BASE, 'Corviknight'], RAIN);
    expect(r.adapted.score).toBeCloseTo(scoreParts(r.adapted.team, r.adapted.plan, ctx.types).total, 9);
    const free = freeTeams(ctx);
    expect(free[0].score).toBeGreaterThanOrEqual(r.adapted.score - 1e-9);
    // A ordem das referências usa nota + fidelidade, mas a nota mostrada é só a do app
    expect(r.rank).toBeCloseTo(r.adapted.score + FID_W * fidelity(r.orig, r.adapted.planKept, r.adapted.plan)(r.adapted.team), 9);
  });
});

describe('plano da original pelo que os sets fazem', () => {
  const species = new Map(T.species.map((row, n) => [row && row[0], n]));
  const member = (s, x) => {
    const n = species.get(s);
    const sp = { types: T.species[n].slice(1).map(i => T.types[i]).filter(Boolean), stats: T.baseStats[n] };
    return { x, spec: sp, sbits: refRoleBits(x.r, sp.types, sp.stats), set: new Set(x.set || []), auto: new Set(x.auto || []), use: new Set(x.use || []), types: sp.types, spe: sp.stats[5], dmg: x.dmg };
  };
  const team = list => list.map(([s, moves, o]) => member(s, set(s, moves, o)));
  it('chuva, sol, neve, terreno, Trick Room, Hiperofensiva e equilibrada', () => {
    expect(refPlan(team(RAIN.map(x => [x.s, [], {}])).map((m, i) => ({ ...m, ...member(RAIN[i].s, RAIN[i]) })))).toEqual({ kind: 'weather', field: 'chuva' });
    expect(refPlan(team([['Torkoal', ['Lava Plume'], { ab: 'Drought', set: ['sol'], auto: ['sol'] }], ['Venusaur', ['Giga Drain', 'Sludge Bomb'], { ab: 'Chlorophyll', use: ['sol'] }],
      ['Lilligant', ['Petal Dance', 'Quiver Dance'], { ab: 'Chlorophyll', use: ['sol'] }]]))).toEqual({ kind: 'weather', field: 'sol' });
    expect(refPlan(team([['Abomasnow', ['Blizzard'], { ab: 'Snow Warning', set: ['neve/granizo'], auto: ['neve/granizo'], use: ['neve/granizo'] }],
      ['Arctozolt', ['Bolt Beak'], { ab: 'Slush Rush', use: ['neve/granizo'] }], ['Beartic', ['Icicle Crash'], { ab: 'Slush Rush', use: ['neve/granizo'] }]]))).toEqual({ kind: 'weather', field: 'neve/granizo' });
    expect(refPlan(team([['Pincurchin', ['Rising Voltage'], { ab: 'Electric Surge', set: ['Electric Terrain'], auto: ['Electric Terrain'], use: ['Electric Terrain'] }],
      ['Raichu', ['Rising Voltage', 'Thunderbolt'], { use: ['Electric Terrain'] }]]))).toEqual({ kind: 'terrain', field: 'Electric Terrain' });
    expect(refPlan(team([['Hatterene', ['Trick Room', 'Psychic', 'Dazzling Gleam']], ['Conkeldurr', ['Mach Punch', 'Drain Punch'], {}], ['Rhyperior', ['Earthquake', 'Stone Edge']],
      ['Torkoal', ['Eruption', 'Earth Power']]]).map((m, i) => (i === 0 ? { ...m, set: new Set(['Trick Room']) } : m)))).toEqual({ kind: 'room', field: 'Trick Room' });
    expect(refPlan(team([['Garchomp', ['Stealth Rock', 'Earthquake']], ['Dragonite', ['Dragon Dance', 'Outrage', 'Earthquake']], ['Gyarados', ['Dragon Dance', 'Waterfall', 'Earthquake']],
      ['Lucario', ['Swords Dance', 'Close Combat', 'Meteor Mash']]]))).toEqual({ kind: 'offense', field: null });
    expect(refPlan(team([['Clefable', ['Moonblast', 'Moonlight']], ['Corviknight', ['Brave Bird', 'Defog']]]))).toEqual({ kind: 'balance', field: null });
  });
});

// Moveset do montador (src/builder/moveset.js): os 4 golpes de cada um entre os que sabe, os por nível e os do tutor
// (Quetzal: o menu do Pokémon, NOVO MOV., ensina na hora o tutor e os por nível até o nível atual).
import { describe as suite, it, expect } from 'vitest';
import T from '../src/data/tables.js';
import { prepare, buildTeams, finalMoveset, movesetMode, attackTypes } from '../src/builder/build.js';
import { pickMoveset, effTable, SRC } from '../src/builder/moveset.js';
import { runBuilder } from '../src/builder/index.js';

const id = name => T.moves.findIndex(r => r && r[0] === name);
const types = attackTypes(T);
const idx = new Map(T.types.map((ty, i) => [ty, i]));
const mult = (a, d) => d.reduce((x, y) => x * (idx.has(y) ? T.typechart[idx.get(a)][idx.get(y)] : 1), 1);
const EFF = effTable(types, mult);
const info = name => { const i = id(name); const det = T.moveDetails[i]; return { name, type: T.types[T.moves[i][1]], power: det[0], accuracy: det[1], category: det[3] }; };
const cand = (name, src = SRC.tutor, level = -1) => ({ ...info(name), src, level });
const ctx = (b, ty, abs = []) => ({ b, types: ty, abs, eff: EFF, N: types.length });

suite('Moveset: os 4 golpes de cada um', () => {
  it('atacante físico: golpes do próprio tipo, cobertura e setup; sem golpe fraco nem de clima', () => {
    const cands = [cand('Dragon Claw', SRC.known), cand('Tackle', SRC.known), cand('Growl', SRC.known), cand('Earthquake'), cand('Outrage'),
      cand('Swords Dance'), cand('Fire Blast'), cand('Stone Edge'), cand('Rain Dance'), cand('Fire Fang')];
    const set = pickMoveset(cands, ctx([108, 130, 95, 80, 85, 102], ['dragon', 'ground'])).map(x => x.name);
    expect(set).toHaveLength(4);
    expect(set).toContain('Earthquake');
    expect(set.some(n => ['Outrage', 'Dragon Claw'].includes(n))).toBe(true);
    expect(set).toContain('Swords Dance');
    for (const n of ['Tackle', 'Growl', 'Rain Dance', 'Fire Blast']) expect(set).not.toContain(n); // Fire Blast: especial num atacante físico
  });
  it('quem aguenta leva recuperação; quem ataca forte prefere golpe de dano a status', () => {
    const support = pickMoveset([cand('Scald'), cand('Ice Beam'), cand('Recover'), cand('Toxic'), cand('Hydro Pump'), cand('Surf')],
      ctx([95, 60, 79, 100, 125, 81], ['water'])).map(x => x.name);
    expect(support).toContain('Recover');
    const attacker = pickMoveset([cand('Flamethrower'), cand('Air Slash'), cand('Focus Blast'), cand('Toxic'), cand('Will-O-Wisp'), cand('Roost')],
      ctx([78, 84, 78, 159, 115, 100], ['fire', 'flying'])).map(x => x.name);
    expect(attacker).toEqual(expect.arrayContaining(['Flamethrower', 'Air Slash', 'Focus Blast']));
    expect(attacker).not.toContain('Toxic');
  });
  it('golpe sem valor que já sabe só completa a vaga; golpe de efeito sem grupo do tutor fica de fora', () => {
    const set = pickMoveset([cand('Flamethrower', SRC.known), cand('Splash', SRC.known), cand('Air Slash'), cand('Teeter Dance')],
      ctx([78, 84, 78, 109, 85, 100], ['fire', 'flying'])).map(x => x.name);
    expect(set.slice(0, 2).sort()).toEqual(['Air Slash', 'Flamethrower']);
    expect(set).not.toContain('Teeter Dance');
  });
  it('golpe que o plano pede entra (Rain Dance) no lugar do que menos faz falta', () => {
    const cands = [cand('Earthquake'), cand('Outrage'), cand('Swords Dance'), cand('Stone Edge'), cand('Rain Dance'), cand('Fire Fang')];
    const set = pickMoveset(cands, { ...ctx([108, 130, 95, 80, 85, 102], ['dragon', 'ground']), force: new Set(['Rain Dance']) }).map(x => x.name);
    expect(set).toContain('Rain Dance');
    expect(set).toContain('Earthquake');
    expect(set).toHaveLength(4);
  });
  it('referência do Smogon: o golpe que os sets usam ganha das contas; repetir o tipo não soma o peso de novo', () => {
    const cands = [cand('Earthquake'), cand('Outrage'), cand('Swords Dance'), cand('Stone Edge'), cand('Stealth Rock'), cand('Fire Fang'), cand('Dragon Claw')];
    const base = ctx([108, 130, 95, 80, 85, 102], ['dragon', 'ground']);
    const usage = new Map([['earthquake', 0.98], ['stealthrock', 0.6], ['swordsdance', 0.53], ['firefang', 0.17]]);
    const set = pickMoveset(cands, { ...base, usage }).map(x => x.name);
    expect(set).toEqual(expect.arrayContaining(['Earthquake', 'Stealth Rock', 'Swords Dance']));
    const ice = new Map([['icebeam', 0.5], ['blizzard', 0.5], ['freezedry', 0.5]]);
    const v = pickMoveset([cand('Ice Beam'), cand('Blizzard'), cand('Freeze-Dry'), cand('Flash Cannon'), cand('Shadow Ball'), cand('Aurora Veil')],
      { ...ctx([71, 95, 85, 110, 95, 79], ['ice']), usage: ice }).map(x => x.name);
    expect(v.filter(n => ['Ice Beam', 'Blizzard', 'Freeze-Dry'].includes(n)).length).toBeLessThanOrEqual(2);
  });
  it('habilidade: Adaptability e Technician contam uma vez; No Guard tira a precisão', () => {
    const noGuard = pickMoveset([cand('Zap Cannon'), cand('Thunderbolt')], ctx([60, 90, 55, 90, 80, 110], ['electric'], ['No Guard'])).map(x => x.name);
    expect(noGuard[0]).toBe('Zap Cannon');
    const plain = pickMoveset([cand('Zap Cannon'), cand('Thunderbolt')], ctx([60, 90, 55, 90, 80, 110], ['electric'])).map(x => x.name);
    expect(plain[0]).toBe('Thunderbolt');
  });
});

suite('Moveset no montador (Quetzal, com a lista do tutor)', () => {
  let slot = 0;
  const mon = (sp, ty, base, moves, o = {}) => ({
    location: 'pc', where: 'BOX1', boxIndex: 0, slot: ++slot, speciesId: o.sid || slot, nickname: sp, hasNickname: false, level: o.level || 50,
    species: { name: sp, form: null, types: ty, baseStats: base, hasIcon: false, spriteId: slot },
    ability: { num: 0, name: o.ab || 'Pressure' }, item: null, nature: { name: 'Adamant' }, ivs: {}, evs: {},
    moves: moves.map(n => ({ ...info(n), id: id(n) })), shiny: false, gender: null,
  });
  const dexFor = mons => {
    const learn = {}, tutor = {};
    for (const m of mons) { learn[m.speciesId] = [0, 1, id('Tackle'), 70, id('Dragon Dance')]; tutor[m.speciesId] = ['Earthquake', 'Outrage', 'Swords Dance', 'Stone Edge', 'Rain Dance', 'Roost', 'Fire Fang'].map(id); }
    return { rom: true, learn, tutor };
  };
  it('só com a lista do tutor (e sem useTutor: false); escolhe e diz de onde vem cada golpe', () => {
    const ms = [mon('Garchomp', ['dragon', 'ground'], [108, 130, 95, 80, 85, 102], ['Tackle', 'Dragon Claw'])];
    const dex = dexFor(ms);
    expect(movesetMode(dex)).toBe(true);
    expect(movesetMode({ ...dex, useTutor: false })).toBe(false);
    expect(movesetMode({ rom: true, learn: {} })).toBe(false);
    const [e] = prepare(ms, T, dex);
    expect(e.set.map(x => x.name)).toContain('Earthquake');
    expect(e.set.map(x => x.name)).not.toContain('Tackle');
    expect(e.set.find(x => x.name === 'Earthquake').src).toBe(SRC.tutor);
    // Dragon Dance é do Nv. 70: precisa de treino (Garchomp Nv. 50)
    const dd = e.mcands.find(x => x.name === 'Dragon Dance');
    expect(dd.src).toBe(SRC.level);
    // O que o plano pede entra no moveset mostrado
    expect(finalMoveset(e, ['Rain Dance']).map(x => x.name)).toContain('Rain Dance');
    // Sem o tutor, os golpes do save
    const [e0] = prepare(ms, T, { ...dex, useTutor: false });
    expect(e0.set).toBe(null);
  });
  it('a tela mostra os 4 golpes no card, os passos dizem o que ensinar e o Showdown leva o moveset', () => {
    slot = 0;
    const ms = [
      mon('Garchomp', ['dragon', 'ground'], [108, 130, 95, 80, 85, 102], ['Tackle', 'Dragon Claw']),
      mon('Pelipper', ['water', 'flying'], [60, 50, 100, 95, 70, 65], ['Water Gun', 'Wing Attack'], { ab: 'Drizzle' }),
      mon('Kingdra', ['water', 'dragon'], [75, 95, 95, 95, 95, 85], ['Bubble'], { ab: 'Swift Swim' }),
      mon('Lucario', ['fighting', 'steel'], [70, 110, 70, 115, 70, 90], ['Quick Attack']),
      mon('Corviknight', ['flying', 'steel'], [98, 87, 105, 53, 85, 67], ['Peck']),
      mon('Clefable', ['fairy'], [95, 70, 73, 95, 90, 60], ['Pound']),
      mon('Raichu', ['electric'], [60, 90, 55, 90, 80, 110], ['Thunder Shock']),
    ];
    const dex = dexFor(ms);
    const res = runBuilder(ms, T, '', dex);
    expect(buildTeams(ms, T, { dex }).length).toBeGreaterThan(0);
    const cur = res[0];
    expect(cur.r.membros.every(x => x.golpes && x.golpes.length)).toBe(true);
    expect(cur.r.dicas.some(x => x.includes('NOVO MOV.'))).toBe(true);
    expect(cur.showdown.some(m => m.plannedMoves && m.moves.some(mv => mv.name === 'Earthquake'))).toBe(true);
    // O Pokémon real (o detalhe e as equipes salvas) continua com os golpes do save
    expect(cur.team.every(m => !m.plannedMoves)).toBe(true);
  });
});

suite('Smogon: golpes de cada espécie', () => {
  it('a tabela traz a fração dos sets de cada golpe (o primeiro formato que conhece a espécie)', async () => {
    const { smogonIndex } = await import('../src/builder/smogon.js');
    const G9 = (await import('../src/data/smogon/gen9nationaldex.json')).default;
    const G9U = (await import('../src/data/smogon/gen9nationaldexubers.json')).default;
    const idx = smogonIndex([G9, G9U]);
    const pel = idx.moves(idx.find({ name: 'Pelipper', form: null, showdown: 'Pelipper' }));
    expect(pel.get('uturn')).toBeGreaterThan(0.5);
    expect(pel.get('hurricane')).toBeGreaterThan(0.5);
    expect(idx.moves(null)).toBe(null);
  });
});

suite('Moveset do plano', () => {
  const vanilluxe = () => [cand('Ice Beam'), cand('Blizzard'), cand('Flash Cannon'), cand('Aurora Veil'), cand('Shadow Ball'), cand('Freeze-Dry')];
  const ice = ctx([71, 95, 85, 110, 95, 79], ['ice']);
  it('neve: Blizzard não erra e Aurora Veil vale; fora da neve, Aurora Veil falha', () => {
    const snow = pickMoveset(vanilluxe(), { ...ice, plan: { kind: 'weather', field: 'neve/granizo' } }).map(x => x.name);
    expect(snow).toContain('Blizzard');
    expect(snow).not.toContain('Ice Beam');
    expect(snow).toContain('Aurora Veil');
    const plain = pickMoveset(vanilluxe(), ice).map(x => x.name);
    expect(plain).not.toContain('Aurora Veil');
    expect(plain).toContain('Ice Beam');
  });
  it('chuva: Thunder no lugar do Thunderbolt; sol: Solar Beam sem carregar e Weather Ball de Fire', () => {
    const elec = [cand('Thunderbolt'), cand('Thunder'), cand('Flash Cannon'), cand('Volt Switch')];
    const raichu = ctx([60, 90, 55, 90, 80, 110], ['electric']);
    expect(pickMoveset(elec, { ...raichu, plan: { kind: 'weather', field: 'chuva' } }).map(x => x.name)[0]).toBe('Thunder');
    expect(pickMoveset(elec, raichu).map(x => x.name)[0]).toBe('Thunderbolt');
    const zard = ctx([78, 104, 78, 159, 115, 100], ['fire', 'flying']);
    const sun = pickMoveset([cand('Flamethrower'), cand('Solar Beam'), cand('Air Slash'), cand('Weather Ball'), cand('Focus Blast')],
      { ...zard, plan: { kind: 'weather', field: 'sol' } }).map(x => x.name);
    expect(sun).toContain('Solar Beam');
    expect(pickMoveset([cand('Flamethrower'), cand('Solar Beam'), cand('Air Slash'), cand('Focus Blast'), cand('Roost')], zard).map(x => x.name)).not.toContain('Solar Beam');
  });
  it('Trick Room: sem Agility', () => {
    const c = [cand('Earthquake'), cand('Stone Edge'), cand('Agility'), cand('Swords Dance')];
    const slow = ctx([100, 130, 110, 60, 80, 70], ['ground', 'rock']);
    expect(pickMoveset([...c, cand('Superpower')], { ...slow, plan: { kind: 'room', field: 'Trick Room' } }).map(x => x.name)).not.toContain('Agility');
  });
});

// Motor de interações (src/builder/mechanics.js): combinações que funcionam e rendem, as que funcionam e rendem pouco, as
// que não funcionam (o item nunca ativa), as que dependem do campo e as da equipe.
import { describe, it, expect } from 'vitest';
import { combosOf, comboValue, itemWorks, kitItem, teamBits, teamComboValue, teamCombos, RULES } from '../src/builder/mechanics.js';

const mv = (name, type = 'normal', category = 0, power = 80, accuracy = 100) => ({ name, type, category, power, accuracy });
const mon = (o = {}) => ({ abs: [], item: null, moves: [], types: ['normal'], b: [80, 110, 80, 60, 80, 90], nfe: false, field: null, ...o });
const ids = c => combosOf(c).filter(x => x.ok).map(x => x.id);

describe('motor de interações', () => {
  it('Toxic Orb + Poison Heal num Pokémon que aguenta: funciona e rende', () => {
    const gliscor = mon({ abs: ['Poison Heal'], item: 'Toxic Orb', types: ['ground', 'flying'], b: [75, 95, 125, 45, 75, 95], moves: [mv('Earthquake', 'ground'), mv('Protect', 'normal', 2, 0)] });
    const list = combosOf(gliscor);
    expect(list[0]).toMatchObject({ id: 'poison-heal', ok: true, label: 'Toxic Orb + Poison Heal' });
    expect(comboValue(list)).toBeGreaterThan(6);
  });

  it('a orb não funciona em quem não pode receber o status ou não aproveita', () => {
    // Toxic Orb num Poison (imune a envenenamento) e Flame Orb num Fire
    expect(itemWorks('Toxic Orb', mon({ abs: ['Poison Heal'], types: ['poison'] }))).toBe(false);
    expect(itemWorks('Flame Orb', mon({ abs: ['Guts'], types: ['fire'] }))).toBe(false);
    // Guts num Fire: a regra pede a Toxic Orb
    const fire = mon({ abs: ['Guts'], types: ['fire'], item: 'Toxic Orb', moves: [mv('Flare Blitz', 'fire'), mv('Facade')] });
    expect(ids(fire)).toContain('guts-orb');
    // Sem habilidade que aproveite o status nem golpe que use a orb (Facade, Fling, Trick…), a orb só machuca
    expect(itemWorks('Flame Orb', mon({ abs: ['Intimidate'] }))).toBe(false);
    expect(itemWorks('Flame Orb', mon({ abs: ['Intimidate'], moves: [mv('Fling', 'dark')] }))).toBe(true);
  });

  it('a semente só ativa com o terreno: o próprio (Electric Surge) ou o do plano', () => {
    const c = mon({ abs: ['Unburden'], item: 'Electric Seed', moves: [mv('Close Combat', 'fighting'), mv('Acrobatics', 'flying', 0, 55)] });
    expect(itemWorks('Electric Seed', c)).toBe(false);
    expect(itemWorks('Electric Seed', { ...c, field: 'Electric Terrain' })).toBe(true);
    expect(itemWorks('Electric Seed', { ...c, abs: ['Electric Surge'] })).toBe(true);
    // Unburden com a semente: só funciona no plano do terreno
    expect(combosOf(c).find(x => x.id === 'unburden')).toMatchObject({ works: false, ok: false, field: 'Electric Terrain' });
    expect(ids({ ...c, field: 'Electric Terrain' })).toContain('unburden');
  });

  it('funciona, mas rende pouco: Unburden num Pokémon que não ataca forte não conta na nota', () => {
    const weak = mon({ abs: ['Unburden'], item: 'Focus Sash', b: [50, 60, 50, 60, 50, 90], moves: [mv('Tackle')] });
    const x = combosOf(weak).find(c => c.id === 'unburden');
    expect(x).toMatchObject({ works: true, ok: false });
    expect(comboValue(combosOf(weak))).toBe(0);
  });

  it('Focus Sash + Unburden + Reversal: as duas combinações rendem num atacante frágil', () => {
    const sneasler = mon({ abs: ['Unburden'], item: 'Focus Sash', types: ['fighting', 'poison'], b: [80, 130, 60, 40, 80, 120],
      moves: [mv('Reversal', 'fighting', 0, 0), mv('Dire Claw', 'poison'), mv('Close Combat', 'fighting', 0, 120)] });
    expect(ids(sneasler)).toEqual(expect.arrayContaining(['unburden', 'sash-lowhp']));
  });

  it('White Herb e Power Herb só com o golpe que eles ajudam', () => {
    expect(itemWorks('White Herb', mon({ moves: [mv('Earthquake', 'ground')] }))).toBe(false);
    expect(itemWorks('White Herb', mon({ moves: [mv('Shell Smash', 'normal', 2, 0)] }))).toBe(true);
    expect(itemWorks('Power Herb', mon({ moves: [mv('Meteor Beam', 'rock', 1, 120)] }))).toBe(true);
    // Solar Beam no sol já não carrega: o Power Herb não serve
    expect(itemWorks('Power Herb', mon({ moves: [mv('Solar Beam', 'grass', 1, 120)], field: 'sol' }))).toBe(false);
  });

  it('Acrobatics como golpe Flying principal pede item que se gasta', () => {
    const c = mon({ types: ['flying', 'fighting'], moves: [mv('Acrobatics', 'flying', 0, 55), mv('Close Combat', 'fighting')] });
    expect(itemWorks('Leftovers', c)).toBe(false);
    expect(itemWorks('Flying Gem', c)).toBe(true);
    expect(ids({ ...c, item: 'Flying Gem' })).toContain('acrobatics');
  });

  it('Choice com Trick: o golpe de efeito não impede o Choice', () => {
    const c = mon({ item: 'Choice Scarf', b: [100, 50, 100, 100, 100, 60], moves: [mv('Trick', 'psychic', 2, 0), mv('Psychic', 'psychic', 1, 90)] });
    expect(combosOf(c).some(x => x.id === 'trick-choice' && x.works)).toBe(true);
  });

  it('sem dados do competitivo, o motor escolhe o item da combinação (e só os que o jogo tem)', () => {
    const c = mon({ abs: ['Guts'], b: [90, 130, 90, 40, 60, 70], moves: [mv('Facade'), mv('Close Combat', 'fighting'), mv('Knock Off', 'dark')] });
    expect(kitItem(c, () => true)).toBe('Flame Orb');
    expect(kitItem(c, name => name !== 'Flame Orb' && name !== 'Toxic Orb')).toBe(null);
  });

  it('combinações da equipe: hazards + quem força a troca; quem se sacrifica + quem varre', () => {
    const rocks = teamBits(mon({ moves: [mv('Stealth Rock', 'rock', 2, 0)] }));
    const roar = teamBits(mon({ moves: [mv('Roar', 'normal', 2, 0)] }));
    const wish = teamBits(mon({ moves: [mv('Healing Wish', 'psychic', 2, 0)] }));
    const sweeper = teamBits(mon({ moves: [mv('Swords Dance', 'normal', 2, 0), mv('Earthquake', 'ground'), mv('Stone Edge', 'rock')], b: [80, 120, 80, 60, 80, 100] }));
    const plan = { kind: 'balance' };
    expect(teamCombos([rocks, roar], plan).map(x => x.id)).toEqual(['hazard-phaze']);
    expect(teamComboValue([{ cbits: rocks }, { cbits: roar }], plan)).toBe(4);
    expect(teamCombos([wish, sweeper], plan).map(x => x.id)).toEqual(['sacrifice-sweeper']);
    // Sem quem varre, o sacrifício não forma combinação
    expect(teamComboValue([{ cbits: wish }, { cbits: rocks }], plan)).toBe(0);
  });

  it('as regras são dados: cada uma tem id único, valor e explicação', () => {
    const seen = new Set();
    for (const r of RULES) {
      expect(seen.has(r.id)).toBe(false);
      seen.add(r.id);
      expect(r.v).toBeGreaterThan(0);
      expect(typeof r.how).toBe('string');
      expect(typeof r.use).toBe('function');
    }
  });
});

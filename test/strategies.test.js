// Biblioteca de estratégias (src/builder/strategies.js): quem executa cada estratégia, o que falta (golpe a ensinar, item
// a dar), papéis no mesmo Pokémon, golpes que o competitivo não usa e a conta da nota pelos bits.
import { describe, it, expect } from 'vitest';
import { rolesOfMon, teamStrategies, roleBits, strategyValue, strategiesOf, strategySeeds, STRATEGIES, planText } from '../src/builder/strategies.js';

const mv = (name, type = 'normal', category = 0, power = 80) => ({ name, type, category, power });
const mon = (o = {}) => ({ abs: [], item: null, moves: [], types: ['normal'], b: [80, 110, 80, 60, 80, 90], ...o });
const member = (ref, c, cands = [], teachOk) => ({ ref, roles: rolesOfMon(c, cands, () => true, teachOk) });
const ids = list => list.map(x => `${x.s.id}:${x.ready ? 'pronta' : 'falta'}`);

describe('biblioteca de estratégias', () => {
  it('pivôs: pronta com 2 pivôs; com 1, falta ensinar o golpe que o menu ensina na hora', () => {
    const a = member('A', mon({ moves: [mv('U-turn', 'bug')] }));
    const b = member('B', mon({ moves: [mv('Volt Switch', 'electric', 1)] }));
    const c = member('C', mon({ moves: [mv('Surf', 'water', 1)] }), [{ name: 'Flip Turn', src: 'tutor' }]);
    expect(ids(teamStrategies([a, b]))).toContain('volt-turn:pronta');
    const near = teamStrategies([a, c]).find(x => x.s.id === 'volt-turn');
    expect(near.ready).toBe(false);
    expect(near.prep).toEqual([{ ref: 'C', kind: 'move', name: 'Flip Turn', src: 'tutor', level: undefined }]);
  });

  it('golpe que o competitivo não usa na espécie não vira preparo', () => {
    const a = member('A', mon({ moves: [mv('U-turn', 'bug')] }));
    const c = member('C', mon(), [{ name: 'Flip Turn', src: 'tutor' }], () => false);
    expect(teamStrategies([a, c]).some(x => x.s.id === 'volt-turn')).toBe(false);
  });

  it('Belly Drum e prioridade no mesmo Pokémon; em Pokémon diferentes não conta', () => {
    const both = member('A', mon({ b: [100, 110, 80, 60, 80, 50], moves: [mv('Belly Drum', 'normal', 2, 0), mv('Aqua Jet', 'water')] }));
    expect(ids(teamStrategies([both]))).toContain('belly-drum:pronta');
    const drum = member('A', mon({ moves: [mv('Belly Drum', 'normal', 2, 0)] }));
    const prio = member('B', mon({ moves: [mv('Aqua Jet', 'water')] }));
    expect(teamStrategies([drum, prio]).some(x => x.s.id === 'belly-drum')).toBe(false);
  });

  it('Shell Smash pede o item: falta dar White Herb', () => {
    const smash = member('A', mon({ moves: [mv('Shell Smash', 'normal', 2, 0), mv('Surf', 'water', 1, 90)] }));
    const x = teamStrategies([smash]).find(s => s.s.id === 'shell-smash');
    expect(x.prep).toEqual([{ ref: 'A', kind: 'item', name: 'White Herb' }]);
  });

  it('núcleo de tipos: cada papel num Pokémon diferente', () => {
    const fire = member('F', mon({ types: ['fire'] })), water = member('W', mon({ types: ['water'] })), grass = member('G', mon({ types: ['grass'] }));
    expect(ids(teamStrategies([fire, water, grass]))).toContain('fwg:pronta');
    // Um Water/Grass sozinho não faz dois papéis
    const wg = member('L', mon({ types: ['water', 'grass'] }));
    expect(teamStrategies([fire, wg]).some(x => x.s.id === 'fwg')).toBe(false);
  });

  it('na Hiperofensiva, telas + setup não entra (o plano já conta)', () => {
    const scr = member('S', mon({ moves: [mv('Reflect', 'psychic', 2, 0), mv('Light Screen', 'psychic', 2, 0)] }));
    const sw = n => member(n, mon({ moves: [mv('Swords Dance', 'normal', 2, 0), mv('Earthquake', 'ground'), mv('Stone Edge', 'rock')] }));
    expect(ids(teamStrategies([scr, sw('A'), sw('B')]))).toContain('screens:pronta');
    expect(teamStrategies([scr, sw('A'), sw('B')], { kind: 'offense' }).some(x => x.s.id === 'screens')).toBe(false);
  });

  it('nota: os bits de cada Pokémon dão a mesma conta das estratégias prontas', () => {
    const team = [mon({ moves: [mv('U-turn', 'bug')] }), mon({ moves: [mv('Volt Switch', 'electric', 1)] }), mon({ moves: [mv('Stealth Rock', 'rock', 2, 0)] }),
      mon({ moves: [mv('Defog', 'flying', 2, 0)] })].map(c => ({ sbits: roleBits(c) }));
    const v = { 'volt-turn': 5, hazards: 5 };
    expect(strategyValue(team, { kind: 'balance' })).toBe(v['volt-turn'] + v.hazards);
  });

  it('nota: cada papel num Pokémon diferente (um Water/Grass não faz dois papéis do núcleo)', () => {
    const e = types => ({ sbits: roleBits(mon({ types })) });
    expect(strategiesOf([e(['fire']), e(['water']), e(['grass'])], { kind: 'balance' })).toContain('fwg');
    expect(strategiesOf([e(['fire']), e(['water', 'grass'])], { kind: 'balance' })).not.toContain('fwg');
    expect(strategiesOf([e(['fire']), e(['water', 'grass']), e(['grass'])], { kind: 'balance' })).toContain('fwg');
  });

  it('sementes da busca: quem executa a estratégia no PC, o melhor de cada papel', () => {
    const e = (name, o, v) => ({ name, v, sbits: roleBits(mon(o)) });
    const pool = [e('A', { moves: [mv('U-turn', 'bug')] }, 10), e('B', { moves: [mv('Volt Switch', 'electric', 1)] }, 30),
      e('C', { moves: [mv('Flip Turn', 'water')] }, 20), e('D', { types: ['fire'] }, 50)];
    const seeds = strategySeeds(pool, { kind: 'balance' }, [], x => x.v, () => true);
    const pivots = seeds.find(x => x.id === 'volt-turn');
    expect(pivots.seed.map(x => x.name)).toEqual(['B', 'C']);
    // Quem já está na semente de sempre conta (e a estratégia que ela já executa não vira semente)
    expect(strategySeeds(pool, { kind: 'balance' }, [pool[0], pool[1]], x => x.v, () => true).some(x => x.id === 'volt-turn')).toBe(false);
  });

  it('cada estratégia tem nome, como joga, o que dá, como é quebrada e valor; os planos têm explicação', () => {
    for (const s of STRATEGIES) for (const k of ['name', 'how', 'gives', 'breaks']) expect(typeof s[k]).toBe('string');
    for (const f of ['chuva', 'sol', 'tempestade de areia', 'neve/granizo', 'Trick Room', 'Electric Terrain']) expect(planText({ field: f }).how).toBeTruthy();
    expect(planText({ kind: 'offense', field: null }).breaks).toBeTruthy();
    expect(planText({ kind: 'balance', field: null })).toBe(null);
  });
});

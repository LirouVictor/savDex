import { describe as suite, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadSave, isUnbound } from '../src/parser/load.js';
import { calcStats } from '../src/parser/stats.js';
import { makeUnboundSave } from './helpers/make-unbound.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';
import U from '../src/data/unbound.json';

const trainer = { name: 'KADE', tid: 1111, sid: 2222 };
const otId = ((trainer.sid << 16) | trainer.tid) >>> 0;
const ABSOL = 376, GALLADE = 528, RAICHU_A = U.species.findIndex(r => r && r[0] === 'Raichu' && r[1] === 'Alola');
const KNOCK_OFF = 282, SWORDS_DANCE = 14, NIGHT_SLASH = 387;
const shinyPid = (((trainer.tid ^ trainer.sid) << 16) | 0x000F) >>> 0; // 0xF < 16: shiny no Unbound (1/4096)

suite('Pokémon Unbound: leitura', () => {
  const save = makeUnboundSave({
    trainer, boxNames: ['FAVES'],
    party: [{ pid: shinyPid, otId, species: ABSOL, item: 480, exp: 1059860, level: 100, ball: 14, moves: [[KNOCK_OFF, 32], [SWORDS_DANCE, 32]], ivs: [31, 31, 31, 31, 31, 31], evs: [6, 252, 0, 252, 0, 0], stats: [272, 359, 156, 273, 167, 156] }],
    pc: {
      0: { pid: 0x11, otId, species: GALLADE, item: 55, exp: 125000, ball: 7, moves: [NIGHT_SLASH, SWORDS_DANCE], ppUps: 0b0011, ivs: [31, 30, 29, 28, 27, 26], hidden: true },
      1: { pid: 0x22, otId, species: RAICHU_A, exp: 1000, nickname: 'SPARK', egg: false },
      [24 * 30 + 2]: { pid: 0x33, otId, species: ABSOL, exp: 8000 }, // caixa 25, posição 3 (fica na seção 0)
    },
  });

  it('identifica o Unbound e lê treinador, equipe e PC', () => {
    expect(isUnbound(save)).toBe(true);
    const { data } = loadSave(save, T, G, U);
    expect(data.game).toMatchObject({ id: 'unbound', note: '2.1' });
    expect(data.trainer).toMatchObject({ name: 'KADE', tid: 1111, sid: 2222 });
    expect(data.warnings).toEqual([]);
    const a = data.party[0];
    expect(a.species).toMatchObject({ name: 'Absol', types: ['dark'], dexId: 359 });
    expect(a).toMatchObject({ level: 100, shiny: true });
    expect(a.item.name).toBe('Absolite');
    expect(a.ball.name).toBe('Quick Ball'); // enum do CFRU começa em 0 (Master Ball)
    expect(a.moves.map(m => [m.name, m.pp])).toEqual([['Knock Off', 32], ['Swords Dance', 32]]);
    expect(a.ability).toMatchObject({ name: 'Super Luck', hidden: false }); // PID ímpar → 2ª habilidade
    expect(Object.values(a.stats)).toEqual([272, 359, 156, 273, 167, 156]);
  });

  it('PC de 58 bytes: golpes de 10 bits, PP pelos PP Ups, IVs, habilidade oculta, formas e caixa 25', () => {
    const { data } = loadSave(save, T, G, U);
    expect(data.pc.boxes).toHaveLength(25);
    expect(data.pc.boxes[0].name).toBe('FAVES');
    const [gallade, raichu] = data.pc.boxes[0].slots;
    expect(gallade.species.name).toBe('Gallade');
    expect(gallade.item.name).toBe('Life Orb'); // item que os cabeçalhos públicos deixam sem nome
    expect(gallade.ball.name).toBe('Nest Ball');
    expect(gallade.moves.map(m => [m.name, m.pp])).toEqual([['Night Slash', 24], ['Swords Dance', 20]]); // 15 × 8/5 com 3 PP Ups
    expect(gallade.ivs).toEqual({ hp: 31, atk: 30, def: 29, spe: 28, spa: 27, spd: 26 });
    expect(gallade.ability).toMatchObject({ name: 'Justified', hidden: true });
    expect(gallade.shiny).toBe(false);
    expect(gallade.stats).toEqual(calcStats(gallade.species.baseStats, gallade.ivs, gallade.evs, gallade.level, gallade.nature));
    expect(raichu.species).toMatchObject({ name: 'Raichu', form: 'Alola', types: ['electric', 'psychic'] });
    expect(raichu.species.showdown).toBe('Raichu-Alola');
    expect(raichu).toMatchObject({ nickname: 'SPARK', hasNickname: true });
    expect(data.pc.boxes[24].slots.map(s => [s.slot, s.species.name])).toEqual([[3, 'Absol']]);
  });

  it('versão nova do Unbound abre com aviso; a 2.0 dá erro claro', () => {
    const newer = loadSave(makeUnboundSave({ trainer, signature: 0x01122000 }), T, G, U).data;
    expect(newer.warnings.join(' ')).toMatch(/mais nova que a 2\.1/);
    expect(() => loadSave(makeUnboundSave({ trainer, signature: 0x01121998 }), T, G, U)).toThrow(/Unbound 2\.0/);
  });
});

// Saves reais (Unbound 2.1.1): mesmo treinador, salvos em momentos diferentes
const SAVES = ['fixtures/unbound-a.sav', 'fixtures/unbound-b.sav'];
suite.skipIf(!SAVES.every(f => existsSync(f)))('Pokémon Unbound com saves reais', () => {
  const load = f => loadSave(readFileSync(f), T, G, U).data;

  it('stats salvos da equipe batem com a fórmula (espécie, stats base do Unbound, natureza = PID % 25)', () => {
    for (const f of SAVES) {
      const d = load(f);
      expect(d.trainer).toMatchObject({ name: 'Kadhem', tid: 48855, sid: 16608 });
      expect(d.party.map(m => m.species.name).sort()).toEqual(['Absol', 'Gallade', 'Greninja', 'Tapu Lele']);
      for (const m of d.party) expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
      const money = f === SAVES[0] ? 998404199 : 999997299;
      expect(d.summary).toEqual({
        playTime: { h: 999, m: 59, s: 59, confidence: 'confirmado' }, money: { value: money, confidence: 'confirmado' },
        badges: expect.objectContaining({ count: 8, total: 8, confidence: 'confirmado' }), dex: expect.objectContaining({ owned: 809, total: 809, confidence: 'confirmado' }),
      });
    }
  });

  it('PP salvos da equipe batem com o PP da ROM (com 0 a 3 PP Ups)', () => {
    for (const f of SAVES) for (const m of load(f).party) for (const mv of m.moves) {
      const ub = mv.id < 0 ? -mv.id : U.moves.indexOf(mv.id);
      const base = U.moveData[ub][3];
      expect([0, 1, 2, 3].map(up => Math.floor((base * (5 + up)) / 5))).toContain(mv.pp);
    }
  });

  it('itens, golpes e bolas coerentes; caixa 25 lida', () => {
    const d = load(SAVES[0]);
    const absol = d.party.find(m => m.species.name === 'Absol');
    expect(absol.item.name).toBe('Absolite');
    expect(absol.moves.map(m => m.name)).toEqual(['Knock Off', 'Psycho Cut', 'Night Slash', 'Swords Dance']);
    expect(d.party.find(m => m.species.name === 'Tapu Lele').item.name).toBe('Choice Specs');
    const pc = d.pc.boxes.flatMap(b => b.slots);
    expect(pc).toHaveLength(208);
    const venusaur = d.pc.boxes[0].slots.find(s => s.slot === 3);
    expect(venusaur).toMatchObject({ level: 50 });
    expect([venusaur.species.name, venusaur.item.name, venusaur.ball.name]).toEqual(['Venusaur', 'Venusaurite', 'Heal Ball']);
    expect(d.pc.boxes[24].slots.map(s => s.species.name)).toEqual(['Eternatus', 'Eternatus', 'Eternatus']);
    expect(pc.filter(m => m.species.confidence !== 'confirmado')).toEqual([]);
    expect(load(SAVES[1]).pc.boxes.flatMap(b => b.slots)).toHaveLength(114);
  });
});

// Save real de outro jogador (Unbound 2.1.0, 11h48m de jogo, sem insígnias; lendários no PC). Os valores do resumo
// foram conferidos no jogo (emulador): cartão do treinador com ₽4040, 11:48, nenhuma insígnia e Pokédex 151;
// tela da Pokédex com Nacional 153 vistos / 151 capturados.
const SAVE_C = 'fixtures/unbound-c.sav';
suite.skipIf(!existsSync(SAVE_C))('Pokémon Unbound: save real com 11h de jogo', () => {
  let d;
  beforeAll(() => { d = loadSave(readFileSync(SAVE_C), T, G, U).data; });
  it('resumo igual ao do jogo: tempo, dinheiro, insígnias e Pokédex Nacional (até 809)', () => {
    expect(d.trainer).toMatchObject({ tid: 8044, sid: 21042 });
    expect(d.summary).toMatchObject({
      playTime: { h: 11, m: 48, s: 56 }, money: { value: 4040 }, badges: expect.objectContaining({ count: 0, total: 8 }), dex: expect.objectContaining({ owned: 151, total: 809 }),
    });
  });
  it('equipe com stats = fórmula', () => {
    expect(d.party.map(m => `${m.species.name}${m.species.form ? `-${m.species.form}` : ''}`)).toEqual(['Greninja-Ash', 'Hoopa-Unbound', 'Shaymin-Sky']);
    for (const m of d.party) expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
    expect(d.pc.boxes.flatMap(b => b.slots).filter(m => m.species.confidence !== 'confirmado')).toEqual([]);
  });
});

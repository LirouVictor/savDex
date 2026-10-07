import { describe as suite, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadSave, isSoulGold } from '../src/parser/load.js';
import { calcStats } from '../src/parser/stats.js';
import { moveInfo } from '../src/parser/describe.js';
import { makeSoulGoldSave } from './helpers/make-soulgold.js';
import { makeGen3Save } from './helpers/make-gen3.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';
import SG from '../src/data/soulgold.json';

const load = bytes => loadSave(bytes, T, G, null, null, null, SG);
const sid = name => SG.species.findIndex(r => r && r[0] === name && !r[1]);
const sgMove = name => SG.moves.findIndex((m, i) => i && (typeof m === 'number' ? T.moves[m][0] : m) === name);

suite('SoulGold: tabelas da ROM', () => {
  it('espécies com numeração própria (não é a Dex Nacional), Froakie como no jogo', () => {
    const froakie = SG.species[656];
    expect(froakie.slice(0, 3)).toEqual(['Froakie', null, 656]);
    expect(froakie.slice(12)).toEqual([41, 56, 40, 62, 44, 71]);
    expect(SG.abilities[froakie[7]]).toBe('Torrent');
    const sprigatito = sid('Sprigatito');
    expect(sprigatito).not.toBe(906);
    expect(SG.species[sprigatito][2]).toBe(906);
  });
  it('golpes, itens e bolas', () => {
    expect(SG.moveData[sgMove('Pound')]).toEqual([T.types.indexOf('normal'), 40, 100, 35, 0]);
    expect(SG.moveData[sgMove('Bubble')][3]).toBe(30);
    expect([SG.balls[1], SG.balls[4]]).toEqual(['Poké Ball', 'Master Ball']);
    expect(SG.items[1]).toBe('Poké Ball');
  });
  it('Pokédex de Johto: 702 espécies, Froakie é o 473', () => {
    expect(SG.johto).toHaveLength(702);
    expect(SG.johto[472]).toBe(656);
    expect(SG.johto[15]).toBe(16); // Pidgey
  });
});

suite('SoulGold: leitura', () => {
  const trainer = { name: 'GOLD', tid: 12345, sid: 54321 };
  const otId = ((trainer.sid << 16) | trainer.tid) >>> 0;
  const froakie = sid('Froakie'), pidgey = sid('Pidgey');
  const save = makeSoulGoldSave({
    trainer,
    party: [{ pid: 0xC5C928CA, otId, species: froakie, exp: 331, level: 8, ball: 1, nickname: 'Froakie', otName: 'GOLD',
      moves: [[sgMove('Pound'), 32], [sgMove('Water Gun'), 25]], ivs: [20, 1, 31, 10, 27, 24], evs: [1, 0, 0, 9, 0, 3],
      stats: [26, 12, 14, 17, 17, 13], hp: 13 }],
    pc: { 0: { pid: 0x10, otId, species: pidgey, exp: 1000, ball: 2, item: 1, moves: [[sgMove('Tackle'), 35]], ivs: [31, 31, 31, 31, 31, 31] } },
    summary: { hours: 3, minutes: 4, seconds: 5, money: 12345, badges: 2, caught: [656, 16, 906] },
  });

  it('identifica o SoulGold (e o Emerald continua Emerald)', () => {
    expect(isSoulGold(save)).toBe(true);
    expect(isSoulGold(makeGen3Save({ trainer, game: 'emerald', party: [] }))).toBe(false);
  });

  it('treinador, resumo e equipe sem criptografia', () => {
    const { data } = load(save);
    expect(data.game.id).toBe('soulgold');
    expect(data.trainer).toMatchObject({ name: 'GOLD', tid: 12345, sid: 54321 });
    expect(data.summary).toMatchObject({ playTime: { h: 3, m: 4, s: 5 }, money: { value: 12345 }, badges: { count: 2, total: 8 }, dex: { owned: 3, total: 702 } });
    const m = data.party[0];
    expect(m.species).toMatchObject({ name: 'Froakie', types: ['water'] });
    expect(m).toMatchObject({ level: 8, hp: 13, nickname: 'Froakie' });
    expect(m.nature.name).toBe('Bold');
    expect(m.gender.symbol).toBe('♂');
    expect(m.ball.name).toBe('Poké Ball');
    expect(m.moves.map(x => [x.name, x.pp, x.type])).toEqual([['Pound', 32, 'normal'], ['Water Gun', 25, 'water']]);
    expect(m.ability).toMatchObject({ name: 'Torrent', confidence: 'provável' });
    expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
  });

  it('PC: 15 caixas de Pokémon de 76 bytes, com aviso de formato provável', () => {
    const { data } = load(save);
    expect(data.pc.boxes).toHaveLength(15);
    const [p] = data.pc.boxes[0].slots;
    expect(p.species.name).toBe('Pidgey');
    expect(p.item.name).toBe('Poké Ball');
    expect(p.ball.name).toBe('Great Ball');
    expect(p.levelFromExp).toBe(true);
    expect(data.warnings.join(' ')).toMatch(/PC do SoulGold/);
  });

  it('dados dos golpes da ROM também no moveInfo', () => {
    const { T: TS } = load(save);
    expect(moveInfo(T.moves.findIndex(r => r && r[0] === 'Bubble'), TS)).toMatchObject({ type: 'water', power: 40 });
  });
});

// Save real (começo do jogo, versão 1.0.5), conferido no próprio jogo com a ROM 1.2 no emulador (tools/gbarun.c):
// cartão do treinador Victor / ID 21893 / ₽3000 / 0:28 / nenhuma insígnia; Froakie Nv. 8 Bold, HP 13/26,
// stats 12/14/17/17/13, golpes Pound 32, Growl 40, Bubble 15, Water Gun 25; Pokédex de Johto 6 vistos, 1 capturado.
const REAL = 'fixtures/soulgold-a.sav';
suite.skipIf(!existsSync(REAL))('SoulGold: save real', () => {
  let d;
  beforeAll(() => { d = load(readFileSync(REAL)).data; });
  it('resumo igual ao do jogo', () => {
    expect(d.trainer).toMatchObject({ name: 'Victor', tid: 21893 });
    expect(d.summary).toMatchObject({ playTime: { h: 0, m: 28 }, money: { value: 3000 }, badges: { count: 0 }, dex: { owned: 1, total: 702 } });
  });
  it('equipe igual à do jogo', () => {
    const [m] = d.party;
    expect(m.species.name).toBe('Froakie');
    expect([m.level, m.hp, m.nature.name, m.gender.symbol, m.friendship, m.exp]).toEqual([8, 13, 'Bold', '♂', 70, 331]);
    expect(m.stats).toEqual({ hp: 26, atk: 12, def: 14, spe: 17, spa: 17, spd: 13 });
    expect(m.moves.map(x => [x.name, x.pp])).toEqual([['Pound', 32], ['Growl', 40], ['Bubble', 15], ['Water Gun', 25]]);
    expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
  });
});

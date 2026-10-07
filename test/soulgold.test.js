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
import SGL from '../src/data/soulgold-learn.json';
import { soulgoldChain, soulgoldEvoMethod } from '../src/ui/evo-rom.js';
import { soulgoldLearnDex, learnsetHtml, evolutionHtml } from '../src/ui/dex.js';
import { learnLines, levelMoveNames } from '../src/ai/prompt.js';
import { soulgoldSpecies } from '../src/parser/soulgold.js';

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

// Conferido no jogo: a aba EVO da Pokédex (Pidgey Nv. 18/32, Hoppip 18/27, Ralts 20/30 e Gallade com Dawn Stone
// macho, Froakie 16/36) e o "Relearn" do resumo de um Froakie levado ao Nv. 100 numa cópia do save (os golpes por
// nível da tabela, menos os 4 que ele já sabe).
suite('SoulGold: evoluções e golpes por nível da ROM', () => {
  const TS = { ...T, soulgold: SG };
  const how = (from, to) => soulgoldChain(sid(from), TS).filter(n => soulgoldSpecies(n[0], SG, TS).name === to).map(n => n[2]).join(' | ');
  it('linha evolutiva com os métodos e as condições do jogo', () => {
    expect(soulgoldChain(sid('Pidgey'), TS).map(n => SG.species[n[0]][0])).toEqual(['Pidgey', 'Pidgeotto', 'Pidgeot']);
    expect(how('Pidgey', 'Pidgeot')).toBe('Nv. 32');
    expect(how('Hoppip', 'Jumpluff')).toBe('Nv. 27');
    expect(how('Froakie', 'Greninja')).toBe('Nv. 36');
    expect(how('Ralts', 'Gallade')).toBe('Dawn Stone, macho');
    expect(how('Tyrogue', 'Hitmonlee')).toBe('Nv. 20, Ataque > Defesa');
    expect(how('Eevee', 'Umbreon')).toBe('Subir de nível, amizade 160+, à noite');
    expect(how('Magneton', 'Magnezone')).toBe('Subir de nível, em Railway Cave ou Thunder Stone');
    expect(how('Onix', 'Steelix')).toBe('Troca, segurando Metal Coat ou Metal Coat'); // ou usando o item
  });
  it('espécie que o hack tirou aparece pelo número, sem inventar o nome', () => {
    const [evo] = SG.evolutions[sid('Mantyke')];
    expect(soulgoldEvoMethod(evo, TS)).toBe('Subir de nível, com uma espécie que não existe no SoulGold (nº 223) na equipe');
  });
  it('no detalhe: evolução e golpes do jogo, sem o "provável"', () => {
    const dex = soulgoldLearnDex(SGL, SG);
    const m = { speciesId: sid('Froakie'), level: 9, species: soulgoldSpecies(sid('Froakie'), SG, TS), moves: [] };
    expect(levelMoveNames(m, dex, TS).slice(0, 7)).toEqual(['Pound', 'Growl', 'Bubble', 'Water Gun', 'Quick Attack', 'Lick', 'Water Pulse']);
    const html = evolutionHtml(m, dex, TS) + learnsetHtml(m, dex, TS);
    expect(html).toContain('Métodos do próprio SoulGold');
    expect(html).toContain('Pokémon SoulGold');
    expect(html).not.toContain('provável');
    const lines = learnLines([{ ...m, location: 'party', slot: 1 }], dex, TS, { id: 'soulgold' });
    expect(lines[1]).toBe('Aprende por nível (tabela do próprio jogo):');
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
    pc: { 0: { pid: 0x10, otId, species: pidgey, exp: 1000, ball: 2, item: 1, abilityNum: 1, moves: [[sgMove('Tackle'), 35]], ivs: [31, 31, 31, 31, 31, 31] },
      31: { pid: 0x20, otId, species: froakie, exp: 50, abilityNum: 2, moves: [[sgMove('Pound'), 35]] } },
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
    expect(m.ability).toMatchObject({ name: 'Torrent', num: 0, confidence: 'confirmado' });
    expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
  });

  it('PC: 15 caixas de Pokémon de 76 bytes; número da habilidade nos bits 12–13 do 4º golpe', () => {
    const { data } = load(save);
    expect(data.pc.boxes).toHaveLength(15);
    const [p] = data.pc.boxes[0].slots;
    expect(p.species.name).toBe('Pidgey');
    expect(p.item.name).toBe('Poké Ball');
    expect(p.ball.name).toBe('Great Ball');
    expect(p.levelFromExp).toBe(true);
    expect(p.ability).toMatchObject({ name: 'Tangled Feet', num: 1 });
    expect(p.moves.map(x => x.name)).toEqual(['Tackle']); // os bits da habilidade não viram golpe
    const [f] = data.pc.boxes[1].slots;
    expect(f.ability).toMatchObject({ name: 'Protean', num: 2, hidden: true });
    expect(data.warnings).toEqual([]);
  });

  it('dados dos golpes da ROM também no moveInfo', () => {
    const { T: TS } = load(save);
    expect(moveInfo(T.moves.findIndex(r => r && r[0] === 'Bubble'), TS)).toMatchObject({ type: 'water', power: 40 });
  });
});

// Save real (começo do jogo, versão 1.0.5), conferido no próprio jogo com a ROM 1.2 no emulador (tools/gbarun.c):
// cartão do treinador Victor / ID 21893 / ₽3000 / 0:28 / nenhuma insígnia; Froakie Nv. 8 Bold, HP 13/26,
// stats 12/14/17/17/13, golpes Pound 32, Growl 40, Bubble 15, Water Gun 25; Pokédex de Johto 6 vistos, 1 capturado.
const REAL = 'fixtures/soulgold-a.sav', REAL_B = 'fixtures/soulgold-b.sav';
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

// Save real com 6 Pokémon na equipe e um no PC (0:51), conferido no jogo: cartão (₽3300, Pokédex 7, 0:51), Pokédex
// de Johto (13 vistos, 7 capturados), as 4 páginas do resumo de cada Pokémon e o Ralts do PC (copiado para a
// equipe numa cópia do save). Pidgey e Spinarak têm a 2ª habilidade (Tangled Feet, Insomnia).
suite.skipIf(!existsSync(REAL_B))('SoulGold: save real com equipe cheia e PC', () => {
  let d;
  beforeAll(() => { d = load(readFileSync(REAL_B)).data; });
  it('resumo igual ao do jogo', () => {
    expect(d.summary).toMatchObject({ playTime: { h: 0, m: 51 }, money: { value: 3300 }, badges: { count: 0 }, dex: { owned: 7, total: 702 } });
    expect(d.warnings).toEqual([]);
  });
  it('equipe igual à do jogo (Pokémon de 96 bytes)', () => {
    const row = m => [m.species.name, m.level, m.nature.name, m.gender.symbol, m.ability.name, m.item?.name ?? null, m.friendship, m.exp, m.hp];
    expect(d.party.map(row)).toEqual([
      ['Froakie', 9, 'Bold', '♂', 'Torrent', null, 84, 526, 21],
      ['Rattata', 2, 'Quirky', '♀', 'Run Away', null, 55, 8, 5],
      ['Zigzagoon', 2, 'Brave', '♂', 'Pickup', 'Potion', 52, 8, 4],
      ['Hoppip', 2, 'Quirky', '♂', 'Chlorophyll', null, 52, 9, 5],
      ['Pidgey', 2, 'Serious', '♂', 'Tangled Feet', null, 51, 9, 4],
      ['Spinarak', 4, 'Serious', '♂', 'Insomnia', null, 52, 51, 3],
    ]);
    expect(d.party[0].stats).toEqual({ hp: 28, atk: 13, def: 15, spe: 18, spa: 18, spd: 15 });
    expect(d.party[5].moves.map(x => [x.name, x.pp])).toEqual([['Poison Sting', 34], ['String Shot', 40], ['Constrict', 34]]);
    for (const m of d.party) expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
  });
  it('PC igual ao do jogo', () => {
    const [r] = d.pc.boxes[0].slots;
    expect([r.species.name, r.level, r.nature.name, r.gender.symbol, r.ability.name, r.friendship, r.exp]).toEqual(['Ralts', 3, 'Hardy', '♂', 'Synchronize', 35, 33]);
    expect(r.stats).toEqual({ hp: 15, atk: 6, def: 6, spe: 7, spa: 8, spd: 7 });
    expect(r.moves.map(x => [x.name, x.pp])).toEqual([['Growl', 40], ['Disarming Voice', 15], ['Double Team', 15]]);
  });
});

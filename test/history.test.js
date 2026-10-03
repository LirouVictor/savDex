import { describe as suite, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadSave } from '../src/parser/load.js';
import { diffSaves, saveKey, signature, orderSaves } from '../src/history/diff.js';
import { changesWin, historyList } from '../src/history/view.js';
import { mediumSlow } from '../src/parser/describe.js';
import { makeSave } from './helpers/make-save.js';
import { makeGen3Save } from './helpers/make-gen3.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';

const trainer = { name: 'ASH', tid: 111, sid: 222 };
const load = o => loadSave(makeSave({ trainer, ...o }), T, G).data;
const ivs = n => [n, n, n, n, n, n];
const TACKLE = 33, EMBER = 52, SCRATCH = 10, GROWL = 45;

// Antes: Charmander nv. 10 (C1-1), Pikachu nv. 20 (C1-2), Eevee nv. 5 (C1-3), Eevee igual (C1-4)
const before = load({
  pc: {
    0: { species: 4, exp: mediumSlow(10), ivs: ivs(10), nature: 3, moves: [[SCRATCH, 35]] },
    1: { species: 25, exp: mediumSlow(20), ivs: ivs(20), nature: 5, moves: [[TACKLE, 35]] },
    2: { species: 133, exp: mediumSlow(5), ivs: ivs(5), nature: 1, moves: [[TACKLE, 35]] },
    3: { species: 133, exp: mediumSlow(5), ivs: ivs(5), nature: 1, moves: [[TACKLE, 35]], female: true },
  },
});
// Depois: Charmander virou Charmeleon nv. 16 e aprendeu Ember (mudou de caixa); Pikachu saiu;
// Eevee subiu para o nv. 7; chegou um Bulbasaur
const after = load({
  pc: {
    31: { species: 5, exp: mediumSlow(16), ivs: ivs(10), nature: 3, moves: [[SCRATCH, 35], [EMBER, 25]] },
    2: { species: 133, exp: mediumSlow(7), ivs: ivs(5), nature: 1, moves: [[TACKLE, 35], [GROWL, 40]] },
    3: { species: 133, exp: mediumSlow(5), ivs: ivs(5), nature: 1, moves: [[TACKLE, 35]], female: true },
    4: { species: 1, exp: mediumSlow(5), ivs: ivs(7), nature: 2, moves: [[TACKLE, 35]] },
  },
});

suite('histórico: comparação entre versões do save', () => {
  it('Quetzal: IVs/natureza/habilidade mudados não viram "novo" + "saiu" (vira "treinado"), nem se evoluiu no lugar', () => {
    const b = load({ pc: {
      0: { species: 279, exp: mediumSlow(26), ivs: ivs(6), nature: 1, abilityNum: 1, ball: 3 },
      1: { species: 147, exp: mediumSlow(30), ivs: ivs(3), nature: 2, ball: 3 },
    } });
    const a = load({ pc: {
      0: { species: 279, exp: mediumSlow(100), ivs: ivs(31), nature: 7, abilityNum: 1, ball: 3 },
      1: { species: 148, exp: mediumSlow(40), ivs: ivs(31), nature: 9, abilityNum: 2, ball: 3 },
    } });
    const d = diffSaves(b, a);
    expect([d.added, d.removed]).toEqual([[], []]);
    expect(d.trained.map(e => [e.mon.species.name, e.what])).toEqual([['Pelipper', ['IVs', 'natureza']], ['Dragonair', ['IVs', 'natureza', 'habilidade']]]);
    expect(d.evolved.map(e => e.to.species.name)).toEqual(['Dragonair']);
  });

  it('ordem pelo tempo de jogo: o save mais antigo aberto por último continua como "antes"', () => {
    const older = loadSave(makeSave({ trainer, playTime: [52, 26, 41], pc: { 0: { species: 4, exp: 100 } } }), T, G).data;
    const newer = loadSave(makeSave({ trainer, playTime: [60, 19, 24], pc: { 0: { species: 4, exp: 100 }, 1: { species: 7, exp: 100, ivs: ivs(3) } } }), T, G).data;
    expect(orderSaves(newer, older)).toMatchObject({ older, newer, swapped: true });
    expect(orderSaves(older, newer)).toMatchObject({ older, newer, swapped: false });
    const d = diffSaves(...Object.values(orderSaves(newer, older)).slice(0, 2));
    expect(d.added.map(m => m.species.name)).toEqual(['Squirtle']);
    expect(changesWin(d, { savedAt: 0 }, 2, { swapped: true }).html).toContain('mais antigo que o comparado');
  });

  it('Quetzal: novos, saíram, evoluíram, subiram de nível e golpes novos', () => {
    const d = diffSaves(before, after);
    const names = list => list.map(m => m.species.name);
    expect(names(d.added)).toEqual(['Bulbasaur']);
    expect(names(d.removed)).toEqual(['Pikachu']);
    expect(d.evolved.map(e => [e.from.species.name, e.to.species.name])).toEqual([['Charmander', 'Charmeleon']]);
    // (o PC guarda a experiência ÷ 10, então o nível pode ficar 1 abaixo do usado para montar o save)
    const by = (a, b) => a[0].localeCompare(b[0]);
    expect(d.leveled.map(e => [e.mon.species.name, e.to > e.from]).sort(by)).toEqual([['Charmeleon', true], ['Eevee', true]]);
    expect(d.learned.map(e => [e.mon.species.name, e.moves.map(m => m.name)]).sort(by)).toEqual([['Charmeleon', ['Ember']], ['Eevee', ['Growl']]]);
    expect(d.total).toEqual({ before: 4, after: 4 });
    expect(d.changed).toBe(true);
  });

  it('mesma versão: nada mudou; assinatura igual e chave do save pelo treinador', () => {
    const d = diffSaves(before, before);
    expect(d.changed).toBe(false);
    expect(signature(before)).not.toBe(signature(after));
    expect(saveKey(before)).toBe('quetzal:111:222:ASH');
  });

  it('Gen 3: pareia pelo PID (evolução e troca de lugar não viram "novo")', () => {
    const otId = (222 << 16) | 111;
    const g = (pc, party = []) => loadSave(makeGen3Save({ game: 'emerald', trainer, party, pc }), T, G).data;
    const a = g({ 0: { pid: 1234, otId, species: 280, exp: 1000 }, 1: { pid: 99, otId, species: 25, exp: 500 } }); // Torchic (interno 280)
    const b = g({ 5: { pid: 1234, otId, species: 281, exp: 5000 } }); // Combusken
    const d = diffSaves(a, b);
    expect(d.evolved.map(e => [e.from.species.name, e.to.species.name])).toEqual([['Torchic', 'Combusken']]);
    expect(d.removed.map(m => m.species.name)).toEqual(['Pikachu']);
    expect(d.added).toEqual([]);
    expect(saveKey(a)).toBe('emerald:111:222:ASH');
  });

  it('desenha a janela e a lista de versões', () => {
    const { html, mons } = changesWin(diffSaves(before, after), { savedAt: 0 }, 3);
    expect(html).toContain('Charmeleon');
    expect(html).toContain('data-history');
    expect(mons.length).toBe(1 + 1 + 2 + 2 + 1);
    const list = historyList([{ id: 1, signature: 'a', savedAt: 0, name: 'x.sav', total: 4, saveIndex: 3 }, { id: 2, signature: 'b', savedAt: 0, name: 'x.sav', total: 4, saveIndex: 2 }], 'a', 2);
    expect(list.match(/data-compare/g)).toHaveLength(1);
  });
});

// Saves reais: entre o save de referência e o "-pc", Lucario e Basculegion foram da equipe para o PC
const REF = process.env.QUETZAL_SAVE || 'fixtures/PokemonQuetzalPtBrAlpha9v0.sav';
const PC = process.env.QUETZAL_SAVE_PC || 'fixtures/PokemonQuetzalPtBrAlpha9v0-pc.sav';
suite.skipIf(!existsSync(REF) || !existsSync(PC))('histórico com os saves reais', () => {
  it('Pokémon levados da equipe para o PC não aparecem como novos nem como saídos', () => {
    const a = loadSave(readFileSync(REF), T, G).data;
    const b = loadSave(readFileSync(PC), T, G).data;
    const d = diffSaves(a, b);
    const moved = ['Lucario', 'Basculegion'];
    expect(d.added.filter(m => moved.includes(m.species.name))).toEqual([]);
    expect(d.removed.filter(m => moved.includes(m.species.name))).toEqual([]);
    expect(saveKey(a)).toBe(saveKey(b));
  });
});

// Saves reais do Quetzal (52h e 60h), entre os quais o autor capturou 4 Pokémon e treinou 3
const OLD = 'fixtures/quetzal-cmp-old.sav', NEW = 'fixtures/quetzal-cmp-new.sav';
suite.skipIf(!existsSync(OLD) || !existsSync(NEW))('histórico com saves reais do Quetzal', () => {
  it('nas duas ordens: 4 novos, 3 treinados, ninguém saiu', () => {
    const o = loadSave(readFileSync(OLD), T, G).data, n = loadSave(readFileSync(NEW), T, G).data;
    for (const [x, y] of [[o, n], [n, o]]) {
      const { older, newer } = orderSaves(x, y);
      const d = diffSaves(older, newer);
      expect(d.added.map(m => m.species.name).sort()).toEqual(['Doublade', 'Feebas', 'Froakie', 'Haunter']);
      expect(d.removed).toEqual([]);
      expect(d.trained.map(e => e.mon.species.name).sort()).toEqual(['Dragonite', 'Pelipper', 'Serperior']);
    }
  });
});

// Golpedex (src/movedex/) e natureza e EVs do competitivo (src/builder/spread.js)
import { describe as suite, it, expect } from 'vitest';
import BASE from '../src/data/tables.js';
import G3 from '../src/data/gen3.json';
import Q from '../src/data/quetzal.json';
import QL from '../src/data/quetzal-learn.json';
import QT from '../src/data/quetzal-teach.json';
import SM9 from '../src/data/smogon/gen9nationaldex.json';
import { gen3Tables } from '../src/parser/gen3.js';
import { quetzalLearnDex } from '../src/ui/dex.js';
import { pokedexEntries } from '../src/pokedex/view.js';
import { gameMoves, learnersIndex, mineIndex, moveRows, filterMoves, moveDetail, moveRow } from '../src/movedex/view.js';
import { smogonIndex } from '../src/builder/smogon.js';
import { parseSpread, pickSpread, compareSpread, evText } from '../src/builder/spread.js';
import { moveInfo } from '../src/parser/describe.js';

const TQ = { ...BASE, quetzal: Q };
const name = (id, T) => moveInfo(id, T).name;

suite('Golpedex', () => {
  const entries = pokedexEntries(TQ, { id: 'quetzal' });
  const dex = quetzalLearnDex(QL, QT);
  const learners = learnersIndex(entries, dex);
  const surf = gameMoves(TQ).find(id => name(id, TQ) === 'Surf');

  it('golpes de cada jogo: Quetzal até o Nihil Light, Gen 3 até o 354', () => {
    const q = gameMoves(TQ);
    expect(q.length).toBe(848);
    expect(name(848, TQ)).toBe('Nihil Light');
    const T3 = gen3Tables(BASE, G3);
    const g = gameMoves(T3, { id: 'emerald' });
    expect(Math.max(...g)).toBe(354);
    expect(g).not.toContain(355);
  });

  it('quem aprende: por nível, tutor e ovo, sem repetir as megas', () => {
    const L = learners.get(surf);
    const sp = L.lv.map(([e]) => e.species.name);
    expect(sp).toContain('Tentacool');
    expect(L.lv.some(([e]) => /^Mega/.test(e.species.form || ''))).toBe(false);
    expect(L.tutor.some(e => e.species.name === 'Pelipper')).toBe(true);
    // PP da ROM
    expect(moveInfo(surf, TQ).pp).toBeGreaterThan(0);
  });

  it('os do save: quem sabe e quem pode aprender, e o filtro', () => {
    const byKey = new Map(entries.map(e => [`${e.id}|${e.species.form || ''}`, e]));
    const entryOf = m => byKey.get(`${m.speciesId}|${m.species.form || ''}`) || null;
    const tent = entries.find(e => e.species.name === 'Tentacool');
    const mon = (e, moves, level) => ({ speciesId: e.id, species: e.species, moves: moves.map(id => ({ id })), level, location: 'party', slot: 1, hasNickname: false });
    const all = [mon(tent, [surf], 50), mon(entries.find(e => e.species.name === 'Pelipper'), [], 30)];
    const mine = mineIndex(all, learners, entryOf);
    expect(mine.get(surf)).toEqual({ know: 1, can: 1 });
    const rows = moveRows(TQ, { id: 'quetzal' }, learners, mine);
    const list = filterMoves(rows, { q: 'sur', mine: 'know', sort: 'name' });
    expect(list.map(r => r.info.name)).toEqual(['Surf']);
    expect(filterMoves(rows, { cat: '2', type: 'water' }).every(r => r.info.category === 2 && r.info.type === 'water')).toBe(true);
    expect(filterMoves(rows, { sort: 'power' })[0].info.power).toBeGreaterThanOrEqual(200);
    expect(moveRow(list[0], 0)).toContain('Surf');
    const { html, lists } = moveDetail(list[0], { T: TQ, dex, learners, all, entries, entryOf, nav: null });
    expect(html).toContain('tutor (NOVO MOV.)'); // o Pelipper aprende pelo menu do Pokémon
    expect(lists.length).toBeGreaterThan(1);
  });
});

suite('Natureza e EVs do competitivo', () => {
  const idx = smogonIndex([SM9]);

  it('lê os spreads da tabela', () => {
    expect(parseSpread('Jolly:0/252/0/0/4/252')).toEqual({ nature: 'Jolly', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 } });
    expect(parseSpread('x:1/2')).toBeNull();
    const id = idx.find({ name: 'Garchomp' });
    expect(idx.natures(id).get('Jolly')).toBeGreaterThan(0.4);
    expect(idx.spreads(id).size).toBeGreaterThan(0);
  });

  it('escolhe a natureza que combina com os golpes', () => {
    const nat = new Map([['Modest', 0.6], ['Adamant', 0.3]]);
    const spr = new Map([['Modest:0/0/0/252/4/252', 0.5], ['Adamant:0/252/0/0/4/252', 0.25]]);
    const phys = [{ category: 0, power: 100 }, { category: 0, power: 80 }];
    expect(pickSpread(nat, spr, phys).nature).toBe('Adamant');
    expect(pickSpread(nat, spr, [{ category: 1, power: 90 }]).nature).toBe('Modest');
    const s = pickSpread(nat, spr, null);
    expect(s).toMatchObject({ nature: 'Modest', natureShare: 0.6, share: 0.5 });
    expect(evText(s.evs)).toBe('252 SpA / 4 SpD / 252 Spe');
    expect(pickSpread(nat, new Map(), phys)).toBeNull();
  });

  it('compara com o Pokémon do save', () => {
    const s = parseSpread('Jolly:0/252/0/0/4/252');
    const ivs = { hp: 31, atk: 20, def: 31, spa: 31, spd: 31, spe: 31 };
    const mon = { nature: { name: 'Adamant' }, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs };
    expect(compareSpread(s, mon, n => n === 'Jolly Mint')).toMatchObject({ natureOk: false, mint: 'Jolly Mint', evsOk: false, lowIvs: ['atk'] });
    expect(compareSpread(s, { ...mon, nature: { name: 'Jolly' }, evs: s.evs }).natureOk).toBe(true);
    expect(compareSpread(s, { ...mon, evs: s.evs }).evsOk).toBe(true);
  });
});

// Pokédex do jogo (src/pokedex/): as espécies de cada jogo, os filtros e o detalhe de uma espécie
import { describe as suite, it, expect, afterAll } from 'vitest';
import BASE from '../src/data/tables.js';
import G3 from '../src/data/gen3.json';
import Q from '../src/data/quetzal.json';
import U from '../src/data/unbound.json';
import SG from '../src/data/soulgold.json';
import N from '../src/data/nds.json';
import QL from '../src/data/quetzal-learn.json';
import QT from '../src/data/quetzal-teach.json';
import EN from '../src/i18n/en.js';
import { setLang, missing } from '../src/i18n.js';
import { gen3Tables } from '../src/parser/gen3.js';
import { ndsTables } from '../src/parser/nds.js';
import { quetzalLearnDex, evolutionHtml, learnsetHtml } from '../src/ui/dex.js';
import { pokedexWin } from '../src/ui/render.js';
import { pokedexEntries, filterEntries, movesMatching, speciesDetail, speciesMon, ownedOf, entryRow, listNote } from '../src/pokedex/view.js';

const TQ = { ...BASE, quetzal: Q };
const names = list => list.map(e => e.species.name + (e.species.form ? '-' + e.species.form : ''));

suite('Pokédex: espécies de cada jogo', () => {
  it('Quetzal: Dex Nacional, formas da ROM e as espécies próprias; sem formas só de aparência', () => {
    const e = pokedexEntries(TQ, { id: 'quetzal' });
    const n = names(e);
    expect(n.slice(0, 4)).toEqual(['Bulbasaur', 'Ivysaur', 'Venusaur', 'Venusaur-Mega']);
    expect(n).toContain('Raichu-Alola');
    expect(n).toContain('Browt');
    expect(n.filter(x => x.startsWith('Vivillon'))).toEqual(['Vivillon']);
    expect(e.find(x => x.species.name === 'Garchomp' && !x.species.form).nat).toBe(445);
  });

  it('Unbound: uma entrada por forma com dados próprios (Unown uma vez só)', () => {
    const n = names(pokedexEntries({ ...BASE, unbound: U }, { id: 'unbound' }));
    expect(n.filter(x => x.startsWith('Unown'))).toEqual(['Unown']);
    expect(n).toContain('Rotom-Wash');
  });

  it('SoulGold: só a Pokédex de Johto (pela Dex Nacional) e as formas dela', () => {
    const e = pokedexEntries({ ...BASE, soulgold: SG }, { id: 'soulgold' });
    expect(new Set(e.map(x => x.nat)).size).toBe(new Set(SG.johto).size);
    expect(names(e)).toContain('Pecharunt');
  });

  it('Gen 3: 1–386; DS: formas da época (Rotom da Gen 4 com cada forma)', () => {
    expect(pokedexEntries(gen3Tables(BASE, G3), { id: 'emerald' })).toHaveLength(386);
    const hg = names(pokedexEntries(ndsTables(BASE, G3, N, 4), { id: 'hgss', gen: 4 }));
    expect(hg.filter(x => x.startsWith('Rotom'))).toEqual(['Rotom', 'Rotom-Heat', 'Rotom-Wash', 'Rotom-Frost', 'Rotom-Fan', 'Rotom-Mow']);
    expect(hg).not.toContain('Sylveon');
  });
});

suite('Pokédex: filtros e detalhe', () => {
  const entries = pokedexEntries(TQ, { id: 'quetzal' });
  const dex = quetzalLearnDex(QL, QT);

  it('nome ou habilidade, tipo, capturados e ordem', () => {
    expect(names(filterEntries(entries, { q: 'garchomp' })).slice(0, 2)).toEqual(['Garchomp', 'Garchomp-Mega']);
    expect(names(filterEntries(entries, { q: 'drizzle', type: 'water' }))).toContain('Pelipper');
    const caught = new Set([1, 4]);
    expect(filterEntries(entries, { caught: 'yes', q: 'saur' }, { caught }).map(e => e.nat)).toEqual([1]);
    expect(filterEntries(entries, { sort: 'bst', type: 'dragon' })[0].species.form).toMatch(/Mega|Primal|Eternamax/);
  });

  it('aprende o golpe: nome exato, por nível, tutor ou ovo', () => {
    const surf = movesMatching('surf', entries, dex, TQ);
    expect(surf.size).toBe(1);
    const got = names(filterEntries(entries, { moves: surf }, { dex }));
    expect(got).toContain('Pelipper');
    expect(got).not.toContain('Charmander');
    expect(movesMatching('', entries, dex, TQ)).toBeNull();
  });

  it('detalhe: stats base, habilidades, quem o jogador tem; evolução e golpes da ROM', () => {
    const e = entries.find(x => x.species.name === 'Pelipper');
    const mine = { speciesId: e.id, species: e.species, location: 'pc', where: 'BOX1', slot: 3, level: 30, moves: [] };
    const owned = ownedOf(e, [mine, { ...mine, egg: true }]);
    expect(owned).toHaveLength(1);
    const html = speciesDetail(e, TQ, { caught: new Set([279]), owned });
    expect(html).toContain('Drizzle');
    expect(html).toContain('data-own="0"');
    expect(html).toContain('Capturado na Pokédex do save');
    const m = speciesMon(e);
    expect(evolutionHtml(m, dex, TQ)).toContain('Wingull');
    expect(learnsetHtml(m, dex, TQ)).toContain('Hurricane');
  });
});

suite('Pokédex em inglês', () => {
  afterAll(() => setLang('pt'));
  it('nenhum texto sem tradução', () => {
    setLang('en', EN);
    missing.clear();
    const entries = pokedexEntries(TQ, { id: 'quetzal' });
    const data = { summary: { dex: { caught: [1] } }, party: [], pc: { boxes: [] } };
    let html = pokedexWin(data, TQ) + listNote({ id: 'quetzal' }) + listNote({ id: 'hgss', gen: 4 });
    entries.slice(0, 5).forEach((e, i) => { html += entryRow(e, i, new Set([1])) + speciesDetail(e, TQ, { caught: new Set([1]) }); });
    expect(html).toContain('Learns the move');
    expect([...missing]).toEqual([]);
  });
});

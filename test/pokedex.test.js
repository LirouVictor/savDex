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
import { pokedexEntries, filterEntries, movesMatching, movesMatchingAll, femalePct, genOf, speciesDetail, speciesMon, ownedOf, entryRow, listNote, matchupHtml, compareHtml } from '../src/pokedex/view.js';
import { wildPlaces, wildAncestor, wildHtml, obtainable } from '../src/pokedex/wild.js';
import { usageHtml } from '../src/pokedex/usage.js';
import { smogonIndex } from '../src/builder/smogon.js';
import SM9 from '../src/data/smogon/gen9nationaldex.json';
import SM9U from '../src/data/smogon/gen9nationaldexubers.json';
import { makeResolver } from '../src/parser/describe.js';
import { defenseWithAbility } from '../src/analysis.js';
import WILD from '../src/data/quetzal-wild.json';

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

  it('mais filtros: segundo tipo, resiste a, geração, evolução, categoria e stat mínimo', () => {
    const f = (x, ctx = {}) => names(filterEntries(entries, x, { T: TQ, ...ctx }));
    expect(f({ type: 'water', type2: 'ground' })).toContain('Swampert');
    expect(f({ type: 'water', type2: 'ground' })).not.toContain('Pelipper');
    expect(f({ type: 'water', type2: 'none' })).toContain('Vaporeon');
    expect(f({ type: 'water', type2: 'none' })).not.toContain('Swampert');
    const rf = f({ resist: 'fire' });
    expect(rf).toContain('Swampert');
    expect(rf).not.toContain('Venusaur');
    expect(f({ resist: 'ground' })).toContain('Pelipper'); // imune conta
    expect(f({ gen: '4', q: 'chomp' }).slice(0, 2)).toEqual(['Garchomp', 'Garchomp-Mega']);
    expect(f({ gen: '1', q: 'chomp' })).toEqual([]);
    expect(f({ gen: 'hack' })).toContain('Browt');
    expect(f({ evo: 'yes', q: 'saur' })).toEqual(['Bulbasaur', 'Ivysaur']);
    expect(f({ evo: 'no', q: 'saur', cat: 'base' })).toEqual(['Venusaur']);
    expect(f({ cat: 'legend', q: 'mewtwo' })).toContain('Mewtwo');
    expect(f({ cat: 'nolegend', q: 'mewtwo' })).toEqual([]);
    expect(f({ cat: 'mega', q: 'venusaur' })).toEqual(['Venusaur-Mega']);
    expect(f({ cat: 'regional', q: 'raichu' })).toEqual(['Raichu-Alola']);
    const fast = filterEntries(entries, { stat: 'spe', min: 150 }, { T: TQ });
    expect(fast.length).toBeGreaterThan(0);
    expect(fast.every(e => e.species.baseStats[5] >= 150)).toBe(true);
    expect(filterEntries(entries, { sort: 'atk' })[0].species.baseStats[1]).toBe(Math.max(...entries.map(e => e.species.baseStats[1])));
    // Vários golpes: precisa aprender todos
    const both = names(filterEntries(entries, { moves: movesMatchingAll('surf, hurricane', entries, dex, TQ) }, { dex }));
    expect(both).toContain('Pelipper');
    expect(both).not.toContain('Swampert');
    expect(genOf(445)).toBe(4);
    expect(genOf(null)).toBeNull();
    expect(femalePct({ genderRate: 1 })).toBe(12.5);
    expect(femalePct({ genderRate: -1 })).toBeNull();
    expect(femalePct({ genderByte: 127 })).toBe(50);
  });

  it('jogos oficiais: evolução pelo dex.json, só com espécies do jogo', async () => {
    const DEX = (await import('../src/data/dex.json')).default;
    const T3 = gen3Tables(BASE, G3);
    const e3 = pokedexEntries(T3, { id: 'emerald' });
    const evo = names(filterEntries(e3, { evo: 'yes', q: 'scyther' }, { T: T3, dex: DEX }));
    expect(evo).toEqual(['Scyther']); // Scizor (troca) existe na Gen 3
    expect(names(filterEntries(e3, { evo: 'yes', q: 'gligar' }, { T: T3, dex: DEX }))).toEqual([]); // Gliscor é da Gen 4
    expect(names(filterEntries(e3, { evo: 'yes', q: 'onix' }, { T: T3, dex: DEX }))).toEqual(['Onix']);
    expect(names(filterEntries(e3, { evo: 'yes', q: 'eevee' }, { T: T3, dex: DEX }))).toEqual(['Eevee']);
    expect(names(filterEntries(e3, { evo: 'yes', q: 'sneasel' }, { T: T3, dex: DEX }))).toEqual([]);
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
    expect(html).toContain('Geração 3');
    expect(html).toContain('♂ 50% · ♀ 50%');
    const m = speciesMon(e);
    expect(evolutionHtml(m, dex, TQ)).toContain('Wingull');
    expect(learnsetHtml(m, dex, TQ)).toContain('Hurricane');
  });
});

suite('Pokédex: onde encontrar (Quetzal)', () => {
  it('lugares e jeitos lidos da ROM', () => {
    const zig = wildPlaces(263);
    const r101 = zig.find(p => p.name === 'Rota 101');
    expect(r101.region).toBe('hoenn');
    expect(r101.rows[0][0]).toBe(0); // grama
    expect(wildPlaces(201).some(p => p.region === 'johto' && p.name === 'Ruínas de Alph')).toBe(true);
    // Todo lugar cabe no mapa da região e toda espécie existe no jogo
    for (const [, , region, x, y, w, h] of WILD.places) {
      const [mw, mh] = WILD.meta.maps[region];
      expect((x + 1 + w) * 8).toBeLessThanOrEqual(mw);
      expect((y + 2 + h) * 8).toBeLessThanOrEqual(mh);
    }
    for (const id of Object.keys(WILD.wild)) expect(+id <= 898 || Q.species[id]).toBeTruthy();
  });

  it('quem não aparece na natureza mostra a pré-evolução', () => {
    expect(wildPlaces(6)).toEqual([]);
    expect(wildAncestor(6, Q)).toBe(4);
    const html = wildHtml(6, Q, { nameOf: id => ({ name: id === 4 ? 'Charmander' : '?' }) });
    expect(html).toContain('Capture <b>Charmander</b> e evolua');
    expect(html).toContain('wild-pin');
    // Abre na região onde o jogador está, se a espécie aparece nela
    expect(wildHtml(147, Q, { region: 'kanto' })).toMatch(/data-region="kanto" aria-pressed="true"/);
  });

  it('encontros únicos (lendários) lidos da ROM', () => {
    const at = (id, name) => wildPlaces(id).find(p => p.name === name);
    expect(at(150, 'Escond. Rocket').rows).toContainEqual([7, 70, 70, 0]);
    expect(at(382, 'Torre Oculta').rows[0][0]).toBe(7);
    expect(at(249, 'Ilhas Redemoinho')).toBeTruthy();
    expect(at(250, 'Torre do Sino')).toBeTruthy();
    const html = wildHtml(150, Q, { caught: false });
    expect(html).toContain('Encontro único · Nv. 70');
    expect(html).toContain('ainda não marca esta espécie como capturada');
    expect(wildHtml(150, Q, { caught: true })).toContain('já marca esta espécie como capturada');
  });

  it('requisitos pela ROM em todas as regiões: Johto pela tabela de encontros únicos, Hoenn e Kanto pelas funções de cada encontro', () => {
    const lugia = wildHtml(249, Q);
    expect(lugia).toContain('Como fazer aparecer');
    expect(lugia).toContain('<li>8 insígnias de Johto</li>');
    expect(lugia).toContain('Em parte');
    const suicune = wildHtml(245, Q);
    expect(suicune).toContain('<li>Vaporeon no 1º lugar.</li>');
    expect(suicune).toContain('Lido da ROM do jogo');
    // O guia dizia Ghost; a ROM pede Dragon
    expect(wildHtml(384, Q)).toContain('Do 3º ao 6º lugar, Pokémon do tipo Dragon.');
    const hoopa = wildHtml(1141, Q);
    expect(hoopa).toContain('Prison Bottle na mochila');
    expect(hoopa).toContain('Teleport');
    // Hoenn e Kanto: lugar e nível dos roteiros dos mapas na ROM; requisitos das funções que conferem cada encontro
    const mewtwo = wildPlaces(150).map(p => p.region);
    expect(mewtwo).toEqual(expect.arrayContaining(['johto', 'hoenn', 'kanto']));
    const at = (id, en) => wildPlaces(id).find(p => WILD.places[p.place][0] === en);
    expect(at(144, 'Shoal Cave').rows).toContainEqual([7, 30, 30, 0]);
    expect(at(384, 'Sky Pillar').rows).toContainEqual([7, 50, 50, 0]);
    expect(at(243, 'Route 10').rows).toContainEqual([7, 40, 40, 0]);
    // Articuno: regras diferentes em cada região
    const articuno = wildHtml(144, Q, { region: 'hoenn' });
    expect(articuno).toContain('<li>Equipe de 5 ou 6 Pokémon do tipo Ice.</li>');
    expect(articuno).toContain('a equipe não é conferida; vale: Ter vencido a Liga de Hoenn.');
    expect(articuno).toContain('Encontro da história');
    expect(wildHtml(243, Q)).toContain('<li>Equipe de 6 Pokémon do tipo Electric.</li>');
    expect(wildHtml(494, Q)).toContain('<li>Ter mais de ₽ 999.999 (₽ 1.000.000 ou mais).</li>');
    const deoxys = wildHtml(386, Q, { region: 'hoenn' });
    expect(deoxys).toContain('Em parte');
    expect(deoxys).not.toContain('guia');
    // Quem só evolui de um lendário não mostra os requisitos do ancestral
    expect(wildHtml(26, Q)).not.toContain('Como fazer aparecer');
  });
});

suite('Pokédex: aparece no jogo, habilidade no dano, uso no competitivo e comparação', () => {
  const entries = pokedexEntries(TQ, { id: 'quetzal' });
  const RS = makeResolver(TQ);
  const obtain = obtainable(Q, id => RS.species(id));
  const by = (n, form = null) => entries.find(e => e.species.name === n && (e.species.form || null) === form);

  it('aparece no jogo: encontros da ROM e quem evolui deles', () => {
    const wild = names(filterEntries(entries, { where: 'wild' }, { obtain }));
    const evo = names(filterEntries(entries, { where: 'evo' }, { obtain }));
    const none = names(filterEntries(entries, { where: 'none' }, { obtain }));
    expect(wild).toContain('Zigzagoon');
    expect(wild).not.toContain('Garchomp-Mega');
    expect(evo.length).toBeGreaterThan(wild.length);
    expect(evo).toContain('Linoone');
    expect(none).toContain('Garchomp-Mega');
    expect(evo.length + none.length).toBe(entries.length);
    expect(filterEntries(entries, { where: 'evo' }, {})).toHaveLength(entries.length); // sem os encontros, sem filtro
  });

  it('dano recebido com a habilidade: Levitate, Thick Fat, Filter, Wonder Guard', () => {
    const T = { types: TQ.types, chart: TQ.typechart };
    const g = (types, ab) => Object.fromEntries(defenseWithAbility(types, T, ab).map(([x, ts]) => [x, ts]));
    expect(g(['ghost', 'poison'], null)[2]).toContain('ground');
    expect(g(['ghost', 'poison'], 'Levitate')[0]).toContain('ground');
    expect(g(['grass', 'poison'], 'Thick Fat')[1]).toBeUndefined();
    expect(g(['rock'], 'Solid Rock')[1.5]).toContain('water');
    expect(g(['bug', 'ghost'], 'Wonder Guard')[0]).toContain('normal');
    // Botões só com as habilidades da espécie que mudam o dano
    const html = matchupHtml(by('Bronzong'), TQ);
    expect(html).toContain('data-mu-ab=""');
    expect(matchupHtml(by('Bronzong'), TQ, 'Heatproof')).toContain('Com a habilidade Heatproof');
    expect(matchupHtml(by('Bronzong'), TQ, 'Heavy Metal')).not.toContain('Com a habilidade');
    expect(matchupHtml(by('Bulbasaur'), TQ)).not.toContain('data-mu-ab');
  });

  it('uso no competitivo: golpes, itens e parceiros que existem no jogo', () => {
    const idx = smogonIndex([SM9, SM9U]);
    const html = usageHtml(idx, by('Pelipper'), TQ, entries);
    expect(html).toContain('Hurricane');
    expect(html).toContain('data-pdx-entry');
    expect(usageHtml(idx, by('Browt'), TQ, entries)).toContain('Sem dados');
    expect(usageHtml(null, by('Pelipper'), TQ, entries)).toContain('Não consegui');
  });

  it('detalhe com anterior/próxima e a comparação de duas espécies', () => {
    const html = speciesDetail(by('Pelipper'), TQ, { nav: { i: 0, n: 3 } });
    expect(html).toMatch(/data-nav="-1"[^>]*disabled/);
    expect(html).toContain('1 de 3 na lista');
    expect(speciesDetail(by('Pelipper'), TQ)).not.toContain('data-nav');
    const cmp = compareHtml(by('Pelipper'), by('Gengar'), TQ);
    expect(cmp).toContain('data-cmp-open="1"');
    expect(cmp).toContain('cmp-hi');
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
    entries.slice(0, 5).forEach((e, i) => { html += entryRow(e, i, new Set([1])) + speciesDetail(e, TQ, { caught: new Set([1]), nav: { i, n: 5 } }) + matchupHtml(e, TQ, 'Overgrow') + compareHtml(e, entries[0], TQ); });
    const idx = smogonIndex([SM9, SM9U]);
    html += usageHtml(idx, entries.find(e => e.species.name === 'Pelipper'), TQ, entries) + usageHtml(null, entries[0], TQ, entries) + usageHtml(idx, entries.find(e => e.species.name === 'Browt'), TQ, entries);
    html += wildHtml(147, Q) + wildHtml(6, Q) + wildHtml(151, Q) + wildHtml(246, Q) + wildHtml(249, Q) + wildHtml(245, Q) + wildHtml(1141, Q) + wildHtml(382, Q) + wildHtml(144, Q) + wildHtml(377, Q) + wildHtml(894, Q);
    expect(html).toContain('Where to find');
    expect(html).toContain('Safari Zone');
    expect(html).toContain('Learns the move');
    expect([...missing]).toEqual([]);
  });
});

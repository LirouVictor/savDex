// Dex de habilidades (src/abilitydex/)
import { describe as suite, it, expect } from 'vitest';
import BASE from '../src/data/tables.js';
import Q from '../src/data/quetzal.json';
import { pokedexEntries } from '../src/pokedex/view.js';
import { abilityRows, filterAbilities, abilityRow, abilityDetail } from '../src/abilitydex/view.js';

const TQ = { ...BASE, quetzal: Q };

suite('Dex de habilidades', () => {
  const entries = pokedexEntries(TQ, { id: 'quetzal' });
  const byKey = new Map(entries.map(e => [`${e.id}|${e.species.form || ''}`, e]));
  const entryOf = m => byKey.get(`${m.speciesId}|${m.species.form || ''}`) || null;
  const pelipper = entries.find(e => e.species.name === 'Pelipper' && !e.species.form);
  const mon = (e, ability) => ({ speciesId: e.id, species: e.species, ability: { name: ability }, moves: [], level: 50, location: 'party', slot: 1, hasNickname: false });
  // Pelipper com Keen Eye: pode ter Drizzle (2ª) e Rain Dish (oculta)
  const all = [mon(pelipper, 'Keen Eye')];
  const rows = abilityRows(entries, all, entryOf);
  const drizzle = rows.find(r => r.key === 'drizzle');

  it('quem tem cada habilidade, comum e oculta, e os do save', () => {
    expect(drizzle.normal.some(e => e === pelipper)).toBe(true);
    expect(drizzle.normal.some(e => e.species.name === 'Kyogre')).toBe(true);
    expect(drizzle.mine).toEqual([]);
    expect(drizzle.could).toEqual([0]);
    expect(rows.find(r => r.key === 'keeneye').mine).toEqual([0]);
    expect(rows.find(r => r.key === 'raindish').hidden.includes(pelipper)).toBe(true);
  });

  it('filtros pelo nome, pela descrição e pelos do save', () => {
    for (const r of rows) r.text = r.key === 'drizzle' ? 'Invoca Chuva por 5 turnos ao entrar.' : '';
    expect(filterAbilities(rows, { q: 'chuva' }).map(r => r.name)).toEqual(['Drizzle']);
    expect(filterAbilities(rows, { mine: 'has' }).map(r => r.name)).toEqual(['Keen Eye']);
    expect(filterAbilities(rows, { mine: 'could' }).map(r => r.name).sort()).toEqual(['Drizzle', 'Keen Eye', 'Rain Dish']);
    expect(filterAbilities(rows, { sort: 'species' })[0].species).toBeGreaterThan(20);
    expect(abilityRow(drizzle, 0)).toContain('Invoca Chuva');
  });

  it('detalhe: o item para trocar a habilidade no jogo', () => {
    const { html, lists } = abilityDetail(drizzle, { all, entries, entryOf, free: 'patch', nav: null });
    expect(html).toContain('dê uma Ability Capsule');
    expect(lists.length).toBe(2); // comum e oculta (Politoed)
    const rd = abilityDetail(rows.find(r => r.key === 'raindish'), { all, entries, entryOf, free: 'patch', nav: null });
    expect(rd.html).toContain('Ability Patch');
  });
});

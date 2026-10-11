import { describe as suite, it, expect } from 'vitest';
import { smogonFormats, smogonIndex, pairSynergy, toId } from '../src/builder/smogon.js';
import G9 from '../src/data/smogon/gen9nationaldex.json';
import G9U from '../src/data/smogon/gen9nationaldexubers.json';
import G3 from '../src/data/smogon/gen3ou.json';
import G8 from '../src/data/smogon/gen8nationaldex.json';

const sp = (name, form = null, showdown = null) => ({ name, form, showdown });

suite('Referência competitiva (Smogon)', () => {
  it('formato de cada jogo', () => {
    expect(smogonFormats({ id: 'quetzal' })).toEqual(['gen9nationaldex', 'gen9nationaldexubers']);
    expect(smogonFormats({ id: 'unbound' })).toEqual(['gen8nationaldex']);
    expect(smogonFormats({ id: 'frlg' })).toEqual(['gen3ou']);
    expect(smogonFormats({ id: 'hgss', gen: 4 })).toEqual(['gen4ou']);
    expect(smogonFormats({ id: 'b2w2', gen: 5 })).toEqual(['gen5ou']);
    expect(smogonFormats(null)).toEqual([]);
    expect(toId('Charizard-Mega-Y')).toBe('charizardmegay');
  });

  it('tabelas geradas: núcleos conhecidos fortes, ruído de pouco uso suavizado', () => {
    const g9 = smogonIndex([G9, G9U]);
    expect(g9.pair('pelipper', 'barraskewda')).toBeGreaterThan(3); // chuva: 16× ou mais
    expect(g9.pair('barraskewda', 'pelipper')).toBe(g9.pair('pelipper', 'barraskewda'));
    expect(g9.pair('torkoal', 'venusaur')).toBeGreaterThan(3); // sol
    // Swampert + Raichu tinha 14,8× com 13 times: a suavização tira da tabela (acaso)
    expect(g9.pair('swampert', 'raichu')).toBe(0);
    expect(smogonIndex([G3]).pair('kingdra', 'ludicolo')).toBeGreaterThan(1.5); // chuva da Gen 3
    expect(smogonIndex([G8]).pair('tyranitar', 'excadrill')).toBeGreaterThan(1); // areia da Gen 8
    for (const t of [G9, G9U, G3, G8]) {
      expect(t.ids.length).toBeGreaterThan(100);
      expect(t.pairs.every(([i, j]) => i < j && j < t.ids.length)).toBe(true);
    }
  });

  it('espécies: nome do Showdown, forma regional não vira a base, mega sem dados usa a base', () => {
    const idx = smogonIndex([G9, G9U]);
    expect(idx.find(sp('Charizard', 'Mega Y', 'Charizard-Mega-Y'))).toBe('charizardmegay');
    expect(idx.find(sp('Pelipper'))).toBe('pelipper');
    // Uma forma regional fora da tabela não é contada como a espécie base
    expect(idx.find(sp('Sliggoo', 'Hisui', 'Sliggoo-Hisui'))).toBe(null);
    // Uma mega sem dados próprios conta como a espécie (o mesmo Pokémon com a pedra)
    expect(idx.find(sp('Baxcalibur', 'Mega', 'Baxcalibur-Mega'))).toBe('baxcalibur');
  });

  it('sinergia de uma equipe: média do log2 do lift nas duplas conhecidas', () => {
    const idx = smogonIndex([G9, G9U]);
    const rain = pairSynergy([sp('Pelipper'), sp('Barraskewda'), sp('Kingdra')], idx);
    expect(rain.known).toBe(3);
    expect(rain.withData).toBe(3);
    expect(rain.strong).toBeGreaterThanOrEqual(2);
    expect(rain.mean).toBeGreaterThan(2);
    expect(rain.list[0].v).toBeGreaterThanOrEqual(rain.list.at(-1).v);
    // Espécie fora da tabela não entra nas duplas; sem duplas conhecidas, média nula
    const odd = pairSynergy([sp('Pelipper'), sp('Browt')], idx);
    expect(odd).toMatchObject({ known: 1, withData: 0, mean: null });
  });
});

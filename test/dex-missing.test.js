// Pokédex: o que falta capturar (src/dex/missing.js), com dados sintéticos e com os saves reais
import { describe as suite, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadSave } from '../src/parser/load.js';
import { dexSummary } from '../src/parser/summary.js';
import { missingDex, dexNamer, dexWinHtml, genOf } from '../src/dex/missing.js';
import BASE from '../src/data/tables.js';
import G3 from '../src/data/gen3.json';
import Q from '../src/data/quetzal.json';
import U from '../src/data/unbound.json';
import SG from '../src/data/soulgold.json';
import N from '../src/data/nds.json';
import DEX from '../src/data/dex.json';

const mon = (dexNo, name, extra = {}) => ({ dexNo, speciesId: dexNo, species: { name }, ...extra });

suite('Pokédex: o que falta (sintético)', () => {
  // Jogo oficial: Bulbasaur e Charmander capturados; só o Bulbasaur está com o jogador
  const data = { summary: { dex: dexSummary([1, 4], 386) }, party: [mon(1, 'Bulbasaur')], pc: { boxes: [{ slots: [mon(133, 'Eevee', { egg: true })] }] } };
  const info = missingDex(data, BASE, DEX);

  it('lista o que falta e quem dá para conseguir evoluindo (sem ovos)', () => {
    expect(info.missing).toHaveLength(384);
    expect(info.missing.slice(0, 3)).toEqual([2, 3, 5]);
    expect([...info.evolve]).toEqual([[2, ['Bulbasaur']], [3, ['Bulbasaur']]]);
    expect(info.seen).toBeNull();
  });

  it('nomes pela Dex Nacional (Gen 9 pelo dex.json) e gerações', () => {
    const name = dexNamer(BASE, DEX);
    expect([25, 906].map(name)).toEqual(['Pikachu', 'Sprigatito']);
    expect([1, 151, 152, 386, 387, 905, 906, 1025].map(genOf)).toEqual([1, 1, 2, 3, 4, 8, 9, 9]);
  });

  it('janela: geração e filtros; Pokédex completa', () => {
    const html = dexWinHtml(info, dexNamer(BASE, DEX), 'emerald', { gen: 1, filter: 'evolve' });
    expect(html).toContain('Ivysaur');
    expect(html).not.toContain('Charmeleon');
    expect(html).not.toContain('data-dex-filter="seen"');
    const full = missingDex({ summary: { dex: dexSummary([1, 2, 3], 3) }, party: [], pc: { boxes: [] } }, BASE, DEX);
    expect(dexWinHtml(full, String, 'emerald', { gen: 0, filter: 'all' })).toContain('Pokédex completa!');
  });
});

const open = f => loadSave(new Uint8Array(readFileSync(f)), BASE, G3, U, N, Q, SG);
const fx = f => new URL('../fixtures/' + f, import.meta.url).pathname;

suite.skipIf(!existsSync(fx('unbound-c.sav')))('Pokédex do Unbound (fixtures/unbound-c.sav)', () => {
  it('vistos e não capturados: os 2 da tela do jogo (153 vistos, 151 capturados)', () => {
    const { data, T } = open(fx('unbound-c.sav'));
    const info = missingDex(data, T);
    const name = dexNamer(T);
    expect([info.owned, info.total, info.seen.size]).toEqual([151, 809, 153]);
    expect(info.missing.filter(n => info.seen.has(n)).map(name)).toEqual(['Skorupi', 'Inkay']);
    expect(info.evolve.get(155 + 1)).toEqual(['Cyndaquil']); // Quilava
  });
});

suite.skipIf(!existsSync(fx('soulgold-b.sav')))('Pokédex do SoulGold (fixtures/soulgold-b.sav)', () => {
  it('Pokédex de Johto: 13 vistos e 7 capturados, como no jogo', () => {
    const { data, T } = open(fx('soulgold-b.sav'));
    const info = missingDex(data, T);
    const name = dexNamer(T);
    expect([info.owned, info.total, info.missing.length, info.seen.size]).toEqual([7, 702, 695, 13]);
    expect(info.list).toBe(SG.johto);
    expect(info.missing.filter(n => info.seen.has(n)).map(name)).toEqual(['Weedle', 'Chikorita', 'Hoothoot', 'Marill', 'Phanpy', 'Budew']);
    expect(info.evolve.get(658)).toEqual(['Froakie']); // Greninja
    expect(info.evolve.get(475)).toEqual(['Ralts']); // Gallade
  });
});

suite.skipIf(!existsSync(fx('quetzal-60h.sav')))('Pokédex do Quetzal (fixtures/quetzal-60h.sav)', () => {
  it('67 capturados de 1025; evoluções pela ROM do Quetzal', () => {
    const { data, T } = open(fx('quetzal-60h.sav'));
    const info = missingDex(data, T);
    expect([info.owned, info.total, info.missing.length]).toEqual([67, 1025, 958]);
    expect(info.evolve.get(68)).toEqual(['Machop']); // Machamp
    expect(info.seen).toBeNull();
  });
});

suite.skipIf(!existsSync(fx('quetzal-en.sav')))('Pokédex do Quetzal em inglês (fixtures/quetzal-en.sav)', () => {
  it('nomes da Gen 9 pela ROM (Palafin só existe com forma)', () => {
    const { data, T } = open(fx('quetzal-en.sav'));
    const info = missingDex(data, T);
    expect(info.owned).toBe(445);
    expect(dexNamer(T)(964)).toBe('Palafin');
    expect(info.evolve.get(964)).toEqual(['Finizen']);
  });
});

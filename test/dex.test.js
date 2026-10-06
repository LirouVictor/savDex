import { describe as suite, it, expect } from 'vitest';
import { defenseMatchups } from '../src/analysis.js';
import { stages, dexIds, evolutionHtml, learnsetHtml } from '../src/ui/dex.js';
import T from '../src/data/tables.js';
import dex from '../src/data/dex.json';

const TT = { types: T.types, chart: T.typechart };
const mon = (o) => ({ species: { name: o.name, types: o.types || [], dexId: o.dexId }, level: o.lv ?? 50, moves: (o.moves || []).map(id => ({ id })) });

suite('Detalhe: dano recebido', () => {
  it('Dragonite: 4× Ice, imune a Ground', () => {
    const g = defenseMatchups(['dragon', 'flying'], TT);
    expect(g[4]).toEqual(['ice']);
    expect(g[0]).toEqual(['ground']);
    expect(g[2]).toEqual(expect.arrayContaining(['rock', 'dragon', 'fairy']));
    expect(g[0.25]).toEqual(expect.arrayContaining(['grass']));
  });
  it('sem tipos: nada', () => {
    expect(Object.values(defenseMatchups([], TT)).flat()).toEqual([]);
  });
});

suite('Detalhe: evolução e golpes (dados dos jogos oficiais)', () => {
  it('estágios em ordem, com ramificação (Eevee)', () => {
    const chain = dex.chains[dex.speciesChain[133]];
    const s = stages(chain);
    expect(s[0].map(n => n[0])).toEqual([133]);
    expect(s[1].map(n => n[0])).toEqual(expect.arrayContaining([134, 135, 136, 196, 197, 470, 471, 700]));
  });
  it('forma regional usa a espécie para a linha (Raichu de Alola → linha do Pikachu)', () => {
    expect(dexIds(mon({ dexId: 10100 }), dex)).toEqual({ pid: 10100, sid: 26 });
    const html = evolutionHtml(mon({ name: 'Raichu', dexId: 10100 }), dex, T);
    expect(html).toContain('Pichu');
    expect(html).toContain('Usar Thunder Stone');
  });
  it('linha com espécie acima de 905 (Annihilape)', () => {
    const html = evolutionHtml(mon({ name: 'Primeape', dexId: 57 }), dex, T);
    expect(html).toContain('Annihilape');
    expect(html).toContain('Usar Rage Fist 20 vezes');
  });
  it('golpes por nível marcam os que já conhece e os acima do nível', () => {
    const tackle = T.moves.findIndex(r => r && r[0] === 'Tackle');
    const html = learnsetHtml(mon({ name: 'Bulbasaur', dexId: 1, lv: 5, moves: [tackle] }), dex, T);
    expect(html).toContain('<b>Tackle <span class="known"');
    expect(html).toMatch(/class="lm t-\w+ future"/);
    expect(html).toContain('Nível atual: 5'); // divisória antes dos golpes acima do nível
    expect(html).toMatch(/<span class="learn-count">\d+<\/span>/);
  });
  it('sem ID (espécie não mapeada): nada', () => {
    expect(evolutionHtml(mon({ dexId: null }), dex, T)).toBe('');
    expect(learnsetHtml(mon({ dexId: null }), dex, T)).toBe('');
  });
});

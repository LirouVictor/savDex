import { describe as suite, it, expect } from 'vitest';
import { buildDemoSave } from '../src/demo/demo.js';
import { loadSave } from '../src/parser/load.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';

suite('save de demonstração', () => {
  const { data } = loadSave(buildDemoSave(T), T, G);

  it('abre como Quetzal e passa nas conferências (stats da equipe = fórmula)', () => {
    expect(data.game.id).toBe('quetzal');
    expect(data.trainer.name).toBe('DEMO');
    expect(data.party).toHaveLength(6);
    expect(data.warnings).toEqual([]);
  });

  it('só usa espécies, itens e bolas conferidos (nada "provável" ou desconhecido)', () => {
    const all = [...data.party, ...data.pc.boxes.flatMap(b => b.slots)];
    expect(all.length).toBeGreaterThan(25);
    for (const m of all) {
      expect(m.species.confidence).toBe('confirmado');
      if (m.item) expect(m.item.confidence).toBe('confirmado');
      expect(m.ball.confidence).toBe('confirmado');
      expect(m.moves.every(mv => mv.name && !mv.name.startsWith('Golpe '))).toBe(true);
    }
  });

  it('resumo: tempo de jogo, dinheiro (gravado com a chave, como no jogo), insígnias e Pokédex', () => {
    const { data } = loadSave(buildDemoSave(T), T, G);
    expect(data.summary).toEqual({
      playTime: { h: 38, m: 12, s: 5, confidence: 'confirmado' }, money: { value: 124560, confidence: 'confirmado' },
      badges: { count: 5, total: 8, confidence: 'confirmado' }, dex: { owned: 33, total: 1025, confidence: 'confirmado' },
    });
  });

  it('tem shiny, fêmeas, apelidos, formas regionais e caixas com nome', () => {
    const all = [...data.party, ...data.pc.boxes.flatMap(b => b.slots)];
    expect(data.party[0]).toMatchObject({ shiny: true });
    expect(data.party[2].gender.name).toBe('fêmea');
    expect(data.party[1]).toMatchObject({ nickname: 'AURA', hasNickname: true });
    expect(all.some(m => m.species.form === 'Hisui')).toBe(true);
    expect(data.pc.boxes.slice(0, 2).map(b => b.name)).toEqual(['FAVORITOS', 'INICIAIS']);
  });
});

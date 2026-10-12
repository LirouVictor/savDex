// Estratégias propostas pela IA no "Comentar com IA" (Quetzal): o pedido leva as estratégias que o app conferiu e a lista
// das conhecidas; a resposta passa por checkStrategies, que confere cada peça (golpe, habilidade, item) e a origem.
import { describe, it, expect } from 'vitest';
import { checkStrategies, REVIEW_STRAT_SCHEMA } from '../src/ai/prompt.js';

const check = {
  refs: new Map([
    ['E1', { name: 'Gliscor', moves: new Set(['Earthquake', 'Toxic', 'Protect', 'Roost', 'U-turn']), abilities: new Set(['Hyper Cutter', 'Sand Veil', 'Poison Heal']) }],
    ['E2', { name: 'Pelipper', moves: new Set(['Hurricane', 'Scald', 'U-turn', 'Roost', 'Defog']), abilities: new Set(['Keen Eye', 'Drizzle', 'Rain Dish']) }],
  ]),
  itemOk: name => ['Toxic Orb', 'Damp Rock', 'Leftovers'].includes(name),
  known: [{ id: 'volt-turn', name: 'Pivôs (U-turn, Volt Switch, Flip Turn)' }, { id: 'hazards', name: 'Hazards com remoção' }],
};

describe('estratégias da IA conferidas pelo app', () => {
  it('conhecida com todas as peças certas', () => {
    const [x] = checkStrategies([{ nome: 'Pivôs (U-turn, Volt Switch, Flip Turn)', origem: 'conhecida', membros: ['E1', 'E2'], execucao: 'Troque com U-turn.',
      pecas: [{ ref: 'E1', tipo: 'golpe', nome: 'U-turn' }, { ref: 'E2', tipo: 'golpe', nome: 'u-turn' }] }], check);
    expect(x).toMatchObject({ origem: 'conhecida', membros: ['E1', 'E2'], bad: [] });
    expect(x.ok).toHaveLength(2);
  });

  it('a IA errou: golpe que ele não aprende, habilidade de outra espécie, item que não existe, membro fora da equipe', () => {
    const [x] = checkStrategies([{ nome: 'Stall de veneno', origem: 'nova', membros: ['E1', 'C9-9'], execucao: '…', pecas: [
      { ref: 'E1', tipo: 'golpe', nome: 'Swords Dance' },
      { ref: 'E1', tipo: 'habilidade', nome: 'Drizzle' },
      { ref: 'E1', tipo: 'item', nome: 'Toxic Plate X' },
      { ref: 'C9-9', tipo: 'golpe', nome: 'Tackle' },
      { ref: 'E1', tipo: 'habilidade', nome: 'Poison Heal' },
      { ref: 'E1', tipo: 'item', nome: 'Toxic Orb' },
    ] }], check);
    expect(x.membros).toEqual(['E1']);
    expect(x.bad.map(b => `${b.why}:${b.nome}`)).toEqual(['golpe:Swords Dance', 'habilidade:Drizzle', 'item:Toxic Plate X', 'fora:Tackle']);
    expect(x.ok.map(b => b.nome)).toEqual(['Poison Heal', 'Toxic Orb']);
  });

  it('"conhecida" fora da lista do app vira ideia nova; no máximo 3', () => {
    const list = checkStrategies([
      { nome: 'Chuva perfeita', origem: 'conhecida', membros: ['E2'], execucao: '', pecas: [] },
      { nome: 'hazards com remoção', origem: 'conhecida', membros: ['E2'], execucao: '', pecas: [] },
      { nome: 'A', origem: 'nova', membros: [], execucao: '', pecas: [] },
      { nome: 'B', origem: 'nova', membros: [], execucao: '', pecas: [] },
    ], check);
    expect(list.map(x => x.origem)).toEqual(['nova', 'conhecida', 'nova']);
  });

  it('resposta sem o campo ou sem o contexto do app: nada', () => {
    expect(checkStrategies(undefined, check)).toEqual([]);
    expect(checkStrategies([{ nome: 'x' }], null)).toEqual([]);
  });

  it('o schema pede origem conhecida/nova e as peças com o tipo', () => {
    const it = REVIEW_STRAT_SCHEMA.properties.estrategias.items;
    expect(it.properties.origem.enum).toEqual(['conhecida', 'nova']);
    expect(it.properties.pecas.items.properties.tipo.enum).toEqual(['golpe', 'item', 'habilidade']);
    expect(REVIEW_STRAT_SCHEMA.required).toContain('estrategias');
  });
});

// Tabelas do Quetzal tiradas da ROM (src/data/quetzal.json, gerado por tools/build-quetzal.mjs a partir da ROM
// do jogador; a ROM não é versionada). Estes testes rodam sempre: usam só o JSON versionado.
import { describe as suite, it, expect } from 'vitest';
import BASE from '../src/data/tables.js';
import Q from '../src/data/quetzal.json';
import { makeResolver } from '../src/parser/describe.js';

const R = makeResolver({ ...BASE, quetzal: Q });

suite('Quetzal: tabelas da ROM', () => {
  it('itens: os confirmados no jogo batem; o deslocamento começa no 758; IDs próprios', () => {
    const name = id => R.item(id).name;
    expect([156, 472, 479, 503, 510, 860, 865, 871, 877].map(name)).toEqual(
      ['Pretty Feather', 'Leftovers', 'Life Orb', 'Assault Vest', 'Heavy-Duty Boots', 'Raichunite Y', 'Lucarionite Z', 'Golisopite', 'Baxcalibrite']);
    expect([71, 72, 108, 522, 523, 757, 758, 759].map(name)).toEqual(
      ['IV Up', 'IV Max', 'Giga Candy', 'Lum Berry', 'Sitrus Berry', 'Sapphire', 'Adamant Crystal', 'Lustrous Globe']);
    expect(R.item(600).confidence).toBe('confirmado');
    expect(R.item(640)).toMatchObject({ name: 'Item 640', confidence: 'desconhecido' }); // TM51–TM100 não existem no Quetzal
    expect(R.item(900)).toMatchObject({ confidence: 'desconhecido' });
  });
  it('golpes: só o 848 tem nome próprio (Nihil Light)', () => {
    expect(Q.moveNames).toEqual({ 848: 'Nihil Light' });
    expect(R.move({ id: 848, pp: 5 })).toMatchObject({ name: 'Nihil Light', type: null });
    expect(R.move({ id: 33, pp: 35 }).name).toBe('Tackle');
  });
  it('espécies: até 898 é a Dex Nacional; depois, formas e Gen 9 pela ROM', () => {
    expect(R.species(898).name).toBe('Calyrex');
    expect(R.species(899)).toMatchObject({ name: 'Venusaur', form: 'Mega', showdown: 'Venusaur-Mega', confidence: 'confirmado' });
    expect(R.species(951)).toMatchObject({ name: 'Raichu', form: 'Alola', types: ['electric', 'psychic'], spriteId: 10100 });
    expect(R.species(1210)).toMatchObject({ name: 'Basculegion', genderRate: 0 });
    expect(R.species(1240)).toMatchObject({ name: 'Basculegion', form: 'Female', showdown: 'Basculegion-F', genderRate: 8 });
    expect(R.species(1308)).toMatchObject({ name: 'Annihilape', types: ['fighting', 'ghost'], spriteId: 979, dexId: 979 });
    expect(R.species(1351)).toMatchObject({ showdown: 'Tauros-Paldea-Blaze', types: ['fighting', 'fire'] });
  });
  it('Pikachu "estilo Red": nome e silhueta da tabela manual, stats da ROM (Pikachu Partner)', () => {
    expect(R.species(1469)).toMatchObject({ name: 'Pikachu', form: 'estilo Red', spriteId: null, baseStats: [45, 80, 50, 75, 60, 120], confidence: 'confirmado' });
  });
  it('formas de aparência usam o sprite da forma padrão; sem correspondência, silhueta', () => {
    expect(R.species(1087)).toMatchObject({ name: 'Vivillon', spriteId: 666, form: null });
    expect(R.species(1520)).toMatchObject({ name: 'Browt', spriteId: null, dexId: null, types: ['grass'] });
  });
});

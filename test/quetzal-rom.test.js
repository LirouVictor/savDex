// Tabelas do Quetzal tiradas da ROM (src/data/quetzal.json, gerado por tools/build-quetzal.mjs a partir da ROM
// do jogador; a ROM não é versionada). Estes testes rodam sempre: usam só o JSON versionado.
import { describe as suite, it, expect } from 'vitest';
import BASE from '../src/data/tables.js';
import Q from '../src/data/quetzal.json';
import { makeResolver } from '../src/parser/describe.js';
import { quetzalChain, evoMethod } from '../src/ui/evo-quetzal.js';

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
  it('golpes: só o 848 tem nome próprio (Nihil Light); tipo, poder e categoria da ROM', () => {
    expect(Q.moveNames).toEqual({ 848: 'Nihil Light' });
    const mv = name => R.move({ id: BASE.moves.findIndex(r => r && r[0] === name), pp: 1 });
    expect(R.move({ id: 848, pp: 5 })).toMatchObject({ name: 'Nihil Light', type: 'dragon', power: 200, category: 1 });
    expect(R.move({ id: 33, pp: 35 })).toMatchObject({ name: 'Tackle', type: 'normal', power: 40, accuracy: 100, category: 0 });
    // Mudanças do Quetzal em relação à tabela do expansion
    expect(mv('Growth').type).toBe('grass');
    expect(mv('Dragon Hammer').power).toBe(90);
    expect(mv('Blood Moon').power).toBe(140);
    expect(mv('Water Shuriken').category).toBe(1);
    expect(mv('Wring Out').power).toBe(0); // 1 na ROM = poder variável
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

suite('Quetzal: evoluções da ROM', () => {
  const TQ = { ...BASE, quetzal: Q };
  const how = (id, to) => quetzalChain(id, TQ).find(n => n[0] === to)[2];
  it('métodos do enum do expansion e as mudanças do Quetzal', () => {
    expect(how(4, 5)).toBe('Nv. 16');
    expect(how(25, 26)).toBe('Thunder Stone');
    expect(how(25, 951)).toBe('Subir de nível sabendo Surf'); // Raichu de Alola: Pikachu que sabe Surf
    expect(how(42, 169)).toBe('Nv. 36'); // Golbat → Crobat: sem amizade no Quetzal
    expect(how(133, 196)).toBe('Shiny Stone ou Sun Stone'); // Espeon só por pedra
    expect(how(265, 266)).toBe('Nv. 7, fêmea'); // Wurmple pelo gênero
    expect(how(61, 186)).toBe("Troca segurando King's Rock ou Subir de nível segurando King's Rock");
    expect(how(64, 65)).toBe('Troca ou Linking Cord');
    expect(evoMethod(45, 36, TQ, null)).toBe('Método próprio do Quetzal (nº 45, valor 36)');
  });
  it('linha completa a partir de qualquer estágio; variações de mesmo nome viram um nó', () => {
    expect(quetzalChain(5, TQ).map(n => n[0])).toEqual([4, 5, 6]);
    const milcery = quetzalChain(868, TQ);
    expect(milcery.filter(n => n[1] === 868)).toHaveLength(1); // as Alcremie juntas
    expect(milcery[1][2]).toMatch(/e outros$/);
    expect(quetzalChain(1308, TQ).map(n => n[0])).toEqual([56, 57, 1308]); // Mankey → Primeape → Annihilape
    expect(quetzalChain(1520, TQ).map(n => n[0])).toEqual([1520, 1521, 1522]);
    expect(quetzalChain(128, TQ)).toBe(null); // Tauros não evolui
  });
});

suite('Quetzal: golpes por nível da ROM', () => {
  const TQ = { ...BASE, quetzal: Q };
  it('lista própria do Quetzal pelo ID do save, sem o "provável"', async () => {
    const L = (await import('../src/data/quetzal-learn.json')).default;
    const { quetzalLearnDex, learnsetHtml } = await import('../src/ui/dex.js');
    const { levelMoveNames, learnLines } = await import('../src/ai/prompt.js');
    const dex = quetzalLearnDex(L);
    const mon = (speciesId, moves = []) => ({ speciesId, level: 50, species: R.species(speciesId), moves: moves.map(name => ({ name })) });
    // Bulbasaur: Magical Leaf e Sludge Wave são do Quetzal (não estão na lista oficial)
    expect(levelMoveNames(mon(1), dex, TQ)).toEqual(expect.arrayContaining(['Magical Leaf', 'Sludge Wave']));
    // Annihilape (ID próprio 1308): golpes de evolução (nível 0) e Rage Fist
    expect(levelMoveNames(mon(1308), dex, TQ)).toEqual(expect.arrayContaining(['Shadow Punch', 'Rage Fist']));
    const html = learnsetHtml(mon(1), dex, TQ);
    expect(html).toContain('Magical Leaf');
    expect(html).toContain('Lista de Pokémon Quetzal');
    expect(html).not.toContain('provável');
    const lines = learnLines([{ ...mon(1308, ['Rage Fist']), location: 'party', slot: 1 }], dex, TQ, { id: 'quetzal' });
    expect(lines[1]).toBe('Aprende por nível (tabela do próprio jogo):');
    expect(lines[2]).toMatch(/^E1: /);
    expect(lines[2]).not.toMatch(/Rage Fist/); // já conhece
  });
});

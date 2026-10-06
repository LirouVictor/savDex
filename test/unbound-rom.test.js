// Tabelas do Unbound conferidas com a ROM e tiradas dela (src/data/unbound.json e unbound-learn.json, gerados
// por tools/build-unbound.mjs com a ROM do jogador; a ROM não é versionada). Usam só os JSON versionados.
import { describe as suite, it, expect } from 'vitest';
import BASE from '../src/data/tables.js';
import U from '../src/data/unbound.json';
import L from '../src/data/unbound-learn.json';
import { moveInfo } from '../src/parser/describe.js';
import { unboundSpecies } from '../src/parser/unbound.js';
import { unboundChain, unboundEvoMethod } from '../src/ui/evo-rom.js';
import { unboundLearnDex, learnsetHtml, evolutionHtml } from '../src/ui/dex.js';
import { levelMoveNames, learnLines } from '../src/ai/prompt.js';

const T = { ...BASE, unbound: U };
const sp = (name, form = null) => U.species.findIndex(r => r && r[0] === name && r[1] === form);
const appMove = name => BASE.moves.findIndex(r => r && r[0] === name);

suite('Unbound: tabelas conferidas com a ROM', () => {
  it('espécies: tipos na ordem da ROM; nomes de habilidade corrigidos', () => {
    expect(unboundSpecies(sp('Ursaluna'), U, T).types).toEqual(['ground', 'normal']);
    expect(unboundSpecies(sp('Calyrex', 'Ice Rider'), U, T).abilities[0]).toBe('As One');
    expect(unboundSpecies(sp('Bulbasaur'), U, T).baseStats).toEqual([45, 49, 49, 65, 65, 45]);
  });
  it('itens: nomes do Unbound nas posições reaproveitadas do FireRed e TMs', () => {
    expect(U.items[176]).toBe('Choice Band');
    expect(U.items[186]).toBeFalsy(); // posição vazia na ROM (o cabeçalho público punha o Choice Band aqui)
    expect([U.items[268], U.items[353], U.items[360]]).toEqual(['Dynamax Band', 'Mega Ring', 'Motorcycle']);
    expect([U.items[289], U.items[437]]).toEqual(['TM01', 'HM01']);
    expect([U.items[18], U.items[707], U.items[708]]).toEqual(['Paralyze Heal', 'Heavy-Duty Boots', 'Utility Umbrella']); // nome oficial, não o curto da ROM
  });
  it('golpes: tipo, poder, PP e categoria da ROM (o Unbound mudou vários)', () => {
    expect(moveInfo(appMove('Flamethrower'), T)).toMatchObject({ type: 'fire', power: 95, category: 1 });
    expect(moveInfo(appMove('Leech Life'), T)).toMatchObject({ power: 20, category: 0 });
    expect(moveInfo(appMove('Water Shuriken'), T)).toMatchObject({ type: 'water', category: 1 });
    expect(moveInfo(appMove('Struggle'), T).type).toBe('normal'); // sem tipo na ROM: fica o do app
    expect(moveInfo(-355, T)).toMatchObject({ name: 'Leech Fang', type: 'bug', power: 80, known: true }); // golpe próprio
    const recover = U.moves.indexOf(appMove('Recover'));
    expect(U.moveData[recover][3]).toBe(10); // PP do Unbound (5 nos jogos atuais)
  });
});

suite('Unbound: evoluções da ROM', () => {
  const how = (from, to) => unboundChain(sp(...[from].flat()), T).find(n => n[0] === sp(...[to].flat()))[2];
  it('métodos do CFRU com o valor extra', () => {
    expect(how('Bulbasaur', 'Ivysaur')).toBe('Nv. 16');
    expect(how('Kirlia', 'Gallade')).toBe('Dawn Stone, macho');
    expect(how('Snorunt', 'Froslass')).toBe('Dawn Stone, fêmea');
    expect(how('Magneton', 'Magnezone')).toBe('Subir de nível em Thundercap Mt. ou Thunder Stone');
    expect(how('Rockruff', ['Lycanroc', 'Dusk'])).toBe('Nv. 25, das 17h às 20h');
    expect(how('Eevee', 'Sylveon')).toBe('Amizade, sabendo um golpe Fairy');
    expect(how('Pancham', 'Pangoro')).toBe('Nv. 32, com um Pokémon Dark na equipe');
    expect(how('Quilava', ['Typhlosion', 'Hisui'])).toBe('Nv. 36 segurando Hisui Rock');
    expect(how(['Basculin', 'Hisui'], ['Basculegion', 'Female'])).toBe('Subir de nível sabendo Wave Crash, fêmea');
    expect(how('Ursaring', 'Ursaluna')).toBe('Peat Block, à noite');
    expect(unboundEvoMethod(33, 5, 0, T)).toBe('Método próprio do Unbound (nº 33, valor 5)');
  });
  it('linha completa a partir de qualquer estágio; megaevoluções não entram', () => {
    expect(unboundChain(sp('Ivysaur'), T).map(n => n[0])).toEqual([1, 2, 3]);
    expect(unboundChain(sp('Tauros'), T)).toBe(null);
    const html = evolutionHtml({ speciesId: sp('Venusaur'), species: unboundSpecies(sp('Venusaur'), U, T) }, null, T);
    expect(html).toContain('Métodos do próprio Unbound');
    expect(html).not.toContain('Mega');
  });
});

suite('Unbound: golpes por nível da ROM', () => {
  const dex = unboundLearnDex(L, U);
  const mon = (speciesId, moves = [], level = 10) => ({ speciesId, level, species: unboundSpecies(speciesId, U, T), moves });
  it('lista do Unbound pelo ID do save, sem o "provável", com os dados dos golpes do Unbound', () => {
    const names = levelMoveNames(mon(1), dex, T);
    expect(names.slice(0, 3)).toEqual(['Tackle', 'Growl', 'Vine Whip']);
    const html = learnsetHtml(mon(1, [{ id: appMove('Tackle') }]), dex, T);
    expect(html).toContain('Lista de Pokémon Unbound');
    expect(html).toContain('<b>Tackle <span class="known"');
    expect(html).not.toContain('provável');
  });
  it('golpes próprios do Unbound entram com o ID negativo', () => {
    const own = Object.entries(dex.learn).find(([, l]) => l.includes(-355));
    expect(own).toBeTruthy(); // Leech Fang
    expect(levelMoveNames(mon(+own[0]), dex, T)).toContain('Leech Fang');
  });
  it('IA: "tabela do próprio jogo" e sem os golpes que já conhece', () => {
    const tackle = appMove('Tackle');
    const lines = learnLines([{ ...mon(1, [{ id: tackle, name: 'Tackle' }]), location: 'party', slot: 1 }], dex, T, { id: 'unbound' });
    expect(lines[1]).toBe('Aprende por nível (tabela do próprio jogo):');
    expect(lines[2]).toMatch(/^E1: /);
    expect(lines[2]).not.toMatch(/Tackle/);
  });
});

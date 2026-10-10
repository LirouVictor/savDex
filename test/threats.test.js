import { describe as suite, it, expect } from 'vitest';
import T from '../src/data/tables.js';
import { prepare, buildTeams } from '../src/builder/build.js';
import { threatList, matchup, typeMult, teamThreats, THREAT_BST } from '../src/builder/threats.js';
import { runBuilder, resultsHtml } from '../src/builder/index.js';

const ivs = v => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });
let slot = 0;
const mon = (sp, types, base, o = {}) => {
  slot++;
  return {
    location: 'pc', where: 'BOX1', boxIndex: 0, slot, speciesId: slot, nickname: sp, hasNickname: false, level: 50,
    species: { name: sp, form: null, types, baseStats: base, hasIcon: false, spriteId: slot },
    ability: { num: 0, name: o.ab || 'Torrent' }, item: null, nature: { name: 'Hardy' }, ivs: ivs(31), evs: ivs(0),
    moves: (o.moves || []).map(([name, type, category, power]) => ({ name, type, category, power })),
    shiny: false, gender: null,
  };
};
const atk = (name, type, cat = 0, power = 90) => [name, type, cat, power];
const entry = m => prepare([m], T)[0];
// Tyranitar como ameaça: Rock e Dark com 80 de poder, físicos
const ttar = { name: 'Tyranitar', form: null, types: ['rock', 'dark'], stats: [100, 134, 110, 95, 100, 61], abilities: ['Sand Stream'], bst: 600,
  moves: [{ name: null, type: 'rock', power: 80, category: 0 }, { name: null, type: 'dark', power: 80, category: 0 }] };
const mult = typeMult(T);

suite('Ameaças concretas', () => {
  it('lista do jogo: fortes (stats base 500+), sem lendários, sem quem só tem Truant', () => {
    const list = threatList(T, { id: 'quetzal' });
    const names = list.map(x => x.name);
    expect(names).toEqual(expect.arrayContaining(['Garchomp', 'Dragonite', 'Metagross', 'Tyranitar', 'Gyarados']));
    expect(names).not.toContain('Mewtwo');
    expect(names).not.toContain('Slaking');
    expect(list.every(x => x.bst >= THREAT_BST)).toBe(true);
    expect(list[0].bst).toBeGreaterThanOrEqual(list[list.length - 1].bst); // dos mais fortes para os mais fracos
    // Sem a tabela de golpes do jogo: um golpe de 90 de cada tipo
    expect(list.find(x => x.name === 'Garchomp').moves.map(m => [m.type, m.power])).toEqual([['dragon', 90], ['ground', 90]]);
  });

  it('golpe super efetivo sozinho não é resposta: precisa vencer o 1 contra 1', () => {
    // Wartortle acerta Tyranitar em cheio (Water), mas é mais lento e cai antes
    const frail = entry(mon('Wartortle', ['water'], [59, 63, 80, 65, 80, 58], { moves: [atk('Surf', 'water', 1)] }));
    const r = matchup(frail, ttar, mult);
    expect(r.se).toBe(true);
    expect(r.wins).toBe(false);
    // Swampert aguenta dois golpes e derruba em dois: vence vindo de graça (entrar no golpe já é demais)
    const bulky = entry(mon('Swampert', ['water', 'ground'], [100, 110, 90, 85, 90, 60], { moves: [atk('Liquidation', 'water'), atk('Earthquake', 'ground')] }));
    const b = matchup(bulky, ttar, mult);
    expect(b.wins).toBe(true);
    expect(b.out).toBeGreaterThan(50);
    expect(b.in).toBeLessThan(50);
  });

  it('clima e Trick Room: Swift Swim na chuva vira o confronto; no Trick Room o lento age antes', () => {
    const swim = entry(mon('Wartortle', ['water'], [59, 63, 80, 65, 80, 58], { ab: 'Swift Swim', moves: [atk('Surf', 'water', 1)] }));
    expect(matchup(swim, ttar, mult, 'none').wins).toBe(false);
    const rain = matchup(swim, ttar, mult, 'chuva');
    expect(rain.faster).toBe(true);
    expect(rain.wins).toBe(true);
    const slow = entry(mon('Slowpoke', ['water'], [90, 65, 65, 40, 40, 15], { moves: [atk('Surf', 'water', 1)] }));
    expect(matchup(slow, ttar, mult, 'none').faster).toBe(false);
    expect(matchup(slow, ttar, mult, 'room').faster).toBe(true);
  });

  it('nota: parte "Ameaças" só com a lista do jogo; sem resposta pesa', () => {
    slot = 0;
    const all = [
      mon('Swampert', ['water', 'ground'], [100, 110, 90, 85, 90, 60], { moves: [atk('Liquidation', 'water'), atk('Earthquake', 'ground'), atk('Ice Punch', 'ice')] }),
      mon('Lucario', ['fighting', 'steel'], [70, 110, 70, 115, 70, 90], { ab: 'Inner Focus', moves: [atk('Aura Sphere', 'fighting', 1), atk('Flash Cannon', 'steel', 1)] }),
      ...['Pidgeot', 'Raticate', 'Fearow', 'Persian', 'Furret', 'Linoone'].map(n => mon(n, ['normal'], [70, 70, 60, 60, 60, 80], { moves: [atk('Body Slam', 'normal'), atk('Return', 'normal')] })),
    ];
    const plain = buildTeams(all, T);
    expect(plain[0].team.length).toBe(6);
    const withThreats = buildTeams(all, T, { threats: [ttar] });
    const r = withThreats[0];
    // Quem vence o Tyranitar (Lucario ou Swampert) entra; a nota conta a parte e as partes somam a nota
    expect(r.team.some(e => ['Lucario', 'Swampert'].includes(e.m.species.name))).toBe(true);
    const t = teamThreats(r.team, [ttar], mult);
    expect(t.wins).toBe(1);
  });

  it('tela: painel das ameaças com cobertura, dano, resposta e o que a estimativa não sabe', () => {
    slot = 0;
    const all = [
      mon('Swampert', ['water', 'ground'], [100, 110, 90, 85, 90, 60], { moves: [atk('Liquidation', 'water'), atk('Earthquake', 'ground'), atk('Ice Punch', 'ice')] }),
      mon('Lucario', ['fighting', 'steel'], [70, 110, 70, 115, 70, 90], { ab: 'Inner Focus', moves: [atk('Aura Sphere', 'fighting', 1), atk('Flash Cannon', 'steel', 1)] }),
      mon('Gengar', ['ghost', 'poison'], [60, 65, 60, 130, 75, 110], { ab: 'Cursed Body', moves: [atk('Shadow Ball', 'ghost', 1), atk('Sludge Bomb', 'poison', 1)] }),
      mon('Togekiss', ['fairy', 'flying'], [85, 50, 95, 120, 115, 80], { ab: 'Serene Grace', moves: [atk('Air Slash', 'flying', 1), atk('Dazzling Gleam', 'fairy', 1)] }),
      mon('Arcanine', ['fire'], [90, 110, 80, 100, 80, 95], { ab: 'Intimidate', moves: [atk('Flare Blitz', 'fire'), atk('Wild Charge', 'electric')] }),
      mon('Scizor', ['bug', 'steel'], [70, 130, 100, 55, 80, 65], { ab: 'Technician', moves: [atk('X-Scissor', 'bug'), atk('Iron Head', 'steel')] }),
    ];
    const rs = runBuilder(all, T, '', null, { game: { id: 'quetzal' } });
    const html = resultsHtml(rs, 0, T);
    expect(html).toContain('Ameaças do jogo (estimativa)');
    expect(html).toMatch(/Cobertura: algum golpe acerta \d+ de \d+ em cheio/);
    expect(html).toMatch(/Dano: alguém tira metade ou mais de \d+ de \d+/);
    expect(html).toMatch(/Resposta: alguém entra no golpe e vence \d+/);
    expect(html).toContain('Estimativa, não simulação');
    expect(html).toContain('o app não tem a tabela de golpes deste jogo');
    // A parte "Ameaças" aparece na linha da nota
    expect(html).toMatch(/Ameaças [-+]?\d+/);
  });
});

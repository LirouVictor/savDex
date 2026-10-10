import { describe as suite, it, expect } from 'vitest';
import T from '../src/data/tables.js';
import { buildTeams, prepare, plans, planHolds, scoreParts, attackTypes } from '../src/builder/build.js';
import { runBuilder, resultsHtml, wantedMons } from '../src/builder/index.js';

const ivs = v => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });
let slot = 0;
const mon = (sp, types, base, o = {}) => {
  slot++;
  return {
    location: o.party ? 'party' : 'pc', where: o.party ? 'Equipe' : 'BOX1', boxIndex: o.party ? null : 0, slot,
    speciesId: o.id || slot, nickname: sp, hasNickname: false, level: o.level || 50,
    species: { name: sp, form: null, types, baseStats: base, hasIcon: false, spriteId: o.id || slot },
    ability: { num: 0, name: o.ab || 'Pressure' }, item: o.item ? { name: o.item } : null,
    nature: { name: 'Adamant' }, ivs: ivs(31), evs: ivs(0),
    moves: (o.moves || []).map(([name, type, category, power]) => ({ name, type, category, power })),
    shiny: false, gender: null,
  };
};
const atk = (name, type, cat = 0) => [name, type, cat, 90];

// Um save com material de sol e de chuva, e quem atrapalha cada um
const pool = () => {
  slot = 0;
  return [
    mon('Torkoal', ['fire'], [70, 85, 140, 85, 70, 20], { ab: 'Drought', item: 'Heat Rock', moves: [atk('Lava Plume', 'fire', 1), atk('Earth Power', 'ground', 1), ['Stealth Rock', 'rock', 2, 0], ['Rapid Spin', 'normal', 0, 50]] }),
    mon('Venusaur', ['grass', 'poison'], [80, 82, 83, 100, 100, 80], { ab: 'Chlorophyll', moves: [atk('Solar Beam', 'grass', 1), atk('Sludge Bomb', 'poison', 1), atk('Earth Power', 'ground', 1), ['Synthesis', 'grass', 2, 0]] }),
    mon('Charizard', ['fire', 'flying'], [78, 84, 78, 109, 85, 100], { ab: 'Solar Power', item: 'Charizardite Y', moves: [atk('Flamethrower', 'fire', 1), atk('Solar Beam', 'grass', 1), atk('Air Slash', 'flying', 1), atk('Focus Blast', 'fighting', 1)] }),
    mon('Great Tusk', ['ground', 'fighting'], [115, 131, 131, 53, 53, 87], { ab: 'Protosynthesis', moves: [atk('Headlong Rush', 'ground'), atk('Close Combat', 'fighting'), ['Rapid Spin', 'normal', 0, 50], atk('Ice Spinner', 'ice')] }),
    mon('Walking Wake', ['water', 'dragon'], [99, 83, 91, 125, 83, 109], { ab: 'Protosynthesis', moves: [atk('Hydro Steam', 'water', 1), atk('Draco Meteor', 'dragon', 1), atk('Flamethrower', 'fire', 1)] }),
    mon('Clefable', ['fairy'], [95, 70, 73, 95, 90, 60], { ab: 'Magic Guard', moves: [atk('Moonblast', 'fairy', 1), ['Moonlight', 'fairy', 2, 0], atk('Flamethrower', 'fire', 1), ['Thunder Wave', 'electric', 2, 0]] }),
    mon('Corviknight', ['flying', 'steel'], [98, 87, 105, 53, 85, 67], { ab: 'Mirror Armor', moves: [atk('Brave Bird', 'flying'), atk('Body Press', 'fighting'), ['Roost', 'flying', 2, 0], ['U-turn', 'bug', 0, 70]] }),
    mon('Swampert', ['water', 'ground'], [100, 110, 90, 85, 90, 60], { ab: 'Torrent', item: 'Swampertite', moves: [atk('Liquidation', 'water'), atk('Earthquake', 'ground'), atk('Ice Punch', 'ice')] }),
    mon('Pelipper', ['water', 'flying'], [60, 50, 100, 95, 70, 65], { ab: 'Drizzle', item: 'Damp Rock', moves: [atk('Hurricane', 'flying', 1), atk('Scald', 'water', 1), ['U-turn', 'bug', 0, 70], ['Roost', 'flying', 2, 0]] }),
    mon('Kingdra', ['water', 'dragon'], [75, 95, 95, 95, 95, 85], { ab: 'Swift Swim', moves: [atk('Hydro Pump', 'water', 1), atk('Draco Meteor', 'dragon', 1), atk('Ice Beam', 'ice', 1)] }),
    mon('Raichu', ['electric'], [60, 90, 55, 90, 80, 110], { ab: 'Lightning Rod', moves: [atk('Thunder', 'electric', 1), atk('Grass Knot', 'grass', 1), ['Volt Switch', 'electric', 1, 70], atk('Focus Blast', 'fighting', 1)] }),
    mon('Slaking', ['normal'], [150, 160, 100, 95, 65, 100], { ab: 'Truant', moves: [atk('Double-Edge', 'normal'), atk('Earthquake', 'ground'), atk('Knock Off', 'dark')] }),
    mon('Lucario', ['fighting', 'steel'], [70, 110, 70, 115, 70, 90], { ab: 'Inner Focus', item: 'Lucarionite', moves: [atk('Aura Sphere', 'fighting', 1), atk('Flash Cannon', 'steel', 1), ['Extreme Speed', 'normal', 0, 80]] }),
    mon('Garchomp', ['dragon', 'ground'], [108, 130, 95, 80, 85, 102], { ab: 'Rough Skin', item: 'Garchompite', moves: [atk('Earthquake', 'ground'), atk('Dragon Claw', 'dragon'), ['Swords Dance', 'normal', 2, 0]] }),
  ];
};
const names = r => r.team.map(e => e.m.species.name);

suite('Montador de equipes (sem IA)', () => {
  it('planos que o save comporta: clima com quem põe e 2+ que aproveitam; equilibrada sempre', () => {
    const p = prepare(pool(), T);
    const kinds = plans(p).map(x => x.field || 'equilibrada');
    expect(kinds).toEqual(expect.arrayContaining(['sol', 'chuva', 'equilibrada']));
    expect(kinds).not.toContain('Trick Room'); // ninguém tem Trick Room
    // Sem quem ponha, só a equilibrada
    expect(plans(prepare(pool().filter(m => !['Torkoal', 'Charizard', 'Pelipper'].includes(m.species.name)), T)).map(x => x.kind)).toEqual(['balance']);
  });

  it('sol: quem põe e quem aproveita; fora quem é fraco a Fire ou depende de golpe Water', () => {
    const sun = buildTeams(pool(), T).find(r => r.plan.field === 'sol');
    const team = names(sun);
    expect(team.some(n => n === 'Torkoal' || n === 'Charizard')).toBe(true);
    expect(team).toContain('Venusaur');
    expect(team).not.toContain('Corviknight'); // fraco a Fire, que o sol fortalece
    expect(team).not.toContain('Swampert'); // Liquidation perde metade no sol
    expect(team).not.toContain('Pelipper'); // põe outro clima
    expect(team).not.toContain('Slaking'); // Truant
    expect(planHolds(sun.team, sun.plan)).toBe(true);
  });

  it('chuva: Pelipper, quem aproveita e o Raichu com Lightning Rod contando como resposta ao Electric', () => {
    const rain = buildTeams(pool(), T).find(r => r.plan.field === 'chuva');
    expect(names(rain)).toEqual(expect.arrayContaining(['Pelipper', 'Kingdra']));
    const types = attackTypes(T);
    const raichu = rain.team.find(e => e.m.species.name === 'Raichu');
    if (raichu) expect(raichu.def[types.indexOf('electric')]).toBe(-2); // anula pela habilidade
    expect(scoreParts(rain.team, rain.plan, types).plan).toBeGreaterThan(0);
  });

  it('até 2 megapedras (nunca 3), sem repetir espécie', () => {
    for (const r of buildTeams(pool(), T)) {
      expect(r.team.filter(e => e.mega).length).toBeLessThanOrEqual(2);
      expect(new Set(names(r)).size).toBe(6);
    }
  });

  it('quem o jogador pede entra em todas as equipes', () => {
    const all = pool();
    const want = wantedMons(all, 'corviknight, Slaking');
    expect(want.map(m => m.species.name)).toEqual(['Corviknight', 'Slaking']);
    for (const r of buildTeams(all, T, { want })) expect(names(r)).toEqual(expect.arrayContaining(['Corviknight', 'Slaking']));
  });

  it('quem não evoluiu conta pela forma evoluída (Quetzal: evoluções da ROM)', () => {
    const all = pool();
    const golett = mon('Golett', ['ground', 'ghost'], [59, 74, 50, 35, 50, 35], { id: 622, level: 10, moves: [atk('Shadow Punch', 'ghost'), atk('Earthquake', 'ground')] });
    const TQ = { ...T, quetzal: { evolutions: { 622: [[4, 43, 623]] }, species: {} } };
    const p = prepare([...all, golett], TQ);
    const golurk = p.find(e => e.m.species.name === 'Golurk');
    expect(golurk.real).toBe(golett);
    expect(golurk.m.level).toBe(10);
    expect(p.find(e => e.m.species.name === 'Golett')).toBeTruthy(); // os dois na busca, nunca juntos
  });

  it('tela: abas por plano, nota com as partes, função de cada membro e os botões de copiar/salvar', () => {
    const res = runBuilder(pool(), T);
    expect(res.length).toBeGreaterThanOrEqual(3);
    const html = resultsHtml(res, 0, T);
    expect(html).toContain('data-plan="1"');
    expect(html).toMatch(/Nota -?\d+: Defesa/);
    expect(html).toContain('Equipe montada pelo app');
    expect(html).toContain('data-ai-copy');
    expect(html).toContain('Montada pelo app, sem IA');
    const sun = res.find(x => x.plan.field === 'sol');
    expect(sun.r.membros.some(x => /^põe sol$/.test(x.papel))).toBe(true);
    expect(sun.r.pontos_fortes.join(' ')).toMatch(/sol: posto por/);
    expect(resultsHtml([], 0, T)).toContain('Não deu para montar');
  });

  it('rápido o bastante com um PC grande', () => {
    const many = [];
    const TYPES = attackTypes(T);
    for (let i = 0; i < 500; i++) {
      const a = TYPES[i % TYPES.length], b = TYPES[(i * 7) % TYPES.length];
      many.push(mon('Mon' + i, a === b ? [a] : [a, b], [60 + (i % 50), 70 + (i % 60), 70, 60 + (i % 40), 70, 40 + (i % 80)],
        { moves: [atk('A', a), atk('B', b, 1), atk('C', TYPES[(i * 3) % TYPES.length])] }));
    }
    const t0 = performance.now();
    const res = buildTeams([...pool(), ...many], T);
    expect(res.length).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

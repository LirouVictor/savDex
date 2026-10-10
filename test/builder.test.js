import { describe as suite, it, expect } from 'vitest';
import T from '../src/data/tables.js';
import { buildTeams, altTeams, isLegendary, prepare, plans, planHolds, scoreParts, attackTypes } from '../src/builder/build.js';
import { megaForm } from '../src/ai/evolve.js';
import { runBuilder, moreOptions, resultsHtml, shownParts, wantedMons } from '../src/builder/index.js';

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

  it('golpes fracos do começo do jogo não contam (cobertura, prioridade, clima)', () => {
    slot = 0;
    const weak = mon('Dragapult', ['dragon', 'ghost'], [88, 120, 75, 100, 75, 142], { moves: [['Quick Attack', 'normal', 0, 40], ['Astonish', 'ghost', 0, 30], ['Bite', 'dark', 0, 60], ['Infestation', 'bug', 1, 20]] });
    const goodra = mon('Goodra', ['dragon'], [90, 100, 70, 110, 150, 80], { ab: 'Sap Sipper', moves: [['Water Pulse', 'water', 1, 60], ['Dragon Breath', 'dragon', 1, 60], ['Protect', 'normal', 2, 0]] });
    const bascu = mon('Basculegion', ['water', 'ghost'], [120, 112, 65, 80, 75, 78], { ab: 'Adaptability', moves: [['Wave Crash', 'water', 0, 120], ['Aqua Jet', 'water', 0, 40], ['Last Respects', 'ghost', 0, 50], ['Agility', 'psychic', 2, 0]] });
    const [a, b, c] = prepare([weak, goodra, bascu], T);
    expect([a.dmg, a.cov, a.roles.includes('prioridade')]).toEqual([0, 0, false]);
    expect([b.dmg, b.strat.boost.has('chuva')]).toEqual([0, false]);
    expect([c.dmg, c.roles.includes('prioridade'), c.strat.boost.has('chuva')]).toEqual([3, true, true]);
  });

  it('sem lendários: ficam de fora, menos quem o jogador pediu', () => {
    const all = [...pool(),
      mon('Kyogre', ['water'], [100, 100, 90, 150, 140, 90], { ab: 'Drizzle', moves: [atk('Water Spout', 'water', 1), atk('Ice Beam', 'ice', 1), atk('Thunder', 'electric', 1)] }),
      mon('Ho-Oh', ['fire', 'flying'], [106, 130, 90, 110, 154, 90], { ab: 'Regenerator', moves: [atk('Sacred Fire', 'fire'), atk('Brave Bird', 'flying'), ['Recover', 'normal', 2, 0]] }),
      mon('Mewtwo', ['psychic'], [106, 110, 90, 154, 90, 130], { ab: 'Pressure', moves: [atk('Psystrike', 'psychic', 1), atk('Aura Sphere', 'fighting', 1), atk('Ice Beam', 'ice', 1)] })];
    expect(all.filter(isLegendary).map(m => m.species.name)).toEqual(['Kyogre', 'Ho-Oh', 'Mewtwo']);
    const leg = ['Kyogre', 'Ho-Oh', 'Mewtwo'];
    expect(buildTeams(all, T).some(r => names(r).some(n => leg.includes(n)))).toBe(true);
    const off = buildTeams(all, T, { noLegends: true });
    expect(off.length).toBeGreaterThan(0);
    for (const r of off) expect(names(r).filter(n => leg.includes(n))).toEqual([]);
    const want = wantedMons(all, 'mewtwo');
    for (const r of buildTeams(all, T, { want, noLegends: true })) expect(names(r).filter(n => leg.includes(n))).toEqual(['Mewtwo']);
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

  it('megapedra da própria espécie: conta com os tipos, stats e habilidade da mega (tabela da ROM)', () => {
    const ty = n => T.types.indexOf(n);
    // Golisopod-Mega no Quetzal: Bug/Steel, Tough Claws (só fraco a Fire, que a chuva corta)
    const TQ = { ...T, quetzal: { evolutions: {}, species: { 1510: ['Golisopod', [ty('bug'), ty('steel')], [75, 150, 175, 70, 120, 40], ['Tough Claws', 'Tough Claws', 'Tough Claws'], 4, 768, 'golisopod-mega', 10316, 0, 'Mega', 'Golisopod-Mega', 0] } } };
    const golisopod = mon('Golisopod', ['bug', 'water'], [75, 125, 140, 60, 90, 40], { ab: 'Emergency Exit', item: 'Golisopite', moves: [atk('First Impression', 'bug'), atk('Liquidation', 'water')] });
    const mega = megaForm(golisopod, TQ);
    expect(mega.species.types).toEqual(['bug', 'steel']);
    expect(mega.ability.name).toBe('Tough Claws');
    expect(megaForm({ ...golisopod, item: { name: 'Charizardite Y' } }, TQ)).toBe(null); // pedra de outra espécie
    expect(megaForm({ ...golisopod, species: { ...golisopod.species, form: 'Hisui' } }, TQ)).toBe(null); // forma regional
    const e = prepare([golisopod], TQ)[0];
    const types = attackTypes(T);
    expect(e.megaKnown).toBe(true);
    expect(types.filter((x, a) => e.def[a] > 0)).toEqual(['fire']); // como mega, só Fire
  });

  it('habilidade × golpes: Technician fortalece Bullet Punch; Contrary com Close Combat vira setup', () => {
    slot = 0;
    const scizor = mon('Scizor', ['bug', 'steel'], [70, 130, 100, 55, 80, 65], { ab: 'Technician', moves: [['Bullet Punch', 'steel', 0, 40], ['Bug Bite', 'bug', 0, 60], ['Swords Dance', 'normal', 2, 0]] });
    const plain = { ...scizor, ability: { num: 0, name: 'Swarm' } };
    const serperior = mon('Serperior', ['grass'], [75, 75, 95, 75, 95, 113], { ab: 'Contrary', moves: [['Leaf Storm', 'grass', 1, 130], ['Dragon Pulse', 'dragon', 1, 85]] });
    const [a, c] = prepare([scizor, serperior], T);
    const [b] = prepare([plain], T);
    expect(a.dmg).toBe(2); // Bug Bite 60 × 1,5 = 90 passa a contar
    expect(a.boosted.map(mv => mv.name)).toEqual(['Bullet Punch', 'Bug Bite']);
    expect(b.dmg).toBe(1); // sem Technician, só o Bullet Punch (prioridade com STAB)
    expect([c.contrary, c.roles.includes('setup')]).toEqual([['Leaf Storm'], true]);
  });

  it('antes e depois de megaevoluir; sem restrição de item conta com a megapedra que ele não segura', () => {
    slot = 0;
    const ty = n => T.types.indexOf(n);
    const row = (name, types, stats, ab, sprite) => [name, types.map(ty), stats, [ab, ab, ab], 4, 0, null, sprite, 0, 'Mega Y', name, 0];
    const TQ = { ...T, quetzal: { evolutions: {}, items: [null, 'Raichunite Y', 'Staraptite', 'Starminite'], species: {
      1501: row('Raichu', ['electric'], [60, 85, 50, 130, 95, 140], 'No Guard', 1),
      1502: [...row('Staraptor', ['fighting', 'flying'], [85, 140, 90, 100, 50, 110], 'Contrary', 2).slice(0, 9), 'Mega', 'Staraptor', 0],
    } } };
    const raichu = mon('Raichu', ['electric'], [60, 90, 55, 110, 80, 90], { ab: 'Lightning Rod', item: 'Raichunite Y', moves: [atk('Thunder', 'electric', 1), atk('Surf', 'water', 1)] });
    const staraptor = mon('Staraptor', ['normal', 'flying'], [85, 120, 70, 100, 50, 60], { ab: 'Intimidate', moves: [atk('Close Combat', 'fighting'), atk('Brave Bird', 'flying')] });
    const types = attackTypes(T);
    const [r] = prepare([raichu], TQ);
    expect(r.bf.ability.name).toBe('No Guard');
    expect(r.def[types.indexOf('ground')]).toBe(1); // a mega continua fraca a Ground
    expect(r.preImmune).toEqual(['electric']); // antes de megaevoluir, Lightning Rod anula Electric
    expect(prepare([staraptor], TQ)).toHaveLength(1); // sem a pedra, só ele mesmo
    const pool = prepare([staraptor], TQ, null, { anyItem: true });
    expect(pool.map(e => e.given)).toEqual([null, 'Staraptite']); // Starminite é do Starmie
    const mega = pool[1];
    expect([mega.real, mega.bf.ability.name]).toEqual([staraptor, 'Contrary']);
    expect(mega.roles).toEqual(expect.arrayContaining(['intimidação', 'setup'])); // Intimidate antes, Contrary depois
  });

  it('golpes de dano que faltam vêm dos que ele aprende por nível (Staraptor só com Close Combat → Brave Bird)', () => {
    slot = 0;
    const staraptor = mon('Staraptor', ['normal', 'flying'], [85, 120, 70, 50, 60, 100], { ab: 'Intimidate', moves: [atk('Close Combat', 'fighting'), ['Double Team', 'normal', 2, 0], ['Feather Dance', 'flying', 2, 0], ['Whirlwind', 'normal', 2, 0]] });
    const learn = [[0, 'Close Combat'], [12, 'Wing Attack'], [33, 'Take Down'], [44, 'Air Slash'], [49, 'Brave Bird']];
    const ids = Object.fromEntries(learn.map(([, n]) => [n, T.moves.findIndex(x => x && x[0] === n)]));
    const dex = { rom: true, learn: { [staraptor.speciesId]: [1, ...learn.flatMap(([lv, n]) => [lv, ids[n]])] } };
    const [e] = prepare([staraptor], T, dex);
    expect(e.teachAtk.map(x => x.name)).toEqual(['Brave Bird']); // do próprio tipo e físico, como ele ataca
    expect(e.dmg).toBe(2);
    expect(prepare([staraptor], T)[0].dmg).toBe(1); // sem a tabela, só o que ele sabe
  });

  it('duas megas: só uma megaevolui por batalha (o Lightning Rod do Raichu vale quando quem megaevolui é o Golisopod)', () => {
    slot = 0;
    const ty = n => T.types.indexOf(n);
    const row = (name, types, stats, ab, form) => [name, types.map(ty), stats, [ab, ab, ab], 4, 0, null, 1, 0, form, name, 0];
    const TQ = { ...T, quetzal: { evolutions: {}, items: [null, 'Raichunite Y', 'Golisopite'], species: {
      1501: row('Raichu', ['electric'], [60, 85, 50, 130, 95, 140], 'No Guard', 'Mega Y'),
      1502: row('Golisopod', ['bug', 'steel'], [75, 150, 175, 70, 120, 40], 'Tough Claws', 'Mega'),
    } } };
    const team = (golisopite) => {
      slot = 0;
      return [
        mon('Pelipper', ['water', 'flying'], [60, 50, 100, 95, 70, 65], { ab: 'Drizzle', moves: [atk('Hurricane', 'flying', 1), atk('Scald', 'water', 1)] }),
        mon('Golisopod', ['bug', 'water'], [75, 125, 140, 60, 90, 40], { ab: 'Emergency Exit', item: golisopite ? 'Golisopite' : 'Leftovers', moves: [atk('First Impression', 'bug'), atk('Liquidation', 'water')] }),
        mon('Basculegion', ['water', 'ghost'], [120, 112, 65, 80, 75, 78], { ab: 'Adaptability', moves: [atk('Wave Crash', 'water'), atk('Shadow Claw', 'ghost')] }),
        mon('Corviknight', ['flying', 'steel'], [98, 87, 105, 53, 85, 67], { moves: [atk('Brave Bird', 'flying'), atk('Body Press', 'fighting')] }),
        mon('Raichu', ['electric'], [60, 90, 55, 90, 80, 110], { ab: 'Lightning Rod', item: 'Raichunite Y', moves: [atk('Thunder', 'electric', 1), atk('Surf', 'water', 1)] }),
        mon('Rillaboom', ['grass'], [100, 125, 90, 60, 70, 85], { moves: [atk('Wood Hammer', 'grass'), atk('Knock Off', 'dark')] }),
      ];
    };
    const types = attackTypes(T);
    const elec = types.indexOf('electric');
    const plan = { kind: 'weather', field: 'chuva', setters: [] };
    const two = prepare(team(true), TQ), one = prepare(team(false), TQ);
    expect(two.filter(e => e.mega).length).toBe(2);
    // Só o Raichu megaevolui: Electric acerta 4 em cheio (o Golisopod comum é Bug/Water) e o Raichu Mega só resiste
    expect(one.filter(e => e.def[elec] > 0).length).toBe(4);
    const pTwo = scoreParts(two, plan, types), pOne = scoreParts(one, plan, types);
    // Com o Golisopod como opção de mega, o Raichu fica com Lightning Rod: a defesa contra Electric melhora
    expect(pTwo.defense).toBeGreaterThan(pOne.defense);
    // Os stats contam a média dos cenários (um de cada vez), não as duas megas juntas
    const both = two.reduce((x, e) => x + (e.bst - 350) / 12, 0);
    expect(pTwo.members).toBeLessThan(both);
  });

  it('plano só com sinergia real: Rain Dance + golpes Water não basta; Drizzle + STAB ou quem aproveita pela habilidade, sim', () => {
    slot = 0;
    const filler = () => [mon('Snorlax', ['normal'], [160, 110, 65, 65, 110, 30], { moves: [atk('Body Slam', 'normal'), atk('Earthquake', 'ground')] })];
    const pika = () => mon('Pikachu', ['electric'], [35, 55, 40, 50, 50, 90], { ab: 'Lightning Rod', moves: [['Rain Dance', 'water', 2, 0], atk('Thunderbolt', 'electric', 1)] });
    const lapras = () => mon('Lapras', ['water', 'ice'], [130, 85, 80, 85, 95, 60], { ab: 'Water Absorb', moves: [atk('Surf', 'water', 1), atk('Ice Beam', 'ice', 1)] });
    const blastoise = () => mon('Blastoise', ['water'], [79, 83, 100, 85, 105, 78], { ab: 'Torrent', moves: [atk('Hydro Pump', 'water', 1), atk('Ice Beam', 'ice', 1)] });
    const fields = list => plans(prepare(list, T)).map(p => p.field);
    expect(fields([pika(), lapras(), blastoise(), ...filler()])).not.toContain('chuva'); // só Rain Dance + golpes Water
    const pelipper = mon('Pelipper', ['water', 'flying'], [60, 50, 100, 95, 70, 65], { ab: 'Drizzle', moves: [atk('Hurricane', 'flying', 1), atk('Scald', 'water', 1)] });
    expect(fields([pelipper, lapras(), blastoise(), ...filler()])).toContain('chuva'); // Drizzle: STAB Water conta
    const kingdra = mon('Kingdra', ['water', 'dragon'], [75, 95, 95, 95, 95, 85], { ab: 'Swift Swim', moves: [atk('Hydro Pump', 'water', 1), atk('Draco Meteor', 'dragon', 1)] });
    const zapdos = mon('Zapdos', ['electric', 'flying'], [90, 90, 85, 125, 90, 100], { moves: [atk('Thunder', 'electric', 1), atk('Hurricane', 'flying', 1)] });
    expect(fields([pika(), kingdra, zapdos, ...filler()])).toContain('chuva'); // Rain Dance + Swift Swim e Thunder
  });

  it('Trick Room de verdade: quem põe e mais 3 lentos que atacam', () => {
    slot = 0;
    const setter = () => mon('Oranguru', ['normal', 'psychic'], [90, 60, 80, 90, 110, 60], { moves: [['Trick Room', 'psychic', 2, 0], atk('Psychic', 'psychic', 1)] });
    const slow = n => mon(n, ['ground'], [100, 120, 100, 60, 80, 30], { moves: [atk('Earthquake', 'ground'), atk('Rock Slide', 'rock')] });
    const has = list => plans(prepare(list, T)).some(p => p.kind === 'room');
    expect(has([setter(), slow('Golem'), slow('Rhyperior')])).toBe(false);
    expect(has([setter(), slow('Golem'), slow('Rhyperior'), slow('Hippowdon')])).toBe(true);
  });

  it('modos: "Posso treinar" dá a nota de sempre; "Prontos para usar" pesa o nível que falta', () => {
    const lowKingdra = () => pool().map(m => (m.species.name === 'Kingdra' ? { ...m, level: 5 } : m));
    const rain = rs => rs.find(r => r.plan.field === 'chuva');
    const train = rain(buildTeams(lowKingdra(), T));
    const ready = rain(buildTeams(lowKingdra(), T, { ready: true }));
    expect(scoreParts(train.team, train.plan, attackTypes(T)).ready).toBe(0); // ninguém precisa ensinar golpe
    expect(names(train)).toContain('Kingdra');
    expect(names(ready)).not.toContain('Kingdra'); // Nv. 5 contra os outros no 50: no modo pronto, sai
  });

  it('alternativas por plano (sob demanda): no máximo 3 membros iguais e nota perto da melhor', () => {
    const rs = buildTeams(pool(), T);
    expect(rs.some(x => x.alt)).toBe(false); // a busca inicial só faz a melhor de cada plano
    const keys = new Set(rs.map(r => r.team.map(e => e.id).sort().join()));
    let found = 0;
    for (const first of rs) {
      const alts = altTeams(rs, first);
      alts.forEach((r, k) => {
        expect(r.alt).toBe(k + 1);
        expect(r.plan).toBe(first.plan);
        expect(planHolds(r.team, r.plan)).toBe(true);
        for (const other of [first, ...alts.slice(0, k)]) expect(r.team.filter(e => other.team.some(f => f.real === e.real)).length).toBeLessThanOrEqual(3);
        expect(r.score).toBeGreaterThanOrEqual(first.score * 0.9);
        expect(keys.has(r.team.map(e => e.id).sort().join())).toBe(false); // não repete uma equipe já mostrada
      });
      found += alts.length;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('tela: as partes mostradas somam a nota no plano de sol com quem é fraco ao Fire (Venusaur)', () => {
    // O Venusaur aproveita o sol (Chlorophyll) mas é fraco ao Fire, que o sol fortalece: entra com pena de 4 na parte
    // "Plano". As partes eram calculadas depois da busca do último plano (equilibrada, sem a pena) e somavam 4 a mais
    const rs = runBuilder(pool(), T);
    const sun = rs.find(r => r.plan.field === 'sol');
    expect(sun.team.map(m => m.species.name)).toContain('Venusaur');
    expect(sun.src.team.some(e => e.conflictBy.sol === 'weak' && e.strong.has('sol'))).toBe(true); // o caso da pena
    for (const r of rs) {
      const { total, ...parts } = r.parts;
      expect(total).toBeCloseTo(r.score, 9);
      expect(Object.values(parts).reduce((a, b) => a + b, 0)).toBeCloseTo(r.score, 9);
    }
    // As alternativas pedidas depois também (a busca delas marca as flags do plano de novo)
    for (let i = rs.length - 1; i >= 0; i--) moreOptions(rs, i, T);
    for (const r of rs) expect(r.parts.total).toBeCloseTo(r.score, 9);
    // Na tela: a linha "Nota N: Defesa … · Ataque …" soma N (as partes são arredondadas juntas, não uma a uma)
    rs.forEach((r, i) => {
      const line = resultsHtml(rs, i, T).match(/builder-score">([^<]*)</)[1];
      const [nota, ...parts] = line.match(/[+-]?\d+/g).map(Number);
      expect(nota).toBe(Math.round(r.score));
      expect(parts).toHaveLength(8);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(nota);
    });
  });

  it('partes na tela: arredondadas juntas somam a nota (42,5 e 4,5 não viram 43 e 5)', () => {
    const parts = { defense: -2, offense: 42.5, roles: 22, members: 130.83, balance: 1.5, plan: 38, ready: 0 };
    const score = Object.values(parts).reduce((a, b) => a + b, 0); // 232,83 → 233
    const shown = shownParts(parts, score);
    expect(Object.values(shown).reduce((a, b) => a + b, 0)).toBe(233);
    for (const k of Object.keys(parts)) expect(Math.abs(shown[k] - parts[k])).toBeLessThan(1);
    const neg = { defense: -6.5, offense: 40, roles: 13, members: -4.5, balance: 0, plan: 0, ready: -3 }; // 39 (arredondando cada uma: 40)
    const sn = shownParts(neg, 39);
    expect(Object.values(sn).reduce((a, b) => a + b, 0)).toBe(39);
    for (const k of Object.keys(neg)) expect(Math.abs(sn[k] - neg[k])).toBeLessThan(1);
  });

  it('tela: o botão pede as alternativas do plano e elas entram logo depois da melhor', () => {
    const rs = runBuilder(pool(), T);
    const n = rs.length;
    expect(resultsHtml(rs, 0, T)).toContain('data-more');
    const k = moreOptions(rs, 0, T);
    expect(k).toBe(1);
    expect(rs.length).toBeGreaterThan(n);
    expect(rs[1].plan).toBe(rs[0].plan);
    expect(rs[1].name).toContain('opção 2');
    expect(resultsHtml(rs, 0, T)).not.toContain('data-more'); // já pediu
    expect(resultsHtml(rs, 1, T)).not.toContain('data-more');
    expect(moreOptions(rs, 0, T)).toBe(-1); // não busca de novo
  });

  it('golpes que aprende: quem aprende Trick Room abre o plano e a tela diz o que ensinar', () => {
    const trId = T.moves.findIndex(r => r && r[0] === 'Trick Room');
    const slowpoke = (sp, types) => mon(sp, types, [100, 120, 100, 90, 90, 30], { moves: [atk('A', types[0]), atk('B', types[types.length - 1], 1), atk('Earthquake', 'ground')] });
    const all = [...pool(), slowpoke('Snorlax', ['normal']), slowpoke('Conkeldurr', ['fighting']), slowpoke('Rhyperior', ['ground', 'rock']),
      mon('Reuniclus', ['psychic'], [110, 65, 75, 125, 85, 30], { id: 579, moves: [atk('Psychic', 'psychic', 1), atk('Focus Blast', 'fighting', 1)] })];
    const dex = { rom: true, learn: { 579: [0, 41, trId] } };
    expect(plans(prepare(all, T)).some(p => p.kind === 'room')).toBe(false); // sem a tabela, ninguém põe
    const res = runBuilder(all, T, '', dex);
    const room = res.find(x => x.plan.kind === 'room');
    expect(room.team.map(m => m.species.name)).toContain('Reuniclus');
    expect(room.r.dicas.join(' ')).toContain('Ensine Trick Room a C1-');
    expect(room.r.dicas.join(' ')).toContain('aprende no Nv. 41');
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

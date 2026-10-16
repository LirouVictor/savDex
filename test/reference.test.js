// Equipes de referência (src/builder/reference.js e src/data/refteams/*.json): a original no jogo, quem o jogador tem, a
// equipe adaptada (busca da equipe inteira com a fidelidade) e o que a tela diz da origem.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import T from '../src/data/tables.js';
import SG from '../src/data/soulgold.json';
import { prepareBuild, scoreParts, allowed, planHolds } from '../src/builder/build.js';
import { referenceTeams, refPlan, normId, fidelity, FID_W, MIN_KEEP, refFormats, GAME_GEN } from '../src/builder/reference.js';
import { runBuilder, resultsHtml, pickerHtml } from '../src/builder/index.js';
import { setRoleKeys, STRATEGIES } from '../src/builder/strategies.js';

const ivs = v => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });
let slot = 0;
const mon = (sp, types, base, o = {}) => {
  slot++;
  return {
    location: 'pc', where: 'BOX1', boxIndex: 0, slot, speciesId: slot, nickname: sp, hasNickname: false, level: 50,
    species: { name: sp, form: null, types, baseStats: base, hasIcon: false, spriteId: slot },
    ability: { num: 0, name: o.ab || 'Pressure' }, item: o.item ? { name: o.item } : null,
    nature: { name: 'Adamant' }, ivs: ivs(31), evs: ivs(0),
    moves: (o.moves || []).map(([name, type, category, power]) => ({ name, type, category, power })), shiny: false, gender: null,
  };
};
const atk = (name, type, cat = 0) => [name, type, cat, 90];
const save = () => {
  slot = 0;
  return [
    mon('Pelipper', ['water', 'flying'], [60, 50, 100, 95, 70, 65], { ab: 'Drizzle', moves: [atk('Hurricane', 'flying', 1), atk('Scald', 'water', 1), ['U-turn', 'bug', 0, 70], ['Roost', 'flying', 2, 0]] }),
    mon('Kingdra', ['water', 'dragon'], [75, 95, 95, 95, 95, 85], { ab: 'Swift Swim', moves: [atk('Hydro Pump', 'water', 1), atk('Draco Meteor', 'dragon', 1), atk('Ice Beam', 'ice', 1)] }),
    mon('Raichu', ['electric'], [60, 90, 55, 90, 80, 110], { ab: 'Lightning Rod', moves: [atk('Thunder', 'electric', 1), atk('Grass Knot', 'grass', 1), ['Volt Switch', 'electric', 1, 70]] }),
    mon('Corviknight', ['flying', 'steel'], [98, 87, 105, 53, 85, 67], { ab: 'Mirror Armor', moves: [atk('Brave Bird', 'flying'), atk('Body Press', 'fighting'), ['Roost', 'flying', 2, 0], ['Defog', 'flying', 2, 0]] }),
    mon('Swampert', ['water', 'ground'], [100, 110, 90, 85, 90, 60], { ab: 'Swift Swim', moves: [atk('Liquidation', 'water'), atk('Earthquake', 'ground'), ['Stealth Rock', 'rock', 2, 0]] }),
    mon('Garchomp', ['dragon', 'ground'], [108, 130, 95, 80, 85, 102], { ab: 'Rough Skin', moves: [atk('Earthquake', 'ground'), atk('Dragon Claw', 'dragon'), ['Swords Dance', 'normal', 2, 0]] }),
    mon('Ludicolo', ['water', 'grass'], [80, 70, 70, 90, 100, 70], { ab: 'Swift Swim', moves: [atk('Hydro Pump', 'water', 1), atk('Giga Drain', 'grass', 1), atk('Ice Beam', 'ice', 1)] }),
    mon('Ferrothorn', ['grass', 'steel'], [74, 94, 131, 54, 116, 20], { ab: 'Iron Barbs', moves: [atk('Power Whip', 'grass'), atk('Gyro Ball', 'steel'), ['Spikes', 'ground', 2, 0], ['Leech Seed', 'grass', 2, 0]] }),
    mon('Scizor', ['bug', 'steel'], [70, 130, 100, 55, 80, 65], { ab: 'Technician', moves: [['Bullet Punch', 'steel', 0, 40], ['U-turn', 'bug', 0, 70], ['Swords Dance', 'normal', 2, 0], atk('Close Combat', 'fighting')] }),
    mon('Clefable', ['fairy'], [95, 70, 73, 95, 90, 60], { ab: 'Magic Guard', moves: [atk('Moonblast', 'fairy', 1), ['Moonlight', 'fairy', 2, 0], atk('Flamethrower', 'fire', 1)] }),
  ];
};
// Um membro como o importador grava: espécie e o que o set faz (sem o set)
const set = (s, moves, o = {}) => {
  const mv = moves.map(([name, type, category, power]) => ({ name, type, category, power }));
  const hits = mv.filter(m => m.category < 2);
  const x = { s, r: setRoleKeys({ abs: o.ab ? [o.ab] : [], item: o.item || null, moves: mv, types: [], b: null }), at: [...new Set(hits.map(m => m.type))].sort(), dmg: hits.length, cat: hits.length ? 'S' : '-' };
  for (const k of ['set', 'auto', 'use']) if (o[k]) x[k] = o[k];
  return x;
};
const RAIN = [
  set('Pelipper', [atk('Hurricane', 'flying', 1), atk('Scald', 'water', 1), ['U-turn', 'bug', 0, 70]], { ab: 'Drizzle', set: ['chuva'], auto: ['chuva'], use: ['chuva'] }),
  set('Barraskewda', [atk('Liquidation', 'water'), atk('Close Combat', 'fighting'), ['Flip Turn', 'water', 0, 60]], { ab: 'Swift Swim', use: ['chuva'] }),
  set('Kingdra', [atk('Hydro Pump', 'water', 1), atk('Draco Meteor', 'dragon', 1)], { ab: 'Swift Swim', use: ['chuva'] }),
  set('Ferrothorn', [atk('Power Whip', 'grass'), ['Spikes', 'ground', 2, 0], ['Stealth Rock', 'rock', 2, 0]]),
  set('Raichu', [atk('Thunder', 'electric', 1), ['Volt Switch', 'electric', 1, 70]], { use: ['chuva'] }),
  set('Tapu Fini', [atk('Moonblast', 'fairy', 1), ['Defog', 'flying', 2, 0]]),
];
const table = (teams, results = []) => [{ format: 'gen9test', name: 'Gen 9 Test', gen: 9, mode: 'singles', kind: 'sample_team',
  source: { thread: 'https://www.smogon.com/forums/threads/x/', dataset: 'https://github.com/pkmn/smogon/blob/main/data/teams/x.json', retrieved: '2026-10-12' },
  teams, results }];
const game = { id: 'quetzal' };

describe('equipes de referência', () => {
  it('nomes do Showdown × tabelas do jogo (máscaras, formas de aparência)', () => {
    expect(normId('Ogerpon-Wellspring-Mask')).toBe(normId('Ogerpon-Wellspring'));
    expect(normId('Enamorus-Incarnate')).toBe('enamorus');
    expect(normId('Gastrodon-East')).toBe('gastrodon');
    expect(normId('Landorus-Therian')).not.toBe(normId('Landorus'));
  });

  it('cada jogo só recebe equipes da geração dele (Quetzal e SoulGold: Gen 9); jogo sem a geração, nenhuma', () => {
    const gen = (g, tb) => tb.map(x => ({ ...x, gen: g }));
    const ctx = prepareBuild(save(), T);
    // A mesma equipe numa tabela da Gen 8 não entra no Quetzal
    expect(referenceTeams(ctx, gen(8, table([{ id: 'g8', members: RAIN }])), T, game)).toHaveLength(0);
    expect(referenceTeams(ctx, [...gen(8, table([{ id: 'g8', members: RAIN }])), ...table([{ id: 'g9', members: RAIN }])], T, game).map(r => r.ref.id)).toEqual(['g9']);
    // Jogos oficiais ainda sem tabelas da geração deles: nem a Gen 9 entra
    for (const id of ['emerald', 'firered', 'heartgold', 'black2', 'unbound']) {
      expect(refFormats({ id })).toEqual([]);
      expect(referenceTeams(ctx, table([{ id: 'g9', members: RAIN }]), T, { id })).toHaveLength(0);
    }
    expect(GAME_GEN).toMatchObject({ quetzal: 9, soulgold: 9 });
    expect(refFormats({ id: 'soulgold' })).toEqual(refFormats({ id: 'quetzal' }));
  });

  it('SoulGold: as espécies são as da Pokédex de Johto do hack (Barraskewda não existe lá)', () => {
    const TS = { ...T, soulgold: SG };
    const ctx = prepareBuild(save(), TS);
    const [r] = referenceTeams(ctx, table([{ id: 'rain', members: RAIN }]), TS, { id: 'soulgold' });
    const missing = r.orig.members.filter(m => !m.spec).map(m => m.x.s);
    expect(missing).toEqual(['Barraskewda']);
    expect(r.owned).toBe(4); // Pelipper, Kingdra, Ferrothorn e Raichu do save
    expect(r.adapted.team.map(e => e.m.species.name)).not.toContain('Barraskewda');
    expect(r.adapted.team).toHaveLength(6);
  });

  it('plano da original pelo que os sets fazem: chuva com quem põe e 2+ que aproveitam', () => {
    const ctx = prepareBuild(save(), T);
    const [r] = referenceTeams(ctx, table([{ id: 'a', members: RAIN }]), T, game);
    expect(r.orig.plan).toEqual({ kind: 'weather', field: 'chuva' });
    expect(r.orig.strategies).toEqual(expect.arrayContaining(['volt-turn', 'hazards']));
  });

  it('equipe toda no save: nenhuma troca', () => {
    const six = ['Pelipper', 'Kingdra', 'Raichu', 'Corviknight', 'Swampert', 'Ludicolo'];
    const members = six.map(s => RAIN.find(x => x.s === s) || set(s, [atk('Tackle', 'normal')]));
    const ctx = prepareBuild(save(), T);
    const [r] = referenceTeams(ctx, table([{ id: 'full', members }]), T, game);
    expect(r.complete).toBe(true);
    expect(r.swaps).toEqual([]);
    expect(r.adapted.team.map(e => e.m.species.name).sort()).toEqual([...six].sort());
  });

  it('parcial: quem o jogador tem fica; as vagas saem da busca da equipe inteira (a melhor nota + fidelidade)', () => {
    const ctx = prepareBuild(save(), T);
    const [r] = referenceTeams(ctx, table([{ id: 'rain', members: RAIN }]), T, game);
    const names = r.adapted.team.map(e => e.m.species.name);
    expect(names).toEqual(expect.arrayContaining(['Pelipper', 'Kingdra', 'Ferrothorn', 'Raichu']));
    expect(r.swaps.map(s => s.orig.x.s).sort()).toEqual(['Barraskewda', 'Tapu Fini']);
    expect(r.adapted.planKept && r.adapted.holds).toBe(true);
    // Global: nenhuma dupla de candidatos para as 2 vagas dá nota + fidelidade maior (busca exaustiva)
    const pp = r.adapted.pp, plan = r.adapted.plan, fid = fidelity(r.orig, true, plan);
    const val = team => scoreParts(team, plan, ctx.types).total + FID_W * fid(team);
    const kept = r.kept;
    let best = -Infinity;
    const cands = pp.pool.filter(e => !kept.some(k => k.real === e.real) && !e.conflict);
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const team = [...kept];
        if (!allowed(team, cands[i], plan)) continue;
        team.push(cands[i]);
        if (!allowed(team, cands[j], plan)) continue;
        team.push(cands[j]);
        if (planHolds(team, plan)) best = Math.max(best, val(team));
      }
    }
    expect(r.rank).toBeCloseTo(best, 6);
    // Cada troca diz o que manteve, o que outro membro cobre e o que se perdeu
    const fini = r.swaps.find(s => s.orig.x.s === 'Tapu Fini');
    expect(fini.sub).toBeTruthy();
    expect([...fini.kept, ...fini.covered, ...fini.lost]).toContain('removal');
  });

  it('a fidelidade troca nota por preservar a original: com o peso, preserva pelo menos o mesmo que sem ele', () => {
    const ctx = prepareBuild(save(), T);
    const [w] = referenceTeams(ctx, table([{ id: 'rain', members: RAIN }]), T, game);
    const [z] = referenceTeams(prepareBuild(save(), T), table([{ id: 'rain', members: RAIN }]), T, game, { fidW: 0 });
    const fid = fidelity(w.orig, true, w.adapted.plan);
    expect(fid(w.adapted.team)).toBeGreaterThanOrEqual(fid(z.adapted.team));
    expect(z.adapted.score).toBeGreaterThanOrEqual(w.adapted.score - 1e-9);
  });

  it('menos de MIN_KEEP membros no save: a referência fica de fora; nenhuma compatível → aviso e montagem livre', () => {
    const none = ['Iron Valiant', 'Great Tusk', 'Gholdengo', 'Dragapult', 'Kingambit', 'Pelipper'].map(s => set(s, [atk('Tackle', 'normal')]));
    const ctx = prepareBuild(save(), T);
    const r = referenceTeams(ctx, table([{ id: 'x', members: none }]), T, game);
    expect(MIN_KEEP).toBe(2);
    expect(r).toEqual([]);
    expect(r.rejected).toBe(1);
    const res = runBuilder(save(), T, '', null, { saveGame: game, refs: table([{ id: 'x', members: none }]) });
    expect(res.every(x => x.kind === 'free')).toBe(true);
    expect(resultsHtml(res, 0, T)).toContain('Nenhuma equipe do competitivo tem 2 ou mais Pokémon seus');
    // Jogo sem referências ainda
    expect(resultsHtml(runBuilder(save(), T, '', null, { saveGame: { id: 'emerald' }, refs: [] }), 0, T)).toContain('Este jogo ainda não tem equipes do competitivo');
  });

  it('tabela de outra geração ou de Doubles não entra (as regras dos papéis são as do jogo)', () => {
    const ctx = prepareBuild(save(), T);
    const [tb] = table([{ id: 'a', members: RAIN }]);
    expect(referenceTeams(ctx, [{ ...tb, gen: 8 }], T, game)).toEqual([]);
    expect(referenceTeams(ctx, [{ ...tb, mode: 'doubles' }], T, game)).toEqual([]);
    expect(referenceTeams(ctx, [tb], T, game)).toHaveLength(1);
  });

  it('a tela separa a original (com a origem) da adaptada; resultado de torneio só com fonte', () => {
    const team = { id: 'rain', name: 'Rain test', author: 'someone', verification: 'unverified', members: RAIN };
    const res = runBuilder(save(), T, '', null, { saveGame: game, refs: table([team]) });
    expect(res[0].kind).toBe('ref');
    const html = resultsHtml(res, 0, T);
    for (const s of ['Equipe original', 'Sua equipe adaptada', 'Trocas', 'Equipe de exemplo do Smogon', 'não conferidos no tópico',
      'Resultado em torneio: nenhum registrado', 'href="https://www.smogon.com/forums/threads/x/"', 'não herda o resultado nem a reputação',
      '1 equipes do competitivo combinam com o seu save (0 de finais de torneio).']) expect(html).toContain(s);
    // Abas: a adaptada aberta primeiro; trocas, estratégia e a original nas outras abas (escondidas até o toque);
    // cada membro é um bloco que abre o card dele
    expect(html.indexOf('Sua equipe adaptada')).toBeLessThan(html.indexOf('data-bt="team"'));
    for (const id of ['team', 'swaps', 'orig']) expect(html).toContain(`data-bt="${id}"`);
    expect(html).toMatch(/id="bt-pane-orig"[^>]*hidden>[\s\S]*Equipe original/);
    expect(html.indexOf('id="bt-pane-team"')).toBeLessThan(html.indexOf('id="bt-pane-swaps"'));
    expect(html.match(/data-sheet="o\d"/g)).toHaveLength(6);
    expect(html.match(/data-sheet="a\d"/g)).toHaveLength(6);
    const card = html.slice(html.indexOf('<template data-sheet-id="o1">'), html.indexOf('</template>', html.indexOf('<template data-sheet-id="o1">')));
    for (const s of ['Barraskewda', 'No seu save', 'você não tem', 'Na original']) expect(card).toContain(s);
    // Sem contas, interações nem o painel antigo "Para reproduzir"; lista de equipes sem rolar para o lado (os próximos
    // passos só aparecem sem o moveset, como aqui: com ele, o que fazer está no card de cada membro)
    for (const s of ['Contas da equipe', 'Interações', 'Para reproduzir a original', 'builder-tabs']) expect(html).not.toContain(s);
    // A equipe escolhida numa barra (sem a lista na página); a janela tem todas as compatíveis, com a ordem explicada
    expect(html).toContain('class="builder-current"');
    expect(html).not.toContain('class="builder-list');
    const pick = pickerHtml(res, 0);
    for (const s of ['Escolher equipe', 'Primeiro as equipes com mais Pokémon seus', 'data-choose="r0"', 'Você tem 4 dos 6', '4/6']) expect(pick).toContain(s);
    expect(html).toContain('4 dos 6 são seus');
    expect(pick).not.toMatch(/Nota|≈/);
    expect(html).not.toContain('data-free'); // sem o botão da montagem do zero (só quando nenhuma referência serve)
    // Equipe de exemplo nunca mostra resultado, nem com um registro na tabela
    const sample = resultsHtml(runBuilder(save(), T, '', null, { saveGame: game, refs: table([team], [{ team: 'rain', player: 'P', event: 'Torneio X', date: '2026', placement: 'champion', url: 'https://example.org/prova' }]) }), 0, T);
    expect(sample).not.toContain('Torneio X');
  });

  it('ordem: primeiro as equipes com mais Pokémon do jogador, mesmo com nota + fidelidade menor', () => {
    // "few" tem só 2 do save (Pelipper e Kingdra); "many" tem 5, mas sem Kingdra/Barraskewda (menos fiel à chuva)
    const few = { id: 'few', members: [RAIN[0], RAIN[2], set('Dragapult', [atk('Shadow Ball', 'ghost', 1)]), set('Gholdengo', [atk('Make It Rain', 'steel', 1)]), set('Great Tusk', [atk('Headlong Rush', 'ground')]), set('Kingambit', [atk('Kowtow Cleave', 'dark')])] };
    const many = { id: 'many', members: ['Garchomp', 'Ferrothorn', 'Scizor', 'Clefable', 'Corviknight'].map(sp => set(sp, [atk('Tackle', 'normal')])).concat([set('Dragapult', [atk('Shadow Ball', 'ghost', 1)])]) };
    const ctx = prepareBuild(save(), T);
    const rs = referenceTeams(ctx, table([few, many]), T, game);
    expect(rs.map(r => r.ref.id)).toEqual(['many', 'few']);
    expect(rs.map(r => r.owned)).toEqual([5, 2]);
    const res = runBuilder(save(), T, '', null, { saveGame: game, refs: table([few, many]) });
    expect(res[0].ref.ref.id).toBe('many');
    const pick = pickerHtml(res, 0);
    expect(pick.indexOf('Você tem 5 dos 6')).toBeLessThan(pick.indexOf('Você tem 2 dos 6'));
  });

  it('equipe de final de torneio: colocação com o replay como prova; sem a prova, nada de campeã', () => {
    const team = { id: 'rain-t', name: 'Torneio X', author: 'P', verification: 'verified', partial: true, members: RAIN.map((m, i) => (i === 5 ? { ...m, r: [], hidden: true } : m)) };
    const tour = (results) => [{ ...table([team], results)[0], kind: 'tournament', source: { retrieved: '2026-10-12' } }];
    const r = { team: 'rain-t', player: 'P', event: 'Torneio X', date: '2026-09-01', placement: 'champion', series: '2-1', games: 3, won: 2,
      url: 'https://replay.pokemonshowdown.com/smogtours-gen9ou-1', thread: 'https://www.smogon.com/forums/threads/torneio-x.1/', verification: 'verified' };
    const res = runBuilder(save(), T, '', null, { saveGame: game, refs: tour([r]) });
    expect(res[0].tag).toBe('Campeã');
    const html = resultsHtml(res, 0, T);
    for (const s of ['Adaptada da campeã de Torneio X (P)', 'Equipe de P na final de Torneio X.', 'Campeão de Torneio X (2026-09-01), P: venceu a final por 2-1.',
      'href="https://replay.pokemonshowdown.com/smogtours-gen9ou-1"', 'href="https://www.smogon.com/forums/threads/torneio-x.1/"', 'não entrou na final',
      '(1 de finais de torneio)', '<span class="builder-tag">Campeã</span>', 'Torneio X · P']) expect(html).toContain(s);
    expect(html).not.toContain('Resultado em torneio: nenhum registrado');
    // Finalista
    const fin = runBuilder(save(), T, '', null, { saveGame: game, refs: tour([{ ...r, placement: 'finalist', series: '1-2' }]) });
    expect(fin[0].tag).toBe('Finalista');
    expect(resultsHtml(fin, 0, T)).toContain('perdeu a final por 1-2');
    // Sem URL de prova: sem colocação
    const none = runBuilder(save(), T, '', null, { saveGame: game, refs: tour([{ ...r, url: undefined }]) });
    expect(none[0].tag).toBe(null);
  });
});

describe('tabelas de referência (src/data/refteams)', () => {
  const files = readdirSync('src/data/refteams').filter(f => f.endsWith('.json'));
  const ROLES = new Set(STRATEGIES.flatMap(s => [...(s.need || []).map(([r]) => r), ...(s.same || [])]).concat(['pivot', 'regen', 'hazard', 'removal', 'phaze', 'screens', 'web', 'sweeper', 'midAttacker', 'priority', 'sacrifice', 'clay', 'passable', 'smashItem', 'drum', 'smash', 'pass']));
  it('só dados derivados (nada do set copiado), Singles, origem e verificação de cada equipe', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const tb = JSON.parse(readFileSync(`src/data/refteams/${f}`, 'utf8'));
      expect(tb.mode).toBe('singles');
      expect(tb.kind).toBe('sample_team');
      expect(tb.source.thread).toMatch(/^https:\/\/www\.smogon\.com\/forums\/threads\//);
      expect(tb.source.dataset).toMatch(/^https:\/\/github\.com\/pkmn\/smogon\//);
      for (const r of tb.results) expect(r.url).toMatch(/^https:\/\//);
      for (const t of tb.teams) {
        expect(['verified', 'partially_verified', 'unverified']).toContain(t.verification);
        expect(t.members).toHaveLength(6);
        for (const m of t.members) {
          for (const k of Object.keys(m)) expect(['s', 'mega', 'r', 'set', 'auto', 'use', 'at', 'dmg', 'cat']).toContain(k);
          for (const r of m.r) expect(ROLES.has(r)).toBe(true);
        }
      }
    }
  });
});

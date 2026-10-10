import { describe as suite, it, expect, beforeEach } from 'vitest';
import { refOf, monLine, candidates, checkAnalysis, checkBuild, analysisPrompt, buildPrompt, schemaHint, ANALYSIS_SCHEMA, BUILD_SCHEMA, teamFacts, analysisPool, learnLines, systemPrompt, ANALYSIS_PC, buildPool, strategyLines, buildIssues, moveChecks, levelGap, refinePrompt, checkRefine } from '../src/ai/prompt.js';
import dex from '../src/data/dex.json';
import { repairTeam } from '../src/ai/repair.js';
import { abilityAlts, freeAbilityMode, strategyOf } from '../src/ai/prompt.js';
import { rolesOf, synergyWarnings } from '../src/ai/strategy.js';
import * as groq from '../src/ai/groq.js';
import { provider, providerId, setProviderId } from '../src/ai/providers.js';
import { generateJSON, errorMessage, pickModel, listFlashModels, fallbackOrder, setModel, getModel, quotaKind, resetQuota } from '../src/ai/gemini.js';
import { analysisView, buildView, rich } from '../src/ai/view.js';
import T from '../src/data/tables.js';

const ivs = n => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n });
const mon = (o) => ({
  location: o.box ? 'pc' : 'party', where: o.box ? `BOX${o.box}` : 'Equipe', boxIndex: o.box ? o.box - 1 : null, slot: o.slot,
  speciesId: o.id, nickname: o.sp, hasNickname: false,
  species: { name: o.sp, form: null, types: o.types, baseStats: o.base || null, hasIcon: false, spriteId: o.id },
  ability: { name: o.ab || 'Static', hidden: !!o.hidden }, item: o.item ? { name: o.item } : null,
  nature: { name: 'Adamant', plus: 'atk', minus: 'spa' }, ivs: ivs(o.iv ?? 31), evs: ivs(0),
  moves: (o.moves || []).map(([name, type, category, power]) => ({ name, type, category, power })),
  shiny: false, gender: null,
});
const all = [
  mon({ sp: 'Lucario', id: 448, slot: 1, types: ['fighting', 'steel'], base: [70, 110, 70, 115, 70, 90], item: 'Lucarionite Z', hidden: true, ab: 'Justified', moves: [['Close Combat', 'fighting', 0, 120]] }),
  mon({ sp: 'Pelipper', id: 279, slot: 2, types: ['water', 'flying'], base: [60, 50, 100, 95, 70, 65] }),
  mon({ sp: 'Garchomp', id: 445, box: 3, slot: 12, types: ['dragon', 'ground'], base: [108, 130, 95, 80, 85, 102] }),
  mon({ sp: 'Garchomp', id: 445, box: 4, slot: 1, types: ['dragon', 'ground'], base: [108, 130, 95, 80, 85, 102], iv: 10 }),
  mon({ sp: 'Garchomp', id: 445, box: 4, slot: 2, types: ['dragon', 'ground'], base: [108, 130, 95, 80, 85, 102], iv: 5 }),
  mon({ sp: 'Rattata', id: 19, box: 1, slot: 1, types: ['normal'], base: [30, 56, 35, 25, 35, 72] }),
];
const byRef = new Map(all.map(m => [refOf(m), m]));

suite('IA: dados enviados', () => {
  it('referências e linha compacta (sem nível)', () => {
    expect(all.map(refOf)).toEqual(['E1', 'E2', 'C3-12', 'C4-1', 'C4-2', 'C1-1']);
    const line = monLine(all[0]);
    expect(line).toContain('E1 | Lucario | Fighting/Steel');
    expect(line).toContain('Hab: Justified (oculta)');
    expect(line).toContain('Base 70/110/70/115/70/90 = 525');
    expect(line).toContain('Close Combat [Fighting, Físico, 120]');
    expect(line).toContain('Item: Lucarionite Z (megapedra)');
    expect(line).not.toMatch(/Nv|nível/i);
  });
  it('candidatos: equipe sempre, PC por stats base, no máximo 2 da mesma espécie', () => {
    const c = candidates(all).map(refOf);
    expect(c.slice(0, 2)).toEqual(['E1', 'E2']);
    expect(c).toEqual(['E1', 'E2', 'C3-12', 'C4-1', 'C1-1']);
    expect(candidates(all, 3).map(refOf)).toEqual(['E1', 'E2', 'C3-12']);
  });
  it('prompts: análise separa equipe e PC; montagem inclui o pedido do jogador', () => {
    const a = analysisPrompt(all, T);
    expect(a).toMatch(/EQUIPE ATUAL:\nE1 \| Lucario/);
    expect(a).toMatch(/PC \(3 candidatos que mais ajudam a equipe\):\nC3-12/);
    expect(a).toContain('defesa entre os membros (25%)');
    expect(a).toContain('o que resolve e o que se perde');
    const b = buildPrompt(all, T, 'quero usar o Lucario');
    expect(b).toContain('Pedido do jogador: quero usar o Lucario');
    expect(b).toContain('DISPONÍVEIS (4):');
    expect(b).toContain('nenhum tipo que acerte em cheio 3 ou mais membros');
    expect(b).toContain('não os 6 mais fortes sozinhos');
    // Sem quem ponha clima/terreno/Trick Room, a IA é avisada para não montar em volta disso
    expect(b).toContain('Nenhum disponível põe clima, terreno nem Trick Room');
    expect(systemPrompt({ id: 'quetzal' })).toContain('não a que a espécie costuma ter');
    expect(b).toContain('Nas dicas, só ajustes concretos');
    expect(b).toContain('Não afirme fraquezas, resistências nem contagens da equipe final');
    expect(b).toContain('não sugira o que o Pokémon já tem');
    expect(a).toContain('Omita quem já está bem montado');
  });
  it('montagem: uma cópia por espécie (a de melhores IVs)', () => {
    expect(buildPool(all).map(refOf)).toEqual(['E1', 'E2', 'C3-12', 'C1-1']);
  });
});

suite('IA: cálculos do app e candidatos', () => {
  const party = [
    mon({ sp: 'Pelipper', id: 279, slot: 1, types: ['water', 'flying'], base: [60, 50, 100, 95, 70, 65], ab: 'Drizzle', moves: [['Hurricane', 'flying', 1, 110], ['Roost', 'flying', 2, 0]] }),
    mon({ sp: 'Lucario', id: 448, slot: 2, types: ['fighting', 'steel'], base: [70, 110, 70, 115, 70, 90], item: 'Lucarionite Z', moves: [['Close Combat', 'fighting', 0, 120]] }),
    mon({ sp: 'Gyarados', id: 130, slot: 3, types: ['water', 'flying'], base: [95, 125, 79, 60, 100, 81], item: 'Eviolite', moves: [['Waterfall', 'water', 0, 80]] }),
  ];
  it('fatos: fraquezas, golpes físicos/especiais, velocidade, tipos repetidos, megapedra e clima', () => {
    const f = teamFacts(party, T);
    expect(f).toMatch(/acertam muitos membros em cheio: .*Electric \(2 fracos/);
    expect(f).toContain('Golpes de dano: 2 físicos, 1 especiais; 1 de status.');
    expect(f).toContain('Velocidade base (maior primeiro): E2 90, E3 81, E1 65.');
    expect(f).toContain('Tipos repetidos: Water ×2, Flying ×2.');
    expect(f).toContain('Megapedras: E2 (Lucarionite Z)'); // Eviolite não é megapedra
    expect(f).toContain('Põem clima/terreno/Trick Room: E1 (chuva).');
    expect(f).toContain('Alertas de sinergia: E1 põe chuva, mas só 1 membro(s) aproveita(m).');
  });
  it('PC da análise: quem resiste às fraquezas da equipe vem antes, e no máximo ANALYSIS_PC', () => {
    const pc = [
      mon({ sp: 'Snorlax', id: 143, box: 1, slot: 1, types: ['normal'], base: [160, 110, 65, 65, 110, 30] }),
      mon({ sp: 'Ferrothorn', id: 598, box: 1, slot: 2, types: ['grass', 'steel'], base: [74, 94, 131, 54, 116, 20] }),
    ];
    const pool = analysisPool([...party, ...pc], T, 10);
    expect(pool.map(m => m.species.name)).toEqual(['Ferrothorn', 'Snorlax']); // Ferrothorn resiste a Electric (BST menor)
    const many = Array.from({ length: 120 }, (_, i) => mon({ sp: 'Mon' + i, id: i + 1, box: 1 + Math.floor(i / 30), slot: 1 + (i % 30), types: ['normal'], base: [50, 50, 50, 50, 50, 50] }));
    expect(analysisPrompt([...party, ...many], T)).toContain(`PC (${ANALYSIS_PC} candidatos`);
  });
  it('golpes por nível só para Quetzal/Unbound, sem os que o Pokémon já tem', () => {
    const p = [{ ...party[0], species: { ...party[0].species, dexId: 279 }, moves: [{ name: 'Hurricane' }] }];
    const lines = learnLines(p, dex, T, { id: 'quetzal' });
    expect(lines[1]).toMatch(/^Aprende por nível/);
    expect(lines[2]).toMatch(/^E1: /);
    expect(lines[2]).not.toMatch(/\bHurricane\b/);
    expect(learnLines(p, dex, T, { id: 'emerald', gen: 3 })).toEqual([]);
    expect(analysisPrompt(p, T, '', 250, { dex, game: { id: 'quetzal' } })).toContain('Aprende por nível');
  });
  it('pistas de estratégia: quem põe clima/terreno, quem aproveita e Trick Room', () => {
    const pool = [
      ...party,
      mon({ sp: 'Kingdra', id: 230, box: 1, slot: 1, types: ['water', 'dragon'], ab: 'Swift Swim' }),
      mon({ sp: 'Venusaur', id: 3, box: 1, slot: 2, types: ['grass', 'poison'], ab: 'Chlorophyll' }), // sem quem ponha sol
      mon({ sp: 'Reuniclus', id: 579, box: 1, slot: 3, types: ['psychic'], ab: 'Magic Guard', moves: [['Trick Room', 'psychic', 2, 0], ['Rain Dance', 'water', 2, 0]] }),
    ];
    const lines = strategyLines(pool, null, T);
    expect(lines[1]).toMatch(/^Pistas de estratégia/);
    expect(lines).toContain('- chuva: põem E1 (Drizzle), C1-3 (Rain Dance); aproveitam (2): E1 (Hurricane), C1-1 (Swift Swim); o clima corta a fraqueza a Fire de E2, C1-2.');
    expect(lines).toContain('- Trick Room: põem C1-3; nenhum lento para aproveitar.');
    expect(lines.join('\n')).not.toMatch(/sol|Chlorophyll/);
    expect(strategyLines(party.slice(1), null, T)).toEqual([]);
    // golpes que aproveitam o terreno também contam (Rillaboom com Grassy Surge e Grassy Glide)
    const rilla = mon({ sp: 'Rillaboom', id: 812, box: 2, slot: 1, types: ['grass'], ab: 'Grassy Surge', moves: [['Grassy Glide', 'grass', 0, 55]] });
    expect(strategyLines([rilla], null, T)).toContain('- Grassy Terrain: põem C2-1 (Grassy Surge); aproveitam (1): C2-1 (Grassy Glide).');
    expect(buildPrompt(pool, T)).toContain('C1-1 (Swift Swim)');
    expect(buildPrompt(pool, T)).not.toContain('Nenhum disponível põe clima');
  });
  it('montagem com pouco espaço: estratégia e variedade de tipos antes dos stats base', () => {
    const strong = Array.from({ length: 20 }, (_, i) => mon({ sp: 'Big' + i, id: 500 + i, box: 2, slot: i + 1, types: ['dragon'], base: [100, 100, 100, 100, 100, 100] }));
    const pool = [
      ...party,
      ...strong,
      mon({ sp: 'Kingdra', id: 230, box: 1, slot: 1, types: ['water', 'dragon'], ab: 'Swift Swim', base: [75, 95, 95, 95, 95, 85] }),
      mon({ sp: 'Venusaur', id: 3, box: 1, slot: 2, types: ['grass', 'poison'], ab: 'Chlorophyll', base: [80, 82, 83, 100, 100, 80] }), // ninguém põe sol
      mon({ sp: 'Reuniclus', id: 579, box: 1, slot: 3, types: ['psychic'], ab: 'Magic Guard', base: [110, 65, 75, 125, 85, 30], moves: [['Trick Room', 'psychic', 2, 0]] }),
      mon({ sp: 'Raichu', id: 26, box: 1, slot: 4, types: ['electric'], base: [60, 90, 55, 90, 80, 110] }),
    ];
    const refs = buildPool(pool, 10).map(refOf);
    expect(refs).toHaveLength(10);
    expect(refs.slice(0, 3)).toEqual(['E1', 'E2', 'E3']);
    // Swift Swim (Pelipper põe chuva) e Trick Room entram; Chlorophyll sem sol, não por isso
    expect(refs).toEqual(expect.arrayContaining(['C1-1', 'C1-3']));
    // um de cada tipo antes dos mais fortes (Raichu, o único Electric; Venusaur, Grass/Poison)
    expect(refs).toEqual(expect.arrayContaining(['C1-4', 'C1-2', 'C2-1']));
    expect(refs.filter(r => r.startsWith('C2-'))).toHaveLength(3); // 1 pelo tipo Dragon + 2 pelos stats base
    // com espaço para todos, nada muda
    expect(buildPool(pool, 250)).toHaveLength(pool.length);
    expect(buildPrompt(pool, T)).toContain('5. Stats base altos: só para desempatar.');
  });
  it('regras: cálculos do app como fonte de verdade, limitação em vez de suposição, golpes só da lista', () => {
    const s = systemPrompt({ id: 'quetzal' });
    expect(s).toContain('fonte de verdade');
    expect(s).toContain('diga que é uma limitação');
    expect(s).toContain('"Aprende por nível"');
    expect(s).toContain('Magic Guard anula o recuo da Life Orb');
  });
});

suite('IA: conferência da resposta', () => {
  it('análise: descarta trocas e dicas com referências inexistentes ou trocadas', () => {
    const r = checkAnalysis({
      nota: 12.4, resumo: 'ok', pontos_fortes: ['a', '', 'b'], pontos_fracos: [], sinergias: ['E1 e E2'],
      trocas: [{ sai: 'E2', entra: 'C3-12', motivo: 'm' }, { sai: 'E9', entra: 'C3-12', motivo: 'x' }, { sai: 'C3-12', entra: 'E1', motivo: 'y' }],
      dicas: [{ ref: 'E1', texto: 'use Swords Dance' }, { ref: 'C99-1', texto: 'z' }],
    }, byRef);
    expect(r.nota).toBe(10);
    expect(r.pontos_fortes).toEqual(['a', 'b']);
    expect(r.trocas).toEqual([{ sai: 'E2', entra: 'C3-12', motivo: 'm' }]);
    expect(r.dicas.map(d => d.ref)).toEqual(['E1']);
    expect(r.dropped).toEqual(['E9 → C3-12', 'C3-12 → E1', 'C99-1']);
  });
  it('montagem: sem repetir referência nem espécie, até 6', () => {
    const r = checkBuild({
      nome: '', resumo: 'r', pontos_fortes: [], pontos_fracos: [], dicas: [],
      membros: [{ ref: 'E1', papel: 'p', motivo: 'm' }, { ref: 'E1' }, { ref: 'C3-12' }, { ref: 'C4-1' }, { ref: 'X1' }, { ref: 'C1-1' }],
    }, byRef);
    expect(r.nome).toBe('Equipe sugerida');
    expect(r.membros.map(x => x.ref)).toEqual(['E1', 'C3-12', 'C1-1']);
    expect(r.dropped).toEqual(['X1']);
  });
  it('nome junto da referência não aparece duas vezes', () => {
    const L = '<b>Lucario</b>', G = '<b>Garchomp</b>';
    expect(rich('E1 forte', byRef)).toBe(`${L} forte`);
    expect(rich('Lucario (E1) e Garchomp (C3-12) formam', byRef)).toBe(`${L} e ${G} formam`);
    expect(rich('E1 Lucario e C3-12 Garchomp', byRef)).toBe(`${L} e ${G}`);
    expect(rich('E1 (Lucario) e [C3-12]', byRef)).toBe(`${L} e ${G}`);
    expect(rich('Lucario E1 ataca', byRef)).toBe(`${L} ataca`);
    expect(rich('(E1) sozinho', byRef)).toBe(`${L} sozinho`);
    expect(rich('Pelipper e E1', byRef)).toBe(`Pelipper e ${L}`);
    expect(rich('C99-1 não existe', byRef)).toBe('C99-1 não existe');
    expect(rich('E1 <script>', byRef)).toBe(`${L} &lt;script&gt;`);
  });
  it('telas: nomes no lugar das referências e texto escapado', () => {
    const a = checkAnalysis({ nota: 7, resumo: 'E1 <b>forte</b>', pontos_fortes: [], pontos_fracos: [], sinergias: [], trocas: [{ sai: 'E2', entra: 'C3-12', motivo: 'C3-12 cobre E2' }], dicas: [] }, byRef);
    const html = analysisView(a, byRef, 'gemini-x');
    expect(html).toContain('<b>Lucario</b> &lt;b&gt;forte&lt;/b&gt;');
    expect(html).toContain('<b>Garchomp</b> cobre <b>Pelipper</b>');
    expect(html).toContain('data-ref="C3-12"');
    const b = checkBuild({ nome: 'Time', resumo: '', pontos_fortes: [], pontos_fracos: [], dicas: [], membros: [{ ref: 'E1', papel: 'atacante', motivo: 'm' }] }, byRef);
    const bv = buildView(b, byRef, 'gemini-x', T);
    expect(bv).toContain('A IA sugeriu só 1 Pokémon válidos.');
    expect(bv).toContain('Conferência do app');
    expect(bv).toContain('Velocidade base (maior primeiro): <b>Lucario</b> 90.'); // mesmas contas da análise, com nomes
    expect(bv).toContain('Megapedras: <b>Lucario</b> (Lucarionite Z)');
    expect(bv).not.toContain('Fora dos critérios pedidos');
  });
  it('montagem: o app avisa quando a equipe fura os critérios pedidos', () => {
    const steel = (sp, slot, item) => mon({ sp, id: slot, box: 5, slot, types: ['steel'], item });
    const team = [steel('Skarmory', 1, 'Scizorite'), steel('Klefki', 2, 'Metagrossite'), steel('Bronzong', 3)];
    expect(buildIssues(team, T)).toEqual([
      'Fighting acerta 3 membros em cheio (o pedido era nenhum tipo acertando 3 ou mais).',
      'Ground acerta 3 membros em cheio (o pedido era nenhum tipo acertando 3 ou mais).',
      'Fire acerta 3 membros em cheio (o pedido era nenhum tipo acertando 3 ou mais).',
      '2 Pokémon com megapedra (o pedido era no máximo um).',
    ]);
    const refs = new Map(team.map(m => [refOf(m), m]));
    const r = checkBuild({ nome: 'T', resumo: '', pontos_fortes: [], pontos_fracos: [], dicas: [], membros: team.map(m => ({ ref: refOf(m) })) }, refs);
    expect(buildView(r, refs, 'x', T)).toContain('Fora dos critérios pedidos:');
  });
});

suite('IA: conferência dos golpes citados e do nível', () => {
  const withDex = (o, dexId, level) => ({ ...mon(o), level, species: { ...mon(o).species, dexId } });
  const team = [
    withDex({ sp: 'Pelipper', id: 279, box: 1, slot: 1, types: ['water', 'flying'], moves: [['Hurricane', 'flying', 1, 110]] }, 279, 100),
    withDex({ sp: 'Dragonite', id: 149, box: 1, slot: 3, types: ['dragon', 'flying'], moves: [['Thunder', 'electric', 1, 110], ['Flamethrower', 'fire', 1, 90]] }, 149, 100),
    withDex({ sp: 'Swampert', id: 260, box: 1, slot: 4, types: ['water', 'ground'], moves: [['Liquidation', 'water', 0, 85]] }, 260, 82),
    withDex({ sp: 'Scizor', id: 212, box: 1, slot: 5, types: ['bug', 'steel'], item: 'Scizorite' }, 212, 59),
  ];
  const refs = new Map(team.map(m => [refOf(m), m]));
  it('golpe novo: confere com os golpes por nível do Pokémon citado mais perto', () => {
    expect(moveChecks('Substitua Flamethrower por Hurricane em C1-3. Sob a chuva, Hurricane ganha precisão.', refs, dex, T))
      .toEqual([{ ref: 'C1-3', move: 'Hurricane', learns: true }]); // Flamethrower ele já tem
    expect(moveChecks('Ensine Rain Dance para C1-4 caso C1-1 seja nocauteado.', refs, dex, T))
      .toEqual([{ ref: 'C1-4', move: 'Rain Dance', learns: false }]); // Swampert não aprende por nível
    expect(moveChecks('Use Fire Punch.', refs, dex, T, team[1])).toEqual([{ ref: 'C1-3', move: 'Fire Punch', learns: true }]); // dono da dica; não confunde com Fire/Punch
    expect(moveChecks('Substitute Flamethrower with Hurricane on C1-3.', refs, dex, T).map(c => c.move)).toEqual(['Hurricane']); // palavra no começo da frase
    expect(moveChecks('Hurricane em C1-3', refs, null, T)).toEqual([]);
    // nome do efeito no campo (estratégia), não golpe a ensinar
    expect(moveChecks('Use o Grassy Terrain de C1-3 e monte um time de Trick Room.', refs, dex, T)).toEqual([]);
  });
  it('nível bem abaixo do resto (só o app; o nível não vai para a IA)', () => {
    expect(levelGap(team)).toBe('Nível bem abaixo do resto: C1-5 (59), C1-4 (82); os outros estão no nível 100. Vale treinar antes.');
    expect(levelGap(team.filter(m => m.level !== 82).concat([{ ...team[2], level: 90 }]))).toBe('Nível bem abaixo do resto: C1-5 (59); os outros, do 90 ao 100. Vale treinar antes.');
    expect(levelGap(team.slice(0, 2))).toBe(null);
  });
  it('telas: marcas de "aprende por nível" e o aviso de nível', () => {
    const b = checkBuild({ nome: 'Chuva', resumo: '', pontos_fortes: [], pontos_fracos: [], membros: team.map(m => ({ ref: refOf(m) })),
      dicas: ['Substitua Flamethrower por Hurricane em C1-3.', 'Ensine Rain Dance para C1-4.'] }, refs);
    const html = buildView(b, refs, 'x', T, { dex });
    expect(html).toContain('✓ Hurricane: <b>Dragonite</b> aprende por nível');
    expect(html).toContain('⚠ Rain Dance: não está nos golpes por nível de <b>Swampert</b>');
    expect(html).toContain('Nível bem abaixo do resto: <b>Scizor</b> (59)');
    expect(buildView(b, refs, 'x', T)).not.toContain('aprende por nível'); // sem dex (jogos oficiais antigos): sem marcas
    const a = checkAnalysis({ nota: 6, resumo: '', pontos_fortes: [], pontos_fracos: [], sinergias: [], trocas: [], dicas: [{ ref: 'C1-4', texto: 'Troque Liquidation por Hydro Pump.' }] }, refs);
    expect(analysisView(a, refs, 'x', { dex, T })).toContain('✓ Hydro Pump: <b>Swampert</b> aprende por nível');
  });
});

suite('IA: montagem em duas etapas', () => {
  const withDex = (o, dexId, level) => ({ ...mon(o), level, species: { ...mon(o).species, dexId } });
  const pool = [
    withDex({ sp: 'Pelipper', id: 279, slot: 1, types: ['water', 'flying'], ab: 'Drizzle', moves: [['Hurricane', 'flying', 1, 110]] }, 279, 100),
    withDex({ sp: 'Swampert', id: 260, box: 1, slot: 4, types: ['water', 'ground'], moves: [['Liquidation', 'water', 0, 85]] }, 260, 82),
    withDex({ sp: 'Rattata', id: 19, box: 2, slot: 1, types: ['normal'] }, 19, 5),
  ];
  const team = pool.slice(0, 2);
  it('segundo pedido: só a equipe escolhida, as contas do app e os golpes por nível dela', () => {
    const p = refinePrompt(team, T, 'quero chuva', { dex, game: { id: 'quetzal' } });
    expect(p).toContain('Esta é a equipe escolhida. Não troque membros');
    expect(p).toMatch(/EQUIPE:\nE1 \| Pelipper[^\n]*\nC1-4 \| Swampert/);
    expect(p).toContain('Tipos sem nenhum golpe super efetivo da equipe:');
    expect(p).toMatch(/\nC1-4: [^\n]*Hydro Pump/); // golpes por nível do Swampert
    expect(p).toContain('Pedido do jogador: quero chuva');
    expect(p).not.toContain('Rattata');
    expect(p).not.toMatch(/Nv|nível 82/);
    expect(refinePrompt(team, T)).not.toContain('Aprende por nível (lista'); // sem dex (jogos oficiais antigos)
    expect(checkRefine({ pontos_fortes: [], pontos_fracos: [], dicas: [] })).toBe(null);
    expect(buildPrompt(pool, T)).not.toContain('quem treinar primeiro');
  });
  const prep = (P) => ({ kind: 'build', P, system: 's', prompt: 'p1', schema: {}, all: pool, T, dex, game: { id: 'quetzal' }, note: '', counts: {} });
  const first = { nome: 'Chuva', resumo: '', pontos_fortes: ['a'], pontos_fracos: ['b'], dicas: ['dica da primeira'], membros: [{ ref: 'E1' }, { ref: 'C1-4' }] };
  it('a tela usa os pontos e as dicas da segunda etapa, com o texto dela à vista', async () => {
    const { sendAi } = await import('../src/ai/index.js');
    const sent = [];
    const P = { service: 'Gemini', generateJSON: async ({ prompt }) => {
      sent.push(prompt);
      return sent.length === 1 ? { data: first, model: 'gemini-x', fallback: false }
        : { data: { pontos_fortes: ['forte'], pontos_fracos: ['Electric acerta E1'], dicas: ['Ensine Hydro Pump a C1-4.'] }, model: 'gemini-x-lite', fallback: true };
    } };
    const steps = [];
    const res = await sendAi(prep(P), { onStep: n => steps.push(n) });
    expect(steps).toEqual([2]);
    expect(sent[1]).toContain('Esta é a equipe escolhida');
    expect(res.html).toContain('Ensine Hydro Pump a <b>Swampert</b>.');
    expect(res.html).toContain('✓ Hydro Pump: <b>Swampert</b> aprende por nível');
    expect(res.html).not.toContain('dica da primeira');
    expect(res.html).toContain('Ver o texto do segundo envio');
    expect(res.html).toContain('veio de um modelo mais leve (gemini-x-lite)');
    expect(res.html).toContain('Gemini (gemini-x + gemini-x-lite)');
    expect(res.html).toContain('estava sobrecarregado');
    // Cota do dia esgotada: o aviso diz isso, não sobrecarga
    let n = 0;
    const Q = { service: 'Gemini', generateJSON: async () => (++n === 1 ? { data: first, model: 'gemini-x-lite', fallback: 'quota' }
      : { data: { pontos_fortes: ['f'], pontos_fracos: ['w'], dicas: ['d'] }, model: 'gemini-x-lite', fallback: 'quota' }) };
    const q = await sendAi(prep(Q));
    expect(q.html).toContain('A cota grátis de hoje do modelo escolhido acabou: a resposta veio de um modelo mais leve (gemini-x-lite)');
    expect(q.html).not.toContain('sobrecarregado');
    expect(res.team.map(refOf)).toEqual(['E1', 'C1-4']);
  });
  it('se a segunda etapa falhar, ficam os pontos e as dicas da primeira', async () => {
    const { sendAi } = await import('../src/ai/index.js');
    let n = 0;
    const P = { service: 'Groq', generateJSON: async () => { if (++n === 2) throw new Error('503'); return { data: first, model: 'm', fallback: false }; } };
    const warn = console.warn; console.warn = () => {};
    const res = await sendAi(prep(P));
    console.warn = warn;
    expect(res.html).toContain('dica da primeira');
    expect(res.html).toContain('A segunda etapa (pontos e dicas com as contas do app) não respondeu');
    expect(res.html).not.toContain('modelo mais leve');
  });
});

suite('IA: cliente do Gemini', () => {
  const store = new Map();
  beforeEach(() => {
    store.clear();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  });
  const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const ok = obj => json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: 'STOP' }] });

  it('envia chave no cabeçalho, schema JSON e lê a resposta', async () => {
    let req;
    const fetchImpl = (url, init) => { req = { url, init }; return ok({ nota: 8 }); };
    const r = await generateJSON({ system: 's', prompt: 'p', schema: { type: 'OBJECT' }, key: 'K', model: 'm1', fetchImpl });
    expect(r).toEqual({ data: { nota: 8 }, model: 'm1', fallback: false });
    expect(req.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent');
    expect(req.init.headers['x-goog-api-key']).toBe('K');
    const body = JSON.parse(req.init.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.systemInstruction.parts[0].text).toBe('s');
  });
  it('mensagens de erro', () => {
    expect(errorMessage(400, { error: { message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } }).code).toBe('key');
    expect(errorMessage(429, {}).code).toBe('quota');
    expect(errorMessage(503, {}).code).toBe('server');
  });
  it('modelo inexistente: escolhe outro Flash disponível e guarda', async () => {
    const calls = [];
    const fetchImpl = (url) => {
      calls.push(url);
      if (url.includes('/models?')) return json(200, { models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
      ] });
      if (url.includes('/old:')) return json(404, { error: { message: 'not found' } });
      return ok({ ok: true });
    };
    const r = await generateJSON({ system: 's', prompt: 'p', schema: {}, key: 'K', model: 'old', fetchImpl });
    expect(r.model).toBe('gemini-3-flash');
    expect(getModel()).toBe('gemini-3-flash');
    expect(calls.length).toBe(3);
    expect(await pickModel('K', fetchImpl)).toBe('gemini-3-flash');
  });
  it('sobrecarga (503): tenta de novo e depois outro modelo, sem guardar a troca', async () => {
    const calls = [];
    const fetchImpl = (url) => {
      calls.push(url.replace('https://generativelanguage.googleapis.com/v1beta/', ''));
      if (url.includes('/models?')) return json(200, { models: [
        { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      ] });
      if (url.includes('/gemini-flash-latest:')) return json(503, { error: { code: 503, message: 'The model is overloaded.' } });
      return ok({ ok: true });
    };
    const r = await generateJSON({ system: 's', prompt: 'p', schema: {}, key: 'K', model: 'gemini-flash-latest', fetchImpl, sleep: () => Promise.resolve() });
    expect(r.model).toBe('gemini-2.5-flash');
    expect(r.fallback).toBe('overload'); // a tela avisa quando a resposta veio de um modelo lite por sobrecarga
    expect(calls).toEqual(['models/gemini-flash-latest:generateContent', 'models/gemini-flash-latest:generateContent', 'models?pageSize=200', 'models/gemini-2.5-flash:generateContent']);
    expect(getModel()).toBe('gemini-flash-latest');
  });
  it('ordem dos modelos: estáveis, depois lite, depois preview', async () => {
    const names = ['gemini-3-flash-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-image', 'gemini-3-flash-lite-preview', 'gemini-2.0-flash'];
    const fetchImpl = () => json(200, { models: names.map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
    expect(await listFlashModels('K', fetchImpl)).toEqual(['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3-flash-lite-preview']);
  });
  it('sobrecarga em todos os modelos: avisa quais foram tentados', async () => {
    const fetchImpl = (url) => url.includes('/models?')
      ? json(200, { models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) })
      : json(503, { error: { code: 503, message: 'This model is currently experiencing high demand.' } });
    await expect(generateJSON({ system: '', prompt: '', schema: {}, key: 'K', model: 'gemini-flash-latest', fetchImpl, sleep: () => Promise.resolve() }))
      .rejects.toMatchObject({ code: 'server', message: expect.stringContaining('Modelos tentados: gemini-flash-latest, gemini-2.5-flash, gemini-2.5-flash-lite.') });
  });
  it('sobrecarga em todos: mensagem com o detalhe do Google', async () => {
    const fetchImpl = (url) => url.includes('/models?')
      ? json(200, { models: [] })
      : json(503, { error: { code: 503, message: 'The model is overloaded.' } });
    await expect(generateJSON({ system: '', prompt: '', schema: {}, key: 'K', model: 'm', fetchImpl, sleep: () => Promise.resolve() }))
      .rejects.toMatchObject({ code: 'server', message: expect.stringContaining('503: The model is overloaded.') });
  });
  // Erro 429 como o Google manda: QuotaFailure com o quotaId da cota que acabou
  const quota429 = (id, model) => json(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: `Quota exceeded for metric: generate_content_free_tier_requests, model: ${model}`,
    details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: id, quotaDimensions: { model } }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '25s' }] } });
  const flashList = () => json(200, { models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.9-flash-lite-preview'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
  it('cota do dia esgotada: vai sozinho para um modelo Lite e os próximos pedidos já começam nele', async () => {
    resetQuota();
    const calls = [];
    const fetchImpl = (url) => {
      calls.push(url.replace('https://generativelanguage.googleapis.com/v1beta/', ''));
      if (url.includes('/models?')) return flashList();
      if (url.includes('/gemini-3.8-flash:')) return quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'gemini-3.8-flash');
      return ok({ ok: true });
    };
    const r = await generateJSON({ system: 's', prompt: 'p', schema: {}, key: 'K', model: 'gemini-3.8-flash', fetchImpl });
    expect(r).toMatchObject({ model: 'gemini-3.5-flash-lite', fallback: 'quota' });
    expect(calls).toEqual(['models/gemini-3.8-flash:generateContent', 'models?pageSize=200', 'models/gemini-3.5-flash-lite:generateContent']);
    expect(getModel()).not.toBe('gemini-3.5-flash-lite'); // a escolha do usuário não muda
    // Segunda etapa da montagem: não gasta outro pedido no modelo sem cota
    calls.length = 0;
    const r2 = await generateJSON({ system: 's', prompt: 'p', schema: {}, key: 'K', model: 'gemini-3.8-flash', fetchImpl });
    expect(r2).toMatchObject({ model: 'gemini-3.5-flash-lite', fallback: 'quota' });
    expect(calls).toEqual(['models?pageSize=200', 'models/gemini-3.5-flash-lite:generateContent']);
    resetQuota();
  });
  it('cota por minuto: não troca de modelo, pede para esperar um minuto', async () => {
    resetQuota();
    const calls = [];
    const fetchImpl = (url) => { calls.push(url); return url.includes('/models?') ? flashList() : quota429('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', 'gemini-3.8-flash'); };
    await expect(generateJSON({ system: '', prompt: '', schema: {}, key: 'K', model: 'gemini-3.8-flash', fetchImpl }))
      .rejects.toMatchObject({ code: 'quota', message: expect.stringContaining('Espere um minuto') });
    expect(calls.length).toBe(1);
    expect(quotaKind({ error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } })).toBe('minute');
    expect(quotaKind({})).toBe(null);
  });
  it('cota do dia esgotada também nos Lite: diz que volta no dia seguinte', async () => {
    resetQuota();
    const fetchImpl = (url) => (url.includes('/models?') ? flashList() : quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'x'));
    await expect(generateJSON({ system: '', prompt: '', schema: {}, key: 'K', model: 'gemini-3.8-flash', fetchImpl }))
      .rejects.toMatchObject({ code: 'quota', message: expect.stringContaining('volta no dia seguinte') });
    resetQuota();
  });
  it('sem chave ou sem conexão', async () => {
    await expect(generateJSON({ system: '', prompt: '', schema: {}, key: '' })).rejects.toMatchObject({ code: 'key' });
    const fetchImpl = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(generateJSON({ system: '', prompt: '', schema: {}, key: 'K', model: 'm', fetchImpl })).rejects.toMatchObject({ code: 'network' });
    setModel('models/x'); expect(getModel()).toBe('x');
  });
});

suite('IA: Groq e formato da resposta em texto', () => {
  const store = new Map();
  beforeEach(() => {
    store.clear();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  });
  const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const models = ids => json(200, { data: ids.map(id => ({ id, active: true, context_window: 131072 })) });
  const answer = obj => json(200, { choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: 'stop' }] });

  it('schemaHint: exemplo do objeto e observações dos campos', () => {
    const h = schemaHint(BUILD_SCHEMA);
    expect(h).toContain('"membros":[{"ref":"...","papel":"...","motivo":"..."}]');
    expect(h).toContain('- membros: Exatamente 6 Pokémon diferentes');
    expect(schemaHint(ANALYSIS_SCHEMA)).toContain('"nota":0');
  });
  it('escolhe o melhor modelo da chave, guarda e manda Bearer + modo JSON', async () => {
    let req;
    const fetchImpl = (url, init) => {
      if (url.endsWith('/models')) return models(['whisper-large-v3', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'meta-llama/llama-guard-4-12b']);
      req = { url, init };
      return answer({ nota: 7 });
    };
    const r = await groq.generateJSON({ system: 'S', prompt: 'P', schema: ANALYSIS_SCHEMA, key: 'gsk_x', model: '', fetchImpl });
    expect(r).toEqual({ data: { nota: 7 }, model: 'openai/gpt-oss-120b', fallback: false });
    expect(groq.getModel()).toBe('openai/gpt-oss-120b');
    expect(req.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(req.init.headers.authorization).toBe('Bearer gsk_x');
    const body = JSON.parse(req.init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.reasoning_effort).toBe('low');
    expect(body.messages[0].content).toMatch(/^S\n\nResponda APENAS com um objeto JSON/);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'P' });
  });
  it('modelo desativado: troca pelo próximo da lista', async () => {
    const fetchImpl = (url, init) => {
      if (url.endsWith('/models')) return models(['llama-3.3-70b-versatile', 'qwen/qwen3-32b']);
      const m = JSON.parse(init.body).model;
      if (m === 'velho') return json(400, { error: { code: 'model_decommissioned', message: 'decommissioned' } });
      return answer({ ok: m });
    };
    const r = await groq.generateJSON({ system: '', prompt: '', schema: {}, key: 'K', model: 'velho', fetchImpl });
    expect(r).toEqual({ data: { ok: 'llama-3.3-70b-versatile' }, model: 'llama-3.3-70b-versatile', fallback: false });
  });
  it('erros do Groq', () => {
    expect(groq.errorMessage(401, { error: { code: 'invalid_api_key' } }).code).toBe('key');
    expect(groq.errorMessage(429, { error: { message: 'Rate limit reached' } }).code).toBe('quota');
    expect(groq.errorMessage(413, { error: { message: 'Request too large for model' } }).message).toContain('grande demais');
    expect(groq.errorMessage(503, { error: { message: 'over capacity' } }).message).toContain('503: over capacity');
  });
  it('resposta com cercas de código ainda é lida', async () => {
    const fetchImpl = () => json(200, { choices: [{ message: { content: '```json\n{"a":1}\n```' } }] });
    expect((await groq.generateJSON({ system: '', prompt: '', schema: {}, key: 'K', model: 'm', fetchImpl })).data).toEqual({ a: 1 });
  });
  it('serviço escolhido fica guardado; desconhecido volta ao Gemini', () => {
    expect(providerId()).toBe('gemini');
    setProviderId('groq'); expect(provider().id).toBe('groq');
    setProviderId('xyz'); expect(providerId()).toBe('gemini');
  });
  it('Groq manda menos Pokémon do PC (limite de tokens por minuto)', () => {
    const many = Array.from({ length: 100 }, (_, i) => mon({ sp: 'Mon' + i, id: i + 1, box: 1 + Math.floor(i / 30), slot: 1 + (i % 30), types: ['normal'], base: [50, 50, 50, 50, 50, 50] }));
    expect(buildPrompt(many, T, '', groq.maxCandidates)).toContain(`DISPONÍVEIS (${groq.maxCandidates}):`);
  });
});

suite('IA: reservas do Gemini', () => {
  it('melhor de cada grupo primeiro (estável, lite, preview)', () => {
    expect(fallbackOrder(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.8-flash-lite', 'gemini-3.9-flash-preview']))
      .toEqual(['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.9-flash-preview', 'gemini-3.7-flash']);
  });
});

suite('IA: transparência antes de enviar', () => {
  it('prepara o pedido sem enviar e conta o que vai junto', async () => {
    const { prepareAi, confirmHtml } = await import('../src/ai/index.js');
    const prep = prepareAi('build', { all, T, game: { id: 'quetzal', name: 'Pokémon Quetzal' }, note: 'quero o Lucario' });
    expect(prep.counts).toEqual({ party: 2, pc: 2, pcTotal: 4, learn: false, hints: false, learn2: false, free: false });
    expect(prep.prompt).toContain('Pedido do jogador: quero o Lucario');
    const html = confirmHtml(prep);
    expect(html).toContain('2 Pokémon da equipe e 2 do PC (de 4: um por espécie;');
    expect(html).toContain('Não vai');
    expect(html).toContain('Seu pedido: “quero o Lucario”');
    expect(html).toContain('data-send');
    // o texto exato aparece escapado, com as instruções e as linhas dos Pokémon
    expect(html).toContain('E1 | Lucario | Fighting/Steel');
  });
  it('o pedido não leva nível, EVs nem dados do treinador', async () => {
    const { prepareAi } = await import('../src/ai/index.js');
    const withTrainer = all.map(m => ({ ...m, level: 77, evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ot: { name: 'SEGREDO', tid: 4242, sid: 9999 } }));
    const { system, prompt } = prepareAi('analyze', { all: withTrainer, T });
    const text = system + prompt;
    expect(text).not.toMatch(/SEGREDO|4242|9999|252|EVs[: ]+\d|Nv\.? 77/); // "EVs" só aparece como sugestão de ajuste
  });
});

suite('IA: o app conserta a equipe montada', () => {
  const F = (sp, slot, types, base, extra = {}) => mon({ sp, id: slot, box: 1, slot, types, base, ...extra });
  // A equipe "de sol" da IA: 5 de fogo (5 fracos a Water, 4 a Ground e Rock) + Corviknight
  const fire = [
    F('Torkoal', 1, ['fire'], [70, 85, 140, 85, 70, 20], { ab: 'White Smoke' }),
    F('Charizard', 2, ['fire', 'flying'], [78, 84, 78, 109, 85, 100], { item: 'Charizardite Y' }),
    F('Arcanine', 3, ['fire', 'rock'], [95, 115, 80, 95, 80, 90]),
    F('Armarouge', 4, ['fire', 'psychic'], [85, 60, 100, 125, 80, 75]),
    F('Blaziken', 5, ['fire', 'fighting'], [80, 120, 70, 110, 70, 80], { item: 'Blazikenite' }),
    F('Corviknight', 6, ['flying', 'steel'], [98, 87, 105, 53, 85, 67]),
  ];
  const pool = [
    ...fire,
    F('Swampert', 7, ['water', 'ground'], [100, 110, 90, 85, 90, 60]),
    F('Ludicolo', 8, ['water', 'grass'], [80, 70, 70, 90, 100, 70]),
    F('Garchomp', 9, ['dragon', 'ground'], [108, 130, 95, 80, 85, 102]),
    F('Venusaur', 10, ['grass', 'poison'], [80, 82, 83, 100, 100, 80], { item: 'Venusaurite' }),
    F('Rattata', 11, ['normal'], [30, 56, 35, 25, 35, 72]),
  ];

  it('troca até 2 membros para nenhum tipo acertar 3+, sem tirar quem foi pedido e sem 2ª megapedra nova', () => {
    const fix = repairTeam(fire, pool, T);
    expect(fix.swaps.length).toBeLessThanOrEqual(2);
    expect(buildIssues(fix.team, T).filter(x => !x.includes('megapedra')).length).toBeLessThan(buildIssues(fire, T).filter(x => !x.includes('megapedra')).length);
    expect(fix.team.map(m => m.species.name)).not.toContain('Venusaur'); // já há megapedras na equipe
    expect(fix.counts.find(c => c.type === 'water')).toMatchObject({ before: 5 });
    expect(fix.counts.find(c => c.type === 'water').after).toBeLessThan(5);
    // Quem o jogador citou no pedido fica
    const keep = repairTeam(fire, pool, T, { note: 'quero usar o Torkoal e o Charizard' });
    expect(keep.swaps.map(s => s.out.species.name)).not.toEqual(expect.arrayContaining(['Torkoal']));
    expect(keep.swaps.map(s => s.out.species.name)).not.toEqual(expect.arrayContaining(['Charizard']));
  });

  it('sem critério furado, nada muda; quem sustenta o clima da equipe não sai', () => {
    expect(repairTeam(pool.slice(6, 9), pool, T)).toBe(null);
    const rain = [
      F('Pelipper', 12, ['water', 'flying'], [60, 50, 100, 95, 70, 65], { ab: 'Drizzle' }),
      F('Kingdra', 13, ['water', 'dragon'], [75, 95, 95, 95, 95, 85], { ab: 'Swift Swim' }),
      F('Lanturn', 14, ['water', 'electric'], [125, 58, 58, 76, 76, 67]),
      F('Gyarados', 15, ['water', 'flying'], [95, 125, 79, 60, 100, 81]),
    ];
    const fix = repairTeam(rain, [...rain, ...pool], T); // Grass acerta Pelipper? não; Electric acerta Pelipper, Kingdra? não: Pelipper e Gyarados
    if (fix) expect(fix.swaps.map(s => s.out.species.name)).not.toEqual(expect.arrayContaining(['Pelipper', 'Kingdra']));
  });

  it('montagem: a tela mostra a troca do app e a segunda etapa escreve para a equipe final', async () => {
    const { sendAi } = await import('../src/ai/index.js');
    const sent = [];
    const firstAnswer = { nome: 'Sol', resumo: 'sol', pontos_fortes: ['a'], pontos_fracos: ['b'], dicas: [], membros: fire.map(m => ({ ref: refOf(m), papel: 'x', motivo: 'y' })) };
    const P = { service: 'Gemini', maxCandidates: 250, generateJSON: async ({ prompt }) => {
      sent.push(prompt);
      return sent.length === 1 ? { data: firstAnswer, model: 'm', fallback: false }
        : { data: { resumo: 'Resumo novo.', pontos_fortes: ['f'], pontos_fracos: ['w'], dicas: ['d'] }, model: 'm', fallback: false };
    } };
    const res = await sendAi({ kind: 'build', P, system: 's', prompt: 'p', schema: {}, all: pool, T, dex: null, game: null, note: '', counts: {} });
    expect(res.html).toContain('Ajuste do app:');
    expect(res.html).toMatch(/Membros fracos a cada tipo: [^<]*Water 5 → [0-4]/);
    expect(res.html).toContain('troca do app');
    expect(res.html).toContain('Resumo novo.');
    expect(sent[1]).toContain('O app trocou membros da escolha anterior');
    expect(res.team.length).toBe(6);
    expect(res.team).not.toEqual(fire);
  });
});

suite('IA: modo livre (habilidade trocável por item)', () => {
  const tork = mon({ sp: 'Torkoal', id: 324, box: 1, slot: 1, types: ['fire'], base: [70, 85, 140, 85, 70, 20], ab: 'White Smoke' });
  tork.species.abilities = ['White Smoke', 'Drought', 'Shell Armor'];
  const venu = mon({ sp: 'Venusaur', id: 3, box: 1, slot: 2, types: ['grass', 'poison'], base: [80, 82, 83, 100, 100, 80], ab: 'Overgrow' });
  venu.species.abilities = ['Overgrow', null, 'Chlorophyll'];
  const pool = [all[0], all[1], tork, venu];

  it('lista as habilidades trocáveis com o item, conforme o jogo', () => {
    expect(abilityAlts(tork, 'patch')).toEqual([{ name: 'Drought', item: 'Ability Capsule' }, { name: 'Shell Armor', item: 'Ability Patch' }]);
    expect(abilityAlts(venu, 'capsule')).toEqual([]); // sem 2ª habilidade; a oculta só com Ability Patch
    expect(abilityAlts(tork, null)).toEqual([]);
    expect(monLine(tork, 'patch')).toContain('Hab: White Smoke; troca possível: Drought [Ability Capsule], Shell Armor [Ability Patch]');
    expect(monLine(tork)).not.toContain('troca possível');
    expect(freeAbilityMode({ id: 'quetzal' })).toBe('patch');
    expect(freeAbilityMode({ id: 'unbound' })).toBe('capsule');
    expect(freeAbilityMode({ id: 'emerald', gen: 3 })).toBe(null);
  });

  it('pistas de estratégia e pedido contam com as habilidades trocáveis só no modo livre', () => {
    expect(strategyLines(pool, null, T).join('\n')).not.toMatch(/sol/);
    const lines = strategyLines(pool, 'patch', T).join('\n');
    expect(lines).toContain('- sol: põem C1-1 (Drought, com Ability Capsule); aproveitam (1): C1-2 (Chlorophyll, com Ability Patch); o clima corta a fraqueza a Water de C1-1.');
    const b = buildPrompt(pool, T, '', 250, { free: 'patch' });
    expect(b).toContain('MODO LIVRE');
    expect(b).not.toContain('Nenhum disponível põe clima');
    expect(buildPrompt(pool, T)).not.toContain('MODO LIVRE');
    expect(analysisPrompt(pool, T, '', 250, { free: 'patch' })).toContain('troca possível: Drought');
    expect(systemPrompt({ id: 'quetzal' })).toContain('HP/Atk/Def/SpA/SpD/Spe');
  });

  it('o modo livre só liga nos jogos que têm o item, e o pedido avisa na confirmação', async () => {
    const { prepareAi, confirmHtml } = await import('../src/ai/index.js');
    const on = prepareAi('build', { all: pool, T, game: { id: 'quetzal', name: 'Pokémon Quetzal' }, free: true });
    expect(on.counts.free).toBe(true);
    expect(on.prompt).toContain('troca possível');
    expect(confirmHtml(on)).toContain('Modo livre: as outras habilidades');
    const off = prepareAi('build', { all: pool, T, game: { id: 'emerald', gen: 3, name: 'Emerald' }, free: true });
    expect(off.counts.free).toBe(false);
    expect(off.prompt).not.toContain('troca possível');
  });
});

suite('IA: plano, papéis e sinergia (strategy.js)', () => {
  const S = (sp, slot, types, base, o = {}) => mon({ sp, id: slot, box: 1, slot, types, base, ...o });
  const tork = S('Torkoal', 1, ['fire'], [70, 85, 140, 85, 70, 20], { ab: 'Drought', moves: [['Stealth Rock', 'rock', 2, 0], ['Lava Plume', 'fire', 1, 80], ['Rapid Spin', 'normal', 0, 50]] });
  const zard = S('Charizard', 2, ['fire', 'flying'], [78, 84, 78, 109, 85, 100], { ab: 'Blaze', item: 'Charizardite Y', moves: [['Solar Beam', 'grass', 1, 120], ['Fire Blast', 'fire', 1, 110]] });
  const venu = S('Venusaur', 3, ['grass', 'poison'], [80, 82, 83, 100, 100, 80], { ab: 'Chlorophyll', moves: [['Growth', 'normal', 2, 0], ['Weather Ball', 'normal', 1, 50], ['Synthesis', 'grass', 2, 0]] });
  const corv = S('Corviknight', 4, ['flying', 'steel'], [98, 87, 105, 53, 85, 67], { ab: 'Pressure', moves: [['U-turn', 'bug', 0, 70], ['Roost', 'flying', 2, 0]] });
  const swam = S('Swampert', 5, ['water', 'ground'], [100, 110, 90, 85, 90, 60], { ab: 'Torrent', moves: [['Liquidation', 'water', 0, 85], ['Earthquake', 'ground', 0, 100]] });
  const pel = S('Pelipper', 6, ['water', 'flying'], [60, 50, 100, 95, 70, 65], { ab: 'Drizzle', moves: [['Hurricane', 'flying', 1, 110], ['Tailwind', 'flying', 2, 0]] });

  it('papéis pelos golpes e stats, na linha de cada Pokémon', () => {
    expect(rolesOf(tork)).toEqual(expect.arrayContaining(['hazards', 'tira hazards', 'lento (Trick Room)', 'tanque']));
    expect(rolesOf(venu)).toEqual(expect.arrayContaining(['setup', 'recuperação']));
    expect(rolesOf(corv)).toEqual(expect.arrayContaining(['pivô', 'recuperação', 'tanque']));
    expect(rolesOf(pel)).toContain('controle de velocidade');
    expect(monLine(corv)).toContain('Papéis: pivô, recuperação, tanque');
  });

  it('megapedra que põe clima conta como quem põe; pistas com quem o clima protege', () => {
    expect([...strategyOf(zard).set]).toEqual(['sol']);
    const lines = strategyLines([tork, zard, venu, corv, swam], null, T).join('\n');
    expect(lines).toMatch(/- sol: põem C1-1 \(Drought\), C1-2 \(Charizardite Y\); aproveitam \(2\): C1-2 \(Solar Beam\), C1-3 \(Chlorophyll\)/);
    expect(lines).toContain('o clima corta a fraqueza a Water de C1-1, C1-2');
  });

  it('alertas: fraqueza que o clima fortalece, golpe que ele enfraquece, climas diferentes', () => {
    const w = synergyWarnings([tork, zard, venu, corv, swam], T, refOf).join(' | ');
    expect(w).toContain('com sol, Fire fica mais forte, e é fraqueza de C1-3, C1-4');
    expect(w).toContain('com sol, golpes Water perdem metade da força: C1-5');
    expect(w).not.toContain('mas só');
    expect(synergyWarnings([tork, pel, venu], T, refOf).join(' | ')).toMatch(/climas diferentes na mesma equipe \(sol, chuva\)/);
    expect(teamFacts([tork, zard, venu, corv], T)).toContain('Alertas de sinergia: com sol, Fire fica mais forte');
  });

  it('pedido: planos de referência, função de cada membro e Tera no Quetzal', () => {
    const b = buildPrompt([tork, zard, venu, corv, swam, pel], T);
    expect(b).toContain('Escolha UM plano');
    expect(b).toContain('Cada membro precisa de uma função no plano');
    expect(systemPrompt({ id: 'quetzal' })).toContain('Terastalização');
    expect(systemPrompt({ id: 'unbound' })).not.toContain('Terastalização');
  });
});

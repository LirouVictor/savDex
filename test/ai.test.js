import { describe as suite, it, expect, beforeEach } from 'vitest';
import { refOf, monLine, candidates, checkAnalysis, checkBuild, analysisPrompt, buildPrompt, schemaHint, ANALYSIS_SCHEMA, BUILD_SCHEMA, teamFacts, analysisPool, learnLines, systemPrompt, ANALYSIS_PC, buildPool, strategyLines } from '../src/ai/prompt.js';
import dex from '../src/data/dex.json';
import * as groq from '../src/ai/groq.js';
import { provider, providerId, setProviderId } from '../src/ai/providers.js';
import { generateJSON, errorMessage, pickModel, listFlashModels, fallbackOrder, setModel, getModel } from '../src/ai/gemini.js';
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
    expect(b).toContain('Nas dicas, só ajustes concretos');
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
    expect(f).toContain('Clima/terreno: E1 Drizzle (chuva).');
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
    const lines = strategyLines(pool);
    expect(lines[1]).toMatch(/^Pistas de estratégia/);
    expect(lines).toContain('- chuva: põem E1 (Drizzle), C1-3 (Rain Dance); aproveitam C1-1 (Swift Swim).');
    expect(lines).toContain('- Trick Room: C1-3.');
    expect(lines.join('\n')).not.toMatch(/sol|Chlorophyll/);
    expect(strategyLines(party.slice(1))).toEqual([]);
    expect(buildPrompt(pool, T)).toContain('aproveitam C1-1 (Swift Swim)');
  });
  it('regras: cálculos do app como fonte de verdade, limitação em vez de suposição, golpes só da lista', () => {
    const s = systemPrompt({ id: 'quetzal' });
    expect(s).toContain('fonte de verdade');
    expect(s).toContain('diga que é uma limitação');
    expect(s).toContain('"Aprende por nível"');
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
    expect(r).toEqual({ data: { nota: 8 }, model: 'm1' });
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
    expect(r).toEqual({ data: { nota: 7 }, model: 'openai/gpt-oss-120b' });
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
    expect(r).toEqual({ data: { ok: 'llama-3.3-70b-versatile' }, model: 'llama-3.3-70b-versatile' });
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
    expect(prep.counts).toEqual({ party: 2, pc: 2, pcTotal: 4, learn: false, hints: false });
    expect(prep.prompt).toContain('Pedido do jogador: quero o Lucario');
    const html = confirmHtml(prep);
    expect(html).toContain('2 Pokémon da equipe e 2 do PC (de 4: os de maior total de stats base, um por espécie)');
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

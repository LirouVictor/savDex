import { describe as suite, it, expect, beforeAll, afterAll } from 'vitest';
import EN from '../src/i18n/en.js';
import { t, setLang, missing } from '../src/i18n.js';
import { codeKeys, htmlKeys, keysInCode } from './helpers/i18n-keys.js';
import { loadSave } from '../src/parser/load.js';
import { buildDemoSave } from '../src/demo/demo.js';
import { makeSave } from './helpers/make-save.js';
import { makeGen3Save } from './helpers/make-gen3.js';
import * as R from '../src/ui/render.js';
import { evolutionHtml, learnsetHtml } from '../src/ui/dex.js';
import { toCSV, toShowdown } from '../src/export.js';
import { PROVIDERS } from '../src/ai/providers.js';
import { prepareAi, confirmHtml } from '../src/ai/index.js';
import { analysisView, buildView } from '../src/ai/view.js';
import { refOf } from '../src/ai/prompt.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';
import dex from '../src/data/dex.json';
import overrides from '../src/data/quetzal-overrides.json';
import U from '../src/data/unbound.json';
import { makeUnboundSave } from './helpers/make-unbound.js';
import N from '../src/data/nds.json';
import { makeHgssSave, makeGen4Save, makeBwSave } from './helpers/make-nds.js';
import { diffSaves } from '../src/history/diff.js';
import { changesWin, historyStartWin, historyList } from '../src/history/view.js';
import { teamsWin, newTeam, locateTeam } from '../src/teams/view.js';

const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

suite('tradução para o inglês', () => {
  it('extrai as chaves de t(...), inclusive os dois lados de um ternário', () => {
    expect(keysInCode("t('a'); x.t('não'); t(ok ? 'b' : 'c', { n: f('d') }); t(`e`); t(`f${x}`)")).toEqual(['a', 'b', 'c', 'e']);
  });

  it('todo texto usado no código e no index.html tem tradução', () => {
    const keys = [...codeKeys(), ...htmlKeys()];
    expect(keys.length).toBeGreaterThan(250);
    expect(keys.filter(k => !EN[k])).toEqual([]);
  });

  it('as evidências das espécies próprias do Quetzal têm tradução', () => {
    const ev = Object.values(overrides.species).map(s => s.evidence).filter(Boolean);
    expect(ev.filter(k => !EN[k])).toEqual([]);
  });

  it('tradução mantém os mesmos parâmetros {x} do original', () => {
    const bad = Object.entries(EN).filter(([pt, en]) => placeholders(pt).join() !== placeholders(en).join());
    expect(bad).toEqual([]);
  });

  it('sem tradução, fica o português', () => {
    expect(t('texto sem tradução {n}', { n: 2 })).toBe('texto sem tradução 2');
  });
});

suite('telas em inglês (nenhum texto sem tradução)', () => {
  beforeAll(() => { setLang('en', EN); missing.clear(); });
  afterAll(() => setLang('pt'));

  /** Desenha tudo o que o app mostra para um save, inclusive o detalhe de cada Pokémon. */
  function renderAll(data, T2) {
    const all = [...data.party, ...data.pc.boxes.flatMap(b => b.slots)];
    let html = R.trainerWin(data, 'x.sav') + R.warningsWin(data.warnings) + R.partyWin(data, { canSave: true }) + R.pcWin(data)
      + R.analysisWin(data, T2) + R.aiWin(data, Object.values(PROVIDERS)) + R.searchWin(data, T2) + R.exportWin();
    for (const box of data.pc.boxes) html += R.boxGrid(box);
    all.forEach((m, i) => {
      html += R.monDetail(m, T2) + R.resultRow(m, i) + R.monTile(m);
      html += evolutionHtml(m, dex, T2) + learnsetHtml(m, dex, T2);
    });
    html += toCSV(data) + toShowdown(data);
    // Histórico: compara com uma versão sem o primeiro Pokémon e com outro nível, para passar por todas as listas
    const fewer = { ...data, party: data.party.slice(1) };
    html += changesWin(diffSaves(data, data), { savedAt: 0 }, 2).html + changesWin(diffSaves(fewer, data), { savedAt: 0 }, 2).html
      + changesWin(diffSaves(data, fewer), { savedAt: 0 }, 2).html + historyStartWin()
      + historyList([{ id: 1, signature: 'a', savedAt: 0, name: 'x', total: 1, saveIndex: 1 }, { id: 2, signature: 'b', savedAt: 0, name: 'x', total: 1, saveIndex: 1 }], 'a', 2);
    // Equipes salvas: uma da equipe e uma "da IA" com um Pokémon que não está mais no save
    const teams = [newTeam(all.slice(0, 6), { saveKey: 'k', name: 'a', source: 'party' }), newTeam(all.slice(0, 2), { saveKey: 'k', name: 'b', source: 'ai' })]
      .map((tm, id) => ({ ...tm, id }));
    const located = teams.map(tm => locateTeam(tm, data));
    if (located[1][0]) located[1][0] = { ...located[1][0], now: null };
    html += teamsWin(teams, located, T2, 0);
    return { html, all };
  }

  it('save de exemplo do Quetzal, IA (os dois serviços) e exportações', () => {
    const { data, T: T2 } = loadSave(buildDemoSave(T), T, G);
    const { html, all } = renderAll(data, T2);
    expect(html).toContain('Party');
    expect(html).toContain('Lv. 62');
    expect(toCSV(data).split('\r\n')[0]).toContain('Species');
    expect(toShowdown(data)).toMatch(/^=== Party ===/);
    const byRef = new Map(all.map(m => [refOf(m), m]));
    for (const id of Object.keys(PROVIDERS)) {
      for (const kind of ['analyze', 'build']) {
        const prep = prepareAi(kind, { all, T: T2, game: data.game, note: 'x' });
        prep.P = PROVIDERS[id];
        expect(confirmHtml(prep)).toContain('Not sent');
        expect(prep.system).toContain('Write in English');
        expect(JSON.stringify(prep.schema)).toContain(kind === 'analyze' ? 'Party score' : 'Exactly 6 different');
      }
    }
    analysisView({ nota: 7, resumo: 'E1', pontos_fortes: ['a'], pontos_fracos: ['b'], sinergias: ['c'],
      trocas: [{ sai: 'E1', entra: 'C1-1', motivo: 'm' }], dicas: [{ ref: 'E2', texto: 't' }], dropped: ['C9-9'] }, byRef, 'Gemini');
    buildView({ nome: 'X', resumo: 'r', membros: [{ ref: 'E1', papel: 'p', motivo: 'm' }], pontos_fortes: [], pontos_fracos: [], dicas: ['d'], dropped: [] }, byRef, 'Groq', T2);
    expect([...missing]).toEqual([]);
  });

  it('Gen 3 oficial (ovo, IA com o contexto da Gen 3) e espécie do Quetzal sem mapeamento', () => {
    const trainer = { name: 'MAY', tid: 1, sid: 2 };
    const otId = (2 << 16) | 1;
    const g3 = loadSave(makeGen3Save({ game: 'emerald', trainer,
      party: [{ pid: 7, otId, species: 285, exp: 1000, level: 10 }],
      pc: { 0: { pid: 0x20, otId, species: 25, exp: 1000 }, 1: { pid: 0x99, otId, species: 283, exp: 0, egg: true } } }), T, G);
    const { all } = renderAll(g3.data, g3.T);
    prepareAi('build', { all, T: g3.T, game: g3.data.game });
    const q = loadSave(makeSave({ trainer, pc: { 0: { species: 1999, nickname: 'MYST', exp: 100 }, 1: { species: 1998, exp: 100 } } }), T, G);
    const { html } = renderAll(q.data, q.T);
    expect(html).toContain('Quetzal-specific ID not mapped yet');
    // Unbound (tabelas próprias, contexto próprio na IA, aviso de versão nova)
    const u = loadSave(makeUnboundSave({ trainer, signature: 0x01122000, party: [{ pid: 1, otId, species: 376, level: 50, moves: [[282, 20]] }], pc: { 0: { pid: 2, otId, species: 528, exp: 9000, moves: [387] } } }), T, G, U);
    const ru = renderAll(u.data, u.T);
    expect(ru.html).toContain('newer than 2.1');
    expect(prepareAi('analyze', { all: ru.all, T: u.T, game: u.data.game }).system).toContain('CFRU engine');
    // Jogos de DS (Gen 4 e Gen 5)
    for (const bytes of [makeHgssSave({ trainer, party: [{ pid: 3, otId, species: 479, form: 1, level: 30 }] }),
      makeGen4Save({ game: 'pt', trainer, party: [{ pid: 4, otId, species: 487, form: 1, level: 50 }], pc: { 0: { pid: 5, otId, species: 25, exp: 100 } } }),
      makeBwSave({ trainer, version: 22, party: [{ pid: 3, otId, species: 25, level: 30 }], pc: { 0: { pid: 9, otId, species: 1, exp: 100 } } })]) {
      const nd = loadSave(bytes, T, G, null, N);
      const rn = renderAll(nd.data, nd.T);
      expect(prepareAi('build', { all: rn.all, T: nd.T, game: nd.data.game }).system).toMatch(/official Generation [45] game/);
    }
    expect([...missing]).toEqual([]);
  });
});

suite('privacidade, termos e novidades', async () => {
  const { page, NEWS } = await import('../src/pages/content.js');
  const { NEWS_LATEST } = await import('../src/pages/latest.js');

  it('as três janelas existem nos dois idiomas', () => {
    for (const id of ['privacidade', 'termos', 'novidades']) {
      for (const lang of ['pt', 'en']) {
        const p = page(id, lang);
        expect(p.title).toBeTruthy();
        expect(p.html.length).toBeGreaterThan(200);
      }
    }
    expect(page('x', 'pt')).toBeNull();
  });

  it('novidades: ordem da mais nova, mesmo número de itens nos dois idiomas, data mais nova em latest.js', () => {
    expect(NEWS[0].date).toBe(NEWS_LATEST);
    expect(NEWS.map(n => n.date)).toEqual([...NEWS.map(n => n.date)].sort().reverse());
    for (const n of NEWS) expect(n.pt.length).toBe(n.en.length);
  });
});

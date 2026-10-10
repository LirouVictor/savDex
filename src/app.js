// Carregado sob demanda quando o usuário abre um save (parser + tabelas + renderização).

import { loadSave, isQuetzal, isUnbound, isNds, isSoulGold } from './parser/index.js';
import BASE from './data/tables.js';
import G3 from './data/gen3.json';
import { toCSV, toShowdown, showdownTeam, toJSON, fileBase } from './export.js';
import { t, locale } from './i18n.js';
import { download, downloadBlob, copyText } from './ui/io.js';
import * as R from './ui/render.js';
import { searchMons } from './search.js';
import { PROVIDERS, provider, providerId, setProviderId } from './ai/providers.js';
import { saveKey, signature, diffSaves, orderSaves } from './history/diff.js';
import { changesWin, historyStartWin, historyList } from './history/view.js';
import { listHistory, addHistory, clearHistory, listTeams, addTeam, putTeam, deleteTeam } from './ui/store.js';

const PAGE = 15; // resultados da busca por página
let moveText = null; // descrições dos golpes, carregadas na primeira vez que um golpe é aberto

let state = null;

// Tabelas do jogo do save aberto (o Quetzal usa as do expansion; a Gen 3 oficial, as da época)
let T = BASE;

/**
 * @param {ArrayBuffer} buffer
 * @param {string} fileName
 * @param {{ history?: boolean }} [opts] history = guardar esta versão e mostrar o que mudou (não no exemplo)
 */
export async function openSave(buffer, fileName, opts = {}) {
  const loaded = loadSave(buffer, BASE, G3, ...(await extraTables(buffer)));
  const data = loaded.data;
  T = loaded.T;
  const firstFilled = data.pc.boxes.findIndex(b => b.slots.length);
  const all = [...data.party, ...data.pc.boxes.flatMap(b => b.slots)];
  // persist = save do usuário (não o de exemplo): guarda o histórico e permite salvar equipes
  state = { data, fileName, box: firstFilled >= 0 ? firstFilled : 0, all, results: [], page: 0, searched: false, persist: !!opts.history, key: saveKey(data) };
  render();
  if (opts.history) {
    setupHistory(buffer).catch(e => console.error(e));
    refreshTeams().catch(e => console.error(e));
  }
  return data;
}

/** Tabelas de jogos que só alguns saves usam, carregadas sob demanda: [Unbound, DS, Quetzal, SoulGold]. */
let unboundTables = null, ndsTables = null, quetzalTables = null, soulgoldTables = null;
async function extraTables(buffer) {
  if (isUnbound(buffer)) {
    if (!unboundTables) unboundTables = (await import('./data/unbound.json')).default;
    return [unboundTables, null, null];
  }
  if (isNds(buffer)) {
    if (!ndsTables) ndsTables = (await import('./data/nds.json')).default;
    return [null, ndsTables, null];
  }
  // Quetzal: itens, golpes, espécies > 898 e evoluções tirados da ROM do jogo
  if (isQuetzal(buffer)) {
    if (!quetzalTables) quetzalTables = (await import('./data/quetzal.json')).default;
    return [null, null, quetzalTables];
  }
  if (isSoulGold(buffer)) {
    if (!soulgoldTables) soulgoldTables = (await import('./data/soulgold.json')).default;
    return [null, null, null, soulgoldTables];
  }
  return [null, null, null];
}

/** Bytes do save de demonstração (montado na hora, num pacote carregado só quando pedido). */
export async function demoBytes() {
  const { buildDemoSave } = await import('./demo/demo.js');
  return buildDemoSave(BASE);
}

function render() {
  const { data, fileName } = state;
  const out = document.getElementById('out');
  // Quatro blocos (a barra de baixo leva a cada um; no computador, Equipe e PC ficam lado a lado)
  out.innerHTML = `
    <div class="grp" id="grp-summary">
      ${R.trainerWin(data, fileName)}
      ${R.warningsWin(data.warnings)}
      <div id="changes-slot"></div>
    </div>
    <div class="grp" id="grp-party">
      ${R.partyWin(data, { canSave: state.persist })}
      ${R.analysisWin(data, T)}
    </div>
    <div class="grp" id="grp-pc">
      ${R.pcWin(data)}
      ${R.searchWin(data, T)}
    </div>
    <div class="grp" id="grp-tools">
      ${R.builderWin(data)}
      ${R.aiWin(data, Object.values(PROVIDERS))}
      <div id="teams-slot"></div>
      ${R.exportWin()}
    </div>
    ${R.navBar()}`;
  out.classList.remove('hidden');
  renderBox();
  setupNav(out);

  out.querySelectorAll('[data-exp]').forEach(b => b.addEventListener('click', () => exportAs(b.dataset.exp)));
  out.querySelector('[data-copy="party"]').addEventListener('click', async () => {
    const ok = await copyText(toShowdown({ ...data, pc: { boxes: [] } }, { includePC: false }));
    status(t(ok ? 'Equipe copiada no formato Showdown.' : 'Não consegui copiar neste navegador. Use "Showdown (TXT)".'));
  });
  const dexBtn = out.querySelector('[data-dex]');
  if (dexBtn) dexBtn.addEventListener('click', () => openDex(dexBtn));
  const imgBtn = out.querySelector('[data-team-image]');
  if (imgBtn) imgBtn.addEventListener('click', () => openTeamImage(imgBtn));
  const saveBtn = out.querySelector('[data-save-team]');
  if (saveBtn) saveBtn.addEventListener('click', () => saveTeam(data.party, t('Equipe de {date}', { date: new Date().toLocaleDateString(locale()) }), 'party', saveBtn));
  setupTeams(out.querySelector('#teams-slot'));
  const partyGrid = out.querySelector('.party-grid');
  if (partyGrid) partyGrid.addEventListener('click', e => {
    const btn = e.target.closest('[data-party]');
    if (btn) openDetail(data.party[+btn.dataset.party], btn);
  });
  const sel = out.querySelector('#box-select');
  sel.addEventListener('change', () => { state.box = +sel.value; renderBox(); });
  out.querySelectorAll('[data-box-step]').forEach(b => b.addEventListener('click', () => {
    const n = data.pc.boxes.length;
    state.box = (state.box + Number(b.dataset.boxStep) + n) % n;
    renderBox();
  }));
  out.querySelector('#box-grid').addEventListener('click', e => {
    const btn = e.target.closest('.slot[data-slot]');
    if (!btn) return;
    const m = state.data.pc.boxes[state.box].slots.find(s => s.slot === +btn.dataset.slot);
    if (m) openDetail(m, btn);
  });

  // Análise: tocar num tipo ou número abre, logo abaixo da linha, quem é fraco/resiste/imune (um tipo por vez)
  const typetab = out.querySelector('.typetab');
  if (typetab) typetab.addEventListener('click', e => {
    const b = e.target.closest('[data-tt]');
    if (!b) return;
    const more = typetab.querySelector('#tt-' + b.dataset.tt);
    const open = more.hidden;
    typetab.querySelectorAll('.tt-more').forEach(r => { r.hidden = true; });
    typetab.querySelectorAll('[data-tt]').forEach(x => x.setAttribute('aria-expanded', 'false'));
    more.hidden = !open;
    if (open) typetab.querySelectorAll(`[data-tt="${b.dataset.tt}"]`).forEach(x => x.setAttribute('aria-expanded', 'true'));
  });

  setupAi(out);
  setupBuilder(out);

  // Busca
  let timer = 0;
  const run = () => { clearTimeout(timer); timer = setTimeout(runSearch, 150); };
  ['#q', '#f-type', '#f-sort'].forEach(sel => {
    const el = out.querySelector(sel);
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', run);
  });
  // Filtros: um ativo por vez; tocar de novo desliga
  out.querySelector('.flags').addEventListener('click', e => {
    const b = e.target.closest('.flag');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    out.querySelectorAll('.flag').forEach(x => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', String(on));
    state.flag = on ? b.dataset.flag : '';
    runSearch();
  });
  out.querySelector('#pager').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    state.page += Number(b.dataset.page);
    showResults();
    const count = document.getElementById('search-count');
    if (count.getBoundingClientRect().top < 0) count.scrollIntoView({ block: 'start' });
  });
  out.querySelector('#results').addEventListener('click', e => {
    const btn = e.target.closest('.result[data-i]');
    if (btn) openDetail(state.results[+btn.dataset.i], btn);
  });

  // Assistente e Busca ficam fechados até o usuário abrir; a lista só é montada quando a Busca abre
  for (const id of ['builder-win', 'ai-win', 'search-win']) {
    const det = out.querySelector('#' + id);
    det.addEventListener('toggle', () => {
      setFoldOpen(id, det.open);
      if (id === 'search-win' && det.open && !state.searched) runSearch();
    });
    if (foldOpen(id)) det.open = true;
  }
}

// Barra de navegação: rola até o bloco e marca o que está no meio da tela
let navObserver = null;
function setupNav(out) {
  const nav = out.querySelector('.nav');
  nav.addEventListener('click', e => {
    const b = e.target.closest('[data-go]');
    if (b) document.getElementById(b.dataset.go).scrollIntoView({ block: 'start' });
  });
  if (navObserver) navObserver.disconnect();
  if (!('IntersectionObserver' in window)) return;
  navObserver = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      nav.querySelectorAll('[data-go]').forEach(b => b.toggleAttribute('aria-current', b.dataset.go === e.target.id));
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  out.querySelectorAll('.grp').forEach(g => navObserver.observe(g));
}

// Janelas abertas/fechadas: preferência deste aparelho
function foldOpen(id) { try { return localStorage.getItem('open-' + id) === '1'; } catch { return false; } }
function setFoldOpen(id, on) { try { if (on) localStorage.setItem('open-' + id, '1'); else localStorage.removeItem('open-' + id); } catch { /* sem armazenamento */ } }

// Assistente (IA): a chave fica no aparelho; o código das análises só carrega ao tocar num botão.
function setupAi(out) {
  const $ = s => out.querySelector(s);
  const aiOut = $('#ai-out');
  // Mostra os textos e a tela (chave ou botões) do serviço escolhido
  const sync = () => {
    const P = provider();
    $('#ai-provider').value = P.id;
    $('#ai-svc').textContent = `${t('IA')} · ${P.service}`;
    const link = $('#ai-key-link');
    link.href = P.keyUrl;
    link.textContent = P.keyUrl.replace(/^https:\/\//, '');
    $('#ai-key-steps').innerHTML = t(P.keySteps);
    $('#ai-key').placeholder = t(P.keyPlaceholder);
    $('#ai-privacy').textContent = t('A IA recebe só a lista dos seus Pokémon (espécie, tipos, golpes, habilidade, item, natureza e IVs), nunca o arquivo .sav. Antes de enviar ao {service}, o app mostra exatamente o que vai. O resto do savDex funciona sem IA e sem chave.', { service: P.service });
    $('#ai-model').value = P.getModel();
    $('#ai-models').innerHTML = '';
    $('#ai-models-out').textContent = '';
    const hasKey = !!P.getKey();
    $('#ai-setup').classList.toggle('hidden', hasKey);
    $('#ai-main').classList.toggle('hidden', !hasKey);
  };
  sync();
  $('#ai-provider').addEventListener('change', e => { setProviderId(e.target.value); aiOut.innerHTML = ''; sync(); });
  $('#ai-save').addEventListener('click', () => {
    const v = $('#ai-key').value.trim();
    if (!v) { aiOut.innerHTML = `<p class="error">${t('Cole a chave antes de salvar.')}</p>`; return; }
    provider().setKey(v);
    $('#ai-key').value = '';
    aiOut.innerHTML = '';
    sync();
  });
  $('#ai-forget').addEventListener('click', () => {
    provider().setKey('');
    aiOut.innerHTML = '';
    sync();
  });
  $('#ai-model-save').addEventListener('click', () => {
    const P = provider();
    P.setModel($('#ai-model').value);
    $('#ai-model').value = P.getModel();
    $('#ai-models-out').textContent = P.getModel() ? t('Modelo salvo: {model}.', { model: P.getModel() }) : t('Modelo automático.');
  });
  $('#ai-list').addEventListener('click', async () => {
    const P = provider();
    const info = $('#ai-models-out');
    info.textContent = t('Buscando…');
    try {
      const names = await P.listModels(P.getKey());
      $('#ai-models').innerHTML = names.map(n => `<option value="${R.esc(n)}"></option>`).join('');
      info.textContent = names.length
        ? t('Disponíveis (do mais indicado ao menos): {list}. Toque no campo Modelo para escolher.', { list: names.join(', ') })
        : t('Nenhum modelo disponível para esta chave.');
    } catch (e) {
      info.textContent = e && e.name === 'AiError' ? e.message : t('Não consegui buscar os modelos.');
    }
  });
  const buttons = out.querySelectorAll('[data-ai]');
  buttons.forEach(b => b.addEventListener('click', async () => {
    const disabled = [...buttons].map(x => x.disabled);
    buttons.forEach(x => { x.disabled = true; });
    $('#ai-provider').disabled = true;
    try {
      const ai = await import('./ai/index.js');
      // Quetzal/Unbound: golpes por nível (dex.json, o mesmo do detalhe). Na análise vão no pedido; nas duas,
      // o app confere com eles os golpes que a IA citar
      const game = state.data.game;
      const dex = game && ROM_LEARN.includes(game.id) ? (await loadDex()).dex : null;
      // Monta o pedido e mostra exatamente o que vai ser enviado antes de enviar
      const prep = ai.prepareAi(b.dataset.ai, { all: state.all, T, game, note: $('#ai-note').value, dex, free: !!$('#ai-free')?.checked });
      if (!skipConfirm() && !(await confirmSend(ai.confirmHtml(prep), b))) return;
      aiOut.innerHTML = `<p class="ai-wait"><svg class="ai-spin" viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" shape-rendering="crispEdges"><use href="#logo"/></svg><span class="pixel">${b.dataset.ai === 'analyze' ? t('Analisando a equipe') : t('Montando a equipe')}</span><span class="dots" aria-hidden="true"></span><br><small>${t('Pode levar até um minuto.')}</small></p>`;
      const res = await ai.sendAi(prep, {
        // Montagem: na segunda etapa a IA escreve os pontos e as dicas com as contas do app sobre a equipe escolhida
        onStep: () => { const w = aiOut.querySelector('.ai-wait .pixel'); if (w) w.textContent = t('Escrevendo as dicas'); },
      });
      state.ai = res;
      aiOut.innerHTML = res.html;
      if (!state.persist) aiOut.querySelector('[data-ai-save]')?.remove();
      aiOut.scrollIntoView({ block: 'start' });
      $('#ai-model').value = provider().getModel();
    } catch (e) {
      console.error(e);
      const msg = e && e.name === 'AiError' ? e.message : t('Algo deu errado ao falar com o {service}. Tente de novo.', { service: provider().service });
      aiOut.innerHTML = `<p class="error">${R.esc(msg)}</p>`;
      if (e && e.code === 'key') { $('#ai-setup').classList.remove('hidden'); $('#ai-main').classList.add('hidden'); }
    } finally {
      buttons.forEach((x, i) => { x.disabled = disabled[i]; });
      $('#ai-provider').disabled = false;
    }
  }));
  // Modo livre (habilidade trocável por item): a escolha fica neste aparelho
  const freeBox = $('#ai-free');
  if (freeBox) {
    try { freeBox.checked = localStorage.getItem('ai-free') === '1'; } catch { /* sem armazenamento */ }
    freeBox.addEventListener('change', () => { try { if (freeBox.checked) localStorage.setItem('ai-free', '1'); else localStorage.removeItem('ai-free'); } catch { /* sem armazenamento */ } });
  }
  const ask = $('#ai-ask');
  ask.checked = !skipConfirm();
  ask.addEventListener('change', () => setSkipConfirm(!ask.checked));
  aiOut.addEventListener('click', async e => {
    const card = e.target.closest('[data-ref]');
    if (card && state.ai) { const m = state.ai.byRef.get(card.dataset.ref); if (m) openDetail(m, card); return; }
    const copy = e.target.closest('[data-ai-copy]');
    if (copy && state.ai && state.ai.team) {
      const ok = await copyText(showdownTeam(state.ai.team));
      copy.textContent = t(ok ? 'Copiado!' : 'Não foi possível copiar');
      return;
    }
    const save = e.target.closest('[data-ai-save]');
    if (save && state.ai && state.ai.team) saveTeam(state.ai.team, state.ai.name || t('Equipe da IA'), 'ai', save);
  });
}

// Montador de equipes (sem IA): o pacote só carrega ao tocar no botão; as contas rodam neste aparelho
function setupBuilder(out) {
  const $ = s => out.querySelector(s);
  const bOut = $('#builder-out');
  let mod = null;
  const show = i => {
    state.builder.i = i;
    bOut.innerHTML = mod.resultsHtml(state.builder.results, i, T);
    if (!state.persist) bOut.querySelector('[data-ai-save]')?.remove();
  };
  // Preparo (posso treinar / prontos para usar): a escolha fica neste aparelho
  const readySel = $('#builder-ready');
  try { if (localStorage.getItem('builder-ready') === 'ready') readySel.value = 'ready'; } catch { /* sem armazenamento */ }
  readySel.addEventListener('change', () => { try { if (readySel.value === 'ready') localStorage.setItem('builder-ready', 'ready'); else localStorage.removeItem('builder-ready'); } catch { /* sem armazenamento */ } });
  // As caixas do montador (sem lendários; sem restrição de item): a escolha fica neste aparelho
  for (const [id, key] of [['#builder-nolegend', 'builder-nolegend'], ['#builder-anyitem', 'builder-anyitem']]) {
    const box = $(id);
    if (!box) continue;
    try { box.checked = localStorage.getItem(key) === '1'; } catch { /* sem armazenamento */ }
    box.addEventListener('change', () => { try { if (box.checked) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { /* sem armazenamento */ } });
  }
  $('#builder-run').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    bOut.innerHTML = `<p class="ai-wait"><svg class="ai-spin" viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" shape-rendering="crispEdges"><use href="#logo"/></svg><span class="pixel">${t('Montando as equipes')}</span><span class="dots" aria-hidden="true"></span></p>`;
    try {
      mod = await import('./builder/index.js');
      // Quetzal/Unbound/SoulGold: golpes por nível da ROM (o montador conta também os golpes que cada um aprende)
      const game = state.data.game;
      const dex = game && ROM_LEARN.includes(game.id) ? (await loadDex()).dex : null;
      await new Promise(r => setTimeout(r, 30)); // deixa a tela de espera aparecer antes das contas
      const noLegends = $('#builder-nolegend').checked, anyItem = !!$('#builder-anyitem')?.checked, ready = $('#builder-ready').value === 'ready';
      state.builder = { results: mod.runBuilder(state.all, T, $('#builder-note').value, dex, { noLegends, anyItem, ready }), i: 0 };
      show(0);
    } catch (err) {
      console.error(err);
      bOut.innerHTML = `<p class="error">${t('Não consegui montar as equipes.')}</p>`;
    } finally {
      btn.disabled = false;
    }
  });
  bOut.addEventListener('click', async e => {
    const cur = state.builder && state.builder.results[state.builder.i];
    if (!cur) return;
    const tab = e.target.closest('[data-plan]');
    if (tab) { show(+tab.dataset.plan); return; }
    // Alternativas do plano: só calcula quando o jogador pede (no celular, a busca de cada plano leva alguns segundos)
    const more = e.target.closest('[data-more]');
    if (more) {
      const b = state.builder, i = b.i;
      more.disabled = true;
      more.innerHTML = `${t('Procurando outras opções')}<span class="dots" aria-hidden="true"></span>`;
      await new Promise(r => setTimeout(r, 30)); // deixa a espera aparecer antes das contas
      if (state.builder !== b) return; // montou de novo enquanto isso
      const k = mod.moreOptions(b.results, i, T);
      show(k >= 0 ? k : i);
      return;
    }
    const card = e.target.closest('[data-ref]');
    if (card) { const m = cur.byRef.get(card.dataset.ref); if (m) openDetail(m, card); return; }
    const copy = e.target.closest('[data-ai-copy]');
    if (copy) {
      const ok = await copyText(showdownTeam(cur.team));
      copy.textContent = t(ok ? 'Copiado!' : 'Não foi possível copiar');
      return;
    }
    const save = e.target.closest('[data-ai-save]');
    if (save) saveTeam(cur.team, t('Equipe {plan}', { plan: cur.name }), 'app', save);
  });
}

// Confirmação antes de enviar à IA (pode ser desligada; a escolha fica neste aparelho)
const SKIP_KEY = 'ai-confirm-skip';
function skipConfirm() { try { return localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } }
function setSkipConfirm(on) { try { if (on) localStorage.setItem(SKIP_KEY, '1'); else localStorage.removeItem(SKIP_KEY); } catch { /* sem armazenamento */ } }

/** Mostra a janela "o que vai ser enviado"; resolve true se o usuário tocar em Enviar. */
function confirmSend(html, opener) {
  const dlg = document.getElementById('ai-confirm');
  dlg.innerHTML = html;
  return new Promise(resolve => {
    let ok = false;
    dlg.querySelector('[data-send]').addEventListener('click', () => {
      ok = true;
      if (dlg.querySelector('[data-skip]').checked) {
        setSkipConfirm(true);
        const ask = document.getElementById('ai-ask');
        if (ask) ask.checked = false;
      }
      dlg.close();
    });
    dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
    const scroll = window.scrollY;
    dlg.addEventListener('close', () => {
      opener.focus({ preventScroll: true });
      if (window.scrollY !== scroll) window.scrollTo(0, scroll);
      resolve(ok);
    }, { once: true });
    dlg.showModal();
    dlg.querySelector('[data-send]').focus();
  });
}

function runSearch() {
  const v = id => document.getElementById(id).value;
  const f = { q: v('q'), type: v('f-type'), flag: state.flag || '', sort: v('f-sort') };
  state.results = searchMons(state.all, f);
  state.filtered = !!(f.q.trim() || f.type || f.flag);
  state.page = 0;
  state.searched = true;
  showResults();
}

/** Mostra só a página atual dos resultados (no máximo PAGE linhas na tela). */
function showResults() {
  const total = state.results.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  state.page = Math.min(Math.max(0, state.page), pages - 1);
  const start = state.page * PAGE;
  document.getElementById('results').innerHTML = state.results.slice(start, start + PAGE).map((m, j) => R.resultRow(m, start + j)).join('');
  document.getElementById('search-count').textContent = state.filtered
    ? t(total === 1 ? '1 resultado.' : '{n} resultados.', { n: total })
    : t('{n} Pokémon na equipe e no PC.', { n: total });
  const pager = document.getElementById('pager');
  pager.classList.toggle('hidden', pages <= 1);
  pager.querySelector('[data-page="-1"]').disabled = state.page === 0;
  pager.querySelector('[data-page="1"]').disabled = state.page >= pages - 1;
  document.getElementById('page-info').textContent = t('Página {p} de {n}', { p: state.page + 1, n: pages });
}

// Descrição do golpe: carrega o arquivo de textos na primeira vez que um golpe é aberto
document.addEventListener('toggle', async e => {
  const det = e.target;
  if (!(det instanceof HTMLDetailsElement) || !det.open || !det.classList.contains('move')) return;
  const p = det.querySelector('.move-desc');
  if (!p || p.dataset.loaded) return;
  if (!moveText) moveText = (await import('./data/move-text.json')).default;
  p.textContent = moveText[+p.dataset.move] || '';
  p.dataset.loaded = '1';
}, true);

function renderBox() {
  const { data } = state;
  const box = data.pc.boxes[state.box];
  const grid = document.getElementById('box-grid');
  if (!box) { grid.innerHTML = `<p class="hint">${t('O PC não pôde ser lido.')}</p>`; return; }
  grid.innerHTML = R.boxGrid(box);
  document.getElementById('box-select').value = String(state.box);
  const total = data.pc.boxes.reduce((a, b) => a + b.slots.length, 0);
  document.getElementById('pc-count').textContent = t('{n} Pokémon no total', { n: total });
}

function openDetail(m, opener) {
  const dlg = document.getElementById('detail');
  dlg.innerHTML = R.monDetail(m, T);
  fillDex(dlg, m);
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  const copy = dlg.querySelector('[data-copy="mon"]');
  copy.addEventListener('click', async () => {
    const ok = await copyText(showdownTeam([m]));
    const msg = t(ok ? 'Copiado!' : 'Não foi possível copiar');
    copy.textContent = ok ? '✓' : '!';
    copy.title = msg;
    copy.setAttribute('aria-label', msg);
  });
  // O nome aparece na barra de cima quando o cabeçalho sai da tela
  const hero = dlg.querySelector('.mon-hero'), bar = dlg.querySelector('.sheet-bar');
  if (hero && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => bar.classList.toggle('stuck', !e.isIntersecting), { root: dlg, rootMargin: '-56px 0px 0px 0px' });
    io.observe(hero);
    dlg.addEventListener('close', () => io.disconnect(), { once: true });
  }
  // Ao fechar, volta exatamente para onde a página estava.
  const scroll = window.scrollY;
  dlg.addEventListener('close', () => {
    opener.focus({ preventScroll: true });
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, { once: true });
  dlg.showModal();
}

// Linha evolutiva e golpes por nível: dados carregados na primeira vez que um detalhe é aberto
// Quetzal, Unbound e SoulGold: golpes por nível da ROM (quetzal-learn.json / unbound-learn.json /
// soulgold-learn.json) no lugar do dex.json; a evolução vem de T.quetzal / T.unbound / T.soulgold
const dexCache = {}, dexLoaded = new Set();
const ROM_LEARN = ['quetzal', 'unbound', 'soulgold']; // jogos com golpes por nível da ROM (também usados pela IA)
const dexKey = () => (T.quetzal ? 'quetzal' : T.unbound ? 'unbound' : T.soulgold ? 'soulgold' : 'dex');
function loadDex() {
  const key = dexKey();
  if (!dexCache[key]) {
    const data = key === 'quetzal' ? import('./data/quetzal-learn.json') : key === 'unbound' ? import('./data/unbound-learn.json')
      : key === 'soulgold' ? import('./data/soulgold-learn.json') : import('./data/dex.json');
    dexCache[key] = Promise.all([data, import('./ui/dex.js')]).then(([d, ui]) => ({
      dex: key === 'quetzal' ? ui.quetzalLearnDex(d.default) : key === 'unbound' ? ui.unboundLearnDex(d.default, T.unbound)
        : key === 'soulgold' ? ui.soulgoldLearnDex(d.default, T.soulgold) : d.default,
      ui,
    })).catch(e => { delete dexCache[key]; throw e; });
  }
  return dexCache[key];
}
async function fillDex(dlg, m) {
  const slot = dlg.querySelector('[data-dex]');
  if (!slot) return;
  try {
    const key = dexKey();
    if (!dexLoaded.has(key)) slot.innerHTML = `<p class="hint">${t('Carregando evolução e golpes…')}</p>`;
    const D = await loadDex();
    dexLoaded.add(key);
    if (!slot.isConnected) return; // o detalhe já foi trocado
    slot.innerHTML = D.ui.evolutionHtml(m, D.dex, T) + D.ui.learnsetHtml(m, D.dex, T);
  } catch (e) {
    console.error(e);
    slot.innerHTML = '';
  }
}

// Histórico: guarda esta versão do save (só neste aparelho) e compara com a versão anterior diferente.
async function setupHistory(buffer) {
  const cur = state;
  const key = saveKey(cur.data), sig = signature(cur.data);
  const before = await listHistory(key);
  const base = before.find(e => e.signature !== sig);
  const added = await addHistory({
    saveKey: key, signature: sig, name: cur.fileName, bytes: buffer.slice(0), savedAt: Date.now(),
    saveIndex: cur.data.trainer.saveIndex, total: cur.all.length,
  });
  if (state !== cur) return; // outro save foi aberto nesse meio-tempo
  cur.history = { key, sig, list: await listHistory(key) };
  if (base) await showChanges(base);
  else if (added || before.length) document.getElementById('changes-slot').innerHTML = historyStartWin(); // sem armazenamento: nada a mostrar
}

async function showChanges(base) {
  const cur = state;
  let old;
  try { old = loadSave(base.bytes, BASE, G3, ...(await extraTables(base.bytes))).data; } catch { return; }
  if (state !== cur) return; // outro save foi aberto nesse meio-tempo
  // Sempre do mais antigo para o mais novo (pelo tempo de jogo), mesmo se o save mais antigo foi aberto por último
  const { older, newer, swapped } = orderSaves(old, cur.data);
  const { html, mons } = changesWin(diffSaves(older, newer), base, cur.history.list.length, { swapped });
  cur.history.baseId = base.id;
  const slot = document.getElementById('changes-slot');
  slot.innerHTML = html;
  slot.onclick = e => {
    const b = e.target.closest('[data-ch]');
    if (b) { openDetail(mons[+b.dataset.ch], b); return; }
    if (e.target.closest('[data-history]')) openHistory(e.target.closest('[data-history]'));
  };
}

function openHistory(opener) {
  const dlg = document.getElementById('history');
  const h = state.history;
  const draw = () => {
    dlg.innerHTML = historyList(h.list, h.sig, h.baseId);
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    dlg.querySelectorAll('[data-compare]').forEach(b => b.addEventListener('click', () => {
      const base = h.list.find(e => e.id === +b.dataset.compare);
      if (base) showChanges(base);
      dlg.close();
    }));
    dlg.querySelector('[data-clear]').addEventListener('click', async () => {
      if (!confirm(t('Apagar todas as versões guardadas deste save? A versão atual continua aberta.'))) return;
      await clearHistory(h.key);
      h.list = [];
      document.getElementById('changes-slot').innerHTML = '';
      dlg.close();
    });
  };
  draw();
  const scroll = window.scrollY;
  dlg.addEventListener('close', () => {
    opener.focus({ preventScroll: true });
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, { once: true });
  dlg.showModal();
}

// Pokédex: o que falta capturar (pacote carregado só ao abrir; nos jogos oficiais, também o dex.json, pelas evoluções)
let dexMissing = null;
async function openDex(opener) {
  const dlg = document.getElementById('dex');
  const official = !T.quetzal && !T.unbound && !T.soulgold;
  if (!dexMissing) {
    dexMissing = Promise.all([import('./dex/missing.js'), official ? import('./data/dex.json').then(m => m.default) : null]);
  }
  let mod, chains;
  try { [mod, chains] = await dexMissing; } catch (e) { dexMissing = null; console.error(e); return; }
  if (official && !chains) chains = (await import('./data/dex.json')).default;
  const info = mod.missingDex(state.data, T, official ? chains : null);
  const name = mod.dexNamer(T, official ? chains : null);
  const view = { gen: 0, filter: 'all' };
  const draw = () => {
    dlg.innerHTML = mod.dexWinHtml(info, name, state.data.game && state.data.game.id, view);
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  };
  dlg.onclick = e => {
    const f = e.target.closest('[data-dex-filter]'), g = e.target.closest('[data-dex-gen]');
    if (f) { view.filter = f.dataset.dexFilter; view.gen = 0; }
    else if (g) view.gen = +g.dataset.dexGen;
    else return;
    draw();
    dlg.querySelector(f ? `[data-dex-filter="${view.filter}"]` : `[data-dex-gen="${view.gen}"]`)?.focus();
  };
  draw();
  const scroll = window.scrollY;
  dlg.addEventListener('close', () => {
    opener.focus({ preventScroll: true });
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, { once: true });
  dlg.showModal();
}

// Imagem da equipe: gerada no aparelho; Compartilhar (Android) ou Baixar
async function openTeamImage(opener, opts = {}) {
  const dlg = document.getElementById('image');
  dlg.innerHTML = `<button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
    <h2 class="pixel" id="image-title">${t('Imagem da equipe')}</h2><p class="hint">${t('Gerando a imagem…')}</p>`;
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  const scroll = window.scrollY;
  let url = '';
  dlg.addEventListener('close', () => {
    if (url) URL.revokeObjectURL(url);
    opener.focus({ preventScroll: true });
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, { once: true });
  dlg.showModal();
  try {
    const { teamImage } = await import('./ui/team-image.js');
    const blob = await teamImage(state.data, opts);
    if (!dlg.open) return;
    url = URL.createObjectURL(blob);
    const name = fileBase(state.data) + '-equipe.png';
    const file = new File([blob], name, { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    dlg.querySelector('.hint').outerHTML = `<img class="team-img" src="${url}" alt="${R.esc(t('Imagem da equipe'))}">
      <div class="export-btns">
        ${canShare ? `<button class="btn" type="button" data-share>${t('Compartilhar')}</button>` : ''}
        <button class="btn${canShare ? ' btn-ghost' : ''}" type="button" data-save>${t('Baixar imagem')}</button>
      </div>`;
    dlg.querySelector('[data-save]').addEventListener('click', () => downloadBlob(name, blob));
    const share = dlg.querySelector('[data-share]');
    if (share) share.addEventListener('click', () => navigator.share({ files: [file], title: t('Imagem da equipe') }).catch(() => {}));
  } catch (e) {
    console.error(e);
    const hint = dlg.querySelector('.hint');
    if (hint) hint.textContent = t('Não consegui gerar a imagem.');
  }
}

// Equipes salvas (só neste aparelho, por save): o pacote da janela só carrega quando há equipe ou ao salvar
let teamsMod = null;
const loadTeams = () => (teamsMod ||= import('./teams/view.js').catch(e => { teamsMod = null; throw e; }));

async function refreshTeams() {
  const cur = state;
  if (!cur.persist) return;
  const list = await listTeams(cur.key);
  if (state !== cur) return;
  const slot = document.getElementById('teams-slot');
  if (!list.length) { cur.teams = null; slot.innerHTML = ''; return; }
  const V = await loadTeams();
  if (state !== cur) return;
  cur.teams = { list, located: list.map(team => V.locateTeam(team, cur.data)) };
  slot.innerHTML = V.teamsWin(list, cur.teams.located, T, cur.openTeam ?? null);
}

/** Salva a equipe; a mensagem aparece no `.team-msg` mais perto do botão. */
async function saveTeam(mons, name, source, btn) {
  const cur = state;
  const msgEl = btn.closest('section, .ai-result')?.querySelector('.team-msg');
  const say = text => { if (msgEl) msgEl.textContent = text; };
  try {
    const V = await loadTeams();
    const team = V.newTeam(mons, { saveKey: cur.key, name, source });
    const list = await listTeams(cur.key);
    if (list.some(x => V.teamSig(x) === V.teamSig(team))) return say(t('Essa equipe já está salva (Ferramentas → Equipes salvas).'));
    if (list.length >= V.TEAM_MAX) return say(t('Limite de {n} equipes por save: apague uma em Ferramentas → Equipes salvas.', { n: V.TEAM_MAX }));
    const id = await addTeam(team);
    if (id == null) return say(t('Não consegui salvar neste navegador.'));
    if (state !== cur) return;
    cur.openTeam = id;
    say(t('Equipe salva em Ferramentas → Equipes salvas.'));
    await refreshTeams();
  } catch (e) {
    console.error(e);
    say(t('Não consegui salvar neste navegador.'));
  }
}

function setupTeams(slot) {
  slot.addEventListener('toggle', e => {
    const det = e.target.closest('[data-team]');
    if (!det || !state.teams) return;
    if (det.open) state.openTeam = +det.dataset.team;
    else if (state.openTeam === +det.dataset.team) state.openTeam = null;
  }, true);
  slot.addEventListener('click', async e => {
    const tm = state.teams;
    if (!tm) return;
    const b = e.target.closest('[data-team-mon], [data-team-copy], [data-team-img], [data-team-rename], [data-team-del]');
    if (!b) return;
    if (b.dataset.teamMon) {
      const [ti, mi] = b.dataset.teamMon.split(':').map(Number);
      const m = tm.located[ti][mi].now;
      if (m) openDetail(m, b);
      return;
    }
    const ti = +(b.dataset.teamCopy ?? b.dataset.teamImg ?? b.dataset.teamRename ?? b.dataset.teamDel);
    const team = tm.list[ti], located = tm.located[ti];
    if (!team) return;
    const V = await loadTeams();
    if (b.dataset.teamCopy != null) {
      const ok = await copyText(V.teamShowdown(located));
      b.textContent = t(ok ? 'Copiado!' : 'Não foi possível copiar');
    } else if (b.dataset.teamImg != null) {
      openTeamImage(b, { mons: located.filter(x => x.now).map(x => x.now), title: team.name });
    } else if (b.dataset.teamRename != null) {
      const name = V.cleanName(prompt(t('Nome da equipe'), team.name) ?? '');
      if (!name || name === team.name) return;
      await putTeam({ ...team, name });
      await refreshTeams();
    } else if (confirm(t('Apagar a equipe "{name}"? Os Pokémon continuam no save.', { name: team.name }))) {
      await deleteTeam(team.id);
      await refreshTeams();
    }
  });
}

function exportAs(kind) {
  const { data } = state;
  const base = fileBase(data);
  if (kind === 'csv') download(base + '.csv', toCSV(data), 'text/csv');
  else if (kind === 'txt') download(base + '-showdown.txt', toShowdown(data), 'text/plain');
  else download(base + '.json', toJSON(data, { exportedAt: new Date().toISOString(), sourceFile: state.fileName }), 'application/json');
  status(t('Arquivo gerado. Confira a pasta de downloads.'));
}

function status(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

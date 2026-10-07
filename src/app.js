// Carregado sob demanda quando o usuário abre um save (parser + tabelas + renderização).

import { loadSave, isQuetzal, isUnbound, isNds, isSoulGold } from './parser/index.js';
import BASE from './data/tables.js';
import G3 from './data/gen3.json';
import { toCSV, toShowdown, showdownTeam, toJSON, fileBase } from './export.js';
import { t } from './i18n.js';
import { download, downloadBlob, copyText } from './ui/io.js';
import * as R from './ui/render.js';
import { searchMons } from './search.js';
import { PROVIDERS, provider, providerId, setProviderId } from './ai/providers.js';
import { saveKey, signature, diffSaves, orderSaves } from './history/diff.js';
import { changesWin, historyStartWin, historyList } from './history/view.js';
import { listHistory, addHistory, clearHistory } from './ui/store.js';

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
  state = { data, fileName, box: firstFilled >= 0 ? firstFilled : 0, all, results: [], page: 0, searched: false };
  render();
  if (opts.history) setupHistory(buffer).catch(e => console.error(e));
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
      ${R.partyWin(data)}
      ${R.analysisWin(data, T)}
    </div>
    <div class="grp" id="grp-pc">
      ${R.pcWin(data)}
      ${R.searchWin(data, T)}
    </div>
    <div class="grp" id="grp-tools">
      ${R.aiWin(data, Object.values(PROVIDERS))}
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
  const imgBtn = out.querySelector('[data-team-image]');
  if (imgBtn) imgBtn.addEventListener('click', () => openTeamImage(imgBtn));
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
  for (const id of ['ai-win', 'search-win']) {
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
      const prep = ai.prepareAi(b.dataset.ai, { all: state.all, T, game, note: $('#ai-note').value, dex });
      if (!skipConfirm() && !(await confirmSend(ai.confirmHtml(prep), b))) return;
      aiOut.innerHTML = `<p class="ai-wait"><svg class="ai-spin" viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" shape-rendering="crispEdges"><use href="#logo"/></svg><span class="pixel">${b.dataset.ai === 'analyze' ? t('Analisando a equipe') : t('Montando a equipe')}</span><span class="dots" aria-hidden="true"></span><br><small>${t('Pode levar até um minuto.')}</small></p>`;
      const res = await ai.sendAi(prep, {
        // Montagem: na segunda etapa a IA escreve os pontos e as dicas com as contas do app sobre a equipe escolhida
        onStep: () => { const w = aiOut.querySelector('.ai-wait .pixel'); if (w) w.textContent = t('Escrevendo as dicas'); },
      });
      state.ai = res;
      aiOut.innerHTML = res.html;
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
    }
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

// Imagem da equipe: gerada no aparelho; Compartilhar (Android) ou Baixar
async function openTeamImage(opener) {
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
    const blob = await teamImage(state.data);
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

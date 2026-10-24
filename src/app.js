// Carregado sob demanda quando o usuário abre um save (parser + tabelas + renderização).

import { loadSave, isQuetzal, isUnbound, isNds, isSoulGold } from './parser/index.js';
import BASE from './data/tables.js';
import G3 from './data/gen3.json';
import { toCSV, toShowdown, showdownTeam, toJSON, fileBase } from './export.js';
import { t, locale } from './i18n.js';
import { download, downloadBlob, copyText } from './ui/io.js';
import * as R from './ui/render.js';
import { searchMons } from './search.js';
import { makeResolver } from './parser/describe.js';
import { PROVIDERS, provider, providerId, setProviderId } from './ai/providers.js';
import { saveKey, signature, diffSaves, orderSaves, evolutionCheck } from './history/diff.js';
import { changesWin, historyStartWin, historyList } from './history/view.js';
import { listHistory, addHistory, clearHistory, listTeams, addTeam, putTeam, deleteTeam } from './ui/store.js';
import { installTips, moveText, abilityText } from './ui/tips.js';
import { freeAbilityMode } from './ai/free.js';

const PAGE = 15; // resultados da busca por página

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
    </div>
    <div class="grp" id="grp-tools">
      ${R.toolsWin(data.game)}
      ${R.builderWin(data, Object.values(PROVIDERS))}
      ${R.pokedexWin(data, T)}
      ${R.movesWin(T)}
      ${R.abilitiesWin()}
      ${R.searchWin(data, T)}
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

  // Análise: tocar num tipo mostra, embaixo da grade, quem é fraco/resiste/imune (um tipo por vez)
  const tgrid = out.querySelector('.tgrid');
  if (tgrid) tgrid.addEventListener('click', e => {
    const b = e.target.closest('[data-tt]');
    if (!b) return;
    const panel = out.querySelector('#tt-panel');
    const open = b.getAttribute('aria-expanded') !== 'true';
    tgrid.querySelectorAll('[data-tt]').forEach(x => x.setAttribute('aria-expanded', 'false'));
    panel.hidden = !open;
    if (open) {
      b.setAttribute('aria-expanded', 'true');
      panel.innerHTML = `<b class="tt-title">${b.querySelector('.type').outerHTML}</b>` + tgrid.querySelector(`[data-tt-who="${b.dataset.tt}"]`).innerHTML;
    }
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

  // Montar equipe (e a parte com IA dentro dela) e Busca ficam fechados até o usuário abrir; a lista só é montada
  // quando a Busca abre
  for (const id of ['builder-win', 'ai-win', 'search-win', 'pokedex-win', 'moves-win', 'abilities-win']) {
    const det = out.querySelector('#' + id);
    det.addEventListener('toggle', () => {
      setFoldOpen(id, det.open);
      if (id === 'search-win' && det.open && !state.searched) runSearch();
      if (id === 'pokedex-win' && det.open) setupPokedex(out);
      if (id === 'moves-win' && det.open) setupMoves(out);
      if (id === 'abilities-win' && det.open) setupAbilities(out);
    });
    if (foldOpen(id)) det.open = true;
  }
  // Cartões das ferramentas: abrem a janela (fechada, ela some; o título dela fecha) e acompanham o estado
  const cards = [...out.querySelectorAll('[data-tool]')];
  const syncCards = () => cards.forEach(c => c.setAttribute('aria-pressed', String(out.querySelector('#' + c.dataset.tool).open)));
  for (const c of cards) {
    const det = out.querySelector('#' + c.dataset.tool);
    det.addEventListener('toggle', syncCards);
    c.addEventListener('click', () => {
      det.open = !det.open;
      if (det.open) det.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }
  syncCards();
}

// Pokédex do jogo: o pacote (lista de espécies, filtros e detalhe) só carrega quando a janela abre
let pokedexMod = null;
const loadPokedex = () => (pokedexMod ||= import('./pokedex/view.js').catch(e => { pokedexMod = null; throw e; }));

/** A Pokédex do save aberto: as espécies do jogo, montadas uma vez por save. */
async function pokedexState() {
  const cur = state;
  if (!cur.pokedex) {
    const P = await loadPokedex();
    const caught = cur.data.summary && cur.data.summary.dex && cur.data.summary.dex.caught;
    cur.pokedex = { P, entries: P.pokedexEntries(T, cur.data.game), caught: caught ? new Set(caught) : null, list: [], page: 0, dex: null };
  }
  return cur.pokedex;
}

async function setupPokedex(out) {
  const cur = state;
  const $ = s => out.querySelector(s);
  if (cur.pokedexWired) return;
  cur.pokedexWired = true;
  $('#pdx-count').textContent = t('Carregando…');
  let pd;
  try { pd = await pokedexState(); } catch (e) { console.error(e); cur.pokedexWired = false; $('#pdx-count').textContent = t('Não consegui abrir a Pokédex.'); return; }
  if (state !== cur) return;
  const note = pd.P.listNote(cur.data.game);
  $('#pdx-note').innerHTML = note ? R.infoBtn(t('Pokédex'), note) : '';
  const show = () => {
    const total = pd.list.length;
    const pages = Math.max(1, Math.ceil(total / pd.P.PAGE));
    pd.page = Math.min(Math.max(0, pd.page), pages - 1);
    const start = pd.page * pd.P.PAGE;
    // Na ordem da Pokédex, a forma logo depois da espécie entra recuada embaixo dela
    const byDex = !$('#pdx-sort').value || $('#pdx-sort').value === 'dex';
    $('#pdx-results').innerHTML = pd.list.slice(start, start + pd.P.PAGE)
      .map((e, j) => pd.P.entryRow(e, start + j, pd.caught, byDex && j ? pd.list[start + j - 1] : null)).join('');
    $('#pdx-count').textContent = t(total === 1 ? '1 espécie' : '{n} espécies', { n: total });
    const pager = $('#pdx-pager');
    pager.classList.toggle('hidden', pages <= 1);
    pager.querySelector('[data-page="-1"]').disabled = pd.page === 0;
    pager.querySelector('[data-page="1"]').disabled = pd.page >= pages - 1;
    $('#pdx-page').textContent = t('Página {p} de {n}', { p: pd.page + 1, n: pages });
  };
  // Filtros escondidos atrás do botão "Filtros" (o nome e a ordem ficam sempre à vista); na tela larga, abertos
  const FILTERS = ['pdx-move', 'pdx-where', 'pdx-type', 'pdx-type2', 'pdx-caught', 'pdx-resist', 'pdx-gen', 'pdx-evo', 'pdx-cat', 'pdx-min'];
  const toggle = $('#pdx-ftoggle'), panel = $('#pdx-filters');
  const active = $('#pdx-active');
  const setOpen = on => { panel.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); active.hidden = on; };
  // Os filtros ligados, à vista com os filtros recolhidos: uma etiqueta por filtro, o ✕ desliga
  const PREFIX = { 'pdx-move': t('Golpes'), 'pdx-type': t('Tipo'), 'pdx-type2': t('Segundo tipo') };
  const showActive = () => {
    const chips = FILTERS.map(id => {
      const el = $('#' + id);
      if (!el || !el.value.trim()) return '';
      let label;
      if (id === 'pdx-min') label = `${$('#pdx-stat').selectedOptions[0].textContent} ≥ ${el.value.trim()}`;
      else if (el.tagName === 'SELECT') label = (PREFIX[id] ? `${PREFIX[id]}: ` : '') + el.selectedOptions[0].textContent;
      else label = `${PREFIX[id]}: ${el.value.trim()}`;
      return `<button type="button" class="pdx-fchip" data-unfilter="${id}" aria-label="${R.esc(t('Desligar o filtro {f}', { f: label }))}">${R.esc(label)} <span aria-hidden="true">✕</span></button>`;
    }).filter(Boolean);
    active.innerHTML = chips.join('') + (chips.length > 1 ? `<button type="button" class="pdx-fchip pdx-fclear" data-unfilter="*">${t('Limpar filtros')}</button>` : '');
  };
  active.addEventListener('click', e => {
    const b = e.target.closest('[data-unfilter]');
    if (!b) return;
    if (b.dataset.unfilter === '*') { $('#pdx-clear').click(); return; }
    $('#' + b.dataset.unfilter).value = '';
    const t2 = $('#pdx-type2');
    if (!$('#pdx-type').value && t2.value && t2.value !== 'none') { $('#pdx-type').value = t2.value; t2.value = ''; }
    run();
    active.querySelector('[data-unfilter]')?.focus();
  });
  setOpen(window.matchMedia('(min-width: 960px)').matches);
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  const run = async () => {
    const v = id => ($('#' + id) ? $('#' + id).value : '');
    const moveQ = v('pdx-move').trim();
    // Filtro por golpe (e o de evolução nos jogos oficiais): carrega os golpes do jogo (os mesmos do detalhe) na primeira vez
    if ((moveQ || (v('pdx-evo') && pd.P.evoNeedsDex(T))) && !pd.dex) {
      $('#pdx-count').textContent = t('Carregando os golpes…');
      try { pd.dex = (await loadDex()).dex; } catch (e) { console.error(e); $('#pdx-count').textContent = t('Não consegui carregar os golpes.'); return; }
      if (state !== cur) return;
    }
    // Onde conseguir (Quetzal): os encontros lidos da ROM, no pacote do "Onde encontrar"
    if (v('pdx-where') && !pd.obtain) {
      $('#pdx-count').textContent = t('Carregando os encontros…');
      try {
        const Wm = await loadWild();
        const RS = makeResolver(T);
        pd.obtain = Wm.obtainable(T.quetzal, id => RS.species(id));
      } catch (e) { console.error(e); $('#pdx-count').textContent = t('Não consegui carregar os encontros.'); return; }
      if (state !== cur) return;
    }
    const moves = moveQ ? pd.P.movesMatchingAll(moveQ, pd.entries, pd.dex, T) : null;
    pd.list = pd.P.filterEntries(pd.entries, {
      q: v('pdx-q'), type: v('pdx-type'), caught: v('pdx-caught'), sort: v('pdx-sort'), moves, where: v('pdx-where'),
      type2: v('pdx-type2'), resist: v('pdx-resist'), gen: v('pdx-gen'), evo: v('pdx-evo'), cat: v('pdx-cat'), stat: v('pdx-stat'), min: v('pdx-min').trim(),
    }, { caught: pd.caught, dex: pd.dex, T, obtain: pd.obtain });
    // Atalhos e grade de tipos acompanham os filtros
    for (const b of out.querySelectorAll('#pokedex-win [data-quick]')) {
      const [id, val] = b.dataset.quick.split(':');
      b.setAttribute('aria-pressed', String(v(id) === val));
    }
    for (const b of out.querySelectorAll('#pdx-tgrid [data-type]')) {
      const x = b.dataset.type;
      b.setAttribute('aria-pressed', String(x === 'none' ? v('pdx-type2') === 'none' : v('pdx-type') === x || v('pdx-type2') === x));
    }
    // Quantos filtros estão ligados (aparece no botão, que fica fechado no celular)
    const on = FILTERS.filter(id => v(id).trim()).length;
    $('#pdx-on').textContent = on ? `(${on})` : '';
    showActive();
    pd.page = 0;
    show();
  };
  let timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 200); };
  for (const id of ['pdx-q', 'pdx-sort', 'pdx-stat', ...FILTERS]) {
    const el = $('#' + id);
    if (el) el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', later);
  }
  // Atalhos: ligam o valor no filtro (o mesmo valor de novo desliga)
  out.querySelector('#pokedex-win .pdx-quick').addEventListener('click', e => {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    const [id, val] = b.dataset.quick.split(':');
    const el = $('#' + id);
    el.value = el.value === val ? '' : val;
    run();
  });
  // Grade de tipos: até dois (o segundo, ou "Só um tipo", vai no segundo filtro); tocar de novo desliga
  $('#pdx-tgrid').addEventListener('click', e => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    const t1 = $('#pdx-type'), t2 = $('#pdx-type2'), x = b.dataset.type;
    if (x === 'none') t2.value = t2.value === 'none' ? '' : 'none';
    else if (t1.value === x) { t1.value = t2.value && t2.value !== 'none' ? t2.value : ''; if (t2.value !== 'none') t2.value = ''; }
    else if (t2.value === x) t2.value = '';
    else if (!t1.value) t1.value = x;
    else t2.value = x;
    run();
  });
  $('#pdx-clear').addEventListener('click', () => {
    for (const id of FILTERS) if ($('#' + id)) $('#' + id).value = '';
    $('#pdx-stat').value = 'bst';
    run();
  });
  $('#pdx-pager').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    pd.page += Number(b.dataset.page);
    show();
    const count = $('#pdx-count');
    if (count.getBoundingClientRect().top < 0) count.scrollIntoView({ block: 'start' });
  });
  $('#pdx-results').addEventListener('click', e => {
    const b = e.target.closest('[data-pdx]');
    if (!b) return;
    const entry = pd.list[+b.dataset.pdx];
    if (pd.cmp) compareSpecies(pd.cmp, entry, b);
    else openSpecies(entry, b);
  });
  // Comparar: a primeira espécie vem do detalhe ("VS"); o próximo toque na lista abre a comparação
  $('#pdx-cmp').addEventListener('click', e => { if (e.target.closest('[data-cmp-cancel]')) setCompare(null); });
  run();
}

/** Marca (ou desmarca, com null) a primeira espécie da comparação e mostra o aviso em cima da lista. */
function setCompare(entry) {
  const pd = state.pokedex;
  const box = document.getElementById('pdx-cmp');
  if (!pd || !box) return;
  pd.cmp = entry;
  box.classList.toggle('hidden', !entry);
  box.innerHTML = entry ? `<span>${t('Comparar com {name}: toque em outra espécie da lista.', { name: `<b>${R.esc(entry.species.name)}${entry.species.form ? ` (${R.esc(entry.species.form)})` : ''}</b>` })}</span>
    <button class="btn btn-ghost btn-small" type="button" data-cmp-cancel>${t('Cancelar')}</button>` : '';
}

/** Duas espécies lado a lado (na janela do detalhe). */
async function compareSpecies(a, b, opener) {
  const pd = await pokedexState();
  setCompare(null);
  const dlg = document.getElementById('detail');
  dlg.innerHTML = pd.P.compareHtml(a, b, T);
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.querySelector('.mon').addEventListener('click', e => {
    const h = e.target.closest('[data-cmp-open]');
    if (h) openSpecies(h.dataset.cmpOpen === '0' ? a : b, opener);
  });
  if (!dlg.open) showSheet(dlg, opener);
  dlg.scrollTop = 0;
}

/** Abre a janela do detalhe e devolve o foco (e a rolagem da página) a quem a abriu, ao fechar. */
function showSheet(dlg, opener) {
  const scroll = window.scrollY;
  dlg.addEventListener('close', () => {
    opener.focus({ preventScroll: true });
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, { once: true });
  dlg.showModal();
}

/** A entrada da Pokédex de um estágio da linha evolutiva (`data-evo-id`: números do jogo, ou da PokeAPI nos oficiais). */
function evoEntry(pd, ids) {
  const nums = ids.split(' ').map(Number);
  const rom = !!(T.quetzal || T.unbound || T.soulgold);
  for (const n of nums) {
    const e = rom ? pd.entries.find(x => x.id === n) : pd.entries.find(x => (x.species.dexId || (!x.species.form && x.nat)) === n);
    if (e) return e;
  }
  return null;
}

/**
 * Filtros recolhidos atrás do botão "Filtros" (a busca e a ordem ficam à vista), como na Pokédex: `pre` = prefixo dos
 * ids (`mv` → #mv-ftoggle, #mv-filters, #mv-active, #mv-on, #mv-clear); `ids` = os filtros; `prefix` = rótulo antes do
 * valor na etiqueta do filtro ligado. Devolve `sync()`, que atualiza a contagem e as etiquetas (chamar no fim do filtro).
 */
function foldFilters($, pre, ids, prefix, run) {
  const toggle = $(`#${pre}-ftoggle`), panel = $(`#${pre}-filters`), active = $(`#${pre}-active`);
  const setOpen = on => { panel.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); active.hidden = on; };
  setOpen(window.matchMedia('(min-width: 960px)').matches);
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  const clear = () => { for (const id of ids) $('#' + id).value = ''; run(); };
  $(`#${pre}-clear`).addEventListener('click', clear);
  active.addEventListener('click', e => {
    const b = e.target.closest('[data-unfilter]');
    if (!b) return;
    if (b.dataset.unfilter === '*') return clear();
    $('#' + b.dataset.unfilter).value = '';
    run();
    active.querySelector('[data-unfilter]')?.focus();
  });
  return () => {
    const on = ids.filter(id => $('#' + id).value);
    $(`#${pre}-on`).textContent = on.length ? `(${on.length})` : '';
    const chips = on.map(id => {
      const label = (prefix[id] ? `${prefix[id]}: ` : '') + $('#' + id).selectedOptions[0].textContent;
      return `<button type="button" class="pdx-fchip" data-unfilter="${id}" aria-label="${R.esc(t('Desligar o filtro {f}', { f: label }))}">${R.esc(label)} <span aria-hidden="true">✕</span></button>`;
    });
    active.innerHTML = chips.join('') + (chips.length > 1 ? `<button type="button" class="pdx-fchip pdx-fclear" data-unfilter="*">${t('Limpar filtros')}</button>` : '');
  };
}

/**
 * Abas dos detalhes de golpe e de habilidade (as mesmas da Pokédex): a escolhida fica em `st.tab` e vale para o próximo
 * (‹ ›); as setas trocam de aba quando o foco está nelas.
 */
function wireDetailTabs(dlg, st) {
  const tabs = dlg.querySelector('.pdx-tabs');
  if (!tabs) return;
  const setTab = k => {
    const btn = tabs.querySelector(`[data-ptab="${k}"]`);
    if (!btn) return;
    st.tab = k;
    for (const b of tabs.querySelectorAll('[data-ptab]')) b.setAttribute('aria-selected', String(b === btn));
    for (const p of dlg.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== k;
    const top = tabs.offsetTop - parseFloat(tabs.style.top || 0);
    if (dlg.scrollTop > top) dlg.scrollTop = top;
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-ptab]'); if (b) setTab(b.dataset.ptab); });
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.stopPropagation();
    const list = [...tabs.querySelectorAll('[data-ptab]')];
    const next = list[(list.indexOf(document.activeElement) + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    if (next) { setTab(next.dataset.ptab); next.focus(); }
  });
}

// Golpedex: o pacote (lista e detalhe dos golpes) só carrega quando a janela abre; usa as espécies da Pokédex e os
// golpes por nível/tutor/ovo do detalhe (loadDex)
let movesMod = null;
const loadMoves = () => (movesMod ||= import('./movedex/view.js').catch(e => { movesMod = null; throw e; }));

/** A Golpedex do save aberto: os golpes do jogo e quem aprende cada um, montados uma vez por save. */
async function movesState() {
  const cur = state;
  if (!cur.movedex) {
    const [M, pd, D] = await Promise.all([loadMoves(), pokedexState(), loadDex()]);
    const learners = M.learnersIndex(pd.entries, D.dex);
    // A entrada da Pokédex de cada Pokémon do save (espécie e forma)
    const byKey = new Map(pd.entries.map(e => [`${e.id}|${e.species.form || ''}`, e]));
    const entryOf = m => byKey.get(`${m.speciesId}|${m.species.form || ''}`) || byKey.get(`${m.speciesId}|`) || null;
    const mine = M.mineIndex(cur.all, learners, entryOf);
    cur.movedex = { M, pd, dex: D.dex, learners, entryOf, rows: M.moveRows(T, cur.data.game, learners, mine), list: [], page: 0 };
  }
  return cur.movedex;
}

async function setupMoves(out) {
  const cur = state;
  const $ = s => out.querySelector(s);
  if (cur.movesWired) return;
  cur.movesWired = true;
  $('#mv-count').textContent = t('Carregando…');
  let md;
  try { md = await movesState(); } catch (e) { console.error(e); cur.movesWired = false; $('#mv-count').textContent = t('Não consegui abrir os golpes.'); return; }
  if (state !== cur) return;
  if (!md.dex.rom) $('#mv-note').innerHTML = R.infoBtn(t('Golpes'), t('Quem aprende: golpes por nível dos jogos oficiais mais recentes; o jogo do save pode ser diferente. TM e tutor não entram.'));
  const FILTERS = ['mv-type', 'mv-cat', 'mv-mine'];
  let sync = () => {};
  const show = () => {
    const total = md.list.length;
    const pages = Math.max(1, Math.ceil(total / md.M.PAGE));
    md.page = Math.min(Math.max(0, md.page), pages - 1);
    const start = md.page * md.M.PAGE;
    $('#mv-results').innerHTML = md.list.slice(start, start + md.M.PAGE).map((r, j) => md.M.moveRow(r, start + j)).join('');
    $('#mv-count').textContent = t(total === 1 ? '1 golpe.' : '{n} golpes.', { n: total });
    const pager = $('#mv-pager');
    pager.classList.toggle('hidden', pages <= 1);
    pager.querySelector('[data-page="-1"]').disabled = md.page === 0;
    pager.querySelector('[data-page="1"]').disabled = md.page >= pages - 1;
    $('#mv-page').textContent = t('Página {p} de {n}', { p: md.page + 1, n: pages });
  };
  const run = () => {
    const v = id => $('#' + id).value;
    md.list = md.M.filterMoves(md.rows, { q: v('mv-q'), type: v('mv-type'), cat: v('mv-cat'), mine: v('mv-mine'), sort: v('mv-sort') });
    md.page = 0;
    sync();
    show();
  };
  sync = foldFilters($, 'mv', FILTERS, { 'mv-type': t('Tipo') }, run);
  let timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 200); };
  for (const id of ['mv-q', 'mv-sort', ...FILTERS]) {
    const el = $('#' + id);
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', later);
  }
  $('#mv-pager').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    md.page += Number(b.dataset.page);
    show();
    const count = $('#mv-count');
    if (count.getBoundingClientRect().top < 0) count.scrollIntoView({ block: 'start' });
  });
  $('#mv-results').addEventListener('click', e => {
    const b = e.target.closest('[data-mv]');
    if (b) openMove(md.list[+b.dataset.mv], b);
  });
  run();
}

// Dex de habilidades: o pacote só carrega quando a janela abre; usa as espécies da Pokédex e as descrições de tips.js
let abilitiesMod = null;
const loadAbilities = () => (abilitiesMod ||= import('./abilitydex/view.js').catch(e => { abilitiesMod = null; throw e; }));

/** As habilidades do save aberto, com quem tem e a descrição de cada uma, montadas uma vez por save. */
async function abilitiesState() {
  const cur = state;
  if (!cur.abilitydex) {
    const [A, pd] = await Promise.all([loadAbilities(), pokedexState()]);
    const byKey = new Map(pd.entries.map(e => [`${e.id}|${e.species.form || ''}`, e]));
    const entryOf = m => byKey.get(`${m.speciesId}|${m.species.form || ''}`) || byKey.get(`${m.speciesId}|`) || null;
    const rows = A.abilityRows(pd.entries, cur.all, entryOf);
    const ctx = tipCtx();
    await Promise.all(rows.map(r => abilityText(r.name, ctx).then(x => { r.text = x.text; r.note = x.note; })));
    cur.abilitydex = { A, pd, entryOf, rows, list: [], page: 0 };
  }
  return cur.abilitydex;
}

async function setupAbilities(out) {
  const cur = state;
  const $ = s => out.querySelector(s);
  if (cur.abilitiesWired) return;
  cur.abilitiesWired = true;
  $('#ab-count').textContent = t('Carregando…');
  let ad;
  try { ad = await abilitiesState(); } catch (e) { console.error(e); cur.abilitiesWired = false; $('#ab-count').textContent = t('Não consegui abrir as habilidades.'); return; }
  if (state !== cur) return;
  const FILTERS = ['ab-mine', 'ab-slot'];
  let sync = () => {};
  const show = () => {
    const total = ad.list.length;
    const pages = Math.max(1, Math.ceil(total / ad.A.PAGE));
    ad.page = Math.min(Math.max(0, ad.page), pages - 1);
    const start = ad.page * ad.A.PAGE;
    $('#ab-results').innerHTML = ad.list.slice(start, start + ad.A.PAGE).map((r, j) => ad.A.abilityRow(r, start + j)).join('');
    $('#ab-count').textContent = t(total === 1 ? '1 habilidade.' : '{n} habilidades.', { n: total });
    const pager = $('#ab-pager');
    pager.classList.toggle('hidden', pages <= 1);
    pager.querySelector('[data-page="-1"]').disabled = ad.page === 0;
    pager.querySelector('[data-page="1"]').disabled = ad.page >= pages - 1;
    $('#ab-page').textContent = t('Página {p} de {n}', { p: ad.page + 1, n: pages });
  };
  const run = () => {
    const v = id => $('#' + id).value;
    ad.list = ad.A.filterAbilities(ad.rows, { q: v('ab-q'), mine: v('ab-mine'), slot: v('ab-slot'), sort: v('ab-sort') });
    ad.page = 0;
    sync();
    show();
  };
  sync = foldFilters($, 'ab', FILTERS, {}, run);
  let timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 200); };
  for (const id of ['ab-q', 'ab-sort', ...FILTERS]) {
    const el = $('#' + id);
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', later);
  }
  $('#ab-pager').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    ad.page += Number(b.dataset.page);
    show();
    const count = $('#ab-count');
    if (count.getBoundingClientRect().top < 0) count.scrollIntoView({ block: 'start' });
  });
  $('#ab-results').addEventListener('click', e => {
    const b = e.target.closest('[data-ab]');
    if (b) openAbility(ad.list[+b.dataset.ab], b);
  });
  run();
}

/** Detalhe de uma habilidade (na janela do detalhe). */
async function openAbility(row, opener) {
  if (!row) return;
  const ad = await abilitiesState();
  const dlg = document.getElementById('detail');
  const wasOpen = dlg.open;
  const i = ad.list.indexOf(row);
  const { html, lists } = ad.A.abilityDetail(row, { all: state.all, entries: ad.pd.entries, entryOf: ad.entryOf, free: freeAbilityMode(state.data.game), nav: i >= 0 ? { i, n: ad.list.length } : null, tab: ad.tab });
  dlg.innerHTML = html;
  wireDetailTabs(dlg, ad);
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  const go = d => { const next = ad.list[i + d]; if (next) openAbility(next, opener); };
  for (const b of dlg.querySelectorAll('[data-nav]')) b.addEventListener('click', () => go(+b.dataset.nav));
  dlg.querySelector('.mon').addEventListener('click', e => {
    const mon = e.target.closest('[data-mon]');
    if (mon) return openDetail(state.all[+mon.dataset.mon], opener);
    const sp = e.target.closest('[data-pdx-entry]');
    if (sp) return openSpecies(ad.pd.entries[+sp.dataset.pdxEntry], opener);
    const more = e.target.closest('[data-more]');
    if (more) {
      const k = +more.dataset.more;
      const ul = dlg.querySelector(`[data-list="${k}"]`);
      ul.insertAdjacentHTML('beforeend', ad.A.learnerChips(lists[k], new Map(ad.pd.entries.map((x, j) => [x, j])), new Set(state.all.filter(m => !m.egg).map(ad.entryOf).filter(Boolean)), ad.A.LEARNER_SHOW));
      more.remove();
    }
  });
  dlg.onkeydown = e => {
    if (!dlg.querySelector('[data-nav]') || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  stickyName(dlg);
  const place = () => { const tabs = dlg.querySelector('.pdx-tabs'); if (tabs) tabs.style.top = `${dlg.querySelector('.sheet-bar').offsetHeight - 16}px`; };
  if (wasOpen) { place(); dlg.scrollTop = 0; return; }
  showSheet(dlg, opener);
  place();
}

/** Detalhe de um golpe da Golpedex (na janela do detalhe). */
async function openMove(row, opener) {
  if (!row) return;
  const md = await movesState();
  const dlg = document.getElementById('detail');
  const wasOpen = dlg.open;
  const i = md.list.indexOf(row);
  const { html, lists } = md.M.moveDetail(row, { T, dex: md.dex, learners: md.learners, all: state.all, entries: md.pd.entries, entryOf: md.entryOf, nav: i >= 0 ? { i, n: md.list.length } : null, tab: md.tab });
  dlg.innerHTML = html;
  wireDetailTabs(dlg, md);
  const text = dlg.querySelector('[data-mtext]');
  moveText(row.id, tipCtx()).then(r => {
    if (!text.isConnected) return;
    text.textContent = r.text || t('Sem descrição para este golpe.');
    if (r.note) text.insertAdjacentHTML('beforeend', `<small class="tip-note">${R.esc(r.note)}</small>`);
  }).catch(() => { text.textContent = t('Sem descrição para este golpe.'); });
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  const go = d => { const next = md.list[i + d]; if (next) openMove(next, opener); };
  for (const b of dlg.querySelectorAll('[data-nav]')) b.addEventListener('click', () => go(+b.dataset.nav));
  dlg.querySelector('.mon').addEventListener('click', e => {
    const mon = e.target.closest('[data-mon]');
    if (mon) return openDetail(state.all[+mon.dataset.mon], opener);
    const sp = e.target.closest('[data-pdx-entry]');
    if (sp) return openSpecies(md.pd.entries[+sp.dataset.pdxEntry], opener);
    const more = e.target.closest('[data-more]');
    if (more) {
      const k = +more.dataset.more;
      const ul = dlg.querySelector(`[data-list="${k}"]`);
      ul.insertAdjacentHTML('beforeend', md.M.learnerChips(lists[k], new Map(md.pd.entries.map((x, j) => [x, j])), new Set(state.all.filter(m => !m.egg).map(md.entryOf).filter(Boolean)), md.M.LEARNER_SHOW));
      more.remove();
    }
  });
  dlg.onkeydown = e => {
    if (!dlg.querySelector('[data-nav]') || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  stickyName(dlg);
  const place = () => { const tabs = dlg.querySelector('.pdx-tabs'); if (tabs) tabs.style.top = `${dlg.querySelector('.sheet-bar').offsetHeight - 16}px`; };
  if (wasOpen) { place(); dlg.scrollTop = 0; return; }
  showSheet(dlg, opener);
  place();
}

/** Detalhe de uma espécie da Pokédex (na janela do detalhe). */
async function openSpecies(entry, opener) {
  if (!entry) return;
  const pd = await pokedexState();
  const dlg = document.getElementById('detail');
  const wasOpen = dlg.open;
  const owned = pd.P.ownedOf(entry, state.all);
  const i = pd.list.indexOf(entry);
  const ranks = pd.P.statRanks(pd.entries);
  dlg.innerHTML = pd.P.speciesDetail(entry, T, { caught: pd.caught, owned, nav: i >= 0 ? { i, n: pd.list.length } : null, tab: pd.tab, ranks, level: pd.statLv || 100 });
  markCurrent(i);
  // Abas: a escolhida vale para as próximas espécies (‹ ›); a barra das abas fica presa embaixo da barra do nome
  const tabs = dlg.querySelector('.pdx-tabs');
  const setTab = (k, remember = true) => {
    const btn = tabs.querySelector(`[data-ptab="${k}"]`);
    if (!btn || btn.hidden) return;
    if (remember) pd.tab = k;
    for (const b of tabs.querySelectorAll('[data-ptab]')) b.setAttribute('aria-selected', String(b === btn));
    for (const p of dlg.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== k;
    // Rolou para baixo do cabeçalho: a aba nova começa no topo, logo embaixo das abas
    const top = tabs.offsetTop - parseFloat(tabs.style.top || 0);
    if (dlg.scrollTop > top) dlg.scrollTop = top;
  };
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-ptab]'); if (b) setTab(b.dataset.ptab); });
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.stopPropagation();
    const list = [...tabs.querySelectorAll('[data-ptab]:not([hidden])')];
    const at = list.indexOf(document.activeElement);
    const next = list[(at + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    if (next) { setTab(next.dataset.ptab); next.focus(); }
  });
  fillWild(dlg, entry, pd);
  // Competitivo: a aba só aparece com dados; se era a escolhida, abre quando os dados chegam
  fillUsage(dlg, entry, pd).then(has => {
    const b = tabs.querySelector('[data-ptab="usage"]');
    if (!b || !b.isConnected) return;
    b.hidden = !has;
    if (has && pd.tab === 'usage') setTab('usage', false);
  });
  fillDex(dlg, pd.P.speciesMon(entry)).then(() => {
    // Estágios da linha evolutiva viram botões (abrem o detalhe deles)
    for (const node of dlg.querySelectorAll('[data-evo] .evo-node[data-evo-id]:not(.here), [data-dex] .evo-node[data-evo-id]:not(.here)')) {
      if (!evoEntry(pd, node.dataset.evoId)) continue;
      node.classList.add('evo-link');
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
    }
  });
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  const go = d => { const next = pd.list[i + d]; if (next) openSpecies(next, opener); };
  for (const b of dlg.querySelectorAll('[data-nav]')) b.addEventListener('click', () => go(+b.dataset.nav));
  dlg.querySelector('[data-cmp]').addEventListener('click', () => {
    setCompare(entry);
    dlg.close();
  });
  const mon = dlg.querySelector('.mon');
  const openEvo = node => { const e = evoEntry(pd, node.dataset.evoId); if (e) openSpecies(e, opener); };
  mon.addEventListener('click', e => {
    // Brilhante: troca o retrato (o normal de volta se a imagem shiny não existir)
    const sh = e.target.closest('[data-shiny]');
    if (sh) {
      const on = sh.getAttribute('aria-pressed') !== 'true';
      const img = sh.parentElement.querySelector('img');
      img.dataset.next = sh.dataset.normal;
      img.src = on ? sh.dataset.shiny : sh.dataset.normal;
      sh.setAttribute('aria-pressed', String(on));
      return;
    }
    // Faixa dos stats no Nv. 100 ou 50 (vale para as próximas espécies)
    const lv = e.target.closest('[data-stat-lv]');
    if (lv) {
      pd.statLv = +lv.dataset.statLv;
      mon.querySelector('[data-stats]').outerHTML = pd.P.baseStatsHtml(entry.species, ranks, pd.statLv);
      mon.querySelector(`[data-stat-lv="${pd.statLv}"]`)?.focus();
      return;
    }
    const b = e.target.closest('[data-own]');
    if (b) return openDetail(owned[+b.dataset.own], opener);
    const ab = e.target.closest('[data-mu-ab]');
    if (ab) {
      mon.querySelector('[data-mu]').innerHTML = pd.P.matchupHtml(entry, T, ab.dataset.muAb || null);
      mon.querySelector(`[data-mu-ab="${CSS.escape(ab.dataset.muAb)}"]`)?.focus();
      return;
    }
    const mate = e.target.closest('[data-pdx-entry]');
    if (mate) return openSpecies(pd.entries[+mate.dataset.pdxEntry], opener);
    // Golpe da aba Golpes: abre o detalhe dele na Golpedex
    const mv = e.target.closest('[data-open-move]');
    if (mv) return movesState().then(md => openMove(md.rows.find(r => r.id === +mv.dataset.openMove), opener)).catch(err => console.error(err));
    const node = e.target.closest('.evo-link');
    if (node) openEvo(node);
  });
  mon.addEventListener('keydown', e => {
    const node = e.target.closest('.evo-link');
    if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEvo(node); }
  });
  // Setas do teclado: anterior/próxima (fora dos campos e das listas que rolam para o lado)
  dlg.onkeydown = e => {
    if (!dlg.querySelector('[data-nav]') || e.target.closest('input, select, textarea, .evo, .wild-map')) return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  };
  swipeNav(mon, go);
  stickyName(dlg);
  const place = () => { tabs.style.top = `${dlg.querySelector('.sheet-bar').offsetHeight - 16}px`; };
  if (wasOpen) { place(); dlg.scrollTop = 0; return; }
  if (!openSide(dlg, opener)) showSheet(dlg, opener);
  place();
}

/** Na lista da Pokédex, marca a espécie aberta no detalhe (o painel do lado, no computador). */
function markCurrent(i) {
  for (const b of document.querySelectorAll('#pdx-results [aria-current]')) b.removeAttribute('aria-current');
  if (i >= 0) document.querySelector(`#pdx-results [data-pdx="${i}"]`)?.setAttribute('aria-current', 'true');
}

/**
 * Celular: arrastar o detalhe para o lado passa para a próxima/anterior da lista (como ‹ ›). Não vale começando em algo
 * que rola para o lado (linha evolutiva, mapa, abas) nem num gesto mais vertical que horizontal.
 */
function swipeNav(el, go) {
  let x0 = null, y0 = 0;
  el.addEventListener('touchstart', e => {
    const tch = e.touches[0];
    x0 = e.touches.length === 1 && !e.target.closest('.evo, .wild-map, .bt-tabs, input, select, .mu-abs') ? tch.clientX : null;
    y0 = tch.clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const tch = e.changedTouches[0];
    const dx = tch.clientX - x0, dy = tch.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// Computador: o detalhe da espécie aberto pela lista da Pokédex fica num painel à direita (sem cobrir a lista)
const SIDE_MQ = '(min-width: 1100px)';
const SIDE_W = 640, SIDE_GAP = 16;

/** Abre o detalhe como painel do lado, se cabe ao lado da lista. @returns {boolean} false = abrir como janela */
function openSide(dlg, opener) {
  const win = document.getElementById('pokedex-win');
  if (!win || !opener || !opener.closest || !opener.closest('#pdx-results') || !window.matchMedia(SIDE_MQ).matches) return false;
  const layout = () => {
    const w = Math.min(SIDE_W, Math.round(window.innerWidth * 0.48));
    const avail = window.innerWidth - w - 2 * SIDE_GAP - win.getBoundingClientRect().left;
    dlg.style.setProperty('--side-w', `${w}px`);
    win.style.setProperty('--pdx-avail', `${Math.max(320, avail)}px`);
    return avail >= 360;
  };
  if (!layout()) return false;
  dlg.classList.add('side');
  win.classList.add('pdx-split');
  const onKey = e => { if (e.key === 'Escape' && dlg.open) dlg.close(); };
  const onResize = () => { if (!window.matchMedia(SIDE_MQ).matches) dlg.close(); else layout(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  dlg.addEventListener('close', () => {
    dlg.classList.remove('side');
    win.classList.remove('pdx-split');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    markCurrent(-1);
    if (opener.isConnected) opener.focus({ preventScroll: true });
  }, { once: true });
  dlg.show();
  return true;
}

// Uso no competitivo (estatísticas do Smogon, as mesmas do montador), num pacote à parte
let usageMod = null;
async function fillUsage(dlg, entry, pd) {
  const slot = dlg.querySelector('[data-usage]');
  if (!slot) return false;
  try {
    const U = await (usageMod ||= import('./pokedex/usage.js').catch(e => { usageMod = null; throw e; }));
    const idx = await U.loadSmogon(state.data.game);
    if (!slot.isConnected) return false;
    slot.innerHTML = U.usageHtml(idx, entry, T, pd.entries);
    return !!slot.innerHTML;
  } catch (e) {
    console.error(e);
    slot.innerHTML = '';
    return false;
  }
}

// Onde encontrar (Quetzal): locais da natureza e o mapa da região, num pacote à parte
let wildMod = null;
const loadWild = () => (wildMod ||= import('./pokedex/wild.js').catch(e => { wildMod = null; throw e; }));
async function fillWild(dlg, entry, pd) {
  const slot = dlg.querySelector('[data-wild]');
  if (!slot) return;
  try {
    const Wm = await loadWild();
    if (!slot.isConnected) return;
    const icons = state.data.summary && state.data.summary.badges && state.data.summary.badges.icons;
    const region = icons ? ({ 1: 'kanto', 9: 'johto', 17: 'hoenn' })[icons[0]] : null;
    const nameOf = id => (pd.entries.find(x => x.id === id) || {}).species || null;
    const caught = pd.caught && entry.nat != null ? pd.caught.has(entry.nat) : null;
    slot.innerHTML = Wm.wildHtml(entry.id, T.quetzal, { region, nameOf, caught });
    Wm.wireWild(slot);
  } catch (e) {
    console.error(e);
    slot.innerHTML = '';
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
    try {
      const res = await askAi(b.dataset.ai, aiOut, b);
      if (res) state.ai = res;
    } finally {
      buttons.forEach((x, i) => { x.disabled = disabled[i]; });
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

// Pedido da IA: o campo de pedido e a opção "Sem lendários e míticos" saíram da janela (decisão do autor)
const aiNote = () => '';

const AI_WAIT = { analyze: 'Analisando a equipe', build: 'Montando a equipe' };

/**
 * Pede à IA (avaliar a equipe atual ou montar uma equipe): monta o pedido, mostra
 * o que vai ser enviado (se o usuário não desligou) e desenha a resposta em `outEl`.
 * @returns {Promise<object|null>} o resultado de sendAi, ou null se o usuário cancelou ou deu erro
 */
async function askAi(kind, outEl, opener) {
  const $ = s => document.getElementById('out').querySelector(s);
  $('#ai-provider').disabled = true;
  try {
    const ai = await import('./ai/index.js');
    // Quetzal/Unbound/SoulGold: golpes por nível (os mesmos do detalhe). Na análise vão no pedido; nas duas, o app
    // confere com eles os golpes que a IA citar
    const game = state.data.game;
    const dex = game && ROM_LEARN.includes(game.id) ? (await loadDex()).dex : null;
    // Monta o pedido e mostra exatamente o que vai ser enviado antes de enviar
    const prep = ai.prepareAi(kind, { all: state.all, T, game, note: aiNote(), dex, free: !!$('#ai-free')?.checked });
    if (!skipConfirm() && !(await confirmSend(ai.confirmHtml(prep), opener))) return null;
    outEl.innerHTML = `<p class="ai-wait"><svg class="ai-spin" viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" shape-rendering="crispEdges"><use href="#logo"/></svg><span class="pixel">${t(AI_WAIT[kind])}</span><span class="dots" aria-hidden="true"></span><br><small>${t('Pode levar até um minuto.')}</small></p>`;
    const res = await ai.sendAi(prep, {
      // Montagem: na segunda etapa a IA escreve os pontos e as dicas com as contas do app sobre a equipe escolhida
      onStep: () => { const w = outEl.querySelector('.ai-wait .pixel'); if (w) w.textContent = t('Escrevendo as dicas'); },
    });
    outEl.innerHTML = res.html;
    if (!state.persist) outEl.querySelector('[data-ai-save]')?.remove();
    outEl.scrollIntoView({ block: 'start' });
    $('#ai-model').value = provider().getModel();
    return res;
  } catch (e) {
    console.error(e);
    const msg = e && e.name === 'AiError' ? e.message : t('Algo deu errado ao falar com o {service}. Tente de novo.', { service: provider().service });
    outEl.innerHTML = `<p class="error">${R.esc(msg)}</p>`;
    if (e && e.code === 'key') { $('#ai-setup').classList.remove('hidden'); $('#ai-main').classList.add('hidden'); }
    return null;
  } finally {
    $('#ai-provider').disabled = false;
  }
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
  // A opção "Sem lendários e míticos" saiu (decisão do autor): apaga a escolha guardada por versões anteriores
  try { localStorage.removeItem('builder-nolegend'); } catch { /* sem armazenamento */ }
  $('#builder-run').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    bOut.innerHTML = `<p class="ai-wait"><svg class="ai-spin" viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" shape-rendering="crispEdges"><use href="#logo"/></svg><span class="pixel">${t('Montando as equipes')}</span><span class="dots" aria-hidden="true"></span></p>`;
    try {
      mod = await import('./builder/index.js');
      // Quetzal/Unbound/SoulGold: golpes por nível da ROM (o montador conta também os golpes que cada um aprende)
      const game = state.data.game;
      const dex = game && ROM_LEARN.includes(game.id) ? (await loadDex()).dex : null;
      // Referência competitiva (duplas dos times do Smogon): sem o pacote (offline na primeira vez), monta sem ela
      const comp = await mod.loadSmogon(game);
      // Equipes de referência do competitivo ([] se o jogo ainda não tem; null se não carregaram): o fluxo principal
      const refs = await mod.loadReferences(game);
      await new Promise(r => setTimeout(r, 30)); // deixa a tela de espera aparecer antes das contas
      // Sem as antigas opções (preparo, ameaças, sem restrição de item): o item é só informado (o jogador dá um jeito de
      // conseguir), então quem tem mega conta com a megapedra nos jogos com a tabela de megas da ROM
      const anyItem = R.MEGA_GAMES.includes(game && game.id);
      state.builder = { results: mod.runBuilder(state.all, T, '', dex, { anyItem, comp, saveGame: game, refs }), i: 0 };
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
    // Abas do resultado (Equipe, Trocas, Estratégia, Original)
    const tab = e.target.closest('[data-bt]');
    if (tab) {
      for (const x of bOut.querySelectorAll('[data-bt]')) x.setAttribute('aria-selected', String(x === tab));
      for (const p of bOut.querySelectorAll('.bt-pane')) p.hidden = p.id !== `bt-pane-${tab.dataset.bt}`;
      const bar = tab.parentElement;
      if (bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start' });
      return;
    }
    // Escolher equipe: a janela com todas as equipes (as que ainda não foram montadas são adaptadas ao escolher)
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const b = state.builder;
      openSheet(mod.pickerHtml(b.results, b.i), pick, sheet => sheet.addEventListener('click', async ev => {
        const f = ev.target.closest('[data-filter]');
        if (f) {
          for (const x of sheet.querySelectorAll('[data-filter]')) x.setAttribute('aria-pressed', String(x === f));
          for (const li of sheet.querySelectorAll('[data-kind]')) li.hidden = f.dataset.filter !== 'all' && li.dataset.kind !== f.dataset.filter;
          // O cabeçalho "Você tem N dos 6" some quando o filtro esconde todas as equipes do grupo
          for (const h of sheet.querySelectorAll('.picker-group')) h.hidden = ![...sheet.querySelectorAll(`[data-kind][data-owned="${h.dataset.owned}"]`)].some(li => !li.hidden);
          return;
        }
        const c = ev.target.closest('[data-choose]');
        if (!c) return;
        document.getElementById('detail').close();
        if (c.dataset.choose[0] === 'c') {
          bOut.querySelector('.builder-current').innerHTML = `<span class="hint">${t('Adaptando a equipe')}<span class="dots" aria-hidden="true"></span></span>`;
          await new Promise(r => setTimeout(r, 30)); // deixa a espera aparecer antes das contas
        }
        if (state.builder !== b) return;
        const k = mod.chooseTeam(b.results, c.dataset.choose);
        show(k >= 0 ? k : b.i);
        bOut.scrollIntoView({ block: 'start' });
      }));
      return;
    }
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
    // Bloco de um membro (original ou adaptada): abre o card dele; dentro do card, "Ver o Pokémon do save" abre o detalhe
    const tile = e.target.closest('[data-sheet]');
    if (tile) {
      const tpl = bOut.querySelector(`template[data-sheet-id="${tile.dataset.sheet}"]`);
      if (tpl) openSheet(tpl.innerHTML, tile, sheet => sheet.addEventListener('click', ev => {
        const b = ev.target.closest('[data-ref]');
        const m = b && cur.byRef.get(b.dataset.ref);
        if (m) openDetail(m, tile);
      }));
      return;
    }
    const card = e.target.closest('[data-ref]');
    if (card) {
      const m = cur.byRef.get(card.dataset.ref);
      if (m) openDetail(m, card);
      return;
    }
    const copy = e.target.closest('[data-ai-copy]');
    if (copy) {
      // Com o moveset do app (Quetzal): os golpes sugeridos, prontos para o Showdown
      const ok = await copyText(showdownTeam(cur.showdown || cur.team));
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

// Descrição do golpe: carrega o arquivo de textos na primeira vez que um golpe é aberto (o da época nos oficiais)
document.addEventListener('toggle', async e => {
  const det = e.target;
  if (!(det instanceof HTMLDetailsElement) || !det.open || !det.classList.contains('move')) return;
  const p = det.querySelector('.move-desc');
  if (!p || p.dataset.loaded) return;
  p.dataset.loaded = '1';
  let r;
  try { r = await moveText(+p.dataset.move, tipCtx()); } catch { delete p.dataset.loaded; return; }
  p.textContent = r.text || t('Sem descrição para este golpe.');
  if (r.note) p.insertAdjacentHTML('beforeend', `<small class="tip-note">${R.esc(r.note)}</small>`);
}, true);

// Nomes de golpes e habilidades com a descrição ao tocar (ui/tips.js), no jogo do save aberto
const tipCtx = () => ({ game: state && state.data.game ? state.data.game.id : null, T });
installTips(tipCtx);

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

/** Card do montador (membro da equipe original ou da adaptada) na mesma janela do detalhe. */
function openSheet(html, opener, wire) {
  const dlg = document.getElementById('detail');
  const wasOpen = dlg.open;
  // O X fica dentro do bloco colorido do card (sem a faixa vazia em cima)
  dlg.innerHTML = `<div class="mon builder-sheet"><button class="btn btn-ghost btn-icon close sheet-x" type="button" data-close aria-label="${t('Fechar')}">✕</button>${html}</div>`;
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  if (wire) wire(dlg.querySelector('.builder-sheet'));
  if (wasOpen) { dlg.scrollTop = 0; return; }
  const scroll = window.scrollY;
  dlg.addEventListener('close', () => {
    opener.focus({ preventScroll: true });
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, { once: true });
  dlg.showModal();
}

/** O nome aparece na barra de cima do detalhe quando o cabeçalho sai da tela. */
function stickyName(dlg) {
  const hero = dlg.querySelector('.mon-hero'), bar = dlg.querySelector('.sheet-bar');
  if (!hero || !bar || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(([e]) => bar.classList.toggle('stuck', !e.isIntersecting), { root: dlg, rootMargin: '-56px 0px 0px 0px' });
  // O título, não o cabeçalho inteiro: em detalhe curto a rolagem acaba com uma fresta do cabeçalho na tela e o nome não aparecia
  io.observe(hero.querySelector('h2') || hero);
  dlg.addEventListener('close', () => io.disconnect(), { once: true });
}

function openDetail(m, opener) {
  const dlg = document.getElementById('detail');
  // Aberto a partir de um card do montador: troca o conteúdo da mesma janela (que já volta para o bloco ao fechar)
  const wasOpen = dlg.open;
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
  stickyName(dlg);
  if (wasOpen) { dlg.scrollTop = 0; return; }
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
// soulgold-learn.json) no lugar do dex.json; a evolução vem de T.quetzal / T.unbound / T.soulgold.
// No Quetzal, também os golpes por tutor e de ovo (quetzal-teach.json); no SoulGold, por TM/HM, tutor e ovo (soulgold-teach.json)
const dexCache = {}, dexLoaded = new Set();
const ROM_LEARN = ['quetzal', 'unbound', 'soulgold']; // jogos com golpes por nível da ROM (também usados pela IA)
const dexKey = () => (T.quetzal ? 'quetzal' : T.unbound ? 'unbound' : T.soulgold ? 'soulgold' : 'dex');
function loadDex() {
  const key = dexKey();
  if (!dexCache[key]) {
    const data = key === 'quetzal' ? import('./data/quetzal-learn.json') : key === 'unbound' ? import('./data/unbound-learn.json')
      : key === 'soulgold' ? import('./data/soulgold-learn.json') : import('./data/dex.json');
    // Quetzal: também os golpes por tutor (menu NOVO MOV. do jogo) e de ovo (quetzal-teach.json); SoulGold: TM/HM, tutor e ovo
    const teach = key === 'quetzal' ? import('./data/quetzal-teach.json') : key === 'soulgold' ? import('./data/soulgold-teach.json') : null;
    dexCache[key] = Promise.all([data, import('./ui/dex.js'), teach]).then(([d, ui, tc]) => ({
      dex: key === 'quetzal' ? ui.quetzalLearnDex(d.default, tc && tc.default) : key === 'unbound' ? ui.unboundLearnDex(d.default, T.unbound)
        : key === 'soulgold' ? ui.soulgoldLearnDex(d.default, T.soulgold, tc && tc.default) : d.default,
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
    // Detalhe da espécie (Pokédex): a evolução fica no Resumo (`[data-evo]`) e os golpes na aba deles
    const evoSlot = dlg.querySelector('[data-evo]');
    if (!dexLoaded.has(key)) for (const x of [slot, evoSlot]) if (x) x.innerHTML = `<p class="hint">${t('Carregando evolução e golpes…')}</p>`;
    const D = await loadDex();
    dexLoaded.add(key);
    if (!slot.isConnected) return; // o detalhe já foi trocado
    if (evoSlot) {
      evoSlot.innerHTML = D.ui.evolutionHtml(m, D.dex, T);
      slot.innerHTML = D.ui.learnsetHtml(m, D.dex, T, { link: true }) || `<p class="hint">${t('Sem lista de golpes para esta espécie.')}</p>`;
      slot.querySelector('details')?.setAttribute('open', ''); // na aba própria, a primeira lista já aberta
    } else slot.innerHTML = D.ui.evolutionHtml(m, D.dex, T) + D.ui.learnsetHtml(m, D.dex, T);
    // Linha mais larga que a tela (rola para o lado): começa mostrando o Pokémon aberto, não sempre o primeiro estágio
    const evo = dlg.querySelector('.evo'), here = evo && evo.querySelector('.here');
    if (here && evo.scrollWidth > evo.clientWidth) evo.scrollLeft = here.getBoundingClientRect().left - evo.getBoundingClientRect().left - (evo.clientWidth - here.offsetWidth) / 2;
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
  const { html, mons } = changesWin(diffSaves(older, newer, evolutionCheck(T)), base, cur.history.list.length, { swapped });
  cur.history.baseId = base.id;
  const slot = document.getElementById('changes-slot');
  slot.innerHTML = html;
  slot.onclick = e => {
    const b = e.target.closest('[data-ch]');
    if (b) { openDetail(mons[+b.dataset.ch], b); return; }
    const tab = e.target.closest('[data-ch-tab]');
    if (tab) {
      slot.querySelectorAll('[data-ch-tab]').forEach(x => x.setAttribute('aria-selected', String(x === tab)));
      slot.querySelectorAll('.ch-pane').forEach(p => { p.hidden = p.id !== 'ch-pane-' + tab.dataset.chTab; });
      return;
    }
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
  const view = { gen: 0, filter: 'all', mode: 'list', region: null };
  // Por lugar (Quetzal): pacote e contas só na primeira vez que a aba é aberta
  let hunt = null;
  const huntView = () => {
    if (!hunt || !hunt.data) return null;
    const icons = state.data.summary && state.data.summary.badges && state.data.summary.badges.icons;
    const home = icons ? ({ 1: 'kanto', 9: 'johto', 17: 'hoenn' })[icons[0]] : null;
    return hunt.mod.huntHtml(hunt.data, info, T.quetzal, name, view, home);
  };
  const draw = () => {
    dlg.innerHTML = mod.dexWinHtml(info, name, state.data.game && state.data.game.id, view, view.mode === 'place' ? huntView() : null);
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  };
  const openHunt = async () => {
    if (hunt) return;
    hunt = {};
    try {
      hunt.mod = await import('./dex/hunt.js');
      hunt.data = hunt.mod.huntPlaces(info, T.quetzal);
    } catch (err) { console.error(err); hunt = null; return; }
    if (dlg.open && view.mode === 'place') { draw(); dlg.querySelector('[data-dex-mode="place"]')?.focus(); }
  };
  dlg.onclick = async e => {
    // Uma espécie que falta: os dados dela na Pokédex do jogo (por cima desta janela); por lugar, a forma exata
    const sp = e.target.closest('[data-dex-nat]');
    if (sp) {
      try {
        const pd = await pokedexState();
        const n = +sp.dataset.dexNat, id = sp.dataset.dexId ? +sp.dataset.dexId : null;
        openSpecies((id != null && pd.entries.find(x => x.id === id)) || pd.entries.find(x => x.nat === n && !x.species.form) || pd.entries.find(x => x.nat === n), sp);
      } catch (err) { console.error(err); }
      return;
    }
    // Um lugar: abre o que falta nele e destaca no mapa (o último aberto)
    const pl = e.target.closest('.hunt-place > summary');
    if (pl) {
      const det = pl.parentElement, reg = det.closest('.wild-region');
      const on = !det.open;
      reg.querySelectorAll('.hunt-place > summary').forEach(x => x.setAttribute('aria-pressed', String(on && x === pl)));
      reg.querySelectorAll('.wild-pin').forEach(p => p.classList.toggle('on', on && p.dataset.pin === det.dataset.pin));
      reg.classList.toggle('focus', on);
      return;
    }
    const f = e.target.closest('[data-dex-filter]'), g = e.target.closest('[data-dex-gen]');
    const md = e.target.closest('[data-dex-mode]'), rg = e.target.closest('[data-hunt-region]');
    let focus;
    if (f) { view.filter = f.dataset.dexFilter; view.gen = 0; focus = `[data-dex-filter="${view.filter}"]`; }
    else if (g) { view.gen = +g.dataset.dexGen; focus = `[data-dex-gen="${view.gen}"]`; }
    else if (md) { view.mode = md.dataset.dexMode; focus = `[data-dex-mode="${view.mode}"]`; if (view.mode === 'place') openHunt(); }
    else if (rg) { view.region = rg.dataset.huntRegion; focus = `[data-hunt-region="${view.region}"]`; }
    else return;
    draw();
    dlg.querySelector(focus)?.focus();
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
  const evolves = evolutionCheck(T);
  cur.teams = { list, located: list.map(team => V.locateTeam(team, cur.data, evolves)) };
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

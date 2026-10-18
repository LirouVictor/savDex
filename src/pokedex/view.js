// Pokédex do jogo (janela em Ferramentas; este pacote só é carregado ao abrir): busca entre todas as espécies do jogo
// do save e o detalhe de cada uma (stats base, habilidades, dano recebido e, carregados à parte como no detalhe de um
// Pokémon, a evolução e os golpes). Filtro por golpe: os golpes por nível, tutor/TM e ovo do mesmo `dex` do detalhe.

import { t, getLang } from '../i18n.js';
import { esc, monHeader, matchupTable, tipBtn, muLabel, infoBtn } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import { SHOWDOWN_ORDER, STAT_LABEL, formName } from '../export.js';
import { BASE_ORDER } from '../parser/stats.js';
import { moveInfo } from '../parser/describe.js';
import { dexIds } from '../ui/dex.js';
import { defenseMatchups, defenseWithAbility, abilityChangesDefense } from '../analysis.js';
import speciesData from '../data/species.json';
import { pokedexEntries, bst } from './entries.js';

// Mesma chave de obtainable() em wild.js (que fica em outro pacote, com os encontros)
const obtainKey = (nat, sp) => `${nat}|${sp.types.join('/')}|${(sp.baseStats || []).join(',')}`;

export { pokedexEntries };

export const PAGE = 21; // 3 colunas no computador
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pokémon "de mentira" com só a espécie, no formato que o detalhe (evolução, golpes, dano recebido) usa. */
export function speciesMon(e) {
  return { speciesId: e.id, species: e.species, dexNo: e.nat, moves: [], level: null, gender: null, shiny: false, hasNickname: false, nickname: e.species.name };
}

/** Os Pokémon do save que são desta espécie (mesma forma; ovos não). */
export function ownedOf(e, all) {
  const form = e.species.form || null;
  return all.filter(m => m.speciesId === e.id && !m.egg && (m.species.form || null) === form);
}

/** Texto pesquisável: nome, forma e habilidades. */
const hay = e => norm([e.species.name, e.species.form, ...e.species.abilities].filter(Boolean).join(' | '));

/** Golpes que a espécie aprende (por nível, tutor/TM e ovo), pelos IDs usados nos Pokémon do save. */
export function learnable(e, dex) {
  if (!dex) return [];
  const pid = dex.rom ? e.id : dexIds(speciesMon(e), dex).pid;
  const out = [];
  const lv = pid ? dex.learn[pid] : null;
  if (lv) for (let i = 2; i < lv.length; i += 2) out.push(lv[i]);
  if (dex.tutor && dex.tutor[e.id]) out.push(...dex.tutor[e.id]);
  if (dex.egg && dex.egg[e.id]) out.push(...dex.egg[e.id]);
  return out;
}

/**
 * Os golpes que casam com o texto (o nome exato, se houver; senão os que contêm o texto), entre os que alguma espécie
 * aprende. @returns {Set<number>|null} null = sem filtro de golpe
 */
export function movesMatching(q, entries, dex, T) {
  const k = norm(q).trim();
  if (!k) return null;
  const names = new Map();
  for (const e of entries) for (const id of learnable(e, dex)) if (!names.has(id)) names.set(id, norm(moveInfo(id, T).name));
  const exact = [...names].filter(([, n]) => n === k).map(([id]) => id);
  return new Set(exact.length ? exact : [...names].filter(([, n]) => n.includes(k)).map(([id]) => id));
}

/** Vários golpes separados por vírgula ("Surf, Ice Beam"): um conjunto por golpe; a espécie precisa aprender todos. */
export function movesMatchingAll(q, entries, dex, T) {
  const sets = String(q ?? '').split(',').map(x => movesMatching(x, entries, dex, T)).filter(Boolean);
  return sets.length ? sets : null;
}

// Última espécie de cada geração na Dex Nacional
const GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
/** Geração da espécie pela Dex Nacional (formas regionais contam pela espécie); null = espécie própria do jogo. */
export const genOf = nat => (nat == null ? null : GEN_END.findIndex(n => nat <= n) + 1 || null);

// Lendários e míticos (PokeAPI), pelo nome sem pontuação: o mesmo em todos os jogos (Ho-Oh → hooh)
const LEGENDARY = new Set(speciesData.legendary);
export const isLegendary = sp => LEGENDARY.has(String(sp.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
const isMega = sp => /^(Mega|Primal)\b/.test(sp.form || '');
const isRegional = sp => /^(Alola|Galar|Hisui|Paldea)\b/.test(sp.form || '');

/**
 * Fêmeas em %, pela taxa da espécie: `genderRate` em oitavos (−1 sem gênero) ou `genderByte` dos hacks (255 sem
 * gênero, 0 só machos, 254 só fêmeas). @returns {number|null} null = sem gênero; undefined = não se sabe
 */
export function femalePct(sp) {
  if (sp.genderRate != null) return sp.genderRate < 0 ? null : sp.genderRate * 12.5;
  if (sp.genderByte != null) {
    const b = sp.genderByte;
    if (b === 255) return null;
    if (b === 0) return 0;
    if (b >= 254) return 100;
    return Math.round((b + 1) / 256 * 1000) / 10;
  }
  return undefined;
}

/**
 * Quem ainda evolui: evoluções da ROM (Quetzal, Unbound, SoulGold) ou as linhas do dex.json (jogos oficiais; só
 * evoluções que existem no jogo, até a última espécie da lista). @returns {((e) => boolean)|null} null = sem os dados
 */
export function evolvesFn(T, dex, entries) {
  const R = T.quetzal || T.unbound || T.soulgold;
  if (R && R.evolutions) return e => (R.evolutions[e.id] || []).some(x => x[2]);
  if (!dex || !dex.chains) return null;
  const last = Math.max(...entries.map(e => e.nat || 0));
  return e => {
    const c = dex.chains[dex.speciesChain[e.nat]];
    return !!c && c.some(n => n[1] === e.nat && n[0] <= last);
  };
}

/** O filtro de evolução precisa do dex.json (jogos oficiais, carregado à parte). */
export const evoNeedsDex = T => !(T.quetzal || T.unbound || T.soulgold);

const statSort = i => (a, b) => b.species.baseStats[i] - a.species.baseStats[i];
const SORTS = {
  dex: null, // a ordem da lista
  name: (a, b) => a.species.name.localeCompare(b.species.name),
  bst: (a, b) => bst(b.species) - bst(a.species),
  ...Object.fromEntries(BASE_ORDER.map((k, i) => [k, statSort(i)])),
};

/**
 * @param {Array} entries pokedexEntries
 * @param {{ q?: string, type?: string, type2?: string, caught?: ''|'yes'|'no', sort?: string,
 *   moves?: Set<number>|Array<Set<number>>|null, gen?: string, evo?: ''|'yes'|'no', cat?: string, resist?: string,
 *   stat?: string, min?: number|string }} f `type2`: '' qualquer, 'none' só um tipo, ou o tipo; `gen`: '1'–'9' ou
 *   'hack' (espécies próprias do jogo); `evo`: 'yes' ainda evolui, 'no' não evolui mais; `cat`: 'legend', 'nolegend',
 *   'mega', 'regional', 'base'; `resist`: tipo de ataque que ela resiste ou é imune (só pelos tipos); `stat` + `min`:
 *   stat base (hp…spe ou bst) no mínimo `min`; `where` (Quetzal): 'wild' aparece nos encontros, 'evo' aparece ou
 *   evolui de quem aparece, 'none' nenhum dos dois
 * @param {{ caught?: Set<number>|null, dex?: object|null, T?: object, obtain?: Map<string, string>|null }} ctx
 *   `obtain`: obtainable() de wild.js
 */
export function filterEntries(entries, f, ctx = {}) {
  const terms = norm(f.q).split(/\s+/).filter(Boolean);
  const moveSets = !f.moves ? null : f.moves instanceof Set ? [f.moves] : f.moves;
  const evolves = f.evo && ctx.T ? evolvesFn(ctx.T, ctx.dex, entries) : null;
  const chart = f.resist && ctx.T ? { types: ctx.T.types, chart: ctx.T.typechart } : null;
  const min = Number(f.min);
  const si = !f.min || !Number.isFinite(min) ? -1 : f.stat === 'bst' || !f.stat ? 6 : BASE_ORDER.indexOf(f.stat);
  const out = entries.filter(e => {
    const sp = e.species;
    if (f.type && !sp.types.includes(f.type)) return false;
    if (f.type2 === 'none' && sp.types.length > 1) return false;
    if (f.type2 && f.type2 !== 'none' && (!sp.types.includes(f.type2) || (f.type2 === f.type && sp.types.length > 1))) return false;
    if (f.caught && ctx.caught && e.nat != null && ctx.caught.has(e.nat) !== (f.caught === 'yes')) return false;
    if (f.caught && ctx.caught && e.nat == null) return false;
    if (f.where && ctx.obtain) {
      const how = ctx.obtain.get(obtainKey(e.nat ?? `q${e.id}`, sp));
      if (f.where === 'none' ? how : f.where === 'wild' ? how !== 'wild' : !how) return false;
    }
    if (f.gen && String(genOf(e.nat) ?? 'hack') !== f.gen) return false;
    if (f.cat === 'legend' && !isLegendary(sp)) return false;
    if (f.cat === 'nolegend' && isLegendary(sp)) return false;
    if (f.cat === 'mega' && !isMega(sp)) return false;
    if (f.cat === 'regional' && !isRegional(sp)) return false;
    if (f.cat === 'base' && sp.form) return false;
    if (si >= 0 && (si === 6 ? bst(sp) : sp.baseStats[si]) < min) return false;
    if (evolves && evolves(e) !== (f.evo === 'yes')) return false;
    if (chart) {
      const g = defenseMatchups(sp.types, chart);
      if (![...g[0.5], ...g[0.25], ...g[0]].includes(f.resist)) return false;
    }
    if (terms.length) { const h = hay(e); if (!terms.every(x => h.includes(x))) return false; }
    if (moveSets) { const ls = new Set(learnable(e, ctx.dex)); if (!moveSets.every(ms => [...ms].some(id => ls.has(id)))) return false; }
    return true;
  });
  const sort = SORTS[f.sort];
  return sort ? out.slice().sort(sort) : out;
}

const numLabel = e => (e.nat != null ? '#' + String(e.nat).padStart(4, '0') : '');
const formLabel = sp => (sp.form ? ` <span class="form">(${esc(sp.form === '?' ? t('forma ?') : formName(sp.form))})</span>` : '');

/**
 * Uma linha da lista (o mesmo estilo dos resultados da Buscar). `prev` = a entrada da linha de cima: a forma (Mega,
 * regional…) logo depois da própria espécie entra recuada, só com o nome da forma.
 */
export function entryRow(e, i, caught, prev = null) {
  const sp = e.species;
  const got = caught && e.nat != null && caught.has(e.nat);
  const sub = !!(sp.form && prev && prev.nat != null && prev.nat === e.nat);
  const name = sub ? `<b><span class="sr">${esc(sp.name)} </span>${esc(sp.form === '?' ? t('forma ?') : formName(sp.form))}</b>`
    : `<b>${esc(sp.name)}</b>${formLabel(sp)}`;
  return `<li><button class="result pdx-row${sub ? ' pdx-form' : ''}" type="button" data-pdx="${i}">
    <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
    <span class="r-main">${!sub && numLabel(e) ? `<span class="pdx-no">${numLabel(e)}</span>` : ''}${name}${got ? ` <span class="pdx-got" title="${esc(t('Capturado (Pokédex do save)'))}">✓<span class="sr"> ${t('capturado')}</span></span>` : ''}
      <span class="r-sub pdx-sub">${sp.types.map(x => `<span class="type t-${esc(x)}">${esc(x)}</span>`).join('')}</span></span>
    <span class="pdx-bst" title="${esc(t('Total dos stats base'))}">${bst(sp)}<small>BST</small></span>
  </button></li>`;
}

/** Stats base em barras (escala até 255, como nas Pokédex dos jogos), com o total. */
function baseStatsHtml(sp) {
  const v = Object.fromEntries(BASE_ORDER.map((k, i) => [k, sp.baseStats[i]]));
  const rows = SHOWDOWN_ORDER.map(k => `<tr><th scope="row">${STAT_LABEL[k]}</th><td class="num">${v[k]}</td>
    <td><div class="bar"><i style="width:${Math.round(Math.min(1, v[k] / 255) * 100)}%;--h:${Math.round(Math.min(1, v[k] / 150) * 120)}"></i></div></td></tr>`).join('');
  return `<section class="dsec"><h3>${t('Stats base')}</h3>
    <table class="stats pdx-stats"><tbody>${rows}<tr class="pdx-total"><th scope="row">${t('Total')}</th><td class="num">${bst(sp)}</td><td></td></tr></tbody></table></section>`;
}

function abilitiesHtml(sp) {
  const [a1, a2, ha] = sp.abilities;
  const row = (k, v) => `<div><dt>${k}</dt><dd>${tipBtn('a', v, `<b>${esc(v)}</b>`)}</dd></div>`;
  const list = [a1 && row(t('Habilidade 1'), a1), a2 && a2 !== a1 && row(t('Habilidade 2'), a2), ha && ha !== a1 && ha !== a2 && row(t('Oculta'), ha)].filter(Boolean).join('');
  if (!list) return '';
  const about = sp.abilitiesProbable ? ` ${infoBtn(t('Habilidades'), t('Habilidades dos jogos mais recentes (PokeAPI); podem ser diferentes neste jogo.'))}` : '';
  return `<section class="dsec"><h3>${t('Habilidades')}${about}</h3><dl class="facts-grid">${list}</dl></section>`;
}

/** Capturado, geração, gênero, categoria e total dos stats: etiquetas embaixo do nome (antes, uma seção "Dados"). */
function chipsHtml(e, caught) {
  const sp = e.species;
  const g = genOf(e.nat);
  const f = femalePct(sp);
  const fmt = n => (getLang() === 'en' ? String(n) : String(n).replace('.', ','));
  const gender = f === undefined ? null : f === null ? t('Sem gênero') : f === 0 ? t('Só machos') : f === 100 ? t('Só fêmeas')
    : `♂ ${fmt(Math.round((100 - f) * 10) / 10)}% · ♀ ${fmt(f)}%`;
  const kind = isLegendary(sp) ? t('Lendário ou mítico') : isMega(sp) ? t('Megaevolução') : isRegional(sp) ? t('Forma regional') : null;
  const chip = (v, title = '', cls = '') => `<li class="pdx-chip${cls}"${title ? ` title="${esc(title)}"` : ''}>${v}</li>`;
  const got = caught && e.nat != null ? caught.has(e.nat) : null;
  return `<ul class="pdx-chips">
    ${got == null ? '' : got ? chip(`✓ ${t('Capturado')}`, t('Capturado na Pokédex do save'), ' on') : chip(t('Não capturado'), t('Ainda não capturado na Pokédex do save'))}
    ${chip(g ? t('Geração {n}', { n: g }) : t('Própria do jogo'))}
    ${gender ? chip(esc(gender), t('Gênero')) : ''}
    ${kind ? chip(kind) : ''}
    ${chip(`BST ${bst(sp)}`, t('Total dos stats base'))}
  </ul>`;
}

/** Os Pokémon do save desta espécie (tocar abre o detalhe deles). */
function ownedHtml(owned) {
  if (!owned.length) return '';
  const items = owned.slice(0, 12).map((m, i) => {
    const where = m.location === 'party' ? `${t('Equipe')} ${m.slot}` : `${esc(m.where)} · ${m.slot}`;
    return `<li><button class="result" type="button" data-own="${i}">
      <img data-sprite="1" src="${esc(iconSrc(m.species))}"${m.species.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
      <span class="r-main"><b>${esc(m.hasNickname ? m.nickname : m.species.name)}</b>${m.shiny ? ' <span class="shiny">★</span>' : ''}<span class="r-sub">${where}</span></span>
      <span class="r-lv">${t('Nv.')} ${m.level ?? '?'}</span></button></li>`;
  }).join('');
  return `<section class="dsec"><h3>${t('No seu save')} <span class="learn-count">${owned.length}</span></h3><ul class="results pdx-owned">${items}</ul>
    ${owned.length > 12 ? `<p class="hint">${t('Mostrando 12 de {n}. Use a Buscar para ver todos.', { n: owned.length })}</p>` : ''}</section>`;
}

/**
 * Dano recebido com a escolha da habilidade: as da espécie que mudam o dano (Levitate, Thick Fat…) viram botões; sem
 * nenhuma, só pelos tipos. @param {string|null} ab a habilidade escolhida (null = só os tipos)
 */
export function matchupHtml(e, T, ab = null) {
  const opts = [...new Set(e.species.abilities.filter(abilityChangesDefense))];
  const table = matchupTable(speciesMon(e), T, opts.includes(ab) ? ab : null);
  if (!opts.length || !table) return table;
  const btn = (v, label) => `<button type="button" class="btn btn-ghost btn-small" data-mu-ab="${esc(v)}" aria-pressed="${(v || null) === (ab || null)}">${esc(label)}</button>`;
  const chips = `<div class="mu-abs" role="group" aria-label="${esc(t('Habilidade'))}">${btn('', t('Só os tipos'))}${opts.map(a => btn(a, a)).join('')}</div>`;
  return table.replace('</h3>', `</h3>${chips}`);
}

/** As abas do detalhe da espécie (a do competitivo só aparece quando há dados; a de onde encontrar, só no Quetzal). */
export const TABS = ['sum', 'wild', 'moves', 'usage'];

/**
 * Detalhe de uma espécie (na janela do detalhe), em abas: Resumo (evolução, habilidades, stats, dano recebido, os do
 * save), Onde encontrar (`[data-wild]`), Golpes (`[data-dex]`) e Competitivo (`[data-usage]`). A evolução entra no
 * `[data-evo]` e os golpes no `[data-dex]` depois, carregados à parte.
 * @param {{ caught?: Set<number>|null, owned?: Array, nav?: { i: number, n: number }|null, tab?: string }} opts `nav`:
 *   posição na lista filtrada (anterior/próxima); `tab`: a aba aberta (a última escolhida)
 */
export function speciesDetail(e, T, { caught = null, owned = [], nav = null, tab = 'sum' } = {}) {
  const sp = e.species;
  const tc = sp.types[0] ? ` t-${esc(sp.types[0])}` : '';
  const arrows = nav && nav.n > 1 ? `<button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="-1" aria-label="${t('Anterior')}"${nav.i <= 0 ? ' disabled' : ''}>‹</button>
    <span class="pdx-pos" title="${esc(t('{i} de {n} na lista', { i: nav.i + 1, n: nav.n }))}">${nav.i + 1}/${nav.n}</span>
    <button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="1" aria-label="${t('Próxima')}"${nav.i >= nav.n - 1 ? ' disabled' : ''}>›</button>` : '';
  const tabs = [['sum', t('Resumo')], T.quetzal && ['wild', t('Onde encontrar')], ['moves', t('Golpes')], ['usage', t('Competitivo')]].filter(Boolean);
  const cur = tabs.some(([k]) => k === tab) && tab !== 'usage' ? tab : 'sum'; // o competitivo só depois de saber se há dados
  const tabBtn = ([k, label]) => `<button type="button" role="tab" class="pdx-tab" data-ptab="${k}" id="pdx-tab-${k}" aria-controls="pdx-pane-${k}" aria-selected="${k === cur}"${k === 'usage' ? ' hidden' : ''}>${label}</button>`;
  const pane = (k, html) => `<div class="pdx-pane" role="tabpanel" id="pdx-pane-${k}" aria-labelledby="pdx-tab-${k}" data-pane="${k}"${k === cur ? '' : ' hidden'}>${html}</div>`;
  return `<div class="sheet-bar pdx-sheet-bar${tc}">
    <b class="sheet-bar-name" aria-hidden="true">${esc(sp.name)}</b>
    ${arrows}
    <button class="btn btn-ghost btn-icon pdx-vs" type="button" data-cmp aria-label="${t('Comparar com outra espécie')}" title="${t('Comparar com outra espécie')}">VS</button>
    <button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
  </div>
  <div class="mon pdx-detail">
    <div class="mon-hero${tc}">
      ${monHeader(speciesMon(e), 'h2', ' id="detail-title"').replace(/<\/div>\s*<\/div>$/, `${chipsHtml(e, caught)}</div></div>`)}
    </div>
    <div class="bt-tabs pdx-tabs" role="tablist" aria-label="${esc(t('Partes do detalhe'))}">${tabs.map(tabBtn).join('')}</div>
    ${pane('sum', `<div class="pdx-sum">
      <div class="pdx-l">${abilitiesHtml(sp)}${baseStatsHtml(sp)}</div>
      <div class="pdx-r"><div class="evo-slot" data-evo></div><div data-mu>${matchupHtml(e, T)}</div>${ownedHtml(owned)}</div>
    </div>`)}
    ${T.quetzal ? pane('wild', '<div class="wild-slot" data-wild></div>') : ''}
    ${pane('moves', '<div class="dex-slot" data-dex></div>')}
    ${pane('usage', '<div class="usage-slot" data-usage></div>')}
  </div>`;
}

/** Multiplicador de dano de cada tipo de ataque (só tipos). */
function typeMults(sp, T) {
  const out = new Map();
  for (const [x, types] of defenseWithAbility(sp.types, { types: T.types, chart: T.typechart })) for (const ty of types) out.set(ty, x);
  return out;
}

/**
 * Duas espécies lado a lado: tipos, stats base (o maior de cada um em destaque), habilidades e dano recebido por tipo.
 * Tocar no nome de uma abre o detalhe dela (`data-cmp-open` = 0 ou 1).
 */
export function compareHtml(a, b, T) {
  const head = (e, k) => {
    const sp = e.species;
    return `<button type="button" class="cmp-head" data-cmp-open="${k}">
      <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" crossorigin="anonymous">
      <b>${esc(sp.name)}</b>${sp.form ? `<small>${esc(sp.form === '?' ? t('forma ?') : formName(sp.form))}</small>` : ''}
      <span class="cmp-types">${sp.types.map(x => `<span class="type t-${esc(x)}">${esc(x)}</span>`).join('')}</span>
    </button>`;
  };
  const va = Object.fromEntries(BASE_ORDER.map((k, i) => [k, a.species.baseStats[i]]));
  const vb = Object.fromEntries(BASE_ORDER.map((k, i) => [k, b.species.baseStats[i]]));
  const cell = (x, y) => `<td class="num${x > y ? ' cmp-hi' : ''}">${x}${x > y ? `<span class="sr"> (${t('maior')})</span>` : ''}</td>`;
  const bar = (x, side) => `<td class="cmp-bar ${side}"><div class="bar"><i style="width:${Math.round(Math.min(1, x / 255) * 100)}%;--h:${Math.round(Math.min(1, x / 150) * 120)}"></i></div></td>`;
  const stats = SHOWDOWN_ORDER.map(k => `<tr>${bar(va[k], 'l')}${cell(va[k], vb[k])}<th scope="row">${STAT_LABEL[k]}</th>${cell(vb[k], va[k])}${bar(vb[k], 'r')}</tr>`).join('')
    + `<tr class="pdx-total"><td></td>${cell(bst(a.species), bst(b.species))}<th scope="row">${t('Total')}</th>${cell(bst(b.species), bst(a.species))}<td></td></tr>`;
  const abil = e => [...new Set(e.species.abilities.filter(Boolean))].map(x => tipBtn('a', x, esc(x))).join('<br>') || '—';
  const ma = typeMults(a.species, T), mb = typeMults(b.species, T);
  const mu = x => (x == null ? '<span class="cmp-n">1×</span>' : `<span class="mu-x ${x > 1 ? 'weak' : x > 0 ? 'resist' : 'immune'}">${muLabel(x)}</span>`);
  // O que muda entre as duas primeiro; o que é igual nas duas fica recolhido
  const row = ty => `<tr><td>${mu(ma.get(ty))}</td><th scope="row"><span class="type t-${esc(ty)}">${esc(ty)}</span></th><td>${mu(mb.get(ty))}</td></tr>`;
  const all = T.types.filter(ty => ty && ty !== 'stellar' && (ma.has(ty) || mb.has(ty)));
  const diff = all.filter(ty => ma.get(ty) !== mb.get(ty)), same = all.filter(ty => ma.get(ty) === mb.get(ty));
  const rows = diff.length ? `<table class="cmp-mu"><tbody>${diff.map(row).join('')}</tbody></table>` : `<p class="hint">${t('Recebem o mesmo dano de todos os tipos.')}</p>`;
  const rest = same.length ? `<details class="cmp-same"><summary>${t('Iguais nas duas ({n})', { n: same.length })}</summary><table class="cmp-mu"><tbody>${same.map(row).join('')}</tbody></table></details>` : '';
  return `<div class="sheet-bar cmp-bar">
    <b class="sheet-bar-name" aria-hidden="true">${esc(a.species.name)} × ${esc(b.species.name)}</b>
    <button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
  </div>
  <div class="mon cmp">
    <h2 class="sr" id="detail-title">${esc(t('{a} e {b} lado a lado', { a: a.species.name, b: b.species.name }))}</h2>
    <div class="cmp-heads">${head(a, 0)}<span class="cmp-x" aria-hidden="true">VS</span>${head(b, 1)}</div>
    <section class="dsec"><h3>${t('Stats base')}</h3><table class="stats cmp-stats"><tbody>${stats}</tbody></table></section>
    <section class="dsec"><h3>${t('Habilidades')}</h3><div class="cmp-abs"><p>${abil(a)}</p><p>${abil(b)}</p></div></section>
    <section class="dsec"><h3>${t('Dano recebido')} ${infoBtn(t('Dano recebido'), t('Só pelos tipos; não considera habilidade (Levitate etc.) nem item.'))}</h3>${rows}${rest}</section>
    <p class="hint">${t('Toque no nome de um dos dois para abrir o detalhe.')}</p>
  </div>`;
}

/** Observação sobre a lista de cada jogo. */
export function listNote(game) {
  const id = game && game.id;
  if (id === 'quetzal') return t('Espécies e formas da ROM do Quetzal. Para ver só as que aparecem no jogo, use Filtros (encontros lidos da ROM; presentes, ovos e trocas não entram).');
  if (id === 'soulgold') return t('Espécies da Pokédex de Johto do SoulGold e as formas delas.');
  if (id === 'unbound') return t('Espécies e formas da ROM do Unbound.');
  if (game && game.gen >= 4) return t('Tipos e stats da época; habilidades e golpes por nível dos jogos mais recentes.');
  return '';
}

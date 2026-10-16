// Pokédex do jogo (janela em Ferramentas; este pacote só é carregado ao abrir): busca entre todas as espécies do jogo
// do save e o detalhe de cada uma (stats base, habilidades, dano recebido e, carregados à parte como no detalhe de um
// Pokémon, a evolução e os golpes). Filtro por golpe: os golpes por nível, tutor/TM e ovo do mesmo `dex` do detalhe.

import { t } from '../i18n.js';
import { esc, monHeader, matchupTable } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import { SHOWDOWN_ORDER, STAT_LABEL, formName } from '../export.js';
import { BASE_ORDER } from '../parser/stats.js';
import { moveInfo } from '../parser/describe.js';
import { dexIds } from '../ui/dex.js';
import { pokedexEntries, bst } from './entries.js';

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

const SORTS = {
  dex: null, // a ordem da lista
  name: (a, b) => a.species.name.localeCompare(b.species.name),
  bst: (a, b) => bst(b.species) - bst(a.species),
  spe: (a, b) => b.species.baseStats[5] - a.species.baseStats[5],
};

/**
 * @param {Array} entries pokedexEntries
 * @param {{ q?: string, type?: string, caught?: ''|'yes'|'no', sort?: string, moves?: Set<number>|null }} f
 * @param {{ caught?: Set<number>|null, dex?: object|null }} ctx
 */
export function filterEntries(entries, f, ctx = {}) {
  const terms = norm(f.q).split(/\s+/).filter(Boolean);
  const out = entries.filter(e => {
    if (f.type && !e.species.types.includes(f.type)) return false;
    if (f.caught && ctx.caught && e.nat != null && ctx.caught.has(e.nat) !== (f.caught === 'yes')) return false;
    if (f.caught && ctx.caught && e.nat == null) return false;
    if (terms.length) { const h = hay(e); if (!terms.every(x => h.includes(x))) return false; }
    if (f.moves && !learnable(e, ctx.dex).some(id => f.moves.has(id))) return false;
    return true;
  });
  const sort = SORTS[f.sort];
  return sort ? out.slice().sort(sort) : out;
}

const numLabel = e => (e.nat != null ? '#' + String(e.nat).padStart(4, '0') : '');
const formLabel = sp => (sp.form ? ` <span class="form">(${esc(sp.form === '?' ? t('forma ?') : formName(sp.form))})</span>` : '');

/** Uma linha da lista (o mesmo estilo dos resultados da Buscar). */
export function entryRow(e, i, caught) {
  const sp = e.species;
  const got = caught && e.nat != null && caught.has(e.nat);
  return `<li><button class="result pdx-row" type="button" data-pdx="${i}">
    <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
    <span class="r-main"><b>${esc(sp.name)}</b>${formLabel(sp)}${got ? ` <span class="pdx-got" title="${esc(t('Capturado (Pokédex do save)'))}">●<span class="sr"> ${t('capturado')}</span></span>` : ''}
      <span class="r-sub">${numLabel(e)}${numLabel(e) ? ' · ' : ''}${sp.types.map(esc).join(' / ')}</span></span>
    <span class="r-lv" title="${esc(t('Total dos stats base'))}">${bst(sp)}</span>
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
  const row = (k, v) => `<div><dt>${k}</dt><dd><b>${esc(v)}</b></dd></div>`;
  const list = [a1 && row(t('Habilidade 1'), a1), a2 && a2 !== a1 && row(t('Habilidade 2'), a2), ha && row(t('Oculta'), ha)].filter(Boolean).join('');
  if (!list) return '';
  return `<section class="dsec"><h3>${t('Habilidades')}</h3><dl class="facts-grid">${list}</dl>
    ${sp.abilitiesProbable ? `<p class="hint">${t('Habilidades dos jogos mais recentes (PokeAPI); podem ser diferentes neste jogo.')}</p>` : ''}</section>`;
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

/** Detalhe de uma espécie (na janela do detalhe; a evolução e os golpes entram no `[data-dex]` depois). */
export function speciesDetail(e, T, { caught = null, owned = [] } = {}) {
  const m = speciesMon(e);
  const sp = e.species;
  const tc = sp.types[0] ? ` t-${esc(sp.types[0])}` : '';
  const got = caught && e.nat != null ? (caught.has(e.nat) ? t('Capturado na Pokédex do save') : t('Ainda não capturado na Pokédex do save')) : '';
  return `<div class="sheet-bar${tc}">
    <b class="sheet-bar-name" aria-hidden="true">${esc(sp.name)}</b>
    <button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
  </div>
  <div class="mon">
    <div class="mon-hero${tc}">
      ${monHeader(m, 'h2', ' id="detail-title"')}
      ${got ? `<p class="mon-sub">${got}</p>` : ''}
    </div>
    ${abilitiesHtml(sp)}
    ${baseStatsHtml(sp)}
    ${matchupTable(m, T)}
    ${ownedHtml(owned)}
    <div class="dex-slot" data-dex></div>
  </div>`;
}

/** Observação sobre a lista de cada jogo. */
export function listNote(game) {
  const id = game && game.id;
  if (id === 'quetzal') return t('Espécies e formas da ROM do Quetzal. O app ainda não sabe quais aparecem no jogo.');
  if (id === 'soulgold') return t('Espécies da Pokédex de Johto do SoulGold e as formas delas.');
  if (id === 'unbound') return t('Espécies e formas da ROM do Unbound.');
  if (game && game.gen >= 4) return t('Tipos e stats da época; habilidades e golpes por nível dos jogos mais recentes.');
  return '';
}

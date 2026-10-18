// Uso no competitivo (detalhe da espécie na Pokédex): as estatísticas de uso públicas do Smogon que o montador já usa
// (src/data/smogon/*.json, `npm run smogon`): quanto a espécie é usada, os golpes, itens e habilidades mais comuns nos
// sets e os parceiros que mais aparecem com ela. Pacote carregado só ao abrir o detalhe de uma espécie.

import { t } from '../i18n.js';
import { esc, tipBtn, infoBtn } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import { loadSmogon, toId } from '../builder/smogon.js';

export { loadSmogon };

const pct = x => Math.round(x * 100);
const top = (map, n) => (map ? [...map].sort((a, b) => b[1] - a[1]).slice(0, n) : []);

/** Nome no jogo de um ID do Showdown (golpe, item ou habilidade); null se o jogo não tem. */
function namer(T) {
  const moves = new Map(), items = new Map(), abilities = new Map();
  for (const row of T.moves || []) if (row) moves.set(toId(row[0]), row[0]);
  for (const it of (T.quetzal && T.quetzal.items) || (T.soulgold && T.soulgold.items) || T.items || []) {
    const n = Array.isArray(it) ? it[0] : it;
    if (typeof n === 'string' && !items.has(toId(n))) items.set(toId(n), n);
  }
  for (const n of T.abilityNames || []) if (n) abilities.set(toId(n), n);
  return { moves, items, abilities };
}
const names = new WeakMap();

/** Entrada da Pokédex de cada ID do Smogon (para os parceiros abrirem o detalhe). */
function entryMap(idx, entries) {
  const out = new Map();
  for (const e of entries) {
    const id = idx.find(e.species);
    if (id && !out.has(id)) out.set(id, e);
  }
  return out;
}
const entryMaps = new WeakMap();

/**
 * A seção "Uso no competitivo" do detalhe da espécie.
 * @param {object|null} idx smogonIndex do jogo (null = sem as tabelas, ex.: offline na primeira vez)
 * @param {object} e entrada da Pokédex
 * @param {object} T tabelas do jogo
 * @param {Array} entries todas as entradas (os parceiros que existem no jogo viram botões, `data-pdx-entry` = posição)
 */
export function usageHtml(idx, e, T, entries) {
  const h = `<h3>${t('Uso no competitivo')}</h3>`;
  if (!idx) return `<section class="dsec usage">${h}<p class="hint">${t('Não consegui carregar as estatísticas de uso (sem internet na primeira vez?).')}</p></section>`;
  const id = idx.find(e.species);
  const u = id && idx.usage(id);
  if (!u) return ''; // sem dados: a aba Competitivo não aparece
  if (!names.has(T)) names.set(T, namer(T));
  const N = names.get(T);
  if (!entryMaps.has(entries)) entryMaps.set(entries, entryMap(idx, entries));
  const E = entryMaps.get(entries);

  const list = (rows, kind, map) => rows.map(([k, v]) => map.get(k) && [map.get(k), v]).filter(Boolean)
    .map(([n, v]) => `<li>${kind ? tipBtn(kind, n, esc(n)) : esc(n)}<span class="usage-bar"><i style="width:${pct(v)}%"></i></span><b>${pct(v)}%</b></li>`).join('');
  const moves = list(top(idx.moves(id), 6), 'm', N.moves);
  const items = list(top(idx.items(id), 3), null, N.items);
  const abilities = list(top(idx.abilities(id), 2), 'a', N.abilities);
  const block = (title, html) => (html ? `<div class="usage-col"><h4>${title}</h4><ul class="usage-list">${html}</ul></div>` : '');

  // Parceiros: os que mais aparecem junto (2× ou mais que o acaso) e existem neste jogo
  const index = new Map(entries.map((x, i) => [x, i]));
  const mates = [...idx.partners(id)].filter(([k, v]) => v >= 1 && E.has(k) && E.get(k) !== e)
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => {
      const x = E.get(k), sp = x.species;
      return `<li><button type="button" class="usage-mate" data-pdx-entry="${index.get(x)}">
        <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
        <b>${esc(sp.name)}${sp.form ? ` <small>(${esc(sp.form)})</small>` : ''}</b><small>${Math.round(2 ** v)}×</small></button></li>`;
    }).join('');

  const head = t('{f}: em {p}% dos times (nº {r})', { f: u.format, p: pct(u.rate) || '<1', r: u.rank });
  const about = t('Estatísticas de uso públicas do Smogon ({m}, corte 1500): a fração dos sets que leva cada golpe, item e habilidade, e quantas vezes mais que o acaso o parceiro aparece no mesmo time. Só o que existe neste jogo.', { m: u.month });
  return `<section class="dsec usage"><h3>${t('Uso no competitivo')} ${infoBtn(t('Uso no competitivo'), about)}</h3>
    <p class="usage-head">${esc(head)}</p>
    <div class="usage-cols">${block(t('Golpes'), moves)}${block(t('Itens'), items)}${block(t('Habilidades'), abilities)}</div>
    ${mates ? `<h4>${t('Costuma jogar com')}</h4><ul class="usage-mates">${mates}</ul>` : ''}
  </section>`;
}

// Onde encontrar (Quetzal): os lugares da natureza onde a espécie aparece, lidos da ROM (tools/build-quetzal-wild.mjs),
// no mapa da região como o jogo desenha. Pacote carregado só ao abrir o detalhe de uma espécie de um save do Quetzal.

import { t, getLang } from '../i18n.js';
import { esc } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import W from '../data/quetzal-wild.json';
import LR from '../data/quetzal-legend-rules.json';

const MAP_URL = {
  hoenn: new URL('../data/maps/quetzal-hoenn.png', import.meta.url).href,
  johto: new URL('../data/maps/quetzal-johto.png', import.meta.url).href,
  kanto: new URL('../data/maps/quetzal-kanto.png', import.meta.url).href,
  sevii123: new URL('../data/maps/quetzal-sevii123.png', import.meta.url).href,
  sevii45: new URL('../data/maps/quetzal-sevii45.png', import.meta.url).href,
  sevii67: new URL('../data/maps/quetzal-sevii67.png', import.meta.url).href,
};
export const REGIONS = ['hoenn', 'johto', 'kanto', 'sevii123', 'sevii45', 'sevii67'];
export const regionName = r => ({ hoenn: 'Hoenn', johto: 'Johto', kanto: 'Kanto', sevii123: t('Ilhas 1–3'), sevii45: t('Ilhas 4–5'), sevii67: t('Ilhas 6–7') })[r];
export const METHOD = () => [t('Grama ou caverna'), t('Surfando'), t('Escondido (DexNav)'), 'Rock Smash', 'Old Rod', 'Good Rod', 'Super Rod', t('Encontro único')];
const STATIC = 7;

/** Onde a espécie (número do Quetzal) aparece: [{ place, region, name, rows: [[jeito, mín., máx., chance]] }]. */
export function wildPlaces(id) {
  const rows = W.wild[id] || [];
  if (!rows.length) return [];
  const en = getLang() === 'en';
  const by = new Map();
  for (const [p, how, min, max, pct] of rows) {
    const pl = W.places[p];
    if (!by.has(p)) by.set(p, { place: p, region: pl[2], name: en ? pl[0] : pl[1], rows: [] });
    by.get(p).rows.push([how, min, max, pct]);
  }
  return [...by.values()];
}

/**
 * Quem não aparece na natureza: a pré-evolução mais próxima que aparece (pelas evoluções da ROM).
 * @returns {number|null} número do Quetzal
 */
export function wildAncestor(id, Q) {
  const prev = new Map();
  for (const [from, list] of Object.entries(Q.evolutions || {})) for (const e of list) if (e[2] && !prev.has(e[2])) prev.set(e[2], +from);
  const seen = new Set([id]);
  for (let cur = prev.get(id); cur != null && !seen.has(cur); cur = prev.get(cur)) {
    if (W.wild[cur]) return cur;
    seen.add(cur);
  }
  return null;
}

export const lv = (a, b) => (!a ? '' : a === b ? `${t('Nv.')} ${a}` : `${t('Nv.')} ${a}–${b}`);

/** O mapa da região com um retângulo (`data-pin` = posição na lista) em cada lugar (índices de W.places). */
export function mapHtml(region, placeIds) {
  const [w, h] = W.meta.maps[region];
  const { x: ox, y: oy, cell } = W.meta.grid;
  const pins = placeIds.map((p, i) => {
    const [, , , x, y, pw, ph] = W.places[p];
    const st = `left:${((x + ox) * cell / w * 100).toFixed(2)}%;top:${((y + oy) * cell / h * 100).toFixed(2)}%;width:${(pw * cell / w * 100).toFixed(2)}%;height:${(ph * cell / h * 100).toFixed(2)}%`;
    return `<span class="wild-pin" style="${st}" data-pin="${i}"></span>`;
  }).join('');
  return `<div class="wild-map" style="aspect-ratio:${w}/${h}">
      <img src="${MAP_URL[region]}" width="${w}" height="${h}" alt="${esc(t('Mapa de {r}', { r: regionName(region) }))}" decoding="async" loading="lazy">${pins}
    </div>`;
}

function regionHtml(region, places, on, req = '') {
  const M = METHOD();
  const list = places.map((p, i) => `<li><button type="button" class="wild-place" data-pin="${i}" aria-pressed="false">
      <b>${esc(p.name)}</b>
      ${p.rows.map(([how, a, b, pct]) => `<span class="wild-how">${[esc(M[how]), lv(a, b), pct ? `${pct}%` : ''].filter(Boolean).join(' · ')}</span>`).join('')}
    </button></li>`).join('');
  return `<div class="wild-region" data-region="${region}"${on ? '' : ' hidden'}>
    ${mapHtml(region, places.map(p => p.place))}
    <ul class="wild-list">${list}</ul>${req}
  </div>`;
}

/**
 * Como fazer o encontro único aparecer numa região, tudo lido da ROM (quetzal-legend-rules.json, por região;
 * tools/quetzal-legend-rules.py). Johto: insígnias, Liga e item da tabela de encontros únicos (quetzal-wild.json →
 * legend) e as regras de equipe das funções que conferem o encontro. Hoenn e Kanto (as Ilhas Sete usam as de Kanto):
 * as funções que conferem cada encontro (tools/quetzal-legend-rules-hk.json), com a Liga, as insígnias e as marcas da
 * história nas próprias linhas.
 */
function reqHtml(id, region, Q) {
  const en = getLang() === 'en', r = regionName(region);
  const li = x => `<li>${esc(x)}</li>`;
  const key = region.startsWith('sevii') ? 'kanto' : region;
  const rule = (LR.legend[key] || {})[id];
  const rom = region === 'johto' ? (W.legend || {})[id] : null;
  if (!rom && !rule) return '';
  const lines = [];
  if (rom && rom.badges) lines.push(t('{n} insígnias de {r}', { n: rom.badges, r }));
  if (rom && rom.league) lines.push(t('Ter vencido a Liga de {r}', { r }));
  if (rom && rom.item) lines.push(t('{item} na mochila', { item: (Q.items || {})[rom.item] || '#' + rom.item }));
  if (rule) lines.push(...(en ? rule.en : rule.pt));
  const vis = rule ? (en ? rule.ven : rule.vpt) : [];
  const hint = [t('Lido da ROM do jogo; não conferido no jogo.')];
  if (rule && rule.partial) hint.push(t('Em parte: o app ainda não leu tudo o que este encontro pede.'));
  if (region === 'johto') {
    hint.push(vis.length ? t('Com a opção LENDÁRIOS = VISÍVEIS (provável), as regras de equipe e o item não valem; valem as insígnias, a Liga e: {x}', { x: vis.join(' ') })
      : t('Com a opção LENDÁRIOS = VISÍVEIS (provável), só valem as insígnias e a Liga.'));
  } else if (vis.length) {
    hint.push(t('Com a opção LENDÁRIOS = VISÍVEIS (provável), a equipe não é conferida; vale: {x}', { x: vis.join(' ') }));
  }
  return `<div class="wild-req"><h4>${t('Como fazer aparecer')}</h4>${lines.length ? `<ul>${lines.map(li).join('')}</ul>` : ''}<p class="hint">${hint.map(esc).join(' ')}</p></div>`;
}

/**
 * A seção "Onde encontrar" do detalhe da espécie.
 * @param {number} id número da espécie no Quetzal
 * @param {object} Q quetzal.json
 * @param {{ region?: string|null, nameOf?: (id: number) => object, caught?: boolean|null }} opts região onde o jogador
 *   está (abre nela), a espécie de um número (para a pré-evolução) e se a Pokédex do save marca a espécie como capturada
 */
export function wildHtml(id, Q, { region = null, nameOf = null, caught = null } = {}) {
  let places = wildPlaces(id);
  let note = '';
  if (!places.length) {
    const anc = wildAncestor(id, Q);
    if (anc == null) return `<section class="dsec wild"><h3>${t('Onde encontrar')}</h3><p class="hint">${t('Não aparece na natureza do jogo (grama, cavernas, água, Rock Smash e encontros únicos). Pode vir de evento, presente, ovo ou troca.')}</p></section>`;
    places = wildPlaces(anc);
    const sp = nameOf ? nameOf(anc) : null;
    note = `<p class="wild-anc">${sp ? `<img src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">` : ''}
      <span>${t('Não aparece na natureza. Capture {name} e evolua:', { name: `<b>${esc(sp ? sp.name : '#' + anc)}</b>` })}</span></p>`;
  }
  let once = '';
  if (!note && caught != null && places.some(p => p.rows.some(r => r[0] === STATIC))) {
    once = `<p class="hint">${caught ? t('A Pokédex do save já marca esta espécie como capturada.') : t('A Pokédex do save ainda não marca esta espécie como capturada.')}</p>`;
  }
  const regions = REGIONS.filter(r => places.some(p => p.region === r));
  const first = regions.includes(region) ? region : regions[0];
  const tabs = regions.length > 1 ? `<div class="wild-tabs" role="group" aria-label="${esc(t('Região'))}">${regions.map(r => `<button type="button" class="btn btn-ghost" data-region="${r}" aria-pressed="${r === first}">${esc(regionName(r))} <span class="wild-n">${places.filter(p => p.region === r).length}</span></button>`).join('')}</div>` : '';
  const body = regions.map(r => regionHtml(r, places.filter(p => p.region === r), r === first, note ? '' : reqHtml(id, r, Q))).join('');
  return `<section class="dsec wild"><h3>${t('Onde encontrar')} <span class="learn-count">${places.length}</span></h3>${note}${once}${tabs}${body}
    <p class="hint">${t('Lido da ROM do Quetzal. Chances pelas regras do motor (pokeemerald); a mesma espécie em vários andares de um lugar mostra a maior chance. Toque num lugar para ver no mapa.')}</p></section>`;
}

/** Abas das regiões e o toque num lugar (destaca no mapa). */
export function wireWild(root) {
  const sec = root.querySelector('.wild');
  if (!sec) return;
  sec.addEventListener('click', e => {
    const tab = e.target.closest('.wild-tabs [data-region]');
    if (tab) {
      sec.querySelectorAll('.wild-tabs [data-region]').forEach(b => b.setAttribute('aria-pressed', String(b === tab)));
      sec.querySelectorAll('.wild-region').forEach(d => { d.hidden = d.dataset.region !== tab.dataset.region; });
      return;
    }
    const b = e.target.closest('.wild-place');
    if (!b) return;
    const reg = b.closest('.wild-region');
    const on = b.getAttribute('aria-pressed') !== 'true';
    reg.querySelectorAll('.wild-place').forEach(x => x.setAttribute('aria-pressed', String(on && x === b)));
    reg.querySelectorAll('.wild-pin').forEach(p => p.classList.toggle('on', on && p.dataset.pin === b.dataset.pin));
    reg.classList.toggle('focus', on);
    if (on) reg.querySelector('.wild-map').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

// Pokédex: o que falta, por lugar (Quetzal). Cruza as espécies que faltam na Pokédex do save com os encontros da
// natureza lidos da ROM (quetzal-wild.json, os mesmos do "Onde encontrar"): para cada lugar, o que dá para capturar
// ali e ainda falta. Quem não aparece na natureza entra pela pré-evolução mais próxima que aparece ("capture e
// evolua"). Pacote carregado só ao abrir a aba "Por lugar" da janela do que falta.

import { t, num, getLang } from '../i18n.js';
import { esc } from '../ui/render.js';
import { SPRITE_BASE, iconUrl } from '../ui/sprites.js';
import { formName } from '../export.js';
import W from '../data/quetzal-wild.json';
import { REGIONS, regionName, METHOD, lv, mapHtml } from '../pokedex/wild.js';

const LAST_ICON = 898;
const STATIC = 7;

/**
 * Lugares onde dá para capturar o que falta, por região.
 * @param {{ missing: number[] }} info resultado de missingDex
 * @param {object} Q quetzal.json
 * @returns {{ regions: Map<string, Array<{ place: number, name: string, mons: Array<{ id: number, nat: number,
 *   via: number|null, rows: number[][] }>, count: number }>>, found: Set<number>, none: number[] }}
 *   found = números da Dex Nacional que aparecem em algum lugar (direto ou pela pré-evolução); none = os outros
 */
export function huntPlaces(info, Q) {
  const natOf = id => (id <= LAST_ICON ? id : Q.species[id]?.[5] ?? null);
  const want = new Set(info.missing);
  const en = getLang() === 'en';
  const places = new Map(); // lugar -> Map(id -> espécie)
  const add = (p, id, nat, via, row) => {
    if (!places.has(p)) places.set(p, new Map());
    const m = places.get(p);
    if (!m.has(id)) m.set(id, { id, nat, via, rows: [] });
    m.get(id).rows.push(row);
  };

  // Direto: a espécie (ou uma forma dela) aparece na natureza
  const direct = new Set();
  for (const [key, rows] of Object.entries(W.wild)) {
    const id = +key, nat = natOf(id);
    if (!want.has(nat)) continue;
    direct.add(nat);
    for (const [p, how, min, max, pct] of rows) add(p, id, nat, null, [how, min, max, pct]);
  }

  // Pela pré-evolução: a mais próxima que aparece na natureza (evoluções da ROM)
  const prev = new Map();
  for (const [from, list] of Object.entries(Q.evolutions || {})) for (const e of list) if (e[2] && !prev.has(e[2])) prev.set(e[2], +from);
  const idsOf = new Map();
  for (let id = 1; id <= LAST_ICON; id++) idsOf.set(id, [id]);
  for (const [key, row] of Object.entries(Q.species)) {
    const id = +key;
    if (id > LAST_ICON && row && row[5] && !row[11]) idsOf.get(row[5])?.push(id);
  }
  const via = new Set();
  for (const nat of info.missing) {
    if (direct.has(nat)) continue;
    for (const id of idsOf.get(nat) || []) {
      const seen = new Set([id]);
      let anc = null;
      for (let cur = prev.get(id); cur != null && !seen.has(cur); cur = prev.get(cur)) {
        if (W.wild[cur]) { anc = cur; break; }
        seen.add(cur);
      }
      if (anc == null) continue;
      via.add(nat);
      for (const [p, how, min, max, pct] of W.wild[anc]) add(p, id, nat, anc, [how, min, max, pct]);
    }
  }

  const regions = new Map();
  for (const [p, mons] of places) {
    const pl = W.places[p];
    const list = [...mons.values()].sort((a, b) => (a.via != null) - (b.via != null) || a.nat - b.nat || a.id - b.id);
    const count = new Set(list.map(m => m.nat)).size;
    if (!regions.has(pl[2])) regions.set(pl[2], []);
    regions.get(pl[2]).push({ place: p, name: en ? pl[0] : pl[1], mons: list, count });
  }
  for (const list of regions.values()) list.sort((a, b) => b.count - a.count || a.place - b.place);
  const found = new Set([...direct, ...via]);
  return { regions, found, none: info.missing.filter(n => !found.has(n)) };
}

/** Nome e imagem de uma espécie do Quetzal (formas com o nome da forma e o sprite dela). */
function monLook(id, nat, Q, name) {
  const row = id > LAST_ICON ? Q.species[id] : null;
  if (!row) return { name: name(nat), src: nat <= LAST_ICON ? iconUrl(nat) : `${SPRITE_BASE}/${nat}.png`, cls: nat <= LAST_ICON ? 'ico' : 'spr' };
  const form = row[9] ? ` (${formName(row[9])})` : '';
  const sprite = row[7] || nat;
  return { name: row[0] + form, src: row[8] ? iconUrl(sprite) : `${SPRITE_BASE}/${sprite}.png`, cls: row[8] ? 'ico' : 'spr' };
}

/**
 * A aba "Por lugar": abas das regiões, o mapa com os lugares e a lista dos lugares (o que tem mais espécies que
 * faltam primeiro). `view.region` = região escolhida (padrão: a do jogador, se tiver lugares).
 */
export function huntHtml(hunt, info, Q, name, view, home = null) {
  const regs = REGIONS.filter(r => hunt.regions.has(r));
  if (!regs.length) return `<p class="hint">${t('Nada do que falta aparece na natureza do jogo.')}</p>`;
  const region = regs.includes(view.region) ? view.region : regs.includes(home) ? home : regs[0];
  const species = r => new Set(hunt.regions.get(r).flatMap(p => p.mons.map(m => m.nat))).size;
  const tabs = `<div class="wild-tabs" role="group" aria-label="${esc(t('Região'))}">${regs.map(r => `<button type="button" class="btn btn-ghost" data-hunt-region="${r}" aria-pressed="${r === region}">${esc(regionName(r))} <span class="wild-n">${num(species(r))}</span></button>`).join('')}</div>`;
  const places = hunt.regions.get(region);
  const M = METHOD();
  const evoTag = n => (info.evolve.has(n) ? `<span class="dex-tag dex-evo" title="${esc(t('Dá para conseguir evoluindo: {list}', { list: info.evolve.get(n).join(', ') }))}">↑ ${esc(info.evolve.get(n).join(', '))}</span>` : '');
  const list = places.map((p, i) => {
    const mons = p.mons.map(m => {
      const look = monLook(m.id, m.nat, Q, name);
      const how = m.rows.map(([h, a, b, pct]) => [esc(M[h]), lv(a, b), pct && h !== STATIC ? `${pct}%` : ''].filter(Boolean).join(' · '));
      const anc = m.via != null ? monLook(m.via, m.via <= LAST_ICON ? m.via : Q.species[m.via]?.[5], Q, name).name : '';
      return `<li><button class="hunt-mon" type="button" data-dex-id="${m.id}" data-dex-nat="${m.nat}">
        <img class="${look.cls}" data-sprite="1" src="${esc(look.src)}" width="68" height="56" alt="" loading="lazy" decoding="async" crossorigin="anonymous">
        <span class="hunt-txt"><b>${esc(look.name)}</b>
          ${anc ? `<span class="hunt-via">${t('Capture {name} e evolua', { name: esc(anc) })}</span>` : ''}
          ${how.map(h => `<span class="wild-how">${h}</span>`).join('')}
          ${evoTag(m.nat)}</span>
      </button></li>`;
    }).join('');
    // Fechado por padrão: com a Pokédex no começo são mais de mil espécies por região, e o celular só monta as abertas
    return `<li><details class="hunt-place" data-pin="${i}"><summary class="wild-place">
        <b>${esc(p.name)}</b><span class="wild-how">${t('{n} que faltam', { n: num(p.count) })}</span></summary>
      <ul class="hunt-mons">${mons}</ul></details></li>`;
  }).join('');
  const none = hunt.none.length
    ? `<p class="hint">${t('{n} espécies que faltam não aparecem na natureza do jogo (nem pela pré-evolução): podem vir de evento, presente, ovo ou troca, ou não existir no Quetzal.', { n: num(hunt.none.length) })}</p>`
    : '';
  return `${tabs}<div class="wild-region hunt-region" data-region="${region}">
      ${mapHtml(region, places.map(p => p.place))}
      <ul class="hunt-list">${list}</ul>
    </div>${none}
    <p class="hint">${t('Lido da ROM do Quetzal (grama, cavernas, água, Rock Smash, varas e encontros únicos), com as chances pelas regras do motor. Toque num lugar para ver no mapa e o que falta nele, e numa espécie para ver os dados e os requisitos dela.')}</p>`;
}

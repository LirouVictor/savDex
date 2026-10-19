// Dex de habilidades (janela "Habilidades" em Ferramentas; este pacote só é carregado ao abrir): as habilidades das
// espécies do jogo do save (as mesmas entradas da Pokédex), com a descrição, quem do save tem e quem pode ter (a espécie
// tem a habilidade em outro espaço: Ability Capsule ou Patch, nos jogos que têm) e todas as espécies que a têm.

import { t } from '../i18n.js';
import { esc } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import { normName } from '../ui/tips.js';
import { learnerChips, LEARNER_SHOW } from '../movedex/view.js';

export const PAGE = 30;
export { learnerChips, LEARNER_SHOW };
// Formas que só existem na batalha repetiriam a espécie (a mega tem outra habilidade, mas conta pela forma comum no save)
const BATTLE_FORM = /^(Gigantamax)\b/;
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * As habilidades das espécies do jogo: uma linha por habilidade com quem a tem (`normal`: 1ª ou 2ª; `hidden`: oculta) e
 * os Pokémon do save que a têm (`mine`, posições em `all`) ou cuja espécie a tem em outro espaço (`could`).
 */
export function abilityRows(entries, all, entryOf) {
  const rows = new Map();
  const at = name => {
    const k = normName(name);
    return rows.get(k) || rows.set(k, { name, key: k, search: norm(name), normal: [], hidden: [], mine: [], could: [] }).get(k);
  };
  for (const e of entries) {
    if (BATTLE_FORM.test(e.species.form || '')) continue;
    const ab = e.species.abilities || [];
    const seen = new Set();
    ab.forEach((name, slot) => {
      if (!name || seen.has(normName(name))) return;
      seen.add(normName(name));
      at(name)[slot === 2 ? 'hidden' : 'normal'].push(e);
    });
  }
  all.forEach((m, i) => {
    if (m.egg || !m.ability || !m.ability.name) return;
    const r = rows.get(normName(m.ability.name));
    if (r) r.mine.push(i);
    const e = entryOf(m);
    for (const name of new Set(((e && e.species.abilities) || []).filter(Boolean))) {
      const o = rows.get(normName(name));
      if (o && o !== r) o.could.push(i);
    }
  });
  return [...rows.values()].map(r => ({ ...r, species: r.normal.length + r.hidden.length }));
}

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  species: (a, b) => b.species - a.species || a.name.localeCompare(b.name),
};

/** @param {{ q?: string, mine?: ''|'has'|'could', sort?: string }} f  A busca vale para o nome e a descrição. */
export function filterAbilities(rows, f) {
  const q = norm(f.q).trim();
  const out = rows.filter(r => (!q || r.search.includes(q) || norm(r.text).includes(q))
    && (!f.mine || (f.mine === 'has' ? r.mine.length : r.mine.length || r.could.length)));
  return out.sort(SORTS[f.sort] || SORTS.name);
}

/** Uma linha da lista: nome, quantos do save têm, a descrição (duas linhas) e quantas espécies. */
export function abilityRow(r, i) {
  const mine = r.mine.length ? `<span class="mv-mine" title="${esc(t('Pokémon do save que têm'))}">✓ ${r.mine.length}</span>`
    : r.could.length ? `<span class="mv-mine can" title="${esc(t('Pokémon do save que podem ter (outra habilidade da espécie)'))}">+${r.could.length}</span>` : '';
  return `<li><button class="result ab-row" type="button" data-ab="${i}">
    <span class="r-main"><b>${esc(r.name)}</b>${mine}<span class="r-sub ab-sub">${esc(r.text || '—')}</span></span>
    <span class="mv-nums ab-nums"><span title="${esc(t('Espécies'))}">${r.species}<small>${t('Espécies')}</small></span></span>
  </button></li>`;
}

/** Como trocar para esta habilidade no jogo (o item), ou só onde a espécie a tem. */
function swapHow(slot, free) {
  if (slot === 2) return free === 'patch' ? t('oculta da espécie: dê um Ability Patch') : t('oculta da espécie');
  return free ? t('habilidade {n} da espécie: dê uma Ability Capsule', { n: slot + 1 }) : t('habilidade {n} da espécie', { n: slot + 1 });
}

/** Os Pokémon do save que têm a habilidade e os que podem ter (a espécie tem em outro espaço). */
function mineHtml(r, all, entryOf, free) {
  const rows = [...r.mine.map(i => ({ i, has: true })), ...r.could.map(i => ({ i, has: false }))];
  if (!rows.length) return `<section class="dsec"><h3>${t('No seu save')}</h3><p class="hint">${t('Nenhum Pokémon do save tem esta habilidade.')}</p></section>`;
  rows.sort((a, b) => (b.has ? 1 : 0) - (a.has ? 1 : 0) || (all[b.i].level || 0) - (all[a.i].level || 0));
  const shown = rows.slice(0, 24);
  const items = shown.map(({ i, has }) => {
    const m = all[i];
    const where = m.location === 'party' ? `${t('Equipe')} ${m.slot}` : `${m.where} · ${m.slot}`;
    const e = entryOf(m);
    const slot = !has && e ? e.species.abilities.findIndex(x => x && normName(x) === r.key) : -1;
    const sub = has ? where : `${where} · ${swapHow(slot, free)}`;
    return `<li><button class="result" type="button" data-mon="${i}">
      <img data-sprite="1" src="${esc(iconSrc(m.species))}"${m.species.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
      <span class="r-main"><b>${esc(m.hasNickname ? m.nickname : m.species.name)}</b>${has ? ` <span class="mv-mine">✓ ${t('tem')}</span>` : ''}<span class="r-sub">${esc(sub)}</span></span>
      <span class="r-lv">${t('Nv.')} ${m.level ?? '?'}</span></button></li>`;
  }).join('');
  return `<section class="dsec"><h3>${t('No seu save')} <span class="learn-count">${rows.length}</span></h3>
    <p class="hint">${esc(t('{k} têm, {c} podem ter.', { k: r.mine.length, c: r.could.length }))}</p>
    <ul class="results pdx-owned mv-own">${items}</ul>
    ${rows.length > shown.length ? `<p class="hint">${t('Mostrando {s} de {n}.', { s: shown.length, n: rows.length })}</p>` : ''}</section>`;
}

/** As espécies que têm a habilidade (1ª/2ª e oculta; as do save primeiro). `lists` guarda as listas para o "Mostrar todas". */
function holdersHtml(r, index, owned, lists) {
  const order = (a, b) => (owned.has(b[0]) ? 1 : 0) - (owned.has(a[0]) ? 1 : 0);
  const groups = [
    [t('Habilidade comum'), r.normal.map(e => [e, null]).sort(order)],
    [t('Habilidade oculta'), r.hidden.map(e => [e, null]).sort(order)],
  ].filter(([, list]) => list.length);
  return `<section class="dsec"><h3>${t('Quem tem')}</h3>${groups.map(([title, list]) => {
    const k = lists.push(list) - 1;
    return `<h4>${esc(title)} <span class="learn-count">${list.length}</span></h4>
    <ul class="usage-mates mv-learners" data-list="${k}">${learnerChips(list, index, owned, 0, LEARNER_SHOW)}</ul>
    ${list.length > LEARNER_SHOW ? `<button type="button" class="btn btn-ghost btn-small" data-more="${k}">${t('Mostrar todas ({n})', { n: list.length })}</button>` : ''}`;
  }).join('')}</section>`;
}

/**
 * Detalhe de uma habilidade (na janela do detalhe): a descrição, os do save e quem tem.
 * @returns {{ html: string, lists: Array }}
 */
export function abilityDetail(r, ctx) {
  const { all, entries, entryOf, nav, free } = ctx;
  const index = new Map(entries.map((e, i) => [e, i]));
  const owned = new Set(all.filter(m => !m.egg).map(entryOf).filter(Boolean));
  const lists = [];
  const arrows = nav && nav.n > 1 ? `<button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="-1" aria-label="${t('Anterior')}"${nav.i <= 0 ? ' disabled' : ''}>‹</button>
    <span class="pdx-pos">${nav.i + 1}/${nav.n}</span>
    <button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="1" aria-label="${t('Próximo')}"${nav.i >= nav.n - 1 ? ' disabled' : ''}>›</button>` : '';
  const fact = (k, v) => `<div><dt>${k}</dt><dd><b>${v}</b></dd></div>`;
  const html = `<div class="sheet-bar pdx-sheet-bar">
    <b class="sheet-bar-name" aria-hidden="true">${esc(r.name)}</b>
    ${arrows}
    <button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
  </div>
  <div class="mon mv-detail">
    <div class="mon-hero"><div class="mv-hero"><h2 id="detail-title">${esc(r.name)}</h2></div>
      <p class="mv-text">${esc(r.text || t('Sem descrição para esta habilidade.'))}${r.note ? `<small class="tip-note">${esc(r.note)}</small>` : ''}</p></div>
    <dl class="facts-grid mv-facts ab-facts">${fact(t('Espécies'), r.species)}${fact(t('Como oculta'), r.hidden.length)}</dl>
    <div class="mv-cols"><div>${mineHtml(r, all, entryOf, free)}</div>
    <div>${holdersHtml(r, index, owned, lists)}</div></div>
  </div>`;
  return { html, lists };
}

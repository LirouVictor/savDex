// Dex de habilidades (janela "Habilidades" em Ferramentas; este pacote só é carregado ao abrir): as habilidades das
// espécies do jogo do save (as mesmas entradas da Pokédex), com a descrição, quem do save tem e quem pode ter (a espécie
// tem a habilidade em outro espaço: Ability Capsule ou Patch, nos jogos que têm) e todas as espécies que a têm.

import { t } from '../i18n.js';
import { esc } from '../ui/render.js';
import { normName } from '../ui/tips.js';
import { learnerChips, LEARNER_SHOW, ownPill, ownRow, ownGroups, speciesGroups, detailBar, detailTabs } from '../movedex/view.js';

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

/**
 * @param {{ q?: string, mine?: ''|'has'|'could', slot?: ''|'normal'|'hidden', sort?: string }} f  A busca vale para o
 *   nome e a descrição; `slot`: comum (1ª/2ª) em alguma espécie ou só oculta.
 */
export function filterAbilities(rows, f) {
  const q = norm(f.q).trim();
  const out = rows.filter(r => (!q || r.search.includes(q) || norm(r.text).includes(q))
    && (!f.mine || (f.mine === 'has' ? r.mine.length : r.mine.length || r.could.length))
    && (!f.slot || (f.slot === 'normal' ? r.normal.length : !r.normal.length && r.hidden.length)));
  return out.sort(SORTS[f.sort] || SORTS.name);
}

/** Uma linha da lista: nome, quantos do save têm, a descrição (duas linhas) e quantas espécies. */
export function abilityRow(r, i) {
  const mine = ownPill(r.mine.length, r.could.length, t('Pokémon do save que têm'), t('Pokémon do save que podem ter (outra habilidade da espécie)'));
  const onlyHidden = !r.normal.length && r.hidden.length ? `<span class="pdx-chip ab-tag">${t('só oculta')}</span>` : '';
  return `<li><button class="result ab-row" type="button" data-ab="${i}">
    <span class="r-main"><span class="dx-name"><b>${esc(r.name)}</b>${mine}${onlyHidden}</span><span class="r-sub ab-sub">${esc(r.text || '—')}</span></span>
    <span class="mv-nums ab-nums"><span title="${esc(t('Espécies'))}">${r.species}<small>${t('Espécies')}</small></span></span>
  </button></li>`;
}

/** Como trocar para esta habilidade no jogo: [etiqueta, explicação] (o item, ou só onde a espécie a tem). */
function swapHow(slot, free) {
  if (slot === 2) return free === 'patch' ? ['Ability Patch', t('oculta da espécie: dê um Ability Patch')] : [t('Oculta'), t('oculta da espécie')];
  return free ? ['Ability Capsule', t('habilidade {n} da espécie: dê uma Ability Capsule', { n: slot + 1 })] : [t('Habilidade {n}', { n: slot + 1 }), t('habilidade {n} da espécie', { n: slot + 1 })];
}

/** Os Pokémon do save que têm a habilidade e os que podem ter (a espécie tem em outro espaço), em grupos. */
function mineHtml(r, all, entryOf, free) {
  const n = r.mine.length + r.could.length;
  if (!n) return { n, html: `<p class="hint">${t('Nenhum Pokémon do save tem esta habilidade.')}</p>` };
  const byLv = (a, b) => (all[b].level || 0) - (all[a].level || 0);
  const could = i => {
    const e = entryOf(all[i]);
    const slot = e ? e.species.abilities.findIndex(x => x && normName(x) === r.key) : -1;
    return ownRow(all[i], i, slot >= 0 ? [swapHow(slot, free)] : []);
  };
  return { n, html: ownGroups([
    { title: t('Têm'), rows: [...r.mine].sort(byLv).map(i => ownRow(all[i], i)) },
    { title: t('Podem ter'), note: free ? t('A espécie tem esta habilidade em outro espaço; o item do jogo troca.') : t('A espécie tem esta habilidade em outro espaço.'), rows: [...r.could].sort(byLv).map(could) },
  ]) };
}

/**
 * Detalhe de uma habilidade (na janela do detalhe): a descrição no topo e, em abas, os do save e quem tem.
 * @returns {{ html: string, lists: Array }}
 */
export function abilityDetail(r, ctx) {
  const { all, entries, entryOf, nav, free, tab = 'mine' } = ctx;
  const index = new Map(entries.map((e, i) => [e, i]));
  const owned = new Set(all.filter(m => !m.egg).map(entryOf).filter(Boolean));
  const lists = [];
  const order = (a, b) => (owned.has(b[0]) ? 1 : 0) - (owned.has(a[0]) ? 1 : 0);
  const mine = mineHtml(r, all, entryOf, free);
  const who = speciesGroups([
    [t('Habilidade comum'), r.normal.map(e => [e, null]).sort(order)],
    [t('Habilidade oculta'), r.hidden.map(e => [e, null]).sort(order)],
  ], index, owned, lists);
  const chip = (v, cls = '') => `<li class="pdx-chip${cls}">${esc(v)}</li>`;
  const html = `${detailBar(r.name, '', nav)}
  <div class="mon mv-detail">
    <div class="mon-hero dx-hero">
      <h2 id="detail-title">${esc(r.name)}</h2>
      <ul class="pdx-chips">${chip(t(r.species === 1 ? '1 espécie' : '{n} espécies', { n: r.species }))}
        ${!r.normal.length ? chip(t('só oculta')) : r.hidden.length ? chip(t('{n} como oculta', { n: r.hidden.length })) : ''}
        ${r.mine.length ? chip(`✓ ${t('{n} do save têm', { n: r.mine.length })}`, ' on') : ''}</ul>
      <p class="dx-text">${esc(r.text || t('Sem descrição para esta habilidade.'))}${r.note ? `<small class="tip-note">${esc(r.note)}</small>` : ''}</p>
    </div>
    ${detailTabs([['mine', t('No seu save'), mine.n, mine.html], ['who', t('Quem tem'), r.species, who || `<p class="hint">—</p>`]], tab === 'mine' && !mine.n ? 'who' : tab)}
  </div>`;
  return { html, lists };
}

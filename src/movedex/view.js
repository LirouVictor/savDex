// Golpedex (janela "Golpes" em Ferramentas; este pacote só é carregado ao abrir): todos os golpes do jogo do save, com
// tipo, categoria, poder, precisão e PP, e o detalhe de cada um: a descrição, quem do save sabe ou pode aprender e todas
// as espécies que aprendem (por nível, tutor/TM e ovo), pelos mesmos golpes do detalhe da Pokédex (o `dex` de app.js).

import { t } from '../i18n.js';
import { esc, typeChip, categoryName, infoBtn } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import { moveInfo } from '../parser/describe.js';
import { dexIds } from '../ui/dex.js';
import { speciesMon } from '../pokedex/view.js';

export const PAGE = 30;
// Formas que só existem na batalha: aprendem o mesmo que a forma comum e só repetiriam a espécie na lista
const BATTLE_FORM = /^(Mega|Primal|Gigantamax)\b/;
// Espécies mostradas de saída em cada forma de aprender (o resto com "Mostrar todas")
export const LEARNER_SHOW = 48;
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Os golpes que existem no jogo do save, pelos IDs usados nos Pokémon do save: Quetzal 1–848 (ROM), Unbound e SoulGold
 * a tabela de golpes da ROM (os próprios com o ID negativo), Gen 3 1–354, DS os da geração e, sem tabela própria, os
 * do app.
 */
export function gameMoves(T, game) {
  const ids = [];
  if (T.quetzal && T.quetzal.moveData) T.quetzal.moveData.forEach((md, id) => { if (id && md) ids.push(id); });
  else if (T.unbound || T.soulgold) (T.unbound || T.soulgold).moves.forEach((v, u) => { if (u && v != null) ids.push(typeof v === 'number' ? v : -u); });
  else if (T.gen3) T.gen3.moves.forEach((mv, id) => { if (id && mv) ids.push(id); });
  else if (T.nds) (T.nds.moves[game && game.gen >= 5 ? 5 : 4] || []).forEach((row, id) => { if (id && row) ids.push(id); });
  else T.moves.forEach((row, id) => { if (id && row) ids.push(id); });
  return [...new Set(ids)];
}

/**
 * Quem aprende cada golpe: Map ID → { lv: [[entrada, nível]], tutor: [entrada], egg: [entrada] } (no SoulGold, `tutor`
 * junta TM/HM e tutor; o TM de cada golpe fica em dex.tm).
 */
export function learnersIndex(entries, dex) {
  const out = new Map();
  const at = id => out.get(id) || out.set(id, { lv: [], tutor: [], egg: [] }).get(id);
  if (!dex) return out;
  for (const e of entries) {
    if (BATTLE_FORM.test(e.species.form || '')) continue; // a mega aprende o mesmo que a forma comum
    const pid = dex.rom ? e.id : dexIds(speciesMon(e), dex).pid;
    const lv = pid ? dex.learn[pid] : null;
    if (lv) {
      const seen = new Set();
      for (let i = 1; i < lv.length; i += 2) {
        const mv = lv[i + 1];
        if (typeof mv !== 'number' || seen.has(mv)) continue; // o nível mais baixo
        seen.add(mv);
        at(mv).lv.push([e, lv[i]]);
      }
    }
    for (const mv of (dex.tutor && dex.tutor[e.id]) || []) at(mv).tutor.push(e);
    for (const mv of (dex.egg && dex.egg[e.id]) || []) at(mv).egg.push(e);
  }
  return out;
}

/** Uma linha por golpe do jogo: o ID, os dados, quantas espécies aprendem e quantos Pokémon do save sabem ou podem aprender. */
export function moveRows(T, game, learners, mine) {
  return gameMoves(T, game).map(id => {
    const info = moveInfo(id, T);
    const L = learners.get(id);
    const species = L ? new Set([...L.lv.map(x => x[0]), ...L.tutor, ...L.egg]).size : 0;
    const m = mine.get(id);
    return { id, info, key: norm(info.name), species, know: m ? m.know : 0, can: m ? m.can : 0 };
  }).filter(r => r.info && r.info.known);
}

/**
 * Quem do save sabe ou pode aprender cada golpe (sem ovos): Map ID → { know, can } (contagens). A entrada da Pokédex de
 * cada Pokémon é a da espécie e forma dele (`entryOf`).
 */
export function mineIndex(all, learners, entryOf) {
  const out = new Map();
  const at = id => out.get(id) || out.set(id, { know: 0, can: 0 }).get(id);
  const byEntry = new Map();
  for (const [id, L] of learners) {
    for (const e of [...L.lv.map(x => x[0]), ...L.tutor, ...L.egg]) (byEntry.get(e) || byEntry.set(e, new Set()).get(e)).add(id);
  }
  for (const m of all) {
    if (m.egg) continue;
    const known = new Set(m.moves.map(x => x.id));
    for (const id of known) at(id).know++;
    for (const id of byEntry.get(entryOf(m)) || []) if (!known.has(id)) at(id).can++;
  }
  return out;
}

const SORTS = {
  name: (a, b) => a.info.name.localeCompare(b.info.name),
  power: (a, b) => (b.info.power || 0) - (a.info.power || 0) || a.info.name.localeCompare(b.info.name),
  accuracy: (a, b) => (b.info.accuracy || 0) - (a.info.accuracy || 0) || a.info.name.localeCompare(b.info.name),
  pp: (a, b) => (b.info.pp || 0) - (a.info.pp || 0) || a.info.name.localeCompare(b.info.name),
  species: (a, b) => b.species - a.species || a.info.name.localeCompare(b.info.name),
};

/**
 * @param {{ q?: string, type?: string, cat?: ''|'0'|'1'|'2', mine?: ''|'know'|'can', min?: string, sort?: string }} f
 */
export function filterMoves(rows, f) {
  const q = norm(f.q).trim();
  const min = +f.min || 0;
  const out = rows.filter(r => (!q || r.key.includes(q))
    && (!f.type || r.info.type === f.type)
    && (f.cat === '' || f.cat == null || r.info.category === +f.cat)
    && (!f.mine || (f.mine === 'know' ? r.know : r.know || r.can))
    && (!min || (r.info.power || 0) >= min));
  return out.sort(SORTS[f.sort] || SORTS.name);
}


const num = v => (v ? String(v) : '—');

/** Etiqueta da categoria (Físico/Especial/Status) com o ícone de cada uma; '' sem categoria. */
export function catChip(c) {
  if (c == null) return '';
  return `<span class="cat-chip cat-${c}"><i aria-hidden="true"></i>${esc(categoryName(c))}</span>`;
}

/** Quantos Pokémon do save já têm (✓ N, ligado) ou podem ter (+N): a mesma etiqueta na lista das duas dex. */
export function ownPill(have, could, haveTitle, couldTitle) {
  if (have) return `<span class="own-pill on" title="${esc(haveTitle)}">✓ ${have}<span class="sr"> ${esc(haveTitle)}</span></span>`;
  if (could) return `<span class="own-pill" title="${esc(couldTitle)}">+${could}<span class="sr"> ${esc(couldTitle)}</span></span>`;
  return '';
}

/** Uma linha da lista: nome e quantos do save sabem; tipo e categoria embaixo; poder, precisão e PP à direita. */
export function moveRow(r, i) {
  const x = r.info;
  const mine = ownPill(r.know, r.can, t('Pokémon do save que já sabem'), t('Pokémon do save que podem aprender'));
  return `<li><button class="result mv-row" type="button" data-mv="${i}">
    <span class="r-main"><span class="dx-name"><b>${esc(x.name)}</b>${mine}</span>
      <span class="r-sub mv-sub">${x.type ? `<span class="type t-${esc(x.type)}">${esc(x.type)}</span>` : ''}${catChip(x.category)}</span></span>
    <span class="mv-nums"><span title="${esc(t('Poder'))}">${num(x.power)}<small>${t('Poder')}</small></span><span title="${esc(t('Precisão'))}">${num(x.accuracy)}<small>${t('Prec.')}</small></span><span title="PP">${num(x.pp)}<small>PP</small></span></span>
  </button></li>`;
}

/**
 * Como um Pokémon do save aprende o golpe: { tags, now } (tags = etiquetas curtas com a explicação no title; now = já
 * pode, sem treinar). null se não aprende.
 */
function howMon(id, m, L, dex, e) {
  const lv = L.lv.find(x => x[0] === e);
  const tags = [];
  let now = false;
  if (lv) {
    const ok = m.level != null && lv[1] <= m.level;
    now = now || ok;
    tags.push(lv[1] === 0 ? [t('Ao evoluir'), t('ao evoluir')] : ok ? [`${t('Nv.')} ${lv[1]} ✓`, t('por nível (Nv. {n}, já alcançado)', { n: lv[1] })] : [`${t('Nv.')} ${lv[1]}`, t('no Nv. {n}', { n: lv[1] })]);
  }
  if (L.tutor.includes(e)) {
    const tm = dex.tm && dex.tm[id];
    if (dex.teach === 'item') tags.push(tm ? [tm, t('com o {tm}', { tm })] : [t('Tutor'), t('com um tutor do jogo')]);
    else { tags.push([t('Tutor'), t('tutor (NOVO MOV.)')]); now = true; }
  }
  if (L.egg.includes(e)) tags.push([t('Ovo'), t('de ovo')]);
  return tags.length ? { tags, now } : null;
}

/** Linha de um Pokémon do save (sprite, nome, onde está, etiquetas e nível): os do save nas duas dex. */
export function ownRow(m, i, tags = []) {
  const where = m.location === 'party' ? `${t('Equipe')} ${m.slot}` : `${m.where} · ${m.slot}`;
  return `<li><button class="result own-row" type="button" data-mon="${i}">
    <img data-sprite="1" src="${esc(iconSrc(m.species))}"${m.species.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
    <span class="r-main"><b>${esc(m.hasNickname ? m.nickname : m.species.name)}</b>
      <span class="r-sub own-sub"><span>${esc(where)}</span>${tags.map(([label, title]) => `<span class="how-tag" title="${esc(title)}">${esc(label)}<span class="sr"> (${esc(title)})</span></span>`).join('')}</span></span>
    <span class="r-lv">${t('Nv.')} ${m.level ?? '?'}</span></button></li>`;
}

/** Grupos de Pokémon do save (título, linhas), até `max` no total; '' sem nenhum. */
export function ownGroups(groups, max = 30) {
  let left = max, total = 0;
  const html = groups.filter(g => g.rows.length).map(g => {
    total += g.rows.length;
    const shown = g.rows.slice(0, Math.max(0, left));
    left -= shown.length;
    if (!shown.length) return '';
    return `<h4>${esc(g.title)} <span class="learn-count">${g.rows.length}</span></h4>${g.note ? `<p class="hint own-note">${esc(g.note)}</p>` : ''}
      <ul class="results own-list">${shown.join('')}</ul>`;
  }).join('');
  return html + (total > max ? `<p class="hint">${t('Mostrando {s} de {n}.', { s: max, n: total })}</p>` : '');
}

/** Os Pokémon do save que já sabem o golpe e os que podem aprender, em grupos: já sabem, aprendem agora, com treino. */
function mineHtml(id, L, all, dex, entryOf) {
  const know = [], now = [], later = [];
  all.forEach((m, i) => {
    if (m.egg) return;
    if (m.moves.some(x => x.id === id)) return know.push({ m, i });
    const h = L ? howMon(id, m, L, dex, entryOf(m)) : null;
    if (h) (h.now ? now : later).push({ m, i, h });
  });
  const n = know.length + now.length + later.length;
  if (!n) return { n, html: `<p class="hint">${t('Nenhum Pokémon do save sabe ou aprende este golpe.')}</p>` };
  const byLv = (a, b) => (b.m.level || 0) - (a.m.level || 0);
  const menu = dex.rom && dex.tutor && dex.teach !== 'item';
  return { n, html: ownGroups([
    { title: t('Já sabem'), rows: know.sort(byLv).map(({ m, i }) => ownRow(m, i)) },
    { title: t('Aprendem agora'), note: menu ? t('Pelo menu do Pokémon (NOVO MOV.), na hora e de graça.') : '', rows: now.sort(byLv).map(({ m, i, h }) => ownRow(m, i, h.tags)) },
    { title: dex.teach === 'item' ? t('Com treino, TM ou tutor') : t('Com treino'), rows: later.sort(byLv).map(({ m, i, h }) => ownRow(m, i, h.tags)) },
  ]) };
}

/** Botões das espécies (abrem o detalhe na Pokédex: `data-pdx-entry` = posição nas entradas). */
export function learnerChips(list, index, owned, from = 0, to = list.length) {
  return list.slice(from, to).map(([e, lv]) => {
    const sp = e.species;
    const own = owned.has(e);
    return `<li><button type="button" class="sp-chip${own ? ' own' : ''}" data-pdx-entry="${index.get(e)}">
      <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
      <span><b>${esc(sp.name)}${own ? ` <span class="sp-own" title="${esc(t('Você tem'))}">✓<span class="sr"> ${t('Você tem')}</span></span>` : ''}</b>${sp.form || lv != null ? `<small>${sp.form ? esc(sp.form) : ''}${sp.form && lv != null ? ' · ' : ''}${lv != null ? `<span class="sp-lv">${lv === 0 ? t('Evo.') : `${t('Nv.')} ${lv}`}</span>` : ''}</small>` : ''}</span></button></li>`;
  }).join('');
}

/** Grupos de espécies (título, lista de [entrada, nível]); `lists` guarda as listas para o "Mostrar todas". */
export function speciesGroups(groups, index, owned, lists) {
  return groups.filter(([, list]) => list.length).map(([title, list]) => {
    const k = lists.push(list) - 1;
    return `<h4>${esc(title)} <span class="learn-count">${list.length}</span></h4>
    <ul class="sp-chips" data-list="${k}">${learnerChips(list, index, owned, 0, LEARNER_SHOW)}</ul>
    ${list.length > LEARNER_SHOW ? `<button type="button" class="btn btn-ghost btn-small sp-more" data-more="${k}">${t('Mostrar todas ({n})', { n: list.length })}</button>` : ''}`;
  }).join('');
}

/** As espécies que aprendem, por forma de aprender (as do save primeiro). */
function learnersHtml(id, L, dex, index, owned, lists) {
  if (!L) return { n: 0, html: `<p class="hint">${t('Nenhuma espécie aprende este golpe pelos dados do app.')}</p>` };
  const order = (a, b) => (owned.has(b[0]) ? 1 : 0) - (owned.has(a[0]) ? 1 : 0);
  const n = new Set([...L.lv.map(x => x[0]), ...L.tutor, ...L.egg]).size;
  const about = !dex.rom ? `<p class="hint">${infoBtn(t('Quem aprende'), t('Golpes por nível dos jogos oficiais mais recentes; o jogo do save pode ser diferente. TM e tutor não entram.'))} ${t('Provável')}</p>` : '';
  return { n, html: about + speciesGroups([
    [t('Por nível'), L.lv.map(([e, lv]) => [e, lv]).sort(order)],
    [dex.teach === 'item' ? (dex.tm && dex.tm[id] ? t('Por {tm}', { tm: dex.tm[id] }) : t('Por tutor')) : t('Por tutor'), L.tutor.map(e => [e, null]).sort(order)],
    [t('De ovo'), L.egg.map(e => [e, null]).sort(order)],
  ], index, owned, lists) };
}

/** Barra do detalhe (nome quando rola, ‹ posição/total ›, ✕): a mesma da Pokédex. */
export function detailBar(name, tc, nav) {
  const arrows = nav && nav.n > 1 ? `<button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="-1" aria-label="${t('Anterior')}"${nav.i <= 0 ? ' disabled' : ''}>‹</button>
    <span class="pdx-pos" title="${esc(t('{i} de {n} na lista', { i: nav.i + 1, n: nav.n }))}">${nav.i + 1}/${nav.n}</span>
    <button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="1" aria-label="${t('Próximo')}"${nav.i >= nav.n - 1 ? ' disabled' : ''}>›</button>` : '';
  return `<div class="sheet-bar pdx-sheet-bar${tc}">
    <b class="sheet-bar-name" aria-hidden="true">${esc(name)}</b>
    ${arrows}
    <button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
  </div>`;
}

/** Abas do detalhe (as mesmas da Pokédex): [chave, rótulo, quantos, html]; `tab` = a aberta. */
export function detailTabs(panes, tab) {
  const cur = panes.some(p => p[0] === tab) ? tab : panes[0][0];
  return `<div class="bt-tabs pdx-tabs" role="tablist" aria-label="${esc(t('Partes do detalhe'))}">${panes.map(([k, label, n]) =>
    `<button type="button" role="tab" class="pdx-tab" data-ptab="${k}" id="dx-tab-${k}" aria-controls="dx-pane-${k}" aria-selected="${k === cur}">${esc(label)}${n != null ? ` <span class="tab-n">${n}</span>` : ''}</button>`).join('')}</div>
  ${panes.map(([k, , , html]) => `<div class="pdx-pane" role="tabpanel" id="dx-pane-${k}" aria-labelledby="dx-tab-${k}" data-pane="${k}"${k === cur ? '' : ' hidden'}>${html}</div>`).join('')}`;
}

/** As abas dos detalhes de golpe e de habilidade. */
export const TABS = ['mine', 'who'];

/**
 * Detalhe de um golpe (na janela do detalhe): no topo o tipo, a categoria, os números e a descrição (`[data-mtext]`,
 * preenchida à parte); em abas, os do save e quem aprende. `tab` = a aba aberta (a última escolhida).
 * @returns {{ html: string, lists: Array }} `lists`: as listas de espécies de cada forma de aprender
 */
export function moveDetail(r, ctx) {
  const { dex, learners, all, entries, entryOf, nav, tab = 'mine' } = ctx;
  const x = r.info;
  const L = learners.get(r.id);
  const index = new Map(entries.map((e, i) => [e, i]));
  const owned = new Set(all.filter(m => !m.egg).map(entryOf).filter(Boolean));
  const lists = [];
  const tc = x.type ? ` t-${esc(x.type)}` : '';
  const mine = mineHtml(r.id, L, all, dex || {}, entryOf);
  const who = learnersHtml(r.id, L, dex || {}, index, owned, lists);
  const stat = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const html = `${detailBar(x.name, tc, nav)}
  <div class="mon mv-detail">
    <div class="mon-hero dx-hero${tc}">
      <h2 id="detail-title">${esc(x.name)}</h2>
      <ul class="pdx-chips">${x.type ? `<li>${typeChip(x.type)}</li>` : ''}${x.category != null ? `<li>${catChip(x.category)}</li>` : ''}
        ${r.know ? `<li class="pdx-chip on">✓ ${esc(t('{n} do save sabem', { n: r.know }))}</li>` : ''}</ul>
      <dl class="dx-stats">${stat(t('Poder'), num(x.power))}${stat(t('Precisão'), x.accuracy ? `${x.accuracy}%` : '—')}${stat('PP', num(x.pp))}</dl>
      <p class="dx-text" data-mtext>${t('Carregando a descrição…')}</p>
    </div>
    ${detailTabs([['mine', t('No seu save'), mine.n, mine.html], ['who', t('Quem aprende'), who.n, who.html]], tab === 'mine' && !mine.n ? 'who' : tab)}
  </div>`;
  return { html, lists };
}

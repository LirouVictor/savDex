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

/** Uma linha da lista (o estilo dos resultados da Buscar e da Pokédex). */
export function moveRow(r, i) {
  const x = r.info;
  const mine = r.know ? `<span class="mv-mine" title="${esc(t('Pokémon do save que já sabem'))}">✓ ${r.know}</span>`
    : r.can ? `<span class="mv-mine can" title="${esc(t('Pokémon do save que podem aprender'))}">+${r.can}</span>` : '';
  return `<li><button class="result mv-row${x.type ? ` t-${esc(x.type)}` : ''}" type="button" data-mv="${i}">
    <span class="r-main"><b>${esc(x.name)}</b>${mine}
      <span class="r-sub mv-sub">${x.type ? `<span class="type t-${esc(x.type)}">${esc(x.type)}</span>` : ''}<span>${esc(categoryName(x.category))}</span></span></span>
    <span class="mv-nums"><span title="${esc(t('Poder'))}">${num(x.power)}<small>${t('Poder')}</small></span><span title="${esc(t('Precisão'))}">${num(x.accuracy)}<small>${t('Prec.')}</small></span><span title="PP">${num(x.pp)}<small>PP</small></span></span>
  </button></li>`;
}

/** Como um Pokémon do save aprende o golpe: { how, now } (now = já pode, sem treinar). null se não aprende. */
function howMon(id, m, L, dex, e) {
  const lv = L.lv.find(x => x[0] === e);
  const out = [];
  let now = false;
  if (lv) {
    const ok = m.level != null && lv[1] <= m.level;
    now = now || ok;
    out.push(lv[1] === 0 ? t('ao evoluir') : ok ? t('por nível (Nv. {n}, já alcançado)', { n: lv[1] }) : t('no Nv. {n}', { n: lv[1] }));
  }
  if (L.tutor.includes(e)) {
    const tm = dex.tm && dex.tm[id];
    if (dex.teach === 'item') out.push(tm ? t('com o {tm}', { tm }) : t('com um tutor do jogo'));
    else { out.push(t('tutor (NOVO MOV.)')); now = true; }
  }
  if (L.egg.includes(e)) out.push(t('de ovo'));
  return out.length ? { how: out.join(' · '), now } : null;
}

/** Os Pokémon do save que já sabem o golpe e os que podem aprender (os que já podem primeiro). */
function mineHtml(id, L, all, dex, entryOf) {
  const rows = [];
  all.forEach((m, i) => {
    if (m.egg) return;
    const knows = m.moves.some(x => x.id === id);
    const h = !knows && L ? howMon(id, m, L, dex, entryOf(m)) : null;
    if (knows || h) rows.push({ m, i, knows, h });
  });
  if (!rows.length) return `<section class="dsec"><h3>${t('No seu save')}</h3><p class="hint">${t('Nenhum Pokémon do save sabe ou aprende este golpe.')}</p></section>`;
  const rank = r => (r.knows ? 0 : r.h.now ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || (b.m.level || 0) - (a.m.level || 0));
  const shown = rows.slice(0, 24);
  const items = shown.map(({ m, i, knows, h }) => {
    const where = m.location === 'party' ? `${t('Equipe')} ${m.slot}` : `${m.where} · ${m.slot}`;
    return `<li><button class="result" type="button" data-mon="${i}">
      <img data-sprite="1" src="${esc(iconSrc(m.species))}"${m.species.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
      <span class="r-main"><b>${esc(m.hasNickname ? m.nickname : m.species.name)}</b>${knows ? ` <span class="mv-mine">✓ ${t('sabe')}</span>` : ''}<span class="r-sub">${esc(knows ? where : `${where} · ${h.how}`)}</span></span>
      <span class="r-lv">${t('Nv.')} ${m.level ?? '?'}</span></button></li>`;
  }).join('');
  const knowN = rows.filter(r => r.knows).length;
  return `<section class="dsec"><h3>${t('No seu save')} <span class="learn-count">${rows.length}</span></h3>
    <p class="hint">${esc(t('{k} sabem, {c} podem aprender.', { k: knowN, c: rows.length - knowN }))}</p>
    <ul class="results pdx-owned mv-own">${items}</ul>
    ${rows.length > shown.length ? `<p class="hint">${t('Mostrando {s} de {n}.', { s: shown.length, n: rows.length })}</p>` : ''}</section>`;
}

/** Botões das espécies (abrem o detalhe na Pokédex: `data-pdx-entry` = posição nas entradas). */
export function learnerChips(list, index, owned, from = 0, to = list.length) {
  return list.slice(from, to).map(([e, lv]) => {
    const sp = e.species;
    return `<li><button type="button" class="usage-mate${owned.has(e) ? ' own' : ''}" data-pdx-entry="${index.get(e)}">
      <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
      <b>${esc(sp.name)}${sp.form ? ` <small>(${esc(sp.form)})</small>` : ''}</b>${lv != null ? `<small>${lv === 0 ? t('Evo.') : `${t('Nv.')} ${lv}`}</small>` : ''}</button></li>`;
  }).join('');
}

/** As espécies que aprendem, por forma de aprender (as do save primeiro). `lists` guarda as listas para o "Mostrar todas". */
function learnersHtml(id, L, dex, index, owned, lists) {
  if (!L) return `<section class="dsec"><h3>${t('Quem aprende')}</h3><p class="hint">${t('Nenhuma espécie aprende este golpe pelos dados do app.')}</p></section>`;
  const order = (a, b) => (owned.has(b[0]) ? 1 : 0) - (owned.has(a[0]) ? 1 : 0);
  const groups = [
    [t('Por nível'), L.lv.map(([e, lv]) => [e, lv]).sort(order)],
    [dex.teach === 'item' ? (dex.tm && dex.tm[id] ? t('Por {tm}', { tm: dex.tm[id] }) : t('Por tutor')) : t('Por tutor'), L.tutor.map(e => [e, null]).sort(order)],
    [t('De ovo'), L.egg.map(e => [e, null]).sort(order)],
  ].filter(([, list]) => list.length);
  return `<section class="dsec"><h3>${t('Quem aprende')}</h3>${groups.map(([title, list]) => {
    const k = lists.push(list) - 1;
    return `<h4>${esc(title)} <span class="learn-count">${list.length}</span></h4>
    <ul class="usage-mates mv-learners" data-list="${k}">${learnerChips(list, index, owned, 0, LEARNER_SHOW)}</ul>
    ${list.length > LEARNER_SHOW ? `<button type="button" class="btn btn-ghost btn-small" data-more="${k}">${t('Mostrar todas ({n})', { n: list.length })}</button>` : ''}`;
  }).join('')}</section>`;
}

/**
 * Detalhe de um golpe (na janela do detalhe): dados, descrição (`[data-mtext]`, preenchida à parte), os do save e quem
 * aprende. @returns {{ html: string, lists: Array }} `lists`: as listas de espécies de cada forma de aprender
 */
export function moveDetail(r, ctx) {
  const { T, dex, learners, all, entries, entryOf, nav } = ctx;
  const x = r.info;
  const L = learners.get(r.id);
  const index = new Map(entries.map((e, i) => [e, i]));
  const owned = new Set(all.filter(m => !m.egg).map(entryOf).filter(Boolean));
  const lists = [];
  const tc = x.type ? ` t-${esc(x.type)}` : '';
  const arrows = nav && nav.n > 1 ? `<button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="-1" aria-label="${t('Anterior')}"${nav.i <= 0 ? ' disabled' : ''}>‹</button>
    <span class="pdx-pos">${nav.i + 1}/${nav.n}</span>
    <button class="btn btn-ghost btn-icon pdx-arrow" type="button" data-nav="1" aria-label="${t('Próximo')}"${nav.i >= nav.n - 1 ? ' disabled' : ''}>›</button>` : '';
  const fact = (k, v) => `<div><dt>${k}</dt><dd><b>${v}</b></dd></div>`;
  const about = dex && !dex.rom ? ` ${infoBtn(t('Quem aprende'), t('Golpes por nível dos jogos oficiais mais recentes; o jogo do save pode ser diferente. TM e tutor não entram.'))}` : '';
  const html = `<div class="sheet-bar pdx-sheet-bar${tc}">
    <b class="sheet-bar-name" aria-hidden="true">${esc(x.name)}</b>
    ${arrows}
    <button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
  </div>
  <div class="mon mv-detail">
    <div class="mon-hero${tc}"><div class="mv-hero"><h2 id="detail-title">${esc(x.name)}</h2>${x.type ? typeChip(x.type) : ''}</div>
      <p class="mv-text" data-mtext>${t('Carregando a descrição…')}</p></div>
    <dl class="facts-grid mv-facts">${fact(t('Categoria'), esc(categoryName(x.category) || '—'))}${fact(t('Poder'), num(x.power))}${fact(t('Precisão'), x.accuracy ? `${x.accuracy}%` : '—')}${fact('PP', num(x.pp))}</dl>
    <div class="mv-cols"><div>${mineHtml(r.id, L, all, dex || {}, entryOf)}</div>
    <div>${learnersHtml(r.id, L, dex || {}, index, owned, lists).replace('</h3>', `${about}</h3>`)}</div></div>
  </div>`;
  return { html, lists };
}

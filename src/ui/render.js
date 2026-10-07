// Templates HTML da interface. Strings simples, sem framework.

import { spriteSrc, iconSrc, spriteUrl } from './sprites.js';
import { SHOWDOWN_ORDER, STAT_LABEL, formName } from '../export.js';
import { analyzeTeam, defenseMatchups } from '../analysis.js';
import { t, num } from '../i18n.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad5 = n => String(n).padStart(5, '0');
const PROBABLE = 'provável';

export function typeChips(types) {
  if (!types.length) return '';
  return `<div class="types">${types.map(t => `<span class="type t-${esc(t)}">${esc(t)}</span>`).join('')}</div>`;
}

/** Ícone de gênero em pixel art (símbolos #male/#female no index.html). */
function genderIcon(g) {
  if (!g || !g.symbol) return '';
  const f = g.symbol === '♀';
  return ` <svg class="gender ${f ? 'f' : 'm'}" viewBox="0 0 12 12" width="12" height="12" role="img" aria-label="${esc(t(g.name))}" shape-rendering="crispEdges"><title>${esc(t(g.name))}</title><use href="#${f ? 'female' : 'male'}"/></svg>`;
}

function badge(conf) {
  if (conf === PROBABLE) return ` <span class="badge" title="${t('Identificação provável, ainda não confirmada')}">${t('provável')}</span>`;
  if (conf === 'desconhecido') return ` <span class="badge" title="${t('ID ainda não mapeado')}">?</span>`;
  return '';
}

function speciesLabel(sp) {
  return esc(sp.name) + (sp.form ? ` <span class="form">(${esc(sp.form === '?' ? t('forma ?') : formName(sp.form))})</span>` : '');
}

function portrait(m, size = 96) {
  const sp = m.species;
  const tc = sp.types[0] ? ` t-${esc(sp.types[0])}` : '';
  // Sprite shiny com o normal como alternativa, se a versão shiny não existir
  const next = m.shiny && sp.spriteId ? ` data-next="${esc(spriteSrc(sp))}"` : '';
  return `<div class="portrait${tc}"><img data-sprite="1"${next} src="${esc(spriteSrc(sp, m.shiny))}" width="${size}" height="${size}" alt="" decoding="async" loading="lazy" crossorigin="anonymous"></div>`;
}

const CATEGORY = ['Físico', 'Especial', 'Status'];
export const categoryName = c => (c !== null && c !== undefined ? t(CATEGORY[c]) : '');

function movesList(moves) {
  if (!moves.length) return `<p class="hint">${t('Sem golpes.')}</p>`;
  return `<ul class="moves">${moves.map(mv => {
    const power = mv.power ? mv.power : '—';
    const acc = mv.accuracy ? mv.accuracy + '%' : '—';
    const cat = categoryName(mv.category) || '—';
    return `<li><details class="move t-${esc(mv.type || 'none')}">
      <summary><span>${esc(mv.name)}</span><span class="pp">${mv.pp} PP</span>
        <span class="mt">${esc(mv.type || '—')} · ${esc(cat)}</span></summary>
      <div class="move-info">
        <span><span class="k">${t('Poder')}</span> ${power}</span><span><span class="k">${t('Precisão')}</span> ${acc}</span>
        <p class="move-desc" data-move="${mv.id}"></p>
      </div>
    </details></li>`;
  }).join('')}</ul>`;
}

/** Tabela de stats com colunas fixas: rótulo, [valor], barra, IV, EV. */
function statRows(m, { withStats }) {
  const max = withStats ? Math.max(...SHOWDOWN_ORDER.map(k => m.stats[k]), 1) : 31;
  const nat = m.nature;
  const rows = SHOWDOWN_ORDER.map(k => {
    const cls = nat && nat.plus === k ? 'plus' : nat && nat.minus === k ? 'minus' : '';
    const mark = cls === 'plus' ? '+' : cls === 'minus' ? '−' : '';
    const iv = m.ivs[k];
    const value = withStats ? m.stats[k] : iv;
    // HP atual só quando o Pokémon está ferido (HP cheio repetiria o máximo)
    const hurt = withStats && k === 'hp' && m.hp != null && m.hp < m.stats.hp;
    const num = hurt ? `<span title="${esc(t('HP atual / máximo'))}">${m.hp}<small>/${m.stats.hp}</small></span>` : withStats ? m.stats[k] : '';
    return `<tr>
      <th class="${cls}" scope="row">${STAT_LABEL[k]}${mark}</th>
      ${withStats ? `<td class="num${hurt ? ' hurt' : ''}">${num}</td>` : ''}
      <td><div class="bar"><i style="width:${Math.round(value / max * 100)}%"></i></div></td>
      <td class="iv${iv === 31 ? ' max' : ''}">${iv}</td>
      <td class="ev">${m.evs[k]}</td>
    </tr>`;
  }).join('');
  const head = `<thead><tr><td></td>${withStats ? '<td></td>' : ''}<td></td><th scope="col" class="iv">IV</th><th scope="col" class="ev">EV</th></tr></thead>`;
  const caption = t(!withStats ? 'Barras = IV (0–31). Stats não calculados (espécie sem stats base conhecidos).'
    : m.statsCalculated ? 'Stats calculados (o PC não guarda stats): stats base oficiais + nível, IVs, EVs e natureza. Barras relativas ao maior stat.'
    : 'Barras relativas ao maior stat deste Pokémon.');
  return `<table class="stats"><caption>${caption}</caption>${head}<tbody>${rows}</tbody></table>`;
}

const ivEvTable = m => statRows(m, { withStats: false });
const statsTable = m => statRows(m, { withStats: true });

function ballChip(b) {
  if (!b) return `<span class="chip unread"><span class="k">${t('Bola')}</span> ${t('não lida')}</span>`;
  return `<span class="chip"><span class="k">${t('Bola')}</span><b>${esc(b.name)}</b>${badge(b.confidence)}</span>`;
}

function natureChip(n, pidNature = null) {
  if (!n) return `<span class="chip unread"><span class="k">${t('Natureza')}</span> ${t('não lida')}</span>`;
  const eff = n.plus ? `+${STAT_LABEL[n.plus]} −${STAT_LABEL[n.minus]}` : t('neutra');
  const title = pidNature ? ` title="${esc(t('Natureza tirada dos stats salvos (o PID indica {name}).', { name: pidNature.name }))}"` : '';
  return `<span class="chip"${title}><span class="k">${t('Natureza')}</span><b>${esc(n.name)}</b> <span class="k">${eff}</span></span>`;
}

function hiddenPowerChip(type) {
  if (!type) return '';
  return `<span class="chip"><span class="k">Hidden Power</span>${typeChip(type)}</span>`;
}

function itemChip(item, complete) {
  if (!complete) return `<span class="chip unread"><span class="k">Item</span> ${t('não lido')}</span>`;
  if (!item) return `<span class="chip"><span class="k">Item</span> ${t('nenhum')}</span>`;
  return `<span class="chip"><span class="k">Item</span><b>${esc(item.name)}</b>${badge(item.confidence)}</span>`;
}

function abilityChip(ab) {
  if (!ab) return `<span class="chip unread"><span class="k">${t('Habilidade')}</span> ${t('não lida')}</span>`;
  return `<span class="chip"><span class="k">${t('Habilidade')}</span><b>${esc(ab.name)}</b>${ab.hidden ? ` <span class="k">${t('oculta')}</span>` : ''}${badge(ab.confidence)}</span>`;
}

function monHeader(m, headingTag = 'h3', idAttr = '') {
  const sp = m.species;
  const title = m.hasNickname ? esc(m.nickname) : speciesLabel(sp);
  const sub = [
    m.hasNickname ? speciesLabel(sp) : null,
    `#${m.dexNo ?? m.speciesId}`,
  ].filter(Boolean).join(' · ');
  return `<div class="mon-head">
    ${portrait(m)}
    <div>
      <${headingTag} class="mon-name"${idAttr}>${title}${genderIcon(m.gender)}${m.shiny ? ' <span class="shiny" title="Shiny">★<span class="sr"> shiny</span></span>' : ''}${badge(sp.confidence)}</${headingTag}>
      <div class="mon-sub">${sub}${m.level ? ` · <span class="lv"${m.levelFromExp ? ` title="${t('Calculado pela experiência')}"` : ''}>${t('Nv.')} ${m.level}</span>` : ''}</div>
      ${typeChips(sp.types)}
    </div>
  </div>`;
}

export function trainerWin(d, fileName) {
  const tr = d.trainer;
  const pcTotal = d.pc.boxes.reduce((a, b) => a + b.slots.length, 0);
  // Números de consulta numa linha discreta; o destaque fica para o nome, o jogo e o resumo
  const kv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const game = d.game ? d.game.name : '';
  return `<section class="win trainer" aria-labelledby="trainer-h">
    <div class="win-title"><h2 id="trainer-h">${t('Treinador')}</h2><small class="file" title="${esc(fileName)}">${esc(fileName)}</small></div>
    <p class="trainer-name pixel">${esc(tr.name || '—')}</p>
    ${game ? `<p class="game-chip"><span class="sr">${t('Jogo')}: </span><b>${esc(game)}</b></p>` : ''}
    <dl class="kv">
      ${kv('ID', pad5(tr.tid))}${kv('SID', pad5(tr.sid))}${kv(t('Equipe'), `${d.party.length}/6`)}${kv('PC', pcTotal)}${tr.saveIndex != null ? kv(t('Save nº'), tr.saveIndex) : ''}
    </dl>
    ${summaryHtml(d.summary)}
  </section>`;
}

/** Resumo do save (só os campos lidos neste jogo): blocos de tempo, dinheiro, insígnias e Pokédex. */
export function summaryHtml(s) {
  if (!s || !Object.keys(s).length) return '';
  const icon = id => `<svg class="sum-ico" viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" shape-rendering="crispEdges"><use href="#${id}"/></svg>`;
  const tile = (cls, ico, label, value, f, extra = '') => `<div class="sum-tile ${cls}">
    <dt>${icon(ico)}<span>${label}</span></dt>
    <dd><b class="sum-v" style="--n:${value.replace(/<[^>]+>/g, '').length}">${value}</b>${badge(f.confidence)}${extra}</dd>
  </div>`;
  const tiles = [];
  if (s.playTime) tiles.push(tile('st-time', 'clock', t('Tempo de jogo'), `${s.playTime.h}<small>h</small> ${String(s.playTime.m).padStart(2, '0')}<small>m</small>`, s.playTime));
  if (s.money) tiles.push(tile('st-money', 'coin', t('Dinheiro'), `<small>₽</small> ${num(s.money.value)}`, s.money));
  if (s.badges) {
    const pips = Array.from({ length: s.badges.total }, (_, i) => `<i${i < s.badges.count ? ' class="on"' : ''}></i>`).join('');
    tiles.push(tile('st-badges', 'medal', t('Insígnias'), `${s.badges.count}<small>/${s.badges.total}</small>`, s.badges, `<span class="pips" aria-hidden="true">${pips}</span>`));
  }
  if (s.dex) {
    const pct = Math.round(Math.min(1, s.dex.owned / s.dex.total) * 100);
    tiles.push(tile('st-dex', 'dex', t('Pokédex (capturados)'), `${num(s.dex.owned)}<small>/${num(s.dex.total)}</small>`, s.dex,
      `<span class="sum-bar" aria-hidden="true"><span style="width:${pct}%"></span></span><small class="sum-pct">${pct}%</small>`));
  }
  return `<dl class="sum">${tiles.join('')}</dl>`;
}

/** Exportar: no fim da página, compacto. */
export function exportWin() {
  return `<section class="win export" aria-labelledby="export-h">
    <div class="win-title"><h2 id="export-h">${t('Exportar')}</h2><small>${t('equipe + PC')}</small></div>
    <div class="export-btns">
      <button class="btn btn-small" type="button" data-exp="csv">${t('Planilha (CSV)')}</button>
      <button class="btn btn-ghost btn-small" type="button" data-exp="txt">Showdown (TXT)</button>
      <button class="btn btn-ghost btn-small" type="button" data-exp="json">JSON</button>
      <button class="btn btn-ghost btn-small" type="button" data-copy="party">${t('Copiar equipe (Showdown)')}</button>
    </div>
    <p class="status" id="status" role="status"></p>
  </section>`;
}

// Tipos abreviados como nas telas dos jogos (cabem dois no cartão da equipe)
const TYPE_ABBR = { normal: 'NOR', fighting: 'FIG', flying: 'FLY', poison: 'POI', ground: 'GRO', rock: 'ROC', bug: 'BUG', ghost: 'GHO',
  steel: 'STE', fire: 'FIR', water: 'WAT', grass: 'GRA', electric: 'ELE', psychic: 'PSY', ice: 'ICE', dragon: 'DRA', dark: 'DAR', fairy: 'FAI', stellar: 'STL' };

/** Barra de HP só quando o Pokémon está ferido (verde, amarela abaixo da metade, vermelha abaixo de 1/5). */
function hpBar(m) {
  const max = m.stats && m.stats.hp;
  if (!max || m.hp == null || m.hp >= max) return '';
  const r = Math.max(0, m.hp) / max;
  return `<span class="ptile-hp${r < 0.2 ? ' low' : r < 0.5 ? ' mid' : ''}" title="${esc(t('HP atual / máximo'))}: ${m.hp}/${max}"><i style="width:${Math.round(r * 100)}%"></i></span>`;
}

/** Bloco de Pokémon com sprite grande (equipe e equipes da IA). */
export function monTile(m, attrs = '') {
  const sp = m.species;
  const tc = sp.types[0] ? ` t-${esc(sp.types[0])}` : '';
  const hurt = m.stats && m.hp != null && m.hp < m.stats.hp ? `, HP ${m.hp}/${m.stats.hp}` : '';
  const label = `${m.hasNickname ? m.nickname + ' (' + sp.name + ')' : sp.name}${m.shiny ? ', shiny' : ''}${m.level ? ', ' + t('nível {n}', { n: m.level }) : ''}${sp.types.length ? ', ' + sp.types.join('/') : ''}${hurt}`;
  const next = m.shiny && sp.spriteId ? ` data-next="${esc(spriteSrc(sp))}"` : '';
  return `<button class="ptile${tc}" type="button" ${attrs} aria-label="${esc(label)}">
    <img data-sprite="1"${next} src="${esc(spriteSrc(sp, m.shiny))}" width="96" height="96" alt="" decoding="async" loading="lazy" crossorigin="anonymous">
    <span class="ptile-marks">${m.shiny ? '<span class="shiny" aria-hidden="true">★</span>' : ''}${genderIcon(m.gender)}</span>
    <span class="ptile-name">${monShort(m)}</span>
    ${m.level ? `<span class="ptile-lv">${t('Nv.')} ${m.level}</span>` : ''}
    ${sp.types.length ? `<span class="ptile-types" aria-hidden="true">${sp.types.map(ty => `<i class="t-${esc(ty)}" title="${esc(ty)}">${TYPE_ABBR[ty] || esc(ty.slice(0, 3))}</i>`).join('')}</span>` : ''}
    ${hpBar(m)}
  </button>`;
}

/** Barra fixa embaixo com os quatro blocos da página. */
export function navBar() {
  const item = (id, ico, label) => `<button type="button" data-go="${id}"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" shape-rendering="crispEdges"><use href="#${ico}"/></svg><span>${label}</span></button>`;
  return `<nav class="nav" aria-label="${t('Seções')}">
    ${item('grp-summary', 'card', t('Resumo'))}${item('grp-party', 'party', t('Equipe'))}${item('grp-pc', 'box', 'PC')}${item('grp-tools', 'tools', t('Ferramentas'))}
  </nav>`;
}

export function warningsWin(warnings) {
  if (!warnings.length) return '';
  return `<section class="win warnings" aria-labelledby="warn-h">
    <div class="win-title"><h2 id="warn-h">${t('Avisos')}</h2></div>
    <ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
  </section>`;
}

export function partyWin(d) {
  const tiles = d.party.map((m, i) => `<li>${monTile(m, `data-party="${i}"`)}</li>`).join('');
  const empty = Array.from({ length: Math.max(0, 6 - d.party.length) }, () => '<li class="ptile-empty" aria-hidden="true"></li>').join('');
  return `<section class="win" aria-labelledby="party-h">
    <div class="win-title"><h2 id="party-h">${t('Equipe')}</h2><small>${t('{n} de 6 · toque para ver detalhes', { n: d.party.length })}</small></div>
    ${d.party.length ? `<ul class="party-grid">${tiles}${empty}</ul>` : `<p class="hint">${t('Nenhum Pokémon na equipe.')}</p>`}
    ${d.party.length ? `<div class="export-btns party-actions"><button class="btn btn-ghost btn-small" type="button" data-team-image>${t('Imagem da equipe')}</button></div>` : ''}
  </section>`;
}

export function pcWin(d) {
  const options = d.pc.boxes.map(b => `<option value="${b.index}">${esc(b.name)} · ${b.slots.length ? b.slots.length + '/30' : t('vazia')}${b.partial ? ` (${t('parcial')})` : ''}</option>`).join('');
  return `<section class="win" aria-labelledby="pc-h">
    <div class="win-title"><h2 id="pc-h">PC</h2><small id="pc-count"></small></div>
    <div class="box-nav">
      <button class="btn btn-ghost btn-icon" type="button" data-box-step="-1" aria-label="${t('Caixa anterior')}">◀</button>
      <label class="sr" for="box-select">${t('Caixa')}</label>
      <select id="box-select">${options}</select>
      <button class="btn btn-ghost btn-icon" type="button" data-box-step="1" aria-label="${t('Próxima caixa')}">▶</button>
    </div>
    <div class="box-grid" id="box-grid" role="grid" aria-label="${t('Pokémon na caixa')}"></div>
    <p class="box-meta">${t('Toque num Pokémon para ver os detalhes.')} <span class="legend-q" aria-hidden="true"></span> = ${t('espécie com identificação provável.')}</p>
  </section>`;
}

export function boxGrid(box) {
  const bySlot = new Map(box.slots.map(s => [s.slot, s]));
  let cells = '';
  for (let i = 1; i <= 30; i++) {
    const s = bySlot.get(i);
    if (!s) { cells += `<div class="slot empty" role="gridcell" aria-label="${t('Posição {n}, vazia', { n: i })}"></div>`; continue; }
    const sp = s.species;
    const label = `${s.hasNickname ? s.nickname + ' (' + sp.name + ')' : sp.name}${s.shiny ? ', shiny' : ''}, ${t('posição {n}', { n: i })}`;
    const next = sp.spriteId && sp.hasIcon ? spriteUrl(sp.spriteId) : '';
    cells += `<button class="slot" type="button" role="gridcell" data-slot="${i}" aria-label="${esc(label)}">
      <img${next ? ' class="ico"' : ''} data-sprite="1" data-next="${esc(next)}" src="${esc(iconSrc(sp))}" alt="" decoding="async" crossorigin="anonymous">
      ${sp.spriteId ? '' : `<span class="lbl">${esc(s.nickname)}</span>`}
      ${sp.confidence !== 'confirmado' ? '<span class="q" aria-hidden="true"></span>' : ''}
      ${s.shiny ? '<span class="star" aria-hidden="true">★</span>' : ''}
    </button>`;
  }
  return cells;
}

/** Fraquezas e resistências deste Pokémon (só pelos tipos). */
function matchupTable(m, T) {
  const g = defenseMatchups(m.species.types, { types: T.types, chart: T.typechart });
  const rows = [['4×', 4, 'weak'], ['2×', 2, 'weak'], ['½', 0.5, 'resist'], ['¼', 0.25, 'resist'], ['0', 0, 'immune']]
    .filter(([, k]) => g[k].length)
    .map(([label, k, cls]) => `<div class="mu-row"><span class="mu-x ${cls}">${label}</span><span class="mu-types">${g[k].map(typeChip).join(' ')}</span></div>`)
    .join('');
  if (!rows) return '';
  return `<section class="dsec"><h3>${t('Dano recebido')}</h3>${rows}<p class="hint">${t('Só pelos tipos; não considera habilidade (Levitate etc.) nem item.')}</p></section>`;
}

export function monDetail(m, T) {
  const sp = m.species;
  const where = `${m.location === 'party' ? t('Equipe') : m.where}, ${t('posição {n}', { n: m.slot })}`;
  const note = m.location !== 'pc' ? ''
    : `<p class="unread-list">${t(m.complete
      ? 'No PC, o nível vem da experiência ({exp} exp) e os stats são calculados.'
      : 'No PC, o nível vem da experiência ({exp} exp) e os stats são calculados. Amizade e treinador original não são guardados no registro do PC.', { exp: num(m.exp) })}</p>`;
  return `<button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
  <div class="mon">
    ${monHeader(m, 'h2', ' id="detail-title"')}
    <p class="mon-sub">${esc(where)}</p>
    <div class="facts">${natureChip(m.nature, m.pidNature)}${itemChip(m.item, true)}${abilityChip(m.ability)}${ballChip(m.ball)}${hiddenPowerChip(m.hiddenPower)}</div>
    ${movesList(m.moves)}
    ${m.stats ? statsTable(m) : ivEvTable(m)}
    ${note}
    ${T ? matchupTable(m, T) : ''}
    <div class="dex-slot" data-dex></div>
    <div class="export-btns"><button class="btn btn-ghost" type="button" data-copy="mon">${t('Copiar (Showdown)')}</button></div>
    <details class="fold adv"><summary>${t('Avançado')}</summary>
      ${sp.evidence ? `<p class="evidence"><span class="k">${t('Como a espécie foi identificada')}</span> ${esc(t(sp.evidence))}</p>` : ''}
      <p class="raw"><span class="k">${t('Bytes do registro')}</span> ${esc(m.raw)}</p>
    </details>
  </div>`;
}

export const typeChip = t => `<span class="type t-${esc(t)}">${esc(t)}</span>`;
export const monShort = m => esc(m.hasNickname ? m.nickname : m.species.name);

/** Fraquezas/resistências por tipo de ataque e cobertura dos golpes da equipe. */
export function analysisWin(d, T) {
  if (!d.party.length) return '';
  const a = analyzeTeam(d.party, { types: T.types, chart: T.typechart });
  const X = { 4: '4×', 2: '2×', 0.5: '½', 0.25: '¼', 0: '0' };
  // Quem é afetado por cada tipo de ataque: abre logo abaixo da linha tocada, com ícone, nome e multiplicador
  const who = (r, list, cls, label) => (list.length ? `<div class="tt-grp ${cls}"><b>${label}</b><ul>${list.map(m => {
    const sp = m.species;
    return `<li><img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" width="40" height="30" loading="lazy" decoding="async" crossorigin="anonymous"><span>${monShort(m)}</span><i>${X[r.mult.get(m)] ?? ''}</i></li>`;
  }).join('')}</ul></div>` : '');
  const rows = a.defense.map((r, i) => {
    const cell = (list, cls, label) => list.length
      ? `<button type="button" class="cnt ${cls}" data-tt="${i}" aria-expanded="false" aria-controls="tt-${i}" aria-label="${list.length} ${esc(label.toLowerCase())}">${list.length}</button>`
      : '<span class="cnt zero">·</span>';
    const any = r.weak.length + r.resist.length + r.immune.length;
    return `<tr class="${r.alert ? 'alert' : ''}">
      <th scope="row">${any ? `<button type="button" class="tt-type" data-tt="${i}" aria-expanded="false" aria-controls="tt-${i}">${typeChip(r.type)}</button>` : typeChip(r.type)}</th>
      <td>${cell(r.weak, 'weak', t('Fracos'))}</td>
      <td>${cell(r.resist, 'resist', t('Resistem'))}</td>
      <td>${cell(r.immune, 'immune', t('Imunes'))}</td>
    </tr>${any ? `<tr class="tt-more" id="tt-${i}" hidden><td colspan="4">
      ${who(r, r.weak, 'weak', t('Fracos'))}${who(r, r.resist, 'resist', t('Resistem'))}${who(r, r.immune, 'immune', t('Imunes'))}
    </td></tr>` : ''}`;
  }).join('');
  return `<section class="win" aria-labelledby="analysis-h">
    <div class="win-title"><h2 id="analysis-h">${t('Análise da equipe')}</h2><small>${t('tipos')}</small></div>
    <details class="analysis fold">
      <summary>${t('Fraquezas e resistências')}</summary>
      <p class="hint">${t('Toque num tipo ou num número para ver quem. Linhas destacadas: tipos que acertam muitos membros em cheio. Não considera habilidades (Levitate etc.) nem itens.')}</p>
      <table class="typetab">
        <thead><tr><th scope="col">${t('Ataque')}</th><th scope="col">${t('Fracos')}</th><th scope="col">${t('Resistem')}</th><th scope="col">${t('Imunes')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
    <details class="analysis fold">
      <summary>${t('Cobertura dos golpes')}</summary>
      <p class="k-line">${t('Golpes de dano da equipe:')} ${a.moveTypes.map(typeChip).join(' ') || '—'}</p>
      <p class="k-line">${t('Super efetivo contra:')} ${a.coverage.map(typeChip).join(' ') || '—'}</p>
      <p class="k-line">${t('Nenhum golpe super efetivo contra:')} ${a.gaps.map(typeChip).join(' ') || '—'}</p>
    </details>
  </section>`;
}

/**
 * Assistente com IA: a chave é do usuário e fica só neste aparelho.
 * Os textos que dependem do serviço (link da chave, aviso de privacidade…) são preenchidos em app.js.
 */
export function aiWin(d, providers) {
  const noParty = !d.party.length;
  const opts = providers.map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
  // Fechada até o usuário abrir (app.js lembra a escolha neste aparelho)
  return `<details class="win win-fold" id="ai-win">
    <summary class="win-title"><h2 id="ai-h">${t('Assistente')}</h2><small id="ai-svc">${t('IA')}</small></summary>
    <p class="ai-intro">${t('A IA avalia sua equipe e monta uma equipe com os Pokémon que você tem.')}</p>
    <div class="ai-form ai-provider">
      <label class="ai-label" for="ai-provider">${t('Serviço de IA')}</label>
      <select id="ai-provider" class="ai-input">${opts}</select>
    </div>
    <div id="ai-setup" class="hidden">
      <p class="ai-intro">${t('Para usar, crie uma chave grátis:')}</p>
      <ol class="ai-steps">
        <li>${t('Abra')} <a id="ai-key-link" href="#" target="_blank" rel="noopener"></a> ${t('e')} <span id="ai-key-steps"></span>.</li>
        <li>${t('Copie a chave e cole abaixo.')}</li>
      </ol>
      <div class="ai-form">
        <label class="sr" for="ai-key">${t('Chave')}</label>
        <input id="ai-key" type="password" autocomplete="off" spellcheck="false">
        <button class="btn" type="button" id="ai-save">${t('Salvar chave')}</button>
      </div>
      <p class="hint">${t('A chave fica guardada só neste aparelho.')}</p>
    </div>
    <div id="ai-main" class="hidden">
      <label class="ai-label" for="ai-note">${t('Pedido (opcional)')}</label>
      <input id="ai-note" class="ai-input" type="text" maxlength="300" autocomplete="off" placeholder="${t('Ex.: quero usar o Lucario; sem lendários')}">
      <div class="export-btns ai-actions">
        <button class="btn" type="button" data-ai="analyze"${noParty ? ' disabled' : ''}>${t('Analisar minha equipe')}</button>
        <button class="btn" type="button" data-ai="build">${t('Montar equipe')}</button>
      </div>
      <p class="hint" id="ai-privacy"></p>
      <details class="ai-settings fold">
        <summary>${t('Configurações da IA')}</summary>
        <div class="ai-form">
          <label class="ai-label" for="ai-model">${t('Modelo')}</label>
          <input id="ai-model" class="ai-input" type="text" autocomplete="off" spellcheck="false" list="ai-models" placeholder="${t('automático')}">
          <button class="btn btn-ghost btn-small" type="button" id="ai-model-save">${t('Salvar modelo')}</button>
          <datalist id="ai-models"></datalist>
        </div>
        <label class="ai-skip"><input type="checkbox" id="ai-ask" checked> ${t('Mostrar o que vai ser enviado antes de enviar')}</label>
        <button class="btn btn-ghost btn-small" type="button" id="ai-list">${t('Ver modelos da chave')}</button>
        <p class="hint" id="ai-models-out" role="status"></p>
        <button class="btn btn-ghost btn-small" type="button" id="ai-forget">${t('Apagar chave deste aparelho')}</button>
      </details>
    </div>
    <div id="ai-out" class="ai-out" aria-live="polite"></div>
  </details>`;
}

/** Busca na equipe e em todas as caixas do PC (fechada até o usuário abrir; resultados em páginas). */
export function searchWin(d, T) {
  const typeOpts = T.types.filter(t => t && t !== 'stellar').map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  return `<details class="win win-fold" id="search-win">
    <summary class="win-title"><h2 id="search-h">${t('Buscar')}</h2><small>${t('equipe + PC')}</small></summary>
    <div class="search-form">
      <label class="sr" for="q">${t('Buscar')}</label>
      <input id="q" type="search" placeholder="${t('Nome, espécie, golpe, habilidade ou item')}" autocomplete="off" enterkeyhint="search">
      <div class="search-row">
        <label class="sr" for="f-type">${t('Tipo')}</label>
        <select id="f-type"><option value="">${t('Todos os tipos')}</option>${typeOpts}</select>
        <label class="sr" for="f-sort">${t('Ordem')}</label>
        <select id="f-sort">
          <option value="pos">${t('Posição')}</option>
          <option value="level">${t('Nível (maior)')}</option>
          <option value="name">${t('Nome')}</option>
          <option value="dex">${t('Nº da espécie')}</option>
        </select>
      </div>
      <div class="flags" role="group" aria-label="${t('Filtros')}">
        <button class="btn btn-ghost btn-small flag" type="button" data-flag="shiny" aria-pressed="false">★ Shiny</button>
        <button class="btn btn-ghost btn-small flag" type="button" data-flag="hidden" aria-pressed="false">${t('Hab. oculta')}</button>
        <button class="btn btn-ghost btn-small flag" type="button" data-flag="female" aria-pressed="false"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" shape-rendering="crispEdges"><use href="#female"/></svg> ${t('Fêmeas')}</button>
        <button class="btn btn-ghost btn-small flag" type="button" data-flag="male" aria-pressed="false"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" shape-rendering="crispEdges"><use href="#male"/></svg> ${t('Machos')}</button>
        <button class="btn btn-ghost btn-small flag" type="button" data-flag="iv31" aria-pressed="false">${t('6 IVs 31')}</button>
      </div>
    </div>
    <p class="hint" id="search-count" role="status"></p>
    <ul class="results" id="results"></ul>
    <nav class="pager hidden" id="pager" aria-label="${t('Páginas dos resultados')}">
      <button class="btn btn-ghost btn-small" type="button" data-page="-1">‹ ${t('Anterior')}</button>
      <span id="page-info"></span>
      <button class="btn btn-ghost btn-small" type="button" data-page="1">${t('Próxima')} ›</button>
    </nav>
  </details>`;
}

export function resultRow(m, i) {
  const sp = m.species;
  const where = m.location === 'party' ? `${t('Equipe')} ${m.slot}` : `${esc(m.where)} · ${m.slot}`;
  const g = genderIcon(m.gender);
  return `<li><button class="result" type="button" data-i="${i}">
    <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
    <span class="r-main"><b>${monShort(m)}</b>${g}${m.shiny ? ' <span class="shiny">★</span>' : ''}
      <span class="r-sub">${m.hasNickname ? esc(sp.name) + ' · ' : ''}${where}</span></span>
    <span class="r-lv">${t('Nv.')} ${m.level ?? '?'}</span>
  </button></li>`;
}

// Detalhe do Pokémon: linha evolutiva e golpes por nível. Quetzal, Unbound e SoulGold: tabelas da ROM do jogo
// (evo-rom.js, quetzal-learn.json / unbound-learn.json / soulgold-learn.json). Demais jogos: dados dos jogos oficiais
// (src/data/dex.json, carregado sob demanda), marcados como "provável".

import { esc, typeChip, categoryName, tipBtn } from './render.js';
import { t, getLang } from '../i18n.js';
import { SILHOUETTE, iconUrl, spriteUrl } from './sprites.js';
import { quetzalEvolutionHtml, unboundEvolutionHtml, soulgoldEvolutionHtml } from './evo-rom.js';
import { moveInfo } from '../parser/describe.js';

const LAST_GEN8_ICON = 898;
const probable = () => `<span class="badge" title="${t('Dos jogos oficiais mais recentes; o jogo do save pode ser diferente')}">${t('provável')}</span>`;

/** IDs do Pokémon na PokeAPI: o do "Pokémon" (forma) e o da espécie (linha evolutiva). */
export function dexIds(m, dex) {
  const pid = m.species.dexId || null;
  if (!pid) return { pid: null, sid: null };
  return { pid, sid: dex.formSpecies[pid] ?? pid };
}

const speciesName = (id, dex, T) => (id <= 905 && T.species[id] ? T.species[id][0] : dex.names[id] || `#${id}`);

/**
 * A linha evolutiva como árvore: cada ramo numa fileira, cada estágio numa coluna (Goomy → Sliggoo → Goodra e, na
 * fileira de baixo, → Sliggoo de Hisui → Goodra de Hisui). Quem tem vários ramos ocupa as fileiras deles.
 * @returns {{ cells: Array<{ n: Array, depth: number, row: number, span: number }>, rows: number, cols: number }}
 */
export function evoTree(chain) {
  const roots = chain.filter(n => !n[1] || !chain.some(o => o[0] === n[1]));
  const kids = new Map();
  for (const n of chain) if (!roots.includes(n)) { if (!kids.has(n[1])) kids.set(n[1], []); kids.get(n[1]).push(n); }
  const cells = [];
  let row = 0, cols = 1;
  const visit = (n, depth, above) => {
    const start = row;
    const next = (kids.get(n[0]) || []).filter(c => !above.has(c[0]));
    if (!next.length) row++;
    for (const c of next) visit(c, depth + 1, new Set([...above, c[0]]));
    cells.push({ n, depth, row: start, span: Math.max(1, row - start) });
    cols = Math.max(cols, depth + 1);
  };
  for (const r of roots) visit(r, 0, new Set([r[0]]));
  return { cells: cells.sort((a, b) => a.row - b.row || a.depth - b.depth), rows: row, cols };
}

/** A árvore em grade (colunas: estágio, seta, estágio…); `node(n)` devolve o HTML de um Pokémon. */
export function evoGridHtml(chain, node) {
  const { cells, cols } = evoTree(chain);
  const tmpl = ['auto', ...Array(cols - 1).fill('18px auto')].join(' ');
  const at = c => `grid-row:${c.row + 1} / span ${c.span}`;
  return `<div class="evo" style="grid-template-columns:${tmpl}">${cells.map(c =>
    (c.depth ? `<span class="evo-arrow" aria-hidden="true" style="grid-column:${2 * c.depth};${at(c)}"></span>` : '')
    + node(c.n).replace('class="evo-node', `style="grid-column:${2 * c.depth + 1};${at(c)}" class="evo-node`)).join('')}</div>`;
}

export function evolutionHtml(m, dex, T) {
  // Quetzal: linha evolutiva e métodos do próprio jogo (tabela da ROM)
  if (T.quetzal && m.speciesId) return quetzalEvolutionHtml(m, T, evoGridHtml);
  if (T.unbound && m.speciesId) return unboundEvolutionHtml(m, T, evoGridHtml);
  if (T.soulgold && m.speciesId) return soulgoldEvolutionHtml(m, T, evoGridHtml);
  const { pid, sid } = dexIds(m, dex);
  if (!pid) return '';
  const ci = dex.speciesChain[sid];
  if (ci === undefined) return `<section class="dsec"><h3>${t('Evolução')}</h3><p class="hint">${t('Não evolui (nos jogos oficiais).')}</p></section>`;
  const chain = dex.chains[ci];
  const en = getLang() === 'en';
  const grid = evoGridHtml(chain, ([id, , pt, eng]) => {
    const how = en ? eng : pt;
    const icon = id <= LAST_GEN8_ICON ? iconUrl(id) : spriteUrl(id);
    return `<div class="evo-node${id === sid ? ' here' : ''}">
      <img data-sprite="1" src="${esc(icon)}" data-next="${esc(SILHOUETTE)}" alt="" width="48" height="40" decoding="async" loading="lazy" crossorigin="anonymous"${id <= LAST_GEN8_ICON ? ' class="ico"' : ''}>
      <b>${esc(speciesName(id, dex, T))}</b>
      ${how ? `<small>${esc(how)}</small>` : ''}
    </div>`;
  });
  return `<section class="dsec"><h3>${t('Evolução')} ${probable()}</h3>
    ${grid}</section>`;
}

/**
 * Golpes por nível do Quetzal (src/data/quetzal-learn.json, tirados da ROM) no mesmo formato do dex.json:
 * learn[ID do Quetzal] = [versão, nível, golpe, …]. `rom: true` faz as funções usarem o ID do save.
 */
export function quetzalLearnDex(L, TC = null) {
  const learn = {};
  L.species.forEach((set, id) => { if (id && L.sets[set]) learn[id] = [0, ...L.sets[set]]; });
  const dex = { rom: true, versions: ['Pokémon Quetzal'], learn };
  // Golpes por tutor (o menu NOVO MOV. → TUTOR do jogo: qualquer um, a qualquer momento) e de ovo (da primeira da linha)
  if (TC) {
    dex.tutor = {};
    TC.tutor.species.forEach((set, id) => { if (id && TC.tutor.sets[set] && TC.tutor.sets[set].length) dex.tutor[id] = TC.tutor.sets[set]; });
    dex.egg = {};
    TC.eggOf.forEach((base, id) => { if (id && base && TC.egg[base]) dex.egg[id] = TC.egg[base]; });
  }
  return dex;
}

/**
 * O mesmo para o Unbound (src/data/unbound-learn.json): os golpes vêm na numeração do Unbound e viram os IDs
 * usados nos Pokémon do save (o do app, ou o do Unbound negativo nos golpes próprios).
 */
export function unboundLearnDex(L, U, version = 'Pokémon Unbound') {
  const sets = L.sets.map(set => set && set.map((v, i) => (i % 2 ? (typeof U.moves[v] === 'number' ? U.moves[v] : -v) : v)));
  const learn = {};
  L.species.forEach((set, id) => { if (id && sets[set]) learn[id] = [0, ...sets[set]]; });
  return { rom: true, versions: [version], learn };
}

/**
 * O mesmo para o SoulGold (src/data/soulgold-learn.json, mesmo formato e mesma tabela de golpes do Unbound) e, com
 * soulgold-teach.json, os golpes por TM/HM e tutor (`tutor`, com o número do TM/HM de cada golpe em `tm`; no SoulGold o
 * TM é um item que o jogador precisa conseguir: `teach: 'item'`) e de ovo (da primeira da linha).
 */
export function soulgoldLearnDex(L, SG, TC = null) {
  const dex = unboundLearnDex(L, SG, 'Pokémon SoulGold');
  if (!TC) return dex;
  const app = v => (typeof SG.moves[v] === 'number' ? SG.moves[v] : -v);
  dex.teach = 'item';
  dex.tutor = {};
  TC.teach.species.forEach((set, id) => { if (id && TC.teach.sets[set]) dex.tutor[id] = TC.teach.sets[set].map(app); });
  dex.tm = {};
  for (const [v, label] of Object.entries(TC.tm)) dex.tm[app(+v)] = label;
  dex.egg = {};
  TC.eggOf.forEach((base, id) => { if (id && base && TC.egg[base]) dex.egg[id] = TC.egg[base].map(app); });
  return dex;
}

export function learnsetHtml(m, dex, T) {
  const pid = dex.rom ? m.speciesId : dexIds(m, dex).pid;
  const raw = pid ? dex.learn[pid] : null;
  if (!raw) return '';
  const [vi, ...flat] = raw;
  const known = new Set(m.moves.map(mv => mv.id));
  const items = [];
  let count = 0, divided = false;
  for (let i = 0; i < flat.length; i += 2) {
    const lv = flat[i], mv = flat[i + 1];
    const info = typeof mv === 'number' ? moveInfo(mv, T) : null;
    const name = info ? info.name : String(mv);
    const type = info ? info.type : null;
    const cat = info ? categoryName(info.category) : '';
    const has = typeof mv === 'number' && known.has(mv);
    const future = !!m.level && lv > m.level;
    // Divisória no nível atual: acima dela, o que o Pokémon ainda vai aprender
    if (future && !divided && count) items.push(`<li class="lm-now"><span>${esc(t('Nível atual: {n}', { n: m.level }))}</span></li>`);
    if (future) divided = true;
    count++;
    const meta = [cat, info && info.power ? `${t('Poder')} ${info.power}` : ''].filter(Boolean).join(' · ');
    items.push(`<li class="lm${type ? ` t-${esc(type)}` : ''}${has ? ' has' : ''}${future ? ' future' : ''}">
      <span class="lm-lv">${lv === 0 ? t('Evo.') : `<small>${t('Nv.')}</small>${lv}`}</span>
      <span class="lm-main"><b>${typeof mv === 'number' ? tipBtn('m', mv, esc(name)) : esc(name)}${has ? ` <span class="known" title="${t('Já conhece')}">✓</span>` : ''}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span>
      ${type ? typeChip(type) : ''}
    </li>`);
  }
  return `<details class="dsec learn fold"><summary><span>${t('Golpes por nível')}</span>${dex.rom ? '' : probable()}<span class="learn-count">${count}</span></summary>
    <p class="hint">${esc(t('Lista de {game}. ✓ = já conhece. Evo. = aprende ao evoluir.', { game: dex.versions[vi] || t('jogo oficial') }))}</p>
    <ul class="learn-list">${items.join('')}</ul>
  </details>${teachHtml(m, dex, T)}${
  dex.egg ? moveListHtml(m, dex.egg[m.speciesId], T, t('Golpes de ovo'), dex.teach === 'item'
    ? t('Passados ao filhote no cruzamento (lista da ROM). ✓ = já conhece.')
    : t('Passados ao filhote no cruzamento (lista da ROM; o jogo não os ensina pelo menu NOVO MOV.). ✓ = já conhece.')) : ''}`;
}

/**
 * Golpes ensinados fora do nível. Quetzal: o tutor do menu do Pokémon (qualquer um, a qualquer momento). SoulGold: os
 * TMs/HMs (itens que o jogador precisa conseguir; o número de cada um) e, à parte, os de tutor.
 */
function teachHtml(m, dex, T) {
  const ids = dex.tutor && dex.tutor[m.speciesId];
  if (!ids) return '';
  if (dex.teach !== 'item') return moveListHtml(m, ids, T, t('Golpes por tutor'), t('No jogo: menu do Pokémon → NOVO MOV. → TUTOR (qualquer um, a qualquer momento). ✓ = já conhece.'));
  const tm = ids.filter(id => dex.tm[id]), npc = ids.filter(id => !dex.tm[id]);
  return moveListHtml(m, tm, T, t('Golpes por TM/HM'), t('Com o TM ou HM do jogo (é preciso conseguir o item). ✓ = já conhece.'), id => dex.tm[id])
    + moveListHtml(m, npc, T, t('Golpes por tutor'), t('Ensinados por tutores do jogo; o app não sabe onde eles ficam. ✓ = já conhece.'));
}

/** Uma lista de golpes sem nível (tutor, ovo), em ordem alfabética, com o tipo, a categoria e o poder (e o TM, `label`). */
function moveListHtml(m, ids, T, title, hint, label = null) {
  if (!ids || !ids.length) return '';
  const known = new Set(m.moves.map(mv => mv.id));
  const rows = ids.map(id => ({ id, info: moveInfo(id, T) })).filter(x => x.info && x.info.name)
    .sort((a, b) => a.info.name.localeCompare(b.info.name));
  const items = rows.map(({ id, info }) => {
    const has = known.has(id);
    const meta = [label && label(id), categoryName(info.category), info.power ? `${t('Poder')} ${info.power}` : ''].filter(Boolean).join(' · ');
    return `<li class="lm lm-nolv${info.type ? ` t-${esc(info.type)}` : ''}${has ? ' has' : ''}">
      <span class="lm-main"><b>${tipBtn('m', id, esc(info.name))}${has ? ` <span class="known" title="${t('Já conhece')}">✓</span>` : ''}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span>
      ${info.type ? typeChip(info.type) : ''}
    </li>`;
  });
  return `<details class="dsec learn fold"><summary><span>${esc(title)}</span><span class="learn-count">${rows.length}</span></summary>
    <p class="hint">${esc(hint)}</p>
    <ul class="learn-list">${items.join('')}</ul>
  </details>`;
}

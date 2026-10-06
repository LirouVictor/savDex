// Detalhe do Pokémon: linha evolutiva e golpes por nível. Quetzal e Unbound: tabelas da ROM do jogo
// (evo-rom.js, quetzal-learn.json / unbound-learn.json). Demais jogos: dados dos jogos oficiais
// (src/data/dex.json, carregado sob demanda), marcados como "provável".

import { esc, typeChip, categoryName } from './render.js';
import { t, getLang } from '../i18n.js';
import { SILHOUETTE, iconUrl, spriteUrl } from './sprites.js';
import { quetzalEvolutionHtml, unboundEvolutionHtml } from './evo-rom.js';
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

/** Estágios da linha: [[nó…], [nó…], …], cada nó = [espécie, de quem evolui, método]. */
export function stages(chain) {
  const out = [];
  let level = chain.filter(n => !n[1] || !chain.some(o => o[0] === n[1]));
  const seen = new Set();
  while (level.length) {
    out.push(level);
    level.forEach(n => seen.add(n[0]));
    level = chain.filter(n => !seen.has(n[0]) && level.some(p => p[0] === n[1]));
  }
  return out;
}

export function evolutionHtml(m, dex, T) {
  // Quetzal: linha evolutiva e métodos do próprio jogo (tabela da ROM)
  if (T.quetzal && m.speciesId) return quetzalEvolutionHtml(m, T, stages);
  if (T.unbound && m.speciesId) return unboundEvolutionHtml(m, T, stages);
  const { pid, sid } = dexIds(m, dex);
  if (!pid) return '';
  const ci = dex.speciesChain[sid];
  if (ci === undefined) return `<section class="dsec"><h3>${t('Evolução')}</h3><p class="hint">${t('Não evolui (nos jogos oficiais).')}</p></section>`;
  const chain = dex.chains[ci];
  const en = getLang() === 'en';
  const cols = stages(chain).map(level => `<div class="evo-stage">${level.map(([id, , pt, eng]) => {
    const how = en ? eng : pt;
    const icon = id <= LAST_GEN8_ICON ? iconUrl(id) : spriteUrl(id);
    return `<div class="evo-node${id === sid ? ' here' : ''}">
      <img data-sprite="1" src="${esc(icon)}" data-next="${esc(SILHOUETTE)}" alt="" width="48" height="40" decoding="async" loading="lazy" crossorigin="anonymous"${id <= LAST_GEN8_ICON ? ' class="ico"' : ''}>
      <b>${esc(speciesName(id, dex, T))}</b>
      ${how ? `<small>${esc(how)}</small>` : ''}
    </div>`;
  }).join('')}</div>`).join('<span class="evo-arrow" aria-hidden="true"></span>');
  return `<section class="dsec"><h3>${t('Evolução')} ${probable()}</h3>
    <div class="evo">${cols}</div></section>`;
}

/**
 * Golpes por nível do Quetzal (src/data/quetzal-learn.json, tirados da ROM) no mesmo formato do dex.json:
 * learn[ID do Quetzal] = [versão, nível, golpe, …]. `rom: true` faz as funções usarem o ID do save.
 */
export function quetzalLearnDex(L) {
  const learn = {};
  L.species.forEach((set, id) => { if (id && L.sets[set]) learn[id] = [0, ...L.sets[set]]; });
  return { rom: true, versions: ['Pokémon Quetzal'], learn };
}

/**
 * O mesmo para o Unbound (src/data/unbound-learn.json): os golpes vêm na numeração do Unbound e viram os IDs
 * usados nos Pokémon do save (o do app, ou o do Unbound negativo nos golpes próprios).
 */
export function unboundLearnDex(L, U) {
  const sets = L.sets.map(set => set && set.map((v, i) => (i % 2 ? (typeof U.moves[v] === 'number' ? U.moves[v] : -v) : v)));
  const learn = {};
  L.species.forEach((set, id) => { if (id && sets[set]) learn[id] = [0, ...sets[set]]; });
  return { rom: true, versions: ['Pokémon Unbound'], learn };
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
      <span class="lm-main"><b>${esc(name)}${has ? ` <span class="known" title="${t('Já conhece')}">✓</span>` : ''}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span>
      ${type ? typeChip(type) : ''}
    </li>`);
  }
  return `<details class="dsec learn fold"><summary><span>${t('Golpes por nível')}</span>${dex.rom ? '' : probable()}<span class="learn-count">${count}</span></summary>
    <p class="hint">${esc(t('Lista de {game}. ✓ = já conhece. Evo. = aprende ao evoluir.', { game: dex.versions[vi] || t('jogo oficial') }))}</p>
    <ul class="learn-list">${items.join('')}</ul>
  </details>`;
}

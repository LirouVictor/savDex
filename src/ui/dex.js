// Detalhe do Pokémon: linha evolutiva e golpes por nível (dados dos jogos oficiais, src/data/dex.json,
// carregado sob demanda). O Quetzal pode ter mudado evoluções e golpes: tudo aparece como "provável".

import { esc, typeChip, categoryName } from './render.js';
import { t, getLang } from '../i18n.js';
import { SILHOUETTE, iconUrl, spriteUrl } from './sprites.js';
import { quetzalEvolutionHtml } from './evo-quetzal.js';

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

export function learnsetHtml(m, dex, T) {
  const { pid } = dexIds(m, dex);
  const raw = pid ? dex.learn[pid] : null;
  if (!raw) return '';
  const [vi, ...flat] = raw;
  const known = new Set(m.moves.map(mv => mv.id));
  const rows = [];
  for (let i = 0; i < flat.length; i += 2) {
    const lv = flat[i], mv = flat[i + 1];
    const row = typeof mv === 'number' ? T.moves[mv] : null;
    const det = typeof mv === 'number' ? T.moveDetails[mv] : null;
    const name = row ? row[0] : String(mv);
    const type = row ? T.types[row[1]] : null;
    const cat = det ? categoryName(det[3]) : '';
    const has = typeof mv === 'number' && known.has(mv);
    const future = m.level && lv > m.level;
    rows.push(`<tr class="${has ? 'has' : ''}${future ? ' future' : ''}">
      <td class="lv-col">${lv === 0 ? t('Evo.') : lv}</td>
      <td>${esc(name)}${has ? ` <span class="known" title="${t('Já conhece')}">✓</span>` : ''}</td>
      <td>${type ? typeChip(type) : ''}</td>
      <td class="k">${esc(cat)}${det && det[0] ? ' · ' + det[0] : ''}</td>
    </tr>`);
  }
  return `<details class="dsec learn"><summary>${t('Golpes por nível')} ${probable()}</summary>
    <p class="hint">${esc(t('Lista de {game}. ✓ = já conhece. Evo. = aprende ao evoluir. Em cinza, níveis acima do atual.', { game: dex.versions[vi] || t('jogo oficial') }))}</p>
    <table class="learn-tab"><tbody>${rows.join('')}</tbody></table>
  </details>`;
}

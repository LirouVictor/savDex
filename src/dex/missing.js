// Pokédex: o que falta capturar. Janela aberta pelo bloco da Pokédex no card do treinador; este pacote só é
// carregado ao abrir. Os capturados (e os vistos, onde o jogo foi conferido) vêm do resumo do save
// (summary.dex); "dá para conseguir evoluindo" usa as evoluções do próprio jogo (ROM no Quetzal, Unbound e
// SoulGold; as dos jogos oficiais, do dex.json, nos demais) a partir dos Pokémon da equipe e do PC.

import { t, num } from '../i18n.js';
import { esc } from '../ui/render.js';
import { SPRITE_BASE, iconUrl } from '../ui/sprites.js';

/** Último número da Dex Nacional de cada geração. */
export const GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const LAST_GEN8_ICON = 898;
export const genOf = n => GEN_END.findIndex(end => n <= end) + 1;

/**
 * Como andar pelas evoluções no jogo do save: a partir do ID da espécie no save, os IDs das evoluções e o
 * número da Dex Nacional de cada uma.
 * @param {object} T tabelas do jogo (T.quetzal / T.unbound / T.soulgold)
 * @param {object|null} official dex.json (jogos oficiais)
 */
function evolutionWalker(T, official) {
  if (T.quetzal) {
    const Q = T.quetzal;
    return { start: m => m.speciesId, next: id => (Q.evolutions[id] || []).map(e => e[2]), nat: id => (id <= LAST_GEN8_ICON ? id : Q.species[id]?.[5] ?? null) };
  }
  for (const R of [T.unbound, T.soulgold]) {
    if (R) return { start: m => m.speciesId, next: id => (R.evolutions[id] || []).map(e => e[2]), nat: id => R.species[id]?.[2] ?? null };
  }
  if (!official) return null;
  // Jogos oficiais: as cadeias do dex.json, pela Dex Nacional (formas, com ID > 10000, ficam de fora)
  const children = new Map();
  for (const chain of official.chains) for (const [id, parent] of chain) {
    if (!parent || id > 10000 || parent > 10000) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(id);
  }
  return { start: m => m.dexNo ?? null, next: id => children.get(id) || [], nat: id => id };
}

/**
 * Espécies que faltam na Pokédex, com as marcas de visto e de "dá para conseguir evoluindo".
 * @returns {{ list: number[], caught: Set<number>, seen: Set<number>|null, missing: number[],
 *   evolve: Map<number, string[]>, total: number, owned: number }}
 */
export function missingDex(data, T, official = null) {
  const dex = data.summary.dex;
  const list = dex.list || Array.from({ length: dex.total }, (_, i) => i + 1);
  const caught = new Set(dex.caught);
  const seen = dex.seen ? new Set(dex.seen) : null;
  const missing = list.filter(n => !caught.has(n));
  const want = new Set(missing);

  // Evoluções dos Pokémon que você tem (sem ovos) que caem em espécies que faltam
  const evolve = new Map();
  const walk = evolutionWalker(T, official);
  if (walk) {
    const mons = [...data.party, ...data.pc.boxes.flatMap(b => b.slots)].filter(m => !m.egg);
    for (const m of mons) {
      const first = walk.start(m);
      if (first == null) continue;
      const own = walk.nat(first);
      const seenIds = new Set([first]);
      const queue = [first];
      while (queue.length) {
        for (const next of walk.next(queue.shift())) {
          if (seenIds.has(next)) continue;
          seenIds.add(next);
          queue.push(next);
          const n = walk.nat(next);
          if (n == null || n === own || !want.has(n)) continue;
          if (!evolve.has(n)) evolve.set(n, []);
          if (!evolve.get(n).includes(m.species.name)) evolve.get(n).push(m.species.name);
        }
      }
    }
  }
  return { list, caught, seen, missing, evolve, total: dex.total, owned: dex.owned };
}

/** Nome da espécie pela Dex Nacional: tabela do app até o 905; acima, a do jogo (Quetzal, SoulGold). */
export function dexNamer(T, official = null) {
  const extra = new Map();
  const add = (n, name) => { if (n && name && !extra.has(n)) extra.set(n, name); };
  // Primeiro a forma padrão; espécie que só aparece com forma (ex.: Palafin) fica com o nome da primeira
  for (const pass of [false, true]) {
    if (T.quetzal) for (const row of Object.values(T.quetzal.species)) if (pass || !row[9]) add(row[5], row[0]);
    for (const R of [T.soulgold, T.unbound]) if (R) for (const row of Object.values(R.species)) if (row && (pass || !row[1])) add(row[2], row[0]);
  }
  if (official) for (const [id, name] of Object.entries(official.names || {})) add(+id, name);
  return n => (T.species[n] && T.species[n][0]) || extra.get(n) || `#${n}`;
}

const iconFor = n => (n <= LAST_GEN8_ICON ? { src: iconUrl(n), cls: 'ico' } : { src: `${SPRITE_BASE}/${n}.png`, cls: 'spr' });

/** Observação sobre a lista usada em cada jogo. */
function listNote(game) {
  if (game === 'quetzal') return t('Lista da Dex Nacional (1025). O app não sabe quais espécies existem no Quetzal: algumas podem não ser capturáveis no jogo.');
  if (game === 'unbound') return t('Pokédex Nacional do jogo: até o Melmetal (809).');
  if (game === 'soulgold') return t('Pokédex de Johto do jogo ({n} espécies), com o número da Dex Nacional.', { n: 702 });
  return '';
}

/**
 * Conteúdo da janela. `view` = { gen, filter } (filter: 'all' | 'evolve' | 'seen').
 * Só a geração escolhida é desenhada (ícones com loading="lazy").
 */
export function dexWinHtml(info, name, game, view) {
  const head = `<div class="sheet-bar"><h2 class="pixel" id="dex-title">${t('Pokédex: o que falta')}</h2>
    <button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button></div>`;
  const stats = `<p class="dex-count"><b>${num(info.owned)}</b>/${num(info.total)} ${t('capturados')} · ${t('faltam {n}', { n: num(info.missing.length) })}</p>`;
  const note = listNote(game);
  if (!info.missing.length) return `${head}${stats}<p class="dex-done">${t('Pokédex completa!')}</p>`;

  const pass = n => view.filter === 'evolve' ? info.evolve.has(n) : view.filter === 'seen' ? info.seen && info.seen.has(n) : true;
  const filtered = info.missing.filter(pass);
  const gens = [...new Set(filtered.map(genOf))];
  const gen = gens.includes(view.gen) ? view.gen : (gens[0] ?? 0);
  const chip = (attr, value, label, count, on) => `<button class="btn btn-ghost btn-small" type="button" ${attr}="${value}" aria-pressed="${on}">${label} <small>${num(count)}</small></button>`;
  const filters = [
    chip('data-dex-filter', 'all', t('Todos'), info.missing.length, view.filter === 'all'),
    chip('data-dex-filter', 'evolve', t('Dá para evoluir'), info.missing.filter(n => info.evolve.has(n)).length, view.filter === 'evolve'),
    info.seen ? chip('data-dex-filter', 'seen', t('Já vistos'), info.missing.filter(n => info.seen.has(n)).length, view.filter === 'seen') : '',
  ].join('');
  const genChips = gens.map(g => chip('data-dex-gen', g, t('Gen {n}', { n: g }), filtered.filter(n => genOf(n) === g).length, g === gen)).join('');

  const items = filtered.filter(n => genOf(n) === gen).map(n => {
    const ic = iconFor(n);
    const evo = info.evolve.get(n);
    const seen = info.seen && info.seen.has(n);
    return `<li class="dex-mon${seen ? ' seen' : ''}">
      <img class="${ic.cls}" data-sprite="1" src="${esc(ic.src)}" width="68" height="56" alt="" loading="lazy" decoding="async" crossorigin="anonymous">
      <span class="dex-no">#${String(n).padStart(4, '0')}</span>
      <span class="dex-name">${esc(name(n))}</span>
      ${seen ? `<span class="dex-tag dex-seen">${t('visto')}</span>` : ''}
      ${evo ? `<span class="dex-tag dex-evo" title="${esc(t('Dá para conseguir evoluindo: {list}', { list: evo.join(', ') }))}">↑ ${esc(evo.join(', '))}</span>` : ''}
    </li>`;
  }).join('');

  return `${head}${stats}
    ${note ? `<p class="hint">${note}</p>` : ''}
    <div class="dex-filters" role="group" aria-label="${t('Filtro')}">${filters}</div>
    ${filtered.length ? `<div class="dex-gens" role="group" aria-label="${t('Geração')}">${genChips}</div>
    <ul class="dex-grid">${items}</ul>` : `<p class="hint">${t('Nenhuma espécie com esse filtro.')}</p>`}
    <p class="hint">${t('“↑” = dá para conseguir evoluindo um Pokémon que você já tem (equipe ou PC). Onde encontrar cada espécie não está no save.')}</p>`;
}

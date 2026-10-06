// Linha evolutiva do Quetzal pela tabela da ROM (src/data/quetzal.json → evolutions): os métodos do próprio
// jogo, que mudou várias evoluções (amizade virou nível, Eevee só por pedras, trocas com alternativa…).
// Métodos 1–42 = enum EVO_* do pokeemerald-expansion (igual em todas as versões); 43–46 são próprios do Quetzal.

import { esc } from './render.js';
import { t } from '../i18n.js';
import { SILHOUETTE, iconUrl, spriteUrl } from './sprites.js';
import { makeResolver } from '../parser/describe.js';

// Tipos no enum da ROM (Mystery no 9), para o método 24 (amizade + golpe de um tipo)
const ROM_TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', '???',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];
const MAX_TEXTS = 3;

/** Texto do método de evolução, no idioma da interface. */
export function evoMethod(method, p, T, R) {
  const Q = T.quetzal;
  const item = () => Q.items[p] || `Item ${p}`;
  const move = () => Q.moveNames[p] || (T.moves[p] ? T.moves[p][0] : `#${p}`);
  const mon = () => { const s = R.species(p); return s.form ? `${s.name} (${s.form})` : s.name; };
  switch (method) {
    case 1: return t('Amizade');
    case 2: return t('Amizade, de dia');
    case 3: return t('Amizade, à noite');
    case 4: case 13: return t('Nv. {n}', { n: p });
    case 5: return t('Troca');
    case 6: return t('Troca segurando {item}', { item: item() });
    case 7: return item();
    case 8: return t('Nv. {n}, Ataque > Defesa', { n: p });
    case 9: return t('Nv. {n}, Ataque = Defesa', { n: p });
    case 10: return t('Nv. {n}, Ataque < Defesa', { n: p });
    case 11: case 12: return t('Nv. {n} (aleatório)', { n: p });
    case 14: return t('Nv. {n}, com espaço na equipe e uma Poké Ball', { n: p });
    case 15: return t('Beleza {n}', { n: p });
    case 16: return t('Nv. {n}, fêmea', { n: p });
    case 17: return t('Nv. {n}, macho', { n: p });
    case 18: return t('Nv. {n}, à noite', { n: p });
    case 19: return t('Nv. {n}, de dia', { n: p });
    case 20: return t('Nv. {n}, ao entardecer', { n: p });
    case 21: return t('Subir de nível segurando {item}, de dia', { item: item() });
    case 22: return t('Subir de nível segurando {item}, à noite', { item: item() });
    case 23: return t('Subir de nível sabendo {move}', { move: move() });
    case 24: return t('Amizade, sabendo um golpe {type}', { type: ROM_TYPES[p] || '?' });
    case 25: case 32: return t('Subir de nível num lugar específico');
    case 26: return t('{item}, macho', { item: item() });
    case 27: return t('{item}, fêmea', { item: item() });
    case 28: return t('Nv. {n}, com chuva', { n: p });
    case 29: return t('Subir de nível com {mon} na equipe', { mon: mon() });
    case 30: return t('Nv. {n}, com um Pokémon Dark na equipe', { n: p });
    case 31: return t('Troca por {mon}', { mon: mon() });
    case 33: case 34: return t('Nv. {n}, conforme a natureza', { n: p });
    case 35: return t('{n} acertos críticos numa batalha', { n: p });
    case 36: return t('Depois de perder {n} de HP', { n: p });
    case 37: return 'Scroll of Darkness';
    case 38: return 'Scroll of Waters';
    case 39: return t('{item}, à noite', { item: item() });
    case 40: return t('{item}, de dia', { item: item() });
    case 41: return t('Subir de nível segurando {item}', { item: item() });
    case 42: return t('Nv. {n}, com neblina', { n: p });
    default: return t('Método próprio do Quetzal (nº {m}, valor {n})', { m: method, n: p });
  }
}

/**
 * Nós da linha evolutiva: [id, id de quem evolui, texto do método, ids juntados]. Formas que aparecem com o
 * mesmo nome a partir do mesmo Pokémon (ex.: as variações da Alcremie) viram um nó só, com os métodos juntos.
 */
export function quetzalChain(id, T, R = makeResolver(T)) {
  const E = T.quetzal.evolutions;
  const pre = new Map();
  for (const [from, list] of Object.entries(E)) for (const [, , to] of list) if (!pre.has(to)) pre.set(to, +from);
  let root = id;
  const back = new Set();
  while (pre.has(root) && !back.has(root)) { back.add(root); root = pre.get(root); }
  if (root === id && !E[id]) return null;
  const label = s => { const sp = R.species(s); return `${sp.name}|${sp.form || ''}`; };
  const nodes = [[root, 0, [], [root]]];
  const queue = [root], done = new Set([root]);
  while (queue.length) {
    const from = queue.shift();
    for (const [method, param, to] of E[from] || []) {
      const text = evoMethod(method, param, T, R);
      let node = nodes.find(n => n[1] === from && (n[0] === to || label(n[0]) === label(to)));
      if (!node) { node = [to, from, [], [to]]; nodes.push(node); }
      if (!node[3].includes(to)) node[3].push(to);
      if (!node[2].includes(text)) node[2].push(text);
      if (!done.has(to)) { done.add(to); queue.push(to); }
    }
  }
  return nodes.map(([n, from, texts, ids]) => [n, from,
    texts.length > MAX_TEXTS ? `${texts.slice(0, MAX_TEXTS).join(t(' ou '))} ${t('e outros')}` : texts.join(t(' ou ')), ids]);
}

export function quetzalEvolutionHtml(m, T, stages) {
  const R = makeResolver(T);
  const chain = quetzalChain(m.speciesId, T, R);
  if (!chain) return `<section class="dsec"><h3>${t('Evolução')}</h3><p class="hint">${t('Não evolui no Quetzal.')}</p></section>`;
  const cols = stages(chain).map(level => `<div class="evo-stage">${level.map(([id, , how, ids]) => {
    const sp = R.species(id);
    const icon = !sp.spriteId ? SILHOUETTE : sp.hasIcon ? iconUrl(sp.spriteId) : spriteUrl(sp.spriteId);
    const name = sp.form ? `${sp.name} (${sp.form})` : sp.name;
    return `<div class="evo-node${ids.includes(m.speciesId) ? ' here' : ''}">
      <img data-sprite="1" src="${esc(icon)}" data-next="${esc(SILHOUETTE)}" alt="" width="48" height="40" decoding="async" loading="lazy" crossorigin="anonymous"${sp.hasIcon ? ' class="ico"' : ''}>
      <b>${esc(name)}</b>
      ${how ? `<small>${esc(how)}</small>` : ''}
    </div>`;
  }).join('')}</div>`).join('<span class="evo-arrow" aria-hidden="true"></span>');
  return `<section class="dsec"><h3>${t('Evolução')}</h3>
    <div class="evo">${cols}</div>
    <p class="hint">${t('Métodos do próprio Quetzal (tabela do jogo).')}</p></section>`;
}

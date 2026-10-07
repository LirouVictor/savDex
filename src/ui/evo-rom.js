// Linha evolutiva pela tabela da ROM do jogo, com os métodos do próprio jogo:
// - Quetzal (src/data/quetzal.json → evolutions), que mudou várias evoluções (amizade virou nível, Eevee só por
//   pedras, trocas com alternativa…). Métodos 1–42 = enum EVO_* do pokeemerald-expansion (igual em todas as
//   versões); 43–46 são próprios do Quetzal.
// - Unbound (src/data/unbound.json → evolutions): enum EvolutionMethods do CFRU (1–39), com o valor extra de
//   cada evolução (gênero da Dawn Stone, tipo na equipe, horário, item segurado…).
// - SoulGold (src/data/soulgold.json → evolutions): enums EvolutionMethods (1–8) e EvolutionConditions (0–38)
//   do pokeemerald-expansion atual; cada evolução tem um método e uma lista de condições.

import { esc } from './render.js';
import { t } from '../i18n.js';
import { SILHOUETTE, iconUrl, spriteUrl } from './sprites.js';
import { makeResolver, moveInfo } from '../parser/describe.js';
import { unboundSpecies } from '../parser/unbound.js';
import { soulgoldSpecies } from '../parser/soulgold.js';
import { natureFromId } from '../parser/natures.js';

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

// Tipos no enum do CFRU (Fairy no 0x17)
const CFRU_TYPES = { 0: 'Normal', 1: 'Fighting', 2: 'Flying', 3: 'Poison', 4: 'Ground', 5: 'Rock', 6: 'Bug', 7: 'Ghost', 8: 'Steel',
  10: 'Fire', 11: 'Water', 12: 'Grass', 13: 'Electric', 14: 'Psychic', 15: 'Ice', 16: 'Dragon', 17: 'Dark', 23: 'Fairy' };

/** Texto do método de evolução do Unbound (CFRU), no idioma da interface. */
export function unboundEvoMethod(method, p, x, T) {
  const U = T.unbound;
  const item = (i = p) => U.items[i] || `Item ${i}`;
  const move = () => { const ref = U.moves[p]; return typeof ref === 'number' ? moveInfo(ref, T).name : ref || `#${p}`; };
  const mon = () => { const s = unboundSpecies(p, U, T); return s.form ? `${s.name} (${s.form})` : s.name; };
  const hour = h => String(h).padStart(2, '0');
  switch (method) {
    case 1: return t('Amizade');
    case 2: return t('Amizade, de dia');
    case 3: return t('Amizade, à noite');
    case 4: case 13: return t('Nv. {n}', { n: p });
    case 5: return t('Troca');
    case 6: return t('Troca segurando {item}', { item: item() });
    case 7: // Dawn Stone: o valor extra é o gênero (0 macho, 254 fêmea)
      if (item() === 'Dawn Stone') return x === 254 ? t('{item}, fêmea', { item: item() }) : t('{item}, macho', { item: item() });
      return item();
    case 8: return t('Nv. {n}, Ataque > Defesa', { n: p });
    case 9: return t('Nv. {n}, Ataque = Defesa', { n: p });
    case 10: return t('Nv. {n}, Ataque < Defesa', { n: p });
    case 11: case 12: return t('Nv. {n} (aleatório)', { n: p });
    case 14: return t('Nv. {n}, com espaço na equipe e uma Poké Ball', { n: p });
    case 15: return t('Beleza {n}', { n: p });
    case 16: return t('Nv. {n}, com chuva ou neblina', { n: p });
    case 17: return x ? t('Amizade, sabendo um golpe {type}', { type: CFRU_TYPES[p] || '?' }) : t('Subir de nível sabendo um golpe {type}', { type: CFRU_TYPES[p] || '?' });
    case 18: return t('Nv. {n}, com um Pokémon {type} na equipe', { n: p, type: CFRU_TYPES[x] || '?' });
    case 19: return t('Subir de nível em {place}', { place: U.places[p] || '?' });
    case 20: return t('Nv. {n}, macho', { n: p });
    case 21: return t('Nv. {n}, fêmea', { n: p });
    case 22: return t('Nv. {n}, à noite', { n: p });
    case 23: return t('Nv. {n}, de dia', { n: p });
    case 24: return t('Subir de nível segurando {item}, à noite', { item: item() });
    case 25: return t('Subir de nível segurando {item}, de dia', { item: item() });
    case 26: return t('Subir de nível sabendo {move}', { move: move() });
    case 27: return t('Subir de nível com {mon} na equipe', { mon: mon() });
    case 28: return t('Nv. {n}, das {from}h às {to}h', { n: p, from: hour(x >> 8), to: hour(x & 0xFF) });
    case 30: return t('{n} acertos críticos numa batalha', { n: 3 });
    case 31: case 32: return t('Nv. {n}, conforme a natureza', { n: p });
    case 34: return t('{item} num lugar específico', { item: item() });
    case 35: return t('Nv. {n} segurando {item}', { n: p, item: item(x) });
    case 36: return t('{item} segurando {held}', { item: item(), held: item(x) });
    case 37: return t('Subir de nível sabendo {move}, macho', { move: move() });
    case 38: return t('Subir de nível sabendo {move}, fêmea', { move: move() });
    case 39: return t('{item}, à noite', { item: item() });
    default: return t('Método próprio do Unbound (nº {m}, valor {n})', { m: method, n: p });
  }
}

// Tipos no enum do expansion recente (NONE = 0, Mystery = 10)
const SG_TYPES = [null, 'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', '???',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];
const REGIONS = [null, 'Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Hisui', 'Paldea'];

/** Texto de uma evolução do SoulGold ([método, parâmetro, alvo, condições?]), no idioma da interface. */
export function soulgoldEvoMethod([method, p, , conds = []], T) {
  const SG = T.soulgold;
  const item = i => SG.items[i] || `Item ${i}`;
  const move = i => { const ref = SG.moves[i]; return typeof ref === 'number' ? moveInfo(ref, T).name : ref || `#${i}`; };
  // Espécie vazia na ROM (o hack tirou, ex.: Remoraid, que o Mantyke ainda pede)
  const mon = i => {
    if (!SG.species[i]) return t('uma espécie que não existe no SoulGold (nº {n})', { n: i });
    const s = soulgoldSpecies(i, SG, T);
    return s.form ? `${s.name} (${s.form})` : s.name;
  };
  const type = i => SG_TYPES[i] || '?';
  const time = i => [t('de manhã'), t('de dia'), t('ao entardecer'), t('à noite')][i] || '?';
  const base = {
    1: p ? t('Nv. {n}', { n: p }) : t('Subir de nível'),
    2: t('Troca'),
    3: item(p),
    4: t('Quando evolui em {mon}', { mon: mon(p) }),
    5: t('Evento no jogo'),
    6: t('Nv. {n}, em batalha', { n: p }),
    7: t('No fim de uma batalha'),
    8: t('Girando no mapa'),
  }[method] || t('Método próprio do SoulGold (nº {m}, valor {n})', { m: method, n: p });
  const cond = ([c, a, b]) => {
    switch (c) {
      case 0: return a === 254 ? t('fêmea') : t('macho');
      case 1: return time(a);
      case 2: return t('exceto {time}', { time: time(a) });
      case 3: return t('amizade {n}+', { n: a });
      case 4: return t('Ataque > Defesa');
      case 5: return t('Ataque = Defesa');
      case 6: return t('Ataque < Defesa');
      case 7: return t('segurando {item}', { item: item(a) });
      case 8: case 9: case 10: case 32: case 33: case 34: return t('aleatório');
      case 11: return t('Beleza {n}+', { n: a });
      case 16: return t('com {mon} na equipe', { mon: mon(a) });
      case 17: return t('num lugar específico');
      case 18: return SG.places && SG.places[a] ? t('em {place}', { place: SG.places[a] }) : t('num lugar específico');
      case 19: return t('sabendo {move}', { move: move(a) });
      case 20: return t('por {mon}', { mon: mon(a) });
      case 21: return t('com um Pokémon {type} na equipe', { type: type(a) });
      case 22: return a === 3 ? t('com chuva') : t('com o clima nº {n}', { n: a });
      case 23: return t('sabendo um golpe {type}', { type: type(a) });
      case 24: return t('natureza {nature}', { nature: (natureFromId(a) || { name: '?' }).name });
      case 25: case 26: return t('conforme a natureza');
      case 27: return t('depois de perder {n} de HP por recuo', { n: a });
      case 28: return t('com {n}+ de HP perdido', { n: a });
      case 29: return t('{n} acertos críticos numa batalha', { n: a });
      case 30: return t('depois de usar {move} {n} vezes', { move: move(a), n: b });
      case 35: return t('depois de andar {n} passos', { n: a });
      case 36: return t('{n}× {item} na mochila', { n: b, item: item(a) });
      case 37: return t('em {place}', { place: REGIONS[a] || '?' });
      case 38: return t('fora de {place}', { place: REGIONS[a] || '?' });
      default: return t('condição nº {m}', { m: c });
    }
  };
  return [base, ...conds.map(cond)].join(', ');
}

/**
 * Nós da linha evolutiva: [id, id de quem evolui, texto do método, ids juntados]. Formas que aparecem com o
 * mesmo nome a partir do mesmo Pokémon (ex.: as variações da Alcremie) viram um nó só, com os métodos juntos.
 * E = { espécie: [[método, parâmetro, alvo, extra?], …] }; label(id) = nome + forma; text(evolução) = método.
 */
function romChain(id, E, label, text) {
  const pre = new Map();
  for (const [from, list] of Object.entries(E)) for (const [, , to] of list) if (!pre.has(to)) pre.set(to, +from);
  let root = id;
  const back = new Set();
  while (pre.has(root) && !back.has(root)) { back.add(root); root = pre.get(root); }
  if (root === id && !E[id]) return null;
  const nodes = [[root, 0, [], [root]]];
  const queue = [root], done = new Set([root]);
  while (queue.length) {
    const from = queue.shift();
    for (const evo of E[from] || []) {
      const to = evo[2], how = text(evo);
      let node = nodes.find(n => n[1] === from && (n[0] === to || label(n[0]) === label(to)));
      if (!node) { node = [to, from, [], [to]]; nodes.push(node); }
      if (!node[3].includes(to)) node[3].push(to);
      if (!node[2].includes(how)) node[2].push(how);
      if (!done.has(to)) { done.add(to); queue.push(to); }
    }
  }
  return nodes.map(([n, from, texts, ids]) => [n, from,
    texts.length > MAX_TEXTS ? `${texts.slice(0, MAX_TEXTS).join(t(' ou '))} ${t('e outros')}` : texts.join(t(' ou ')), ids]);
}

const labelOf = species => id => { const sp = species(id); return `${sp.name}|${sp.form || ''}`; };

export function quetzalChain(id, T, R = makeResolver(T)) {
  return romChain(id, T.quetzal.evolutions, labelOf(R.species), ([method, param]) => evoMethod(method, param, T, R));
}

export function unboundChain(id, T) {
  const species = s => unboundSpecies(s, T.unbound, T);
  return romChain(id, T.unbound.evolutions, labelOf(species), ([method, param, , extra]) => unboundEvoMethod(method, param, extra, T));
}

export function soulgoldChain(id, T) {
  const species = s => soulgoldSpecies(s, T.soulgold, T);
  return romChain(id, T.soulgold.evolutions, labelOf(species), evo => soulgoldEvoMethod(evo, T));
}

export function quetzalEvolutionHtml(m, T, stages) {
  const R = makeResolver(T);
  return chainHtml(m, quetzalChain(m.speciesId, T, R), R.species, stages, t('Não evolui no Quetzal.'), t('Métodos do próprio Quetzal (tabela do jogo).'));
}

export function unboundEvolutionHtml(m, T, stages) {
  return chainHtml(m, unboundChain(m.speciesId, T), s => unboundSpecies(s, T.unbound, T), stages,
    t('Não evolui no Unbound.'), t('Métodos do próprio Unbound (tabela do jogo).'));
}

export function soulgoldEvolutionHtml(m, T, stages) {
  return chainHtml(m, soulgoldChain(m.speciesId, T), s => soulgoldSpecies(s, T.soulgold, T), stages,
    t('Não evolui no SoulGold.'), t('Métodos do próprio SoulGold (tabela do jogo).'));
}

function chainHtml(m, chain, species, stages, none, hint) {
  if (!chain) return `<section class="dsec"><h3>${t('Evolução')}</h3><p class="hint">${none}</p></section>`;
  const cols = stages(chain).map(level => `<div class="evo-stage">${level.map(([id, , how, ids]) => {
    const sp = species(id);
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
    <p class="hint">${hint}</p></section>`;
}

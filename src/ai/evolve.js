// Evoluções no conserto da equipe: um Pokémon ainda não evoluído pode entrar contando com a forma evoluída
// (tipos, stats base e habilidade dela), e a tela avisa "evolua". Só nos jogos com as evoluções tiradas da ROM
// (Quetzal, Unbound e SoulGold), que já vêm carregadas com o save; nos oficiais o app não entra aqui.

import { makeResolver } from '../parser/describe.js';
import { unboundSpecies } from '../parser/unbound.js';
import { soulgoldSpecies } from '../parser/soulgold.js';

const resolvers = new WeakMap();
/** Espécie (no formato do app) pelo ID do jogo do save. */
function speciesFn(T) {
  if (T.quetzal) {
    if (!resolvers.has(T)) resolvers.set(T, makeResolver(T));
    const R = resolvers.get(T);
    return id => R.species(id);
  }
  if (T.unbound) return id => unboundSpecies(id, T.unbound, T);
  if (T.soulgold) return id => soulgoldSpecies(id, T.soulgold, T);
  return null;
}

/** IDs das evoluções finais de uma espécie (a última de cada ramo), pela tabela da ROM. */
export function finalEvolutionIds(id, T) {
  const R = T.quetzal || T.unbound || T.soulgold;
  if (!R || !R.evolutions) return [];
  const finals = [], seen = new Set([id]);
  const walk = cur => {
    const next = (R.evolutions[cur] || []).map(e => e[2]).filter(n => n && !seen.has(n));
    if (!next.length) { if (cur !== id) finals.push(cur); return; }
    for (const n of next) { seen.add(n); walk(n); }
  };
  walk(id);
  return finals;
}

/**
 * O mesmo Pokémon contado como a forma evoluída: tipos, stats base e habilidade (pelo mesmo número) dela;
 * golpes, item, natureza, IVs, EVs, nível e lugar continuam os dele. `evolvedFrom` aponta para o Pokémon real.
 */
export function evolveMon(m, id, sp) {
  const num = m.ability ? m.ability.num : 0;
  const name = sp.abilities[num] || sp.abilities.find(Boolean) || (m.ability && m.ability.name);
  return { ...m, speciesId: id, species: sp, ability: m.ability ? { ...m.ability, name } : m.ability, evolvedFrom: m };
}

/** As formas evoluídas (finais) de um Pokémon, prontas para o conserto; [] se não evolui ou o jogo não tem a tabela. */
export function evolvedVersions(m, T) {
  if (m.egg || (m.species && m.species.form === 'ovo')) return [];
  const sp = speciesFn(T);
  if (!sp) return [];
  return finalEvolutionIds(m.speciesId, T)
    .map(id => [id, sp(id)])
    .filter(([, s]) => s && s.types && s.types.length && s.baseStats)
    .map(([id, s]) => evolveMon(m, id, s));
}

const megaIndex = new WeakMap();
/** Megas do jogo (tabela da ROM): nome da espécie → [{ id, form }]. */
function megas(T) {
  const R = T.quetzal || T.unbound || T.soulgold;
  if (!R || !R.species) return null;
  if (!megaIndex.has(R)) {
    const idx = new Map();
    const formOf = row => (T.quetzal ? row[9] : row[1]);
    for (const [id, row] of Object.entries(R.species)) {
      if (!row || !/^Mega( [XYZ])?$/.test(formOf(row) || '')) continue;
      if (!idx.has(row[0])) idx.set(row[0], []);
      idx.get(row[0]).push({ id: +id, form: formOf(row) });
    }
    megaIndex.set(R, idx);
  }
  return megaIndex.get(R);
}

/**
 * A forma mega do Pokémon, se ele segura a própria megapedra (Charizardite Y → Charizard Mega Y): tipos, stats
 * base e habilidade da mega, pela tabela da ROM (Quetzal, Unbound, SoulGold). Só na forma comum da espécie (uma
 * forma regional, como o Raichu de Alola, não usa a megapedra da forma comum). null se não há.
 */
export function megaForm(m, T) {
  const item = m.item && m.item.name;
  if (!item || m.species.form) return null;
  const list = megas(T) && megas(T).get(m.species.name);
  if (!list) return null;
  // A pedra é desta espécie (as 4 primeiras letras: Charizardite, Golisopite, Lucarionite…)
  if (!item.toLowerCase().startsWith(m.species.name.toLowerCase().slice(0, 4))) return null;
  const suffix = (item.match(/ ([XYZ])$/) || [])[1];
  const hit = list.find(x => x.form === (suffix ? `Mega ${suffix}` : 'Mega')) || (list.length === 1 ? list[0] : null);
  if (!hit) return null;
  const sp = speciesFn(T)(hit.id);
  if (!sp || !sp.types.length || !sp.baseStats) return null;
  const name = sp.abilities.find(Boolean) || (m.ability && m.ability.name);
  return { ...m, species: sp, ability: m.ability ? { ...m.ability, name } : { num: 0, name }, megaOf: m };
}

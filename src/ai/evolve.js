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

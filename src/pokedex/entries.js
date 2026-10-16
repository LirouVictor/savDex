// Pokédex do jogo do save: todas as espécies (e formas com dados próprios) que o app conhece para o jogo, no mesmo
// formato de espécie dos Pokémon do save (describe), para reaproveitar o detalhe (evolução, golpes, dano recebido).
// Quetzal: Dex Nacional até o 898 e as espécies da ROM depois; Unbound: a tabela da ROM; SoulGold: a Pokédex de Johto
// do hack e as formas dessas espécies; Gen 3: 1–386; DS: 1–493 / 1–649 e as formas, com tipos e stats da época.

import { makeResolver } from '../parser/describe.js';
import { unboundSpecies } from '../parser/unbound.js';
import { soulgoldSpecies } from '../parser/soulgold.js';
import { gen3Species } from '../parser/gen3.js';
import { ndsSpecies } from '../parser/nds.js';

/**
 * As entradas da Pokédex, na ordem da Dex Nacional (formas logo depois da espécie).
 * @param {object} T tabelas do jogo do save
 * @param {{ id: string, gen?: number }|null} game
 * @returns {Array<{ id: number, form: number|null, nat: number|null, species: object }>} `id` = número da espécie no
 *   save (o que o detalhe usa para a evolução e os golpes da ROM); `form` = número da forma (DS)
 */
export function pokedexEntries(T, game) {
  const out = [];
  // Forma igual a outra da mesma espécie na batalha (Unown, Vivillon, Gigantamax, bonés do Pikachu…) não entra: só
  // repetiria os mesmos dados. No DS, só a igual à forma padrão (na Gen 4 as formas do Rotom têm os mesmos stats e tipos,
  // mas golpes próprios)
  const seen = new Set();
  const formsToo = !T.nds;
  const sig = (nat, sp) => `${nat}|${sp.types.join('/')}|${(sp.baseStats || []).join(',')}`;
  const add = (id, nat, sp, form = null) => {
    if (!sp || !sp.baseStats || !sp.types.length) return;
    const k = sig(nat ?? `q${id}`, sp);
    if (sp.form && seen.has(k)) return;
    if (!sp.form || formsToo) seen.add(k);
    out.push({ id, form, nat: nat ?? null, species: sp });
  };

  if (T.unbound || T.soulgold) {
    const D = T.unbound || T.soulgold;
    const of = T.unbound ? unboundSpecies : soulgoldSpecies;
    // SoulGold: só as espécies da Pokédex de Johto do hack (lista de números da Dex Nacional) e as formas delas
    const johto = T.soulgold ? new Set(D.johto) : null;
    // SoulGold: forma regional às vezes só no nome do Showdown (Raticate-Alola)
    const spOf = (row, id) => {
      const sp = of(id, D, T);
      return !sp.form && sp.showdown && sp.showdown.startsWith(sp.name + '-') ? { ...sp, form: sp.showdown.slice(sp.name.length + 1) } : sp;
    };
    const rows = D.species.map((row, id) => [row, id]).filter(([row]) => row && !(johto && !johto.has(row[2]))).map(([row, id]) => [spOf(row, id), id, row[2]]);
    // Primeiro as formas padrão, para a forma igual à padrão ser a que sai
    for (const pass of [false, true]) for (const [sp, id, nat] of rows) if (!!sp.form === pass) add(id, nat, sp);
  } else if (T.gen3) {
    T.gen3.species.forEach((row, id) => { if (row && row[0] <= 386) add(id, row[0], gen3Species(id, T)); });
  } else if (T.nds) {
    const gen = (game && game.gen) || 4;
    const N = T.nds;
    const withAbilities = (n, sp) => {
      // Habilidades da PokeAPI (podem ter mudado depois da época); na Gen 4 não há habilidade oculta
      const ab = (T.speciesAbilities[n] || []).map(a => (a ? T.abilityNames[a] : null));
      return { ...sp, abilities: [ab[0] || null, ab[1] || null, gen >= 5 ? ab[2] || null : null], abilitiesProbable: true };
    };
    N.species[gen].forEach((row, n) => { if (row && T.species[n]) add(n, n, withAbilities(n, ndsSpecies(n, 0, T, gen))); });
    for (const key of Object.keys(N.forms[gen] || {})) {
      const [n, f] = key.split(':').map(Number);
      add(n, n, withAbilities(n, ndsSpecies(n, f, T, gen)), f);
    }
  } else {
    const R = makeResolver(T);
    const Q = T.quetzal;
    const last = Q ? 898 : T.species.length - 1;
    for (let n = 1; n <= last; n++) if (T.species[n]) add(n, n, R.species(n));
    if (Q) {
      for (const [k, row] of Object.entries(Q.species)) {
        const id = +k;
        if (id <= 898 || !row || row[11]) continue; // row[11]: forma só de aparência
        add(id, row[5], R.species(id));
      }
    }
  }
  if (!T.nds) {
    // Linhas sem nome de forma além da primeira de cada espécie (Gigantamax, Totem, formas sem par na PokeAPI): só as que
    // mudam tipos ou stats, como "forma ?"
    const natKey = x => x.nat ?? `q${x.id}`;
    const body = x => `${natKey(x)}|${x.species.types.join('/')}|${x.species.baseStats.join(',')}`;
    const firstOf = new Map(), bodies = new Set();
    for (const x of out) {
      if (x.species.form) { bodies.add(body(x)); continue; }
      if (!firstOf.has(natKey(x))) { firstOf.set(natKey(x), x); bodies.add(body(x)); }
    }
    for (let i = out.length - 1; i >= 0; i--) {
      const x = out[i];
      if (x.species.form || firstOf.get(natKey(x)) === x) continue;
      if (bodies.has(body(x))) out.splice(i, 1);
      else { bodies.add(body(x)); out[i] = { ...x, species: { ...x.species, form: '?' } }; }
    }
  }
  return out.sort((a, b) => (a.nat ?? 1e5) - (b.nat ?? 1e5) || (a.species.form ? 1 : 0) - (b.species.form ? 1 : 0) || a.id - b.id);
}

/** Total dos stats base. */
export const bst = sp => (sp.baseStats || []).reduce((a, b) => a + b, 0);

// Conserto da equipe montada pela IA, feito pelo app: se algum tipo acerta 3 ou mais membros em cheio (o
// critério que a IA mais fura, e que só o app consegue contar de verdade), troca 1 ou 2 membros por
// disponíveis que resolvam, mexendo o mínimo. A IA continua escolhendo a ideia da equipe; o app só conserta
// o que dá para medir. Sem chamada a mais: a segunda etapa da IA escreve os textos já para a equipe final.

import { isMegaStone, strategyOf, speciesKey, MAX_MEGAS } from './prompt.js';
import { benefits, teamWeathers, weatherConflict, WEATHER } from './strategy.js';
import { evolvedVersions } from './evolve.js';

/** Candidatos testados (os que resistem aos tipos problemáticos, de maior total de stats base). */
const CANDIDATES = 40;
const LIMIT = 3; // um tipo acertando 3 ou mais membros em cheio fura o critério
const SPE = 5;

/** a < b comparando item a item (menos tipos furando, menos trocas, menos troca de papel, mais stats base). */
const lexLess = (a, b) => { const k = a.findIndex((v, i) => v !== b[i]); return k >= 0 && a[k] < b[k]; };
const bst = m => (m.species.baseStats ? m.species.baseStats.reduce((a, b) => a + b, 0) : 0);
/** Atacante físico ou especial, pelos stats base (para trocar físico por físico quando der). */
const lean = m => (m.species.baseStats ? (m.species.baseStats[1] >= m.species.baseStats[3] ? 'phys' : 'spec') : '');

/**
 * Quem não pode sair: quem o jogador citou no pedido e quem sustenta uma estratégia que a equipe usa
 * (põe um clima/terreno que algum membro aproveita, ou o aproveita pela habilidade, golpe próprio ou megapedra;
 * Trick Room com membro lento). Quem só tem golpe Fire/Water que o clima fortalece pode sair.
 */
function keepers(team, roles, note) {
  const text = (note || '').toLowerCase();
  const keep = new Set(team.filter(m => text && text.includes(m.species.name.toLowerCase())));
  const set = new Set(roles.flatMap(r => [...r.set]));
  const slow = team.some(m => m.species.baseStats && m.species.baseStats[SPE] <= 60);
  team.forEach((m, i) => {
    const r = roles[i];
    if ([...r.set].some(f => roles.some(o => benefits(o, f)) || (f === 'Trick Room' && slow)) || [...r.use].some(f => set.has(f))) keep.add(m);
  });
  return keep;
}

/**
 * @param {object[]} team os Pokémon escolhidos pela IA
 * @param {object[]} pool os disponíveis que a IA viu (uma cópia por espécie)
 * @param {{ types: string[], typechart: number[][] }} T
 * @param {{ note?: string, free?: string|null }} [opts] pedido do jogador (quem ele citou fica) e o modo livre
 * @returns {null | { team: object[], swaps: Array<{ out: object, in: object }>, counts: Array<{ type: string, before: number, after: number }> }}
 *   null quando não há o que consertar (ou nenhuma troca melhora)
 */
export function repairTeam(team, pool, T, { note = '', free = null } = {}) {
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const types = T.types.filter(ty => ty && ty !== 'stellar');
  // O mesmo multiplicador da análise da equipe (analysis.js): sem habilidades nem itens
  const mult = (atk, def) => def.reduce((x, d) => x * (idx.has(d) ? T.typechart[idx.get(atk)][idx.get(d)] : 1), 1);
  const roles = team.map(m => strategyOf(m, free));
  const keep = keepers(team, roles, note);
  // Clima que a equipe sustenta: quem põe fica, e o tipo que ele corta pela metade (Water no sol, Fire na chuva)
  // não conta como fraqueza (2× vira 1×). Quem entra não pode atrapalhar esse clima.
  const weathers = teamWeathers(team, roles).filter(f => team.some((m, i) => keep.has(m) && roles[i].set.has(f)));
  const halved = new Set(weathers.map(f => WEATHER[f].weakens));
  const cache = new Map();
  const weakVec = m => {
    if (!cache.has(m)) cache.set(m, types.map(atk => (!halved.has(atk) && m.species.types.length && mult(atk, m.species.types) > 1 ? 1 : 0)));
    return cache.get(m);
  };
  const counts = list => types.map((_, i) => list.reduce((n, m) => n + weakVec(m)[i], 0));
  const excess = list => counts(list).reduce((s, n) => s + Math.max(0, n - (LIMIT - 1)), 0);

  const before = counts(team);
  const start = excess(team);
  if (!start) return null;
  const problem = types.filter((_, i) => before[i] >= LIMIT);

  const out = team.map((m, i) => i).filter(i => !keep.has(team[i]));
  const inTeam = new Set(team.map(speciesKey));
  // Quem ainda não evoluiu também entra contando com a forma evoluída (a tela avisa "evolua")
  const real = m => m.evolvedFrom || m;
  const cands = pool.flatMap(m => [m, ...evolvedVersions(m, T)])
    .filter(m => !inTeam.has(speciesKey(m)) && !team.includes(real(m)) && m.species.types.length)
    .filter(m => !weathers.some(f => weatherConflict(m, f, T)))
    .filter(m => problem.some(ty => mult(ty, m.species.types) < 1) && !problem.some(ty => mult(ty, m.species.types) > 1))
    .map(m => [m, problem.filter(ty => mult(ty, m.species.types) < 1).length * 100 + bst(m)])
    .sort((a, b) => b[1] - a[1]).slice(0, CANDIDATES).map(([m]) => m);
  if (!out.length || !cands.length) return null;

  let best = null;
  const consider = (removed, added) => {
    const next = team.map((m, i) => (removed.includes(i) ? added[removed.indexOf(i)] : m));
    if (added.length === 2 && (speciesKey(added[0]) === speciesKey(added[1]) || real(added[0]) === real(added[1]))) return;
    if (added.some(m => isMegaStone(m.item)) && next.filter(m => isMegaStone(m.item)).length > MAX_MEGAS) return;
    const score = [excess(next), added.length,
      removed.filter((i, k) => lean(team[i]) !== lean(added[k])).length,
      -(added.reduce((s, m) => s + bst(m), 0) - removed.reduce((s, i) => s + bst(team[i]), 0))];
    if (!best || lexLess(score, best.score)) best = { score, next, removed, added };
  };
  for (const i of out) for (const c of cands) consider([i], [c]);
  // Duas trocas (até 15 pares × 780 pares de candidatos: alguns milissegundos)
  for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
    for (let x = 0; x < cands.length; x++) for (let y = x + 1; y < cands.length; y++) {
      consider([out[a], out[b]], [cands[x], cands[y]]);
    }
  }
  if (!best || best.score[0] >= start) return null;
  const after = counts(best.next);
  return {
    team: best.next,
    swaps: best.removed.map((i, k) => ({ out: team[i], in: best.added[k] })),
    counts: types.map((type, i) => ({ type, before: before[i], after: after[i] })).filter(c => c.before >= LIMIT),
  };
}

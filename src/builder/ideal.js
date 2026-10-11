// "Ideal × o que você tem": para uma equipe que o app montou, o Pokémon que o competitivo usaria com ela e o jogador não
// tem (o ideal), em qual vaga, e o mais parecido que existe no save (a alternativa). O ideal sai das duplas fortes do
// Smogon (smogon.js) com quem fica na equipe e só aparece se a nota do app, estimada com ele, sobe. Tudo por contas; a IA
// só comenta (o "Comentar com IA" leva estas linhas).

import { scoreParts, allowed, planHolds, outsiderEntry, sets, isLegendary } from './build.js';
import { gameSpecies } from './threats.js';

const SHORTLIST = 12; // ideais avaliados pela nota: os que mais jogam com a equipe no competitivo
const MAX = 2; // sugestões por equipe (vagas diferentes)
const MIN_PAIR = 1; // dupla forte: juntos 2× o acaso ou mais
const MIN_GAIN = 0.5; // a nota estimada precisa subir pelo menos isso
const MIN_SIM = 4; // parecido o bastante para ser a alternativa
const ALT_TRY = 6; // alternativas avaliadas pela nota (as mais parecidas)
// Formas que são outro Pokémon (Raichu de Alola não é o Raichu); gênero e aparência, não
const REGIONAL = /Alola|Galar|Hisui|Paldea/;
const isMegaId = id => /(mega[xyz]?|primal)$/.test(id) && id !== 'yanmega';

const cache = new WeakMap();
/** Espécies do jogo por ID do Smogon (sem megas: a mega é o mesmo Pokémon com a pedra). */
function speciesById(index, T, game) {
  let byT = cache.get(index);
  if (!byT) cache.set(index, (byT = new WeakMap()));
  if (!byT.has(T)) {
    const map = new Map();
    for (const sp of gameSpecies(T, game)) {
      const id = index.find(sp);
      if (id && !isMegaId(id) && !map.has(id)) map.set(id, sp);
    }
    byT.set(T, map);
  }
  return byT.get(T);
}

/** O jogador tem: a mesma espécie do Smogon (na forma que o app conta, inclusive evoluída) ou o mesmo Pokémon. */
function owned(pool, c) {
  const ids = new Set(), names = new Set();
  for (const e of pool) {
    if (e.sx >= 0) ids.add(c.ids[e.sx]);
    for (const sp of [e.m.species, e.bf.species]) if (!REGIONAL.test(sp.form || '')) names.add(sp.name);
  }
  return (sp, id) => ids.has(id) || (!REGIONAL.test(sp.form || '') && names.has(sp.name));
}

const centered = b => { const avg = b.reduce((a, x) => a + x, 0) / b.length; return b.map(x => x - avg); };
function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/**
 * Quanto `y` (do save) faz o papel de `x` (o ideal): tipos em comum, o mesmo papel no plano (aproveita o clima/terreno
 * pela habilidade ou megapedra; lento no Trick Room) e o jeito dos stats (atacante físico/especial, velocidade, perfil).
 */
function similarity(x, y, plan) {
  const shared = x.types.filter(ty => y.types.includes(ty));
  let score = 3 * shared.length, role = null;
  const f = plan.field;
  if (f && plan.kind !== 'room' && (x.value[f] || 0) >= 11 && (y.value[f] || 0) >= 11) {
    score += 4;
    role = f;
  }
  if (plan.kind === 'room' && x.spe <= 50 && y.spe <= 50) { score += 3; role = f; }
  if (x.lean && x.lean === y.lean) score += 1;
  if (Math.abs(x.spe - y.spe) <= 15) score += 1;
  score += 3 * cosine(centered(x.bf.species.baseStats), centered(y.bf.species.baseStats));
  score -= Math.max(0, (x.bst - y.bst) / 50); // bem mais fraco não faz o papel (Minccino no lugar de Blissey)
  return { score, shared, role, ok: score >= MIN_SIM && (shared.length > 0 || !!role) };
}

/** No save, o mais parecido com o ideal que pode entrar na vaga (sem quebrar o plano), e a nota com ele. */
function alternative(found, team, plan, pool, types) {
  const { X, out } = found;
  const rest = team.filter(e => e !== out);
  const real = new Set(team.map(e => e.real)), keys = new Set(team.map(e => e.key));
  const close = [];
  for (const y of pool) {
    if (real.has(y.real) || keys.has(y.key) || y.conflict || !allowed(rest, y, plan)) continue;
    const s = similarity(X, y, plan);
    if (s.ok) close.push([y, s]);
  }
  close.sort((a, b) => b[1].score - a[1].score);
  let best = null;
  for (const [y, sim] of close.slice(0, ALT_TRY)) {
    const team2 = [...rest, y];
    if (!planHolds(team2, plan)) continue;
    const score = scoreParts(team2, plan, types).total;
    // O mais parecido; entre os igualmente parecidos, o de nota maior
    if (!best || sim.score > best.sim.score + 1e-9 || (Math.abs(sim.score - best.sim.score) <= 1e-9 && score > best.score)) best = { e: y, sim, score };
  }
  return best;
}

/**
 * Sugestões "ideal × o que você tem" para uma equipe montada pelo app.
 * @param {object[]} team a equipe (entradas de build.js)
 * @param {object} ctx o contexto de buildTeams (`results.ctx`: tipos, quem o jogador pediu, referência competitiva,
 *   golpes por nível)
 * @param {{ id: string, gen?: number }} game o jogo do save (as espécies que existem nele)
 * @returns {Array<{ out: object, X: object, spec: object, pairs: Array<{ m: object, v: number }>, base: number, score: number, alt: { e: object, sim: object, score: number }|null }>}
 *   `out`: quem sai; `X`: o ideal (entrada estimada); `pairs`: as duplas fortes dele com quem fica; `base`/`score`: a
 *   nota da equipe hoje e com o ideal; `alt`: a alternativa do save e a nota com ela
 */
export function idealSwaps(team, plan, pool, ctx, T, game) {
  const c = ctx.comp;
  if (!c || !game || team.length < 6) return [];
  const { index } = c;
  const types = ctx.types;
  const byId = speciesById(index, T, game);
  const has = owned(pool, c);
  const forced = new Set(ctx.forcedFor(plan));
  const ids = team.map(e => (e.sx >= 0 ? c.ids[e.sx] : null));
  // Candidatos: quem joga forte com alguém da equipe, existe no jogo e o jogador não tem; os que mais jogam com a
  // equipe toda (soma das duplas positivas) vão para a nota
  const cand = new Map();
  for (const a of ids) {
    if (!a) continue;
    for (const [b, v] of index.partners(a)) {
      const sp = byId.get(b);
      // Lendários e míticos não entram como ideal: costumam ser um por jogo (e muitos só no fim dele)
      if (v < MIN_PAIR || !sp || cand.has(b) || has(sp, b) || isLegendary({ species: { name: sp.name } })) continue;
      let sum = 0;
      for (const x of ids) if (x) { const w = index.pair(x, b); if (w > 0) sum += w; }
      cand.set(b, sum);
    }
  }
  const shortlist = [...cand].sort((x, y) => y[1] - x[1]).slice(0, SHORTLIST);
  const base = scoreParts(team, plan, types).total;
  // Vagas: quem o jogador pediu e quem põe o plano ficam
  const open = team.filter(e => !forced.has(e) && !(plan.field && sets(e, plan.field)));
  const found = [];
  for (const [xid] of shortlist) {
    const spec = byId.get(xid);
    const X = outsiderEntry(spec, T, ctx.dex, team[0], plan);
    if (X.conflict) continue; // atrapalha o clima do plano
    let best = null;
    for (const out of open) {
      const rest = team.filter(e => e !== out);
      if (!allowed(rest, X, plan)) continue;
      // O motivo: dupla forte com quem fica (não com quem sai)
      const pairs = rest.map(m => ({ m, v: m.sx >= 0 ? index.pair(xid, c.ids[m.sx]) : 0 }));
      const strong = pairs.filter(p => p.v >= MIN_PAIR).sort((a, b) => b.v - a.v);
      if (!strong.length) continue;
      const team2 = [...rest, X];
      if (!planHolds(team2, plan)) continue;
      // O ideal fica fora da matriz competitiva: as duplas dele entram aqui
      const score = scoreParts(team2, plan, types).total + c.w * pairs.reduce((a, p) => a + p.v, 0);
      if (score >= base + MIN_GAIN && (!best || score > best.score)) best = { out, X, spec, pairs: strong, base, score };
    }
    if (best) found.push(best);
  }
  found.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const f of found) {
    if (picked.length >= MAX) break;
    if (picked.some(p => p.out === f.out)) continue;
    f.alt = alternative(f, team, plan, pool, types);
    picked.push(f);
  }
  return picked;
}

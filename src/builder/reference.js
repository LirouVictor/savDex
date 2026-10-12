// Equipes de referência: equipes do competitivo (src/data/refteams/*.json, `npm run refteams`) adaptadas ao save.
//
// Cada referência guarda só as espécies e o que cada set faz (papéis pelas regras de strategies.js, campo que põe ou
// aproveita, tipos dos golpes de dano), nunca o set copiado. Para um save, o app:
//   1. confere cada membro no jogo (a espécie existe? com que tipos e stats?) e no save (o jogador tem? evoluído conta);
//   2. calcula, com as tabelas do jogo, o plano da original (clima, terreno, Trick Room, Hiperofensiva ou equilibrado),
//      os papéis de cada membro e as estratégias da biblioteca que ela executa;
//   3. monta a equipe adaptada com a busca do montador (build.js): os membros que o jogador tem ficam fixos e as vagas
//      dos que faltam são preenchidas juntas (busca em feixe sobre a equipe inteira, não um substituto por vez), no plano
//      da original, com a nota de sempre mais a FIDELIDADE (o quanto a equipe preserva das estratégias, dos papéis e do
//      plano da original);
//   4. explica cada troca: quem entrou no lugar de quem (o par mais parecido em papéis, tipos e campo; só para a tela, a
//      escolha foi da equipe inteira), papéis preservados e perdidos, e o que falta para reproduzir a original.
// A equipe adaptada não herda nada da original: a nota é a do montador, e resultado de torneio só existe com fonte
// (`results` das tabelas: vazio nas equipes de exemplo; nas de torneio, a colocação com o replay da final como prova).

import { bestTeam, plans, planPool, setPlanFlags, planHolds, scoreParts, sets, allowed, withRoles, WEATHERS } from './build.js';
import { refRoleBits, roleKeysOf, roleMask, strategiesOf, STRATEGIES } from './strategies.js';
import { gameSpecies } from './threats.js';
import { normId, speciesIds } from './species-id.js';
export { normId, speciesIds };
import { WEATHER } from '../ai/strategy.js';

/** Formatos de referência de cada jogo (só Singles; por enquanto o Quetzal) e a geração das mecânicas de cada jogo. */
const FORMATS = {
  quetzal: ['gen9nationaldex', 'gen9nationaldexubers', 'gen9ou', 'gen9uu', 'gen9ru', 'gen9nu', 'gen9pu'],
};
const GAME_GEN = { quetzal: 9 };
export const refFormats = game => (game && FORMATS[game.id]) || [];

// Pacotes à parte, carregados só ao montar equipes: as equipes de exemplo (refteams, `npm run refteams`) e as de finais de
// torneio com o replay como prova (tourteams, `npm run tourteams`)
const LOAD = {
  gen9nationaldex: () => import('../data/refteams/gen9nationaldex.json'),
  gen9nationaldexubers: () => import('../data/refteams/gen9nationaldexubers.json'),
  gen9ou: () => import('../data/refteams/gen9ou.json'),
  gen9uu: () => import('../data/refteams/gen9uu.json'),
  gen9ru: () => import('../data/refteams/gen9ru.json'),
  gen9nu: () => import('../data/refteams/gen9nu.json'),
  gen9pu: () => import('../data/refteams/gen9pu.json'),
};
const LOAD_TOUR = {
  gen9nationaldex: () => import('../data/tourteams/gen9nationaldex.json'),
  gen9nationaldexubers: () => import('../data/tourteams/gen9nationaldexubers.json'),
  gen9ou: () => import('../data/tourteams/gen9ou.json'),
  gen9uu: () => import('../data/tourteams/gen9uu.json'),
  gen9ru: () => import('../data/tourteams/gen9ru.json'),
  gen9nu: () => import('../data/tourteams/gen9nu.json'),
  gen9pu: () => import('../data/tourteams/gen9pu.json'),
};
const loaded = new Map();
/** As tabelas de referência do jogo do save ([] se o jogo ainda não tem; null se não carregaram, ex.: offline). */
export async function loadReferences(game) {
  const fs = refFormats(game);
  if (!fs.length) return [];
  const k = fs.join('+');
  if (!loaded.has(k)) {
    try {
      const all = await Promise.all([...fs.map(f => LOAD[f]()), ...fs.filter(f => LOAD_TOUR[f]).map(f => LOAD_TOUR[f]())]);
      loaded.set(k, all.map(m => m.default).filter(tb => tb.teams.length));
    } catch (err) {
      console.warn('Equipes de referência indisponíveis', err);
      return null;
    }
  }
  return loaded.get(k);
}

// Mínimo de membros da original que o jogador tem para a referência valer: com menos de 2, a equipe "adaptada" seria
// quase toda da busca livre e não teria nenhuma dupla da original jogando junta (medido nos saves reais: ver CLAUDE.md)
export const MIN_KEEP = 2;
// Fidelidade (parte da busca e da ordem das referências): cada estratégia da original que a adaptada ainda executa vale
// o `v` dela, cada papel da original que a adaptada tem (e que não faz parte de uma dessas estratégias nem do plano) vale
// ROLE_FID e manter o plano, se a equipe o sustenta, vale PLAN_FID (o plano é a estratégia principal; vale como uma
// estratégia forte). O peso FID_W foi escolhido pelo teste de comparação (3 saves do Quetzal): sem a contagem dupla da
// primeira versão (papel contado de novo dentro da estratégia), 1 preservava menos (estratégias 49/62 → 47/62); 1,5
// preserva o mesmo ou mais que a primeira versão com 1 (50/63, papéis 129/143) com a nota igual (−0,4 num save); 2 ganha
// mais estratégias (52/64), mas a nota cai nos três saves.
const ROLE_FID = 1, PLAN_FID = 5;
export const FID_W = 1.5;
// Papéis que contam na fidelidade e na tela (os de tipo e os auxiliares das estratégias, não)
export const FID_ROLES = ['pivot', 'regen', 'hazard', 'removal', 'phaze', 'screens', 'web', 'sweeper', 'priority', 'sacrifice'];
const SLOW = 50; // Trick Room: lentos que atacam (o mesmo corte de build.js)

/**
 * Um membro da original no jogo do save: a espécie (tipos e stats do jogo; null se não existe nele), os papéis em bits
 * (os do set que a espécie permite, mais os de tipo) e o campo.
 */
function refMember(x, byId) {
  const spec = byId.get(normId(x.s)) || null;
  const bits = refRoleBits(x.r || [], spec ? spec.types : [], spec ? spec.stats : null);
  return { x, spec, sbits: bits, set: new Set(x.set || []), auto: new Set(x.auto || []), use: new Set(x.use || []),
    types: spec ? spec.types : [], spe: spec ? spec.stats[5] : null, dmg: x.dmg || 0 };
}

/** O plano da original, pelas mesmas regras de plans()/planHolds() de build.js, com o que os sets fazem. */
export function refPlan(members) {
  for (const f of [...WEATHERS, 'Electric Terrain', 'Psychic Terrain', 'Grassy Terrain', 'Misty Terrain']) {
    const setters = members.filter(m => m.set.has(f));
    if (!setters.length) continue;
    const auto = setters.some(m => m.auto.has(f));
    const boost = WEATHER[f] ? WEATHER[f].boosts : null;
    const users = members.filter(m => m.use.has(f) || (auto && boost && m.types.includes(boost) && m.x.at && m.x.at.includes(boost)));
    if (users.length >= 2 && users.some(m => !setters.includes(m) || setters.length > 1)) return { kind: WEATHERS.includes(f) ? 'weather' : 'terrain', field: f };
  }
  if (members.some(m => m.set.has('Trick Room')) && members.filter(m => !m.set.has('Trick Room') && m.spe !== null && m.spe <= SLOW && m.dmg >= 2).length >= 3) return { kind: 'room', field: 'Trick Room' };
  const has = (m, k) => !!(m.sbits & roleMask([k]));
  const sweepers = members.filter(m => has(m, 'sweeper'));
  if (members.some(m => (has(m, 'hazard') || has(m, 'screens') || has(m, 'web')) && sweepers.filter(s => s !== m).length >= 3)) return { kind: 'offense', field: null };
  return { kind: 'balance', field: null };
}

const roleSet = bits => new Set(roleKeysOf(bits).filter(r => FID_ROLES.includes(r)));
const samePlan = (a, b) => a.kind === b.kind && (a.field || null) === (b.field || null);

/**
 * A fidelidade de uma equipe à original: estratégias da original que ela executa (valor de cada), papéis da original que
 * ela tem e o plano mantido.
 */
export function fidelity(orig, planKept, plan = null, mode = 'v2') {
  const strats = STRATEGIES.filter(s => orig.strategies.includes(s.id));
  const mask = roleMask([...orig.roles]);
  if (mode === 'v1') {
    return team => {
      let v = planKept ? PLAN_FID : 0;
      if (strats.length) { const have = new Set(strategiesOf(team, orig.plan)); for (const s of strats) if (have.has(s.id)) v += s.v; }
      let union = 0;
      for (const e of team) union |= e.sbits;
      let m = union & mask;
      while (m) { m &= m - 1; v += ROLE_FID; }
      return v;
    };
  }
  // Sem contar duas vezes: o papel que já faz parte de uma estratégia executada (hazards e remoção na "Hazards com
  // remoção") ou do plano sustentado (quem abre o caminho e quem varre na Hiperofensiva) não soma de novo; o plano só
  // conta se a equipe o sustenta de verdade (planHolds), não só por ser o mesmo plano
  const keysOf = new Map(strats.map(s => [s.id, roleMask([...(s.need || []).map(([r]) => r), ...(s.same || [])].filter(r => FID_ROLES.includes(r)))]));
  const offenseMask = roleMask(['hazard', 'screens', 'web', 'sweeper']);
  return team => {
    let v = 0, covered = 0;
    if (planKept && plan && team.length === 6 && planHolds(team, plan)) {
      v += PLAN_FID;
      if (plan.kind === 'offense') covered |= offenseMask;
    }
    if (strats.length) {
      const have = new Set(strategiesOf(team, orig.plan));
      for (const s of strats) if (have.has(s.id)) { v += s.v; covered |= keysOf.get(s.id); }
    }
    let union = 0;
    for (const e of team) union |= e.sbits;
    let m = union & mask & ~covered;
    while (m) { m &= m - 1; v += ROLE_FID; }
    return v;
  };
}
// Modo da fidelidade ('v1': como no PR #82; 'v2': sem contagem dupla, plano só se sustentado); escolhido pelo teste de comparação
export const FID_MODE = 'v2';

// Adaptadas com a busca completa logo de início: as melhores pela estimativa (a busca gulosa, feixe de 1, com a mesma nota
// e fidelidade) e as que o jogador tem inteiras. Medido nos saves reais do Quetzal: as 6 melhores da busca completa
// estão entre as 6 primeiras da estimativa nos PCs grandes (5 de 6 no pequeno); estimar todas custa ~0,45 s no desktop
// nos PCs de 400–700 Pokémon (55 referências), adaptar 6 ~0,4 s. As outras, sob demanda ("ver mais").
export const ADAPT_N = 6;
// E as melhores de finais de torneio pela estimativa, mesmo fora das ADAPT_N (o jogador vê logo as campeãs compatíveis)
export const TOUR_N = 2;
// As que o jogador tem inteiras: só as COMPLETE_N melhores pela estimativa de início (com as de torneio, os PCs grandes têm
// 20–30 delas, e adaptar todas levava o tempo de 1,4 s a 2,0–2,4 s no desktop); as outras ficam no "ver mais"
export const COMPLETE_N = 3;

/**
 * As referências compatíveis com o save (MIN_KEEP membros ou mais que o jogador tem), com a original no jogo (plano,
 * papéis, estratégias), quem fica e a estimativa, da melhor para a pior.
 * @param {object} ctx prepareBuild (build.js)
 * @param {object[]} tables loadReferences
 * @param {{ fidW?: number, minKeep?: number }} [opts] o teste de comparação troca o peso da fidelidade e o mínimo
 * @returns {{ list: object[], rejected: number, fidW: number }} `rejected`: quantas ficaram de fora por ter menos de
 *   `minKeep` membros no save
 */
export function referenceCandidates(ctx, tables, T, game, opts = {}) {
  const { fidW = FID_W, minKeep = MIN_KEEP } = opts;
  // O que a busca de cada candidata usa (as opções existem para o teste de comparação)
  const ro = { fidW, roleMoves: opts.roleMoves ?? 'choose', fidMode: opts.fidMode || FID_MODE, beam: opts.beam };
  const { pool, forcedFor } = ctx;
  const byId = new Map();
  for (const sp of gameSpecies(T, game)) for (const id of speciesIds(sp)) if (!byId.has(id)) byId.set(id, sp);
  // Quem o jogador tem, por espécie (o Pokémon como o app conta: evoluído, com a megapedra…)
  const owned = new Map();
  for (const e of pool) for (const id of speciesIds(e.m.species)) (owned.get(id) || owned.set(id, []).get(id)).push(e);
  const savePlans = plans(pool);
  let rejected = 0;
  const list = [];
  // Só tabelas Singles da geração do jogo: os papéis e as estratégias são lidos com as regras da Gen 9 (Defog tira os
  // hazards dos dois lados, Sticky Web, terrenos), que não valem nas gerações antigas
  const gen = game && GAME_GEN[game.id];
  for (const tb of tables) {
    if (tb.mode !== 'singles' || (gen && tb.gen !== gen)) continue;
    for (const team of tb.teams) {
      const members = team.members.map(x => refMember(x, byId));
      const keep = members.map(m => pickOwned(owned.get(normId(m.x.s)) || [], m.x));
      const n = keep.filter(Boolean).length;
      if (n < minKeep) { rejected++; continue; }
      const plan0 = refPlan(members);
      const orig = { plan: plan0, members, strategies: strategiesOf(members, plan0), roles: new Set(members.flatMap(m => [...roleSet(m.sbits)])) };
      const target = savePlans.find(p => samePlan(p, plan0)) || savePlans.find(p => p.kind === 'balance');
      list.push({ ref: team, format: tb, members, keep, orig, target, complete: n === 6, estimate: -Infinity, result: undefined, opts: ro });
    }
  }
  // Moveset do plano (Quetzal): uma vez por plano, com os membros que ficam de todas as referências
  const pps = new Map();
  for (const w of list) {
    const k = planKey(w.target);
    if (!pps.has(k)) pps.set(k, { plan: w.target, forced: new Set() });
    for (const e of w.keep) if (e) pps.get(k).forced.add(e);
  }
  for (const [k, x] of pps) {
    pps.set(k, ctx.dex && ctx.dex.planMoves === false ? { pool, plan: x.plan, map: e => e } : planPool(pool, x.plan, [...x.forced, ...forcedFor(x.plan)]));
  }
  for (const w of list) {
    w.pp = pps.get(planKey(w.target));
    const r = run(ctx, w, { ...ro, quick: true });
    w.estimate = r ? r.rank : -Infinity;
  }
  list.sort((a, b) => b.estimate - a.estimate);
  return { list, rejected, fidW };
}

/** A equipe adaptada de uma candidata (busca completa; guardada na candidata). null se não deu para montar 6. */
export function adaptReference(ctx, w) {
  if (w.result === undefined) w.result = run(ctx, w, w.opts);
  return w.result;
}

/**
 * As referências do jogo no save, adaptadas: as ADAPT_N melhores pela estimativa, as TOUR_N melhores de torneio e as
 * COMPLETE_N melhores que o jogador tem inteiras, da
 * melhor para a pior (nota + fidelidade). `candidates` (propriedade): referenceCandidates, para adaptar mais depois.
 * @param {{ fidW?: number, minKeep?: number, adapt?: number, tour?: number, complete?: number, beam?: number, roleMoves?: 'choose'|'always'|false, fidMode?: 'v1'|'v2' }} [opts]
 */
export function referenceTeams(ctx, tables, T, game, opts = {}) {
  const c = referenceCandidates(ctx, tables, T, game, opts);
  const n = opts.adapt ?? ADAPT_N, nt = opts.tour ?? TOUR_N;
  const tours = new Set(c.list.filter(w => w.format.kind === 'tournament').slice(0, nt));
  const whole = new Set(c.list.filter(w => w.complete).slice(0, opts.complete ?? COMPLETE_N));
  const out = c.list.filter((w, i) => i < n || whole.has(w) || tours.has(w)).map(w => adaptReference(ctx, w)).filter(Boolean);
  out.sort((a, b) => b.rank - a.rank);
  Object.defineProperty(out, 'candidates', { value: c });
  return Object.defineProperty(out, 'rejected', { value: c.rejected });
}

// Os papéis da original que o Pokémon mantido não cumpre com o moveset que o app escolheu
const lostOf = (m, e) => FID_ROLES.filter(r => (m.sbits & roleMask([r])) && !(e.sbits & roleMask([r])));
// Versões com os papéis, guardadas por entrada (a estimativa e a busca completa usam as mesmas)
const variants = new WeakMap();
function roleVariant(e, lost, plan) {
  let byKey = variants.get(e);
  if (!byKey) variants.set(e, (byKey = new Map()));
  const k = lost.join(',');
  if (!byKey.has(k)) byKey.set(k, withRoles(e, lost, plan));
  return byKey.get(k);
}

/**
 * Busca da equipe adaptada: quem fica (e quem o jogador pediu) fixo, o resto pela busca do montador com a fidelidade.
 * Quem fica e perdeu um papel da original com o moveset do app entra na versão com o golpe do papel (withRoles); na equipe
 * final, cada versão é comparada com a de sempre pela nota + fidelidade da equipe inteira, e fica a que rende mais
 * (`roleMoves: 'always'` fica sempre com a versão do papel e `false` desliga; os dois só para o teste de comparação).
 */
function run(ctx, w, { fidW = FID_W, quick = false, beam, roleMoves = 'choose', fidMode = FID_MODE } = {}) {
  const { types, forcedFor } = ctx;
  const pp = w.pp, plan = pp.plan;
  setPlanFlags(pp.pool, plan);
  const kept = [], plain = [];
  w.keep.forEach((e0, i) => {
    if (!e0) return;
    const e = pp.map(e0);
    const lost = roleMoves ? lostOf(w.members[i], e) : [];
    const v = lost.length ? roleVariant(e, lost, plan) : e;
    const x = v.roleFix && v.roleFix.length ? v : e;
    if (allowed(kept, x, plan)) { kept.push(x); plain.push(e); }
  });
  // O que o jogador pediu entra também (se couber)
  const forced = [...kept];
  for (const e of forcedFor(w.target).map(pp.map)) if (forced.length < 6 && !forced.some(f => f.real === e.real) && allowed(forced, e, plan)) forced.push(e);
  const planKept = w.orig.plan.kind !== 'balance' && samePlan(plan, w.orig.plan);
  const fid = fidelity(w.orig, planKept, plan, fidMode);
  const bonus = fidW ? team => fidW * fid(team) : null;
  // A estimativa: feixe de 1, sem as sementes de estratégia; a completa parte também de quem executa as estratégias da original
  const r = quick ? bestTeam(pp.pool, plan, types, forced, [], 1, undefined, { bonus, only: new Set() })
    : bestTeam(pp.pool, plan, types, forced, [], beam, undefined, { bonus, only: new Set(w.orig.strategies) });
  if (!r || r.team.length < 6) return null;
  let team = r.team;
  const value = t => scoreParts(t, plan, types).total + fidW * fid(t);
  // A versão do papel só fica se a equipe inteira rende mais com ela (um golpe de efeito no lugar de um de dano pode
  // custar mais que o papel vale)
  const reverted = new Set();
  if (roleMoves === 'choose') {
    let best = value(team);
    kept.forEach((x, i) => {
      if (x === plain[i] || !team.includes(x)) return;
      const alt = team.map(y => (y === x ? plain[i] : y));
      const v = value(alt);
      if (v > best) { best = v; team = alt; kept[i] = plain[i]; reverted.add(x.real); }
    });
  }
  const parts = scoreParts(team, plan, types);
  const adapted = { plan, team, score: parts.total, parts, fidelity: fid(team), holds: planHolds(team, plan), planKept };
  Object.defineProperty(adapted, 'pp', { value: pp });
  const rank = parts.total + fidW * adapted.fidelity;
  if (quick) return { rank };
  // `reverted`: os mantidos que voltaram à versão sem o golpe do papel porque a equipe inteira rende mais assim
  return { ref: w.ref, format: w.format, orig: w.orig, keep: w.keep, kept, complete: w.complete, adapted, swaps: explain(w, kept, team, plan, forced), rank, reverted };
}
const planKey = p => `${p.kind}|${p.field || ''}`;

/** O Pokémon do save que faz o membro da original: com a mesma megapedra, se a original megaevolui; senão o comum. */
function pickOwned(list, x) {
  if (!list.length) return null;
  if (x.mega) {
    const suffix = (/-([XYZ])$/.exec(x.mega) || [])[1];
    const stone = e => (e.m.item && e.m.item.name) || '';
    const mega = list.find(e => e.mega && (!suffix || stone(e).endsWith(` ${suffix}`)));
    if (mega) return mega;
  }
  return list.find(e => !e.mega) || list[0];
}

/**
 * Quem entrou no lugar de quem e o que se perdeu. A escolha foi da equipe inteira; aqui só se acha, para explicar, o par
 * mais parecido entre os que saíram e os que entraram (papéis em comum, tipos, campo, físico/especial), testando todas as
 * combinações (no máximo 6! = 720).
 */
function explain(w, kept, team, plan, forced) {
  const keptSet = new Set(kept.map(e => e.real));
  const missing = w.members.filter((m, i) => !w.keep[i] || !keptSet.has(w.keep[i].real));
  const wanted = new Set(forced.filter(e => !kept.includes(e)).map(e => e.real));
  const subs = team.filter(e => !keptSet.has(e.real));
  const sim = (m, e) => {
    let v = 0;
    const a = roleSet(m.sbits), b = roleSet(e.sbits);
    // O papel em comum vale mais que o tipo; físico/especial só desempata
    for (const r of a) if (b.has(r)) v += 3;
    for (const ty of m.types) if (e.types.includes(ty)) v += 1;
    for (const f of [...m.set, ...m.use]) if (sets(e, f) || (e.value && (e.value[f] || 0) >= 11)) v += 3;
    if (m.x.cat === (e.lean === 'phys' ? 'P' : e.lean === 'spec' ? 'S' : '')) v += 0.5;
    return v;
  };
  let best = null;
  const used = new Array(subs.length).fill(false), pick = [];
  const walk = (i, v) => {
    if (i === missing.length) { if (!best || v > best.v) best = { v, pick: [...pick] }; return; }
    let any = false;
    for (let j = 0; j < subs.length; j++) {
      if (used[j]) continue;
      any = true;
      used[j] = true; pick.push(j);
      walk(i + 1, v + sim(missing[i], subs[j]));
      used[j] = false; pick.pop();
    }
    if (!any) { pick.push(-1); walk(i + 1, v); pick.pop(); }
  };
  walk(0, 0);
  const unionOther = (e) => { let u = 0; for (const x of team) if (x !== e) u |= x.sbits; return u; };
  return missing.map((m, i) => {
    const e = best && best.pick[i] >= 0 ? subs[best.pick[i]] : null;
    const a = roleSet(m.sbits), b = e ? roleSet(e.sbits) : new Set();
    const other = e ? roleSet(unionOther(e)) : new Set();
    const lost = [...a].filter(r => !b.has(r));
    return {
      orig: m, sub: e, wanted: !!e && wanted.has(e.real),
      kept: [...a].filter(r => b.has(r)),
      covered: lost.filter(r => other.has(r)), lost: lost.filter(r => !other.has(r)),
      added: [...b].filter(r => !a.has(r)),
    };
  });
}

/**
 * O que falta para reproduzir a original: cada membro que não ficou na adaptada e por quê: não existe no jogo (`game`),
 * o jogador tem a espécie em outra forma (`form`), tem mas ficou de fora pela opção sem lendários (`excluded`) ou não tem
 * (`missing`); e os papéis dele na original.
 */
export function missingMembers(res, ctx) {
  const keptSet = new Set(res.kept.map(e => e.real));
  const byName = new Map();
  for (const e of ctx.pool) if (!byName.has(e.m.species.name)) byName.set(e.m.species.name, e);
  return res.orig.members.filter((m, i) => !res.keep[i] || !keptSet.has(res.keep[i].real)).map(m => {
    const id = normId(m.x.s);
    const base = m.spec ? m.spec.name : null;
    const other = base && byName.has(base) ? byName.get(base) : null;
    const status = !m.spec ? 'game' : other ? 'form' : ctx.allIds && ctx.allIds.has(id) ? 'excluded' : 'missing';
    return { m, status, other: status === 'form' ? other : null, roles: [...roleSet(m.sbits)] };
  });
}

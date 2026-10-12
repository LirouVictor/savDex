// Comparação do montador de equipes com os saves reais (opcional; não roda no `npm test` normal).
// Uso: BUILDER_BENCH=1 BENCH_OUT=/caminho/saida.json [BENCH_LOG=/caminho/texto.txt] npx vitest run test/builder-bench.test.js
// Referência competitiva: cada equipe sai com a sinergia das duplas nos times do Smogon (src/builder/smogon.js), e a nota
// conta a parte "Competitivo"; BENCH_COMP_W troca o peso (0 tira a parte), para comparar
// Ameaças: a nota conta as do jogo (threats.js) e cada equipe sai com cobertura, dano e resposta contra elas; BENCH_NO_THREATS=1
// tira a parte da nota e BENCH_THREAT_W='[2,0.2]' troca os pesos (sem resposta, só vindo de graça), para comparar.
// Opcionais: BENCH_STAT_MODEL (um de STAT_MODELS em build.js; padrão 'bst') e BENCH_TIERS (JSON { id do Showdown:
// { nat, sv } } com os tiers competitivos, tirado do formats-data do Pokémon Showdown; não versionado), para a média
// de tier dos membros como medida externa
// Quetzal: o montador escolhe o moveset de cada um (moveset.js, com os golpes do tutor); BENCH_NO_TUTOR=1 volta aos golpes
// do save, para comparar. BENCH_ONLY (expressão regular) escolhe os saves de fixtures/.
// Saves: os de fixtures/ (não versionados) e, se existir, o de BENCH_USER_SAVE. Para cada save e plano mede a nota
// e as partes, a pior fraqueza em comum, a cobertura real (contra os dois tipos dos Pokémon com stats base 450+),
// o trabalho pendente (evoluir, ensinar, nível), a diversidade entre as equipes, o tempo (o inicial e o das alternativas
// de cada plano, que a tela só calcula quando o jogador pede) e quanto uma busca local
// (trocar um membro de cada vez) ainda melhoraria a nota. A saída em JSON serve de linha de base para comparar versões.
import { it } from 'vitest';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { loadSave } from '../src/parser/index.js';
import BASE from '../src/data/tables.js';
import G3 from '../src/data/gen3.json';
import U from '../src/data/unbound.json';
import N from '../src/data/nds.json';
import Q from '../src/data/quetzal.json';
import SG from '../src/data/soulgold.json';
import QL from '../src/data/quetzal-learn.json';
import QT from '../src/data/quetzal-teach.json';
import UL from '../src/data/unbound-learn.json';
import SL from '../src/data/soulgold-learn.json';
import { quetzalLearnDex, unboundLearnDex, soulgoldLearnDex } from '../src/ui/dex.js';
import * as B from '../src/builder/build.js';
import { threatList, teamThreats, typeMult, variantOf } from '../src/builder/threats.js';
import { MAX_MEGAS } from '../src/ai/prompt.js';
import { strategiesOf } from '../src/builder/strategies.js';
import { smogonFormats, smogonIndex, pairSynergy } from '../src/builder/smogon.js';
import SM3 from '../src/data/smogon/gen3ou.json';
import SM4 from '../src/data/smogon/gen4ou.json';
import SM5 from '../src/data/smogon/gen5ou.json';
import SM8 from '../src/data/smogon/gen8nationaldex.json';
import SM9 from '../src/data/smogon/gen9nationaldex.json';
import SM9U from '../src/data/smogon/gen9nationaldexubers.json';

// Referência competitiva (Smogon): quanto as duplas da equipe aparecem juntas nos times do competitivo (só medida)
const SMOGON = { gen3ou: SM3, gen4ou: SM4, gen5ou: SM5, gen8nationaldex: SM8, gen9nationaldex: SM9, gen9nationaldexubers: SM9U };
const compIndex = game => { const fs = smogonFormats(game); return fs.length ? smogonIndex(fs.map(f => SMOGON[f])) : null; };
// Teto da referência: a equipe que só busca duplas do competitivo (gulosa, sem olhar mais nada), com os do save
function compCeiling(pool, idx) {
  const ids = [...new Set(pool.map(e => idx.find(e.bf.species)).filter(Boolean))];
  if (ids.length < 2) return null;
  let best = null;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const v = idx.pair(ids[i], ids[j]); if (!best || v > best[2]) best = [ids[i], ids[j], v]; }
  const team = [best[0], best[1]];
  while (team.length < Math.min(6, ids.length)) {
    let pick = null, gain = -Infinity;
    for (const c of ids) { if (team.includes(c)) continue; const g = team.reduce((x, t) => x + idx.pair(c, t), 0); if (g > gain) { gain = g; pick = c; } }
    team.push(pick);
  }
  let sum = 0, n = 0;
  for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) { sum += idx.pair(team[i], team[j]); n++; }
  return { team, mean: Math.round(100 * sum / n) / 100 };
}
function compSummary(team, idx) {
  const s = pairSynergy(team.map(e => e.bf.species), idx);
  return { known: s.known, withData: s.withData, mean: s.mean === null ? null : Math.round(100 * s.mean) / 100, strong: s.strong, avoid: s.avoid,
    top: s.list.slice(0, 3).map(x => `${x.a}+${x.b} ${x.v}`) };
}

const RUN = !!process.env.BUILDER_BENCH;
// Opcional: tiers competitivos por espécie ({ id do Showdown: { nat, sv } }), só como medida externa nas comparações
const TIERS = process.env.BENCH_TIERS && existsSync(process.env.BENCH_TIERS) ? JSON.parse(readFileSync(process.env.BENCH_TIERS, 'utf8')) : null;
const sdId = m => String((m.species && (m.species.showdown || m.species.name)) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const FILES = ['quetzal-7ins.sav', 'quetzal-en.sav', 'quetzal-en2.sav', 'unbound-a.sav', 'unbound-c.sav', 'soulgold-b.sav', 'emerald.sav', 'hgss.duc', 'b2w2.duc'];
const r1 = x => Math.round(x * 10) / 10;
const popc = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };

// Adversários de referência para a cobertura real: espécies 1–905 com stats base 450+ (tipos da PokeAPI)
const OPP = [];
for (let i = 1; i < BASE.species.length; i++) {
  const row = BASE.species[i], b = BASE.baseStats[i];
  if (row && b && b.reduce((x, y) => x + y, 0) >= 450) OPP.push(row.slice(1).map(t => BASE.types[t]).filter(Boolean));
}

const allowed = (team, e, plan) => !team.some(x => x.real === e.real || x.key === e.key)
  && !(e.mega && team.filter(x => x.mega).length >= MAX_MEGAS)
  && !(plan.kind === 'weather' && [...e.strat.set].some(f => B.WEATHERS.includes(f) && f !== plan.field));

function setFlags(pool, plan) {
  for (const x of pool) {
    for (const e of x.base ? [x, x.base] : [x]) {
      const c = plan.kind === 'weather' && e.conflictBy ? e.conflictBy[plan.field] : null;
      e.conflict = !!c && !(c === 'weak' && e.strong.has(plan.field));
      e.risk = c === 'weak' && e.strong.has(plan.field);
    }
  }
}

// Busca local: troca um membro por vez enquanto a nota sobe (mede o quanto a busca em feixe deixou na mesa)
function localGain(team, pool, plan, types, opts) {
  let cur = [...team], s = B.score(cur, plan, types), gain = 0, improved = true, guard = 0;
  const usable = pool.filter(e => !e.conflict);
  while (improved && guard++ < 20) {
    improved = false;
    for (let i = 0; i < cur.length && !improved; i++) {
      const rest = cur.filter((_, j) => j !== i);
      for (const c of usable) {
        if (!allowed(rest, c, plan)) continue;
        const t = [...rest, c];
        if (!B.planHolds(t, plan)) continue;
        const v = B.score(t, plan, types);
        if (v > s + 1e-9) { gain += v - s; cur = t; s = v; improved = true; break; }
      }
    }
  }
  return gain;
}

function threatSummary(t) {
  return { n: t.n, se: t.se, hit2: t.hit2, safe: t.safe, wins: t.wins, none: t.none.length, onlyWins: t.onlyWins.length, seNoAnswer: t.seNoAnswer,
    noneNames: t.none.slice(0, 8).map(x => x.name + (x.form ? '-' + x.form : '')) };
}

function avgTier(team, k) {
  const v = team.map(e => TIERS[sdId(e.m)]).filter(x => x && x[k] !== null && x[k] !== undefined).map(x => x[k]);
  return v.length ? { avg: Math.round(100 * v.reduce((a, b) => a + b, 0) / v.length) / 100, n: v.length } : null;
}

function teamMetrics(team, plan, T, types, refLevel, opts, threats = null, comp = null) {
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const eff = (a, ds) => ds.reduce((x, d) => x * (idx.has(d) && idx.has(a) ? T.typechart[idx.get(a)][idx.get(d)] : 1), 1);
  let worst = null, critical = 0;
  types.forEach((ty, a) => {
    const w = team.filter(e => e.def[a] > 0).length, rs = team.filter(e => e.def[a] < 0).length;
    if (!worst || w > worst.w || (w === worst.w && rs < worst.r)) worst = { type: ty, w, r: rs };
    if (w >= 3 && rs === 0) critical++;
  });
  const atk = new Set();
  for (const e of team) for (const mv of [...(e.moves || e.m.moves), ...(e.teachAtk || [])]) if ((mv.category === 0 || mv.category === 1) && mv.type && (!mv.power || mv.power >= 70)) atk.add(mv.type);
  let hit = 0, wall = 0;
  for (const o of OPP) { const best = Math.max(...[...atk].map(a => eff(a, o))); if (best > 1) hit++; if (best < 1) wall++; }
  const parts = B.scoreParts(team, plan, types);
  return {
    names: team.map(e => e.m.species.name + (e.given ? '@' + e.given : '') + (e.m.evolvedFrom ? '(de ' + e.m.evolvedFrom.species.name + ')' : '')),
    score: r1(parts.total), noComp: r1(parts.total - (parts.comp || 0)), parts: Object.fromEntries(Object.entries(parts).filter(([k]) => k !== 'total').map(([k, v]) => [k, r1(v)])),
    worst, critical, pureCov: popc(team.reduce((x, e) => x | e.cov, 0)), realCov: Math.round(100 * hit / OPP.length), walls: Math.round(100 * wall / OPP.length),
    evolve: team.filter(e => e.m.evolvedFrom).length, teach: team.reduce((x, e) => x + (e.teachAtk || []).length + (e.setTeach || []).filter(y => y.src === 'level').length, 0),
    // Moveset (Quetzal): golpes que o menu do Pokémon ensina na hora (tutor, nível já alcançado)
    teachNow: team.reduce((x, e) => x + (e.setTeach || []).filter(y => y.src !== 'level').length, 0),
    sets: team.map(e => (e.set ? e.set.map(y => y.name + (y.src === 'known' ? '' : y.src === 'tutor' ? '*' : y.src === 'now' ? '+' : '^')).join('/') : '')),
    belowLevel: team.filter(e => (e.real.level || 0) < refLevel - 15).length,
    legends: team.filter(e => B.isLegendary(e.m)).length, megas: team.filter(e => e.mega).length,
    bst: Math.round(team.reduce((x, e) => x + e.bst, 0) / team.length),
    // Ataque que os golpes dele não usam, em % dos stats base (o Dragonite só com golpes especiais desperdiça o Ataque)
    waste: Math.round(100 * team.reduce((x, e) => { const b = e.bf.species.baseStats; const n = (e.nPhys || 0) + (e.nSpec || 0); const unused = !n ? Math.min(b[1], b[3]) : (e.nPhys ? 0 : b[1]) + (e.nSpec ? 0 : b[3]); return x + unused / e.bst; }, 0) / team.length),
    tierNat: TIERS ? avgTier(team, 'nat') : null, tierSv: TIERS ? avgTier(team, 'sv') : null,
    // Ameaças do jogo (threats.js): cobertura (super efetivo), dano (2 golpes), resposta (entra e vence / vence vindo de graça)
    thr: threats ? threatSummary(teamThreats(team, threats, typeMult(T), variantOf(plan))) : null,
    comp: comp ? compSummary(team, comp) : null,
    // Estratégias da biblioteca que a equipe executa e as combinações do motor que rendem (Quetzal)
    strats: strategiesOf(team, plan), combos: team.reduce((x, e) => x + (e.combos || []).filter(c => c.ok).length, 0),
  };
}

it.skipIf(!RUN)('montador: linha de base nos saves reais', () => {
  const files = FILES.filter(f => !process.env.BENCH_ONLY || new RegExp(process.env.BENCH_ONLY).test(f)).map(f => ['fixtures/' + f, f]);
  if (process.env.BENCH_USER_SAVE) files.unshift([process.env.BENCH_USER_SAVE, 'user.sav']);
  const out = { modes: {}, ref: null };
  const modes = [['train', {}], ['ready', { ready: true }]];
  for (const [mode, extra] of modes) {
    const res = [];
    for (const [p, name] of files) {
      if (!existsSync(p)) continue;
      const { data: d, T } = loadSave(readFileSync(p), BASE, G3, U, N, Q, SG);
      const all = [...d.party, ...d.pc.boxes.flatMap(b => b.slots)];
      const g = d.game.id;
      const dex = g === 'quetzal' ? ({ ...quetzalLearnDex(QL, QT), useTutor: !process.env.BENCH_NO_TUTOR, ...(process.env.BENCH_STRAT_W ? { stratW: +process.env.BENCH_STRAT_W } : {}), ...(process.env.BENCH_MECH_W ? { mechW: +process.env.BENCH_MECH_W } : {}) }) : g === 'unbound' ? unboundLearnDex(UL, T.unbound) : g === 'soulgold' ? soulgoldLearnDex(SL, T.soulgold) : null;
      const types = B.attackTypes(T);
      const threats = threatList(T, d.game, dex);
      const comp = compIndex(d.game);
      const refLevel = all.map(m => m.level || 0).sort((a, b) => b - a)[Math.min(5, all.length - 1)] || 0;
      // Com o jogo, a nota conta as ameaças dele (BENCH_NO_THREATS=1 tira, para comparar)
      const opts = { dex, ...extra, statModel: process.env.BENCH_STAT_MODEL || 'bst', game: process.env.BENCH_NO_THREATS ? null : d.game, comp,
        ...(process.env.BENCH_COMP_W ? { compWeight: +process.env.BENCH_COMP_W } : {}),
        ...(process.env.BENCH_THREAT_W ? { threatWeights: JSON.parse(process.env.BENCH_THREAT_W) } : {}) };
      const t0 = performance.now();
      const mains = B.buildTeams(all, T, opts);
      const ms = Math.round(performance.now() - t0);
      // Alternativas (na tela, só quando o jogador pede): o tempo de cada plano à parte
      const teams = B.altTeams ? [] : mains, altMs = [];
      if (B.altTeams) {
        for (const r of mains) {
          const t1 = performance.now();
          const alts = B.altTeams(mains, r);
          altMs.push(Math.round(performance.now() - t1));
          teams.push(r, ...alts);
        }
      }
      const pool = mains.pool;
      const rows = [];
      for (const r of teams) {
        setFlags(r.team, r.plan);
        const m = teamMetrics(r.team, r.plan, T, types, refLevel, extra, threats, comp);
        const pl = pool;
        if (pl) setFlags(pl, r.plan);
        m.lsGain = pl ? r1(localGain(r.team, pl, r.plan, types, extra)) : null;
        rows.push({ plan: r.plan.field || (r.plan.kind === 'offense' ? 'hiperofensiva' : 'equilibrada'), alt: r.alt || 0, ...m });
      }
      const first = rows.filter(x => !x.alt);
      const cnt = new Map();
      for (const r of teams.filter(x => !x.alt)) for (const e of r.team) cnt.set(e.real, (cnt.get(e.real) || 0) + 1);
      const save = { save: name, game: g, mons: all.length, pool: pool.length, ms, altMs, msTotal: ms + altMs.reduce((a, b) => a + b, 0), plans: rows,
        compCeiling: comp && pool ? compCeiling(pool, comp) : null,
        diversity: { distinct: cnt.size, teams: first.length, inAll: [...cnt].filter(([, c]) => c === first.length && first.length > 1).map(([m]) => m.species.name) } };
      res.push(save);
      // A equipe do jogador como referência (o time de chuva do autor guiou os pesos)
      if (name === 'user.sav' && mode === 'train') {
        const pp = B.prepare(all, T, dex, { ...extra, statModel: opts.statModel });
        const team = d.party.map(m => pp.find(e => e.real === m)).filter(Boolean);
        const plan = B.plans(pp).find(x => x.field === 'chuva');
        if (plan) {
          for (const e of pp) { e.conflictBy = {}; }
          out.ref = { team: team.map(e => e.m.species.name), ...teamMetrics(team, plan, T, types, refLevel, extra, threats, comp) };
        }
      }
    }
    out.modes[mode] = res;
  }
  if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, JSON.stringify(out, null, 1));
  const lines = [];
  for (const [mode, res] of Object.entries(out.modes)) {
    lines.push(`\n=== modo ${mode}`);
    for (const s of res) {
      lines.push(`# ${s.save} (${s.game}) ${s.mons} Pokémon, ${s.ms} ms (alternativas por plano: ${(s.altMs || []).join('/')} ms); ${s.diversity.distinct} diferentes em ${s.diversity.teams} equipes; em todas: ${s.diversity.inAll.join(', ') || '—'}`);
      if (s.compCeiling) lines.push(`  teto competitivo do save (só duplas): média ${s.compCeiling.mean} (${s.compCeiling.team.join(', ')})`);
      for (const r of s.plans) {
        lines.push(`  ${(r.plan + (r.alt ? ' #' + (r.alt + 1) : '')).padEnd(22)} ${String(r.score).padStart(6)} ${JSON.stringify(r.parts)} pior ${r.worst.type} ${r.worst.w}/${r.worst.r} crit ${r.critical} cob ${r.pureCov}/${r.realCov}% pend evo${r.evolve} ens${r.teach} nv${r.belowLevel} leg${r.legends} ls+${r.lsGain}`);
        lines.push(`      ${r.names.join(', ')}`);
        if (r.sets.some(Boolean)) lines.push(`      golpes (* tutor, + nível já alcançado, ^ treinar): ${r.sets.join(' | ')}`);
        if (r.thr) lines.push(`      ameaças ${r.thr.n}: super efetivo ${r.thr.se}, 2 golpes ${r.thr.hit2}, entra e vence ${r.thr.safe}, vence de graça ${r.thr.wins}, sem resposta ${r.thr.none} (${r.thr.noneNames.join(', ')})`);
        if (r.strats.length || r.combos) lines.push(`      estratégias: ${r.strats.join(', ') || '—'}; combinações que rendem: ${r.combos}`);
        if (r.comp) lines.push(`      competitivo: conhecidos ${r.comp.known}/6, duplas ${r.comp.withData}, média ${r.comp.mean}, fortes ${r.comp.strong}, se evitam ${r.comp.avoid}${r.comp.top.length ? ` (${r.comp.top.join('; ')})` : ''}`);
      }
    }
    // Resumo da referência competitiva nas equipes principais (as alternativas ficam de fora)
    const mains = res.flatMap(s => s.plans.filter(r => !r.alt && r.comp));
    const measured = mains.filter(r => r.comp.withData >= 3);
    const avg = xs => (xs.length ? Math.round(100 * xs.reduce((a, b) => a + b, 0) / xs.length) / 100 : null);
    const ceil = res.filter(s => s.compCeiling).map(s => s.compCeiling.mean);
    lines.push(`  COMPETITIVO (${mode}): teto médio dos saves ${avg(ceil)}; ${mains.length} equipes principais; com 3+ duplas conhecidas ${measured.length}; média do log2 do lift ${avg(measured.map(r => r.comp.mean))}; duplas fortes por equipe ${avg(measured.map(r => r.comp.strong))}; se evitam ${avg(measured.map(r => r.comp.avoid))}; espécies conhecidas por equipe ${avg(mains.map(r => r.comp.known))}`);
    // O que a parte competitiva custa nas outras medidas (equipes principais)
    const all = res.flatMap(s => s.plans.filter(r => !r.alt));
    const thr = all.filter(r => r.thr);
    lines.push(`  RESUMO (${mode}): ${all.length} equipes; nota ${avg(all.map(r => r.score))}, sem a parte competitiva ${avg(all.map(r => r.noComp))}; críticos ${all.reduce((a, r) => a + r.critical, 0)}; pior fraqueza ${avg(all.map(r => r.worst.w))}; cobertura real ${avg(all.map(r => r.realCov))}%; ameaças sem resposta ${avg(thr.map(r => 100 * r.thr.none / r.thr.n))}%; ensinar ${avg(all.map(r => r.teach))} (na hora ${avg(all.map(r => r.teachNow))}); estratégias ${avg(all.map(r => r.strats.length))}, combinações ${avg(all.map(r => r.combos))}, nota sem elas ${avg(all.map(r => r.score - (r.parts.strat || 0) - (r.parts.combo || 0)))}; evoluir ${avg(all.map(r => r.evolve))}${TIERS ? `; tier nat ${avg(all.filter(r => r.tierNat).map(r => r.tierNat.avg))}` : ''}; tempo ${res.reduce((a, s) => a + s.ms, 0)} ms`);
  }
  if (out.ref) lines.push(`\nREFERÊNCIA (equipe do jogador, chuva): ${out.ref.score} ${JSON.stringify(out.ref.parts)} pior ${out.ref.worst.type} ${out.ref.worst.w}/${out.ref.worst.r}${out.ref.comp ? `; competitivo: média ${out.ref.comp.mean}, fortes ${out.ref.comp.strong} (${out.ref.comp.top.join('; ')})` : ''}`);
  console.log(lines.join('\n'));
  if (process.env.BENCH_LOG) writeFileSync(process.env.BENCH_LOG, lines.join('\n') + '\n');
}, 600000);

// Busca (opcional: BENCH_SEARCH=1; mais BENCH_SEARCH_K, padrão 22; BENCH_NO_THREATS e BENCH_OUT/BENCH_LOG como acima): quanto a
// busca em feixe deixa escapar, para cada save e plano, no modo "Posso treinar".
// - exaustiva: todas as equipes com quem põe o plano (as mesmas sementes do feixe) e os K melhores candidatos sozinhos, contra o
//   feixe no mesmo conjunto (mede o erro do feixe, separado do corte de candidatos);
// - no conjunto inteiro: o feixe de 24 contra o de 96 e contra a busca sem o corte de candidatos (CANDS em build.js; mede o "descartar cedo").
function exhaustive(R, seeds, plan, types) {
  let best = null, n = 0;
  for (const seed of seeds) {
    const rest = R.filter(e => !seed.includes(e));
    const team = [...seed];
    const rec = start => {
      if (team.length === 6) {
        if (!B.planHolds(team, plan)) return;
        n++;
        const s = B.score(team, plan, types);
        if (!best || s > best.s) best = { s, team: [...team] };
        return;
      }
      for (let i = start; i <= rest.length - (6 - team.length); i++) {
        if (!B.allowed(team, rest[i], plan)) continue;
        team.push(rest[i]);
        rec(i + 1);
        team.pop();
      }
    };
    rec(0);
  }
  return { ...best, n };
}

it.skipIf(!process.env.BENCH_SEARCH)('montador: o que a busca em feixe deixa escapar', () => {
  const K = +(process.env.BENCH_SEARCH_K || 22);
  const files = FILES.map(f => ['fixtures/' + f, f]);
  if (process.env.BENCH_USER_SAVE) files.unshift([process.env.BENCH_USER_SAVE, 'user.sav']);
  const rows = [], lines = [];
  const names = t => t.map(e => e.m.species.name + (e.given ? '@' + e.given : ''));
  const diff = (a, b) => { const s = new Set(a.map(e => e.real)); return b.filter(e => !s.has(e.real)).length; };
  for (const [p, name] of files) {
    if (!existsSync(p)) continue;
    const { data: d, T } = loadSave(readFileSync(p), BASE, G3, U, N, Q, SG);
    const all = [...d.party, ...d.pc.boxes.flatMap(b => b.slots)];
    const g = d.game.id;
    const dex = g === 'quetzal' ? ({ ...quetzalLearnDex(QL, QT), useTutor: !process.env.BENCH_NO_TUTOR, ...(process.env.BENCH_STRAT_W ? { stratW: +process.env.BENCH_STRAT_W } : {}), ...(process.env.BENCH_MECH_W ? { mechW: +process.env.BENCH_MECH_W } : {}) }) : g === 'unbound' ? unboundLearnDex(UL, T.unbound) : g === 'soulgold' ? soulgoldLearnDex(SL, T.soulgold) : null;
    const types = B.attackTypes(T);
    const mains = B.buildTeams(all, T, { dex, game: process.env.BENCH_NO_THREATS ? null : d.game, comp: compIndex(d.game) });
    const pool = mains.pool;
    for (const r of mains) {
      const plan = r.plan;
      B.setPlanFlags(pool, plan);
      const label = plan.field || (plan.kind === 'offense' ? 'hiperofensiva' : 'equilibrada');
      const usable = pool.filter(e => !e.conflict);
      const setters = plan.setters.filter(e => usable.includes(e)).sort((a, b) => B.solo(b, plan) - B.solo(a, plan)).slice(0, 2);
      const seeds = setters.length ? setters.map(s => [s]) : [[]];
      // Conjunto pequeno: quem põe + os K melhores sozinhos
      const top = usable.slice().sort((a, b) => B.solo(b, plan) - B.solo(a, plan)).slice(0, K);
      const R = [...new Set([...setters, ...top])];
      const sub = { ...plan, setters };
      let t0 = performance.now();
      const beamR = B.bestTeam(R, sub, types, [], [], undefined, Infinity);
      const beamRms = performance.now() - t0;
      t0 = performance.now();
      const ex = exhaustive(R, seeds, plan, types);
      const exMs = performance.now() - t0;
      const sBeamR = beamR && B.planHolds(beamR.team, plan) ? B.score(beamR.team, plan, types) : null;
      // Conjunto inteiro: feixe de 24 (o do app), de 96, e sem o corte de candidatos
      const run = (beam, cands) => {
        const t = performance.now();
        const x = B.bestTeam(pool, plan, types, [], [], beam, cands);
        return { team: x && x.team, s: x && B.planHolds(x.team, plan) ? B.score(x.team, plan, types) : null, ms: Math.round(performance.now() - t) };
      };
      const base = run(24, undefined), wide = run(96, undefined), nocut = run(24, Infinity);
      const row = {
        save: name, plan: label, pool: pool.length, K: R.length, combos: ex.n,
        exGap: ex.s !== undefined && sBeamR !== null ? r1(ex.s - sBeamR) : null, exDiff: ex.team && beamR ? diff(beamR.team, ex.team) : null,
        exMs: Math.round(exMs), beamRms: Math.round(beamRms),
        base: r1(base.s), wideGap: wide.s !== null ? r1(wide.s - base.s) : null, wideDiff: diff(base.team, wide.team),
        nocutGap: nocut.s !== null ? r1(nocut.s - base.s) : null, nocutDiff: diff(base.team, nocut.team),
        ms: base.ms, wideMs: wide.ms, nocutMs: nocut.ms,
        exTeam: ex.team ? names(ex.team) : null, beamTeam: beamR ? names(beamR.team) : null,
        wideTeam: names(wide.team), nocutTeam: names(nocut.team), baseTeam: names(base.team),
      };
      rows.push(row);
      lines.push(`${name.padEnd(16)} ${label.padEnd(20)} pool ${String(pool.length).padStart(3)} | exaustiva ${row.combos} equipes em ${row.exMs} ms: +${row.exGap} (${row.exDiff} membros) | feixe 96: +${row.wideGap} (${row.wideDiff}) ${row.wideMs} ms | sem corte: +${row.nocutGap} (${row.nocutDiff}) ${row.nocutMs} ms | app ${row.ms} ms`);
      if (row.exGap > 0) lines.push(`    feixe ${row.beamTeam.join(', ')}\n    exaust ${row.exTeam.join(', ')}`);
      if (row.wideGap > 0) lines.push(`    app    ${row.baseTeam.join(', ')}\n    96     ${names(wide.team).join(', ')}`);
      if (row.nocutGap > 0) lines.push(`    s/corte ${row.nocutTeam.join(', ')}`);
    }
  }
  const avg = xs => (xs.length ? Math.round(100 * xs.reduce((a, b) => a + b, 0) / xs.length) / 100 : null);
  const miss = k => rows.filter(r => r[k] > 0.05).length;
  lines.push(`RESUMO: ${rows.length} planos; exaustiva acima do feixe em ${miss('exGap')} (média +${avg(rows.map(r => r.exGap || 0))}, máx +${Math.max(...rows.map(r => r.exGap || 0))}); `
    + `feixe 96 acima em ${miss('wideGap')} (média +${avg(rows.map(r => r.wideGap || 0))}, máx +${Math.max(...rows.map(r => r.wideGap || 0))}); `
    + `sem corte acima em ${miss('nocutGap')} (média +${avg(rows.map(r => r.nocutGap || 0))}, máx +${Math.max(...rows.map(r => r.nocutGap || 0))}); `
    + `tempo: app ${rows.reduce((a, r) => a + r.ms, 0)} ms, feixe 96 ${rows.reduce((a, r) => a + r.wideMs, 0)} ms, sem corte ${rows.reduce((a, r) => a + r.nocutMs, 0)} ms`);
  console.log(lines.join('\n'));
  if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, JSON.stringify(rows, null, 1));
  if (process.env.BENCH_LOG) writeFileSync(process.env.BENCH_LOG, lines.join('\n') + '\n');
}, 3600000);

// Equipes de referência (opcional: BENCH_REFS=1; BENCH_OUT/BENCH_LOG como acima; BENCH_FID_W troca o peso da fidelidade,
// BENCH_ANYITEM=1 conta as megapedras que o Pokémon ainda não segura, BENCH_FID_MODE=v1|v2 troca a conta da fidelidade, BENCH_ROLE_MOVES=off|always troca a escolha das versões com os papéis da original nos mantidos, BENCH_REF_ALL=1 adapta todas as compatíveis em vez das ADAPT_N melhores pela estimativa). Nos saves do Quetzal mede,
// lado a lado com a montagem livre: quantas referências são compatíveis, a nota e a fidelidade das adaptadas, quanto das
// estratégias, dos papéis e do plano da original a adaptada preserva, e o tempo.
it.skipIf(!process.env.BENCH_REFS)('montador: equipes de referência × montagem livre', async () => {
  const { referenceTeams, refFormats } = await import('../src/builder/reference.js');
  const { roleMask } = await import('../src/builder/strategies.js');
  const lines = [], rows = [];
  const fidW = process.env.BENCH_FID_W ? +process.env.BENCH_FID_W : undefined;
  for (const name of ['quetzal-7ins.sav', 'quetzal-en.sav', 'quetzal-en2.sav', ...(process.env.BENCH_USER_SAVE ? [process.env.BENCH_USER_SAVE] : [])]) {
    const p = name.includes('/') ? name : `fixtures/${name}`;
    if (!existsSync(p)) continue;
    const { data: d, T } = loadSave(readFileSync(p), BASE, G3, U, N, Q, SG);
    // Equipes de exemplo e, sem BENCH_NO_TOUR, as de finais de torneio
    const tables = refFormats(d.game).flatMap(f => ['refteams', ...(process.env.BENCH_NO_TOUR ? [] : ['tourteams'])]
      .map(dir => `src/data/${dir}/${f}.json`).filter(existsSync).map(x => JSON.parse(readFileSync(x, 'utf8')))).filter(tb => tb.teams.length);
    if (!tables.length) continue;
    const all = [...d.party, ...d.pc.boxes.flatMap(b => b.slots)];
    const dex = quetzalLearnDex(QL, QT);
    const comp = compIndex(d.game);
    let t0 = performance.now();
    const anyItem = !!process.env.BENCH_ANYITEM;
    const ctx = B.prepareBuild(all, T, { dex, comp, anyItem });
    const tPrep = performance.now() - t0;
    t0 = performance.now();
    const rm = process.env.BENCH_ROLE_MOVES;
    const refs = referenceTeams(ctx, tables, T, d.game, { ...(fidW !== undefined ? { fidW } : {}), ...(process.env.BENCH_REF_ALL ? { adapt: 999 } : {}),
      ...(rm ? { roleMoves: rm === 'off' ? false : rm } : {}), ...(process.env.BENCH_FID_MODE ? { fidMode: process.env.BENCH_FID_MODE } : {}) });
    const tRefs = performance.now() - t0;
    t0 = performance.now();
    const free = B.freeTeams(B.prepareBuild(all, T, { dex, comp, anyItem }));
    const tFree = performance.now() - t0;
    let st = 0, stN = 0, ro = 0, roN = 0, pl = 0, plN = 0, kr = 0, krN = 0;
    const FIDR = ['pivot', 'regen', 'hazard', 'removal', 'phaze', 'screens', 'web', 'sweeper', 'priority', 'sacrifice'];
    for (const r of refs) {
      // Papéis da original que o próprio Pokémon mantido ainda cumpre (com o moveset da equipe adaptada)
      r.orig.members.forEach((m, i) => {
        const k = r.keep[i] && r.adapted.team.find(e => e.real === r.keep[i].real);
        if (!k) return;
        for (const role of FIDR) if (m.sbits & roleMask([role])) { krN++; if (k.sbits & roleMask([role])) kr++; }
      });
      const have = new Set(strategiesOf(r.adapted.team, r.adapted.plan));
      stN += r.orig.strategies.length; st += r.orig.strategies.filter(s => have.has(s)).length;
      let u = 0; for (const e of r.adapted.team) u |= e.sbits;
      roN += r.orig.roles.size; ro += [...r.orig.roles].filter(k => u & roleMask([k])).length;
      if (r.orig.plan.kind !== 'balance') { plN++; if (r.adapted.planKept && r.adapted.holds) pl++; }
    }
    // A lista vem primeiro pelos Pokémon do jogador (byOwned): a melhor é a de maior nota + fidelidade
    const top = list => list.reduce((a, r) => (!a || r.rank > a.rank ? r : a), null);
    const best = refs.length ? top(refs).adapted.score : null, bestFree = free[0] ? free[0].score : null;
    const freeStrats = free.length ? free.reduce((a, r) => a + strategiesOf(r.team, r.plan).length, 0) / free.length : 0;
    const row = { save: name, pc: all.length, compatible: refs.candidates.list.length, rejected: refs.rejected, adapted: refs.length,
      best: best && r1(best), bestFree: bestFree && r1(bestFree), meanRef: refs.length ? r1(refs.reduce((a, r) => a + r.adapted.score, 0) / refs.length) : null,
      meanFree: free.length ? r1(free.reduce((a, r) => a + r.score, 0) / free.length) : null,
      kept: refs.map(r => r.kept.length), stratsKept: `${st}/${stN}`, rolesKept: `${ro}/${roN}`, keptOwnRoles: `${kr}/${krN}`, planKept: `${pl}/${plN}`, freeStrats: r1(freeStrats),
      ms: { prep: Math.round(tPrep), refs: Math.round(tRefs), free: Math.round(tFree) } };
    // Equipes de finais de torneio: compatíveis, adaptadas, entre as 6 primeiras e a melhor nota
    const isTour = r => r.format.kind === 'tournament';
    const tours = refs.filter(isTour);
    Object.assign(row, { tourCompatible: refs.candidates.list.filter(w => w.format.kind === 'tournament').length, tourAdapted: tours.length,
      tourTop6: refs.slice(0, 6).filter(isTour).length, bestTour: tours.length ? r1(top(tours).adapted.score) : null, firstOwned: refs[0] ? refs[0].owned : null });
    rows.push(row);
    lines.push(`${name} (${all.length}): ${row.compatible} compatíveis (${row.rejected} de fora), ${row.adapted} adaptadas; melhor ${row.best} × livre ${row.bestFree}; média ${row.meanRef} × ${row.meanFree}; mantidos ${row.kept.join(',')}; estratégias da original ${row.stratsKept}, papéis ${row.rolesKept}, papéis dos mantidos ${row.keptOwnRoles}, plano ${row.planKept}; estratégias por equipe livre ${row.freeStrats}; tempo preparo ${row.ms.prep} ms, referências ${row.ms.refs} ms, livre ${row.ms.free} ms`);
    lines.push(`  torneio: ${row.tourCompatible} compatíveis, ${row.tourAdapted} adaptadas, ${row.tourTop6} entre as 6 primeiras, melhor ${row.bestTour}`);
    for (const r of tours.slice(0, 3)) {
      const res = (r.format.results || []).find(x => x.team === r.ref.id);
      lines.push(`  [torneio ${r.format.format}] ${res ? `${res.placement} ${res.player}, ${res.event}` : '-'}: ${r.orig.members.map(m => m.x.s).join(', ')} → ${r.adapted.team.map(e => e.m.species.name).join(', ')} (nota ${r1(r.adapted.score)}, fidelidade ${r.adapted.fidelity}, mantidos ${r.kept.length})`);
    }
    for (const r of refs.slice(0, 3)) lines.push(`  [${r.format.format}] ${r.ref.name || '-'}: ${r.orig.members.map(m => m.x.s).join(', ')} → ${r.adapted.team.map(e => e.m.species.name).join(', ')} (nota ${r1(r.adapted.score)}, fidelidade ${r.adapted.fidelity})`);
  }
  if (process.env.BENCH_OUT) writeFileSync(process.env.BENCH_OUT, JSON.stringify(rows, null, 1));
  if (process.env.BENCH_LOG) writeFileSync(process.env.BENCH_LOG, lines.join('\n') + '\n');
}, 3600000);

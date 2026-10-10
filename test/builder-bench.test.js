// Comparação do montador de equipes com os saves reais (opcional; não roda no `npm test` normal).
// Uso: BUILDER_BENCH=1 BENCH_OUT=/caminho/saida.json npx vitest run test/builder-bench.test.js
// Saves: os de fixtures/ (não versionados) e, se existir, o de BENCH_USER_SAVE. Para cada save e plano mede a nota
// e as partes, a pior fraqueza em comum, a cobertura real (contra os dois tipos dos Pokémon com stats base 450+),
// o trabalho pendente (evoluir, ensinar, nível), a diversidade entre as equipes, o tempo e quanto uma busca local
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
import UL from '../src/data/unbound-learn.json';
import SL from '../src/data/soulgold-learn.json';
import { quetzalLearnDex, unboundLearnDex, soulgoldLearnDex } from '../src/ui/dex.js';
import * as B from '../src/builder/build.js';
import { MAX_MEGAS } from '../src/ai/prompt.js';

const RUN = !!process.env.BUILDER_BENCH;
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
  for (const e of pool) {
    const c = plan.kind === 'weather' && e.conflictBy ? e.conflictBy[plan.field] : null;
    e.conflict = !!c && !(c === 'weak' && e.strong.has(plan.field));
    e.risk = c === 'weak' && e.strong.has(plan.field);
  }
}

// Busca local: troca um membro por vez enquanto a nota sobe (mede o quanto a busca em feixe deixou na mesa)
function localGain(team, pool, plan, types, opts) {
  let cur = [...team], s = B.score(cur, plan, types, opts), gain = 0, improved = true, guard = 0;
  const usable = pool.filter(e => !e.conflict);
  while (improved && guard++ < 20) {
    improved = false;
    for (let i = 0; i < cur.length && !improved; i++) {
      const rest = cur.filter((_, j) => j !== i);
      for (const c of usable) {
        if (!allowed(rest, c, plan)) continue;
        const t = [...rest, c];
        if (!B.planHolds(t, plan)) continue;
        const v = B.score(t, plan, types, opts);
        if (v > s + 1e-9) { gain += v - s; cur = t; s = v; improved = true; break; }
      }
    }
  }
  return gain;
}

function teamMetrics(team, plan, T, types, refLevel, opts) {
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const eff = (a, ds) => ds.reduce((x, d) => x * (idx.has(d) && idx.has(a) ? T.typechart[idx.get(a)][idx.get(d)] : 1), 1);
  let worst = null, critical = 0;
  types.forEach((ty, a) => {
    const w = team.filter(e => e.def[a] > 0).length, rs = team.filter(e => e.def[a] < 0).length;
    if (!worst || w > worst.w || (w === worst.w && rs < worst.r)) worst = { type: ty, w, r: rs };
    if (w >= 3 && rs === 0) critical++;
  });
  const atk = new Set();
  for (const e of team) for (const mv of [...e.m.moves, ...(e.teachAtk || [])]) if ((mv.category === 0 || mv.category === 1) && mv.type && (!mv.power || mv.power >= 70)) atk.add(mv.type);
  let hit = 0, wall = 0;
  for (const o of OPP) { const best = Math.max(...[...atk].map(a => eff(a, o))); if (best > 1) hit++; if (best < 1) wall++; }
  const parts = B.scoreParts(team, plan, types, opts);
  return {
    names: team.map(e => e.m.species.name + (e.given ? '@' + e.given : '') + (e.m.evolvedFrom ? '(de ' + e.m.evolvedFrom.species.name + ')' : '')),
    score: r1(parts.total), parts: Object.fromEntries(Object.entries(parts).filter(([k]) => k !== 'total').map(([k, v]) => [k, r1(v)])),
    worst, critical, pureCov: popc(team.reduce((x, e) => x | e.cov, 0)), realCov: Math.round(100 * hit / OPP.length), walls: Math.round(100 * wall / OPP.length),
    evolve: team.filter(e => e.m.evolvedFrom).length, teach: team.reduce((x, e) => x + (e.teachAtk || []).length, 0),
    belowLevel: team.filter(e => (e.real.level || 0) < refLevel - 15).length,
    legends: team.filter(e => B.isLegendary(e.m)).length, megas: team.filter(e => e.mega).length,
  };
}

it.skipIf(!RUN)('montador: linha de base nos saves reais', () => {
  const files = FILES.map(f => ['fixtures/' + f, f]);
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
      const dex = g === 'quetzal' ? quetzalLearnDex(QL) : g === 'unbound' ? unboundLearnDex(UL, T.unbound) : g === 'soulgold' ? soulgoldLearnDex(SL, T.soulgold) : null;
      const types = B.attackTypes(T);
      const refLevel = all.map(m => m.level || 0).sort((a, b) => b - a)[Math.min(5, all.length - 1)] || 0;
      const opts = { dex, ...extra };
      const t0 = performance.now();
      const teams = B.buildTeams(all, T, opts);
      const ms = Math.round(performance.now() - t0);
      const pool = teams.pool || B.prepare(all, T, dex, extra);
      const rows = [];
      for (const r of teams) {
        setFlags(r.team, r.plan);
        const m = teamMetrics(r.team, r.plan, T, types, refLevel, extra);
        const pl = teams.pool ? teams.pool : null;
        if (pl) setFlags(pl, r.plan);
        m.lsGain = pl ? r1(localGain(r.team, pl, r.plan, types, extra)) : null;
        rows.push({ plan: r.plan.field || 'equilibrada', alt: r.alt || 0, ...m });
      }
      const first = rows.filter(x => !x.alt);
      const cnt = new Map();
      for (const r of teams.filter(x => !x.alt)) for (const e of r.team) cnt.set(e.real, (cnt.get(e.real) || 0) + 1);
      const save = { save: name, game: g, mons: all.length, pool: pool.length, ms, plans: rows,
        diversity: { distinct: cnt.size, teams: first.length, inAll: [...cnt].filter(([, c]) => c === first.length && first.length > 1).map(([m]) => m.species.name) } };
      res.push(save);
      // A equipe do jogador como referência (o time de chuva do autor guiou os pesos)
      if (name === 'user.sav' && mode === 'train') {
        const pp = B.prepare(all, T, dex, extra);
        const team = d.party.map(m => pp.find(e => e.real === m)).filter(Boolean);
        const plan = B.plans(pp).find(x => x.field === 'chuva');
        if (plan) {
          for (const e of pp) { e.conflictBy = {}; }
          out.ref = { team: team.map(e => e.m.species.name), ...teamMetrics(team, plan, T, types, refLevel, extra) };
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
      lines.push(`# ${s.save} (${s.game}) ${s.mons} Pokémon, ${s.ms} ms; ${s.diversity.distinct} diferentes em ${s.diversity.teams} equipes; em todas: ${s.diversity.inAll.join(', ') || '—'}`);
      for (const r of s.plans) {
        lines.push(`  ${(r.plan + (r.alt ? ' #' + (r.alt + 1) : '')).padEnd(22)} ${String(r.score).padStart(6)} ${JSON.stringify(r.parts)} pior ${r.worst.type} ${r.worst.w}/${r.worst.r} crit ${r.critical} cob ${r.pureCov}/${r.realCov}% pend evo${r.evolve} ens${r.teach} nv${r.belowLevel} leg${r.legends} ls+${r.lsGain}`);
        lines.push(`      ${r.names.join(', ')}`);
      }
    }
  }
  if (out.ref) lines.push(`\nREFERÊNCIA (equipe do jogador, chuva): ${out.ref.score} ${JSON.stringify(out.ref.parts)} pior ${out.ref.worst.type} ${out.ref.worst.w}/${out.ref.worst.r}`);
  console.log(lines.join('\n'));
}, 600000);

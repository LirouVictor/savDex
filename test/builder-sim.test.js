// Conferência do montador por batalhas simuladas (opcional; não roda no `npm test` normal).
// Precisa do simulador do Pokémon Showdown (MIT), fora do package.json: `npm i --no-save pokemon-showdown@0.11.11`.
// Uso: BUILDER_SIM=1 [BENCH_USER_SAVE=save] [SIM_ONLY=a.sav,b.sav] [SIM_N=20] [SIM_VARIANTS=2] [SIM_RR=5] [SIM_OUT=saida.json]
//   [SIM_LOG=texto.txt] npx vitest run test/builder-sim.test.js
// Opções do montador como no teste de comparação: SIM_THREATS=1 (ameaças do jogo), SIM_READY=1 ("Prontos para usar").
// Para cada save: as equipes do app (uma por plano) e variações delas (um membro trocado por outro candidato) jogam
// contra os mesmos SIM_N times do random battle da geração (test/sim.js). Mede: a taxa de vitória de cada equipe; se a
// nota ordena as equipes do mesmo plano como as vitórias (variações: a troca que baixa a nota também baixa as vitórias?);
// e se a nota ordena os planos como as vitórias (as abas da tela). Correlação de Spearman e concordância de sinal.
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
import { smogonFormats, smogonIndex } from '../src/builder/smogon.js';
import SM3 from '../src/data/smogon/gen3ou.json';
import SM4 from '../src/data/smogon/gen4ou.json';
import SM5 from '../src/data/smogon/gen5ou.json';
import SM8 from '../src/data/smogon/gen8nationaldex.json';
import SM9 from '../src/data/smogon/gen9nationaldex.json';
import SM9U from '../src/data/smogon/gen9nationaldexubers.json';
import { showdown, formatsFor, toSet, leadOrder, battle, opponents } from './sim.js';

const SMOGON = { gen3ou: SM3, gen4ou: SM4, gen5ou: SM5, gen8nationaldex: SM8, gen9nationaldex: SM9, gen9nationaldexubers: SM9U };
const compIndex = game => { const fs = smogonFormats(game); return fs.length ? smogonIndex(fs.map(f => SMOGON[f])) : null; };
const FILES = ['quetzal-7ins.sav', 'quetzal-en.sav', 'quetzal-en2.sav', 'unbound-a.sav', 'unbound-c.sav', 'soulgold-b.sav', 'emerald.sav', 'hgss.duc', 'b2w2.duc'];
const RUN = !!process.env.BUILDER_SIM;
const r2 = x => Math.round(x * 100) / 100;

// Correlação de Spearman (postos com empates pela média)
function ranks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}
function pearson(a, b) {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sa && sb ? s / Math.sqrt(sa * sb) : 0;
}
const spearman = (a, b) => (a.length > 2 ? pearson(ranks(a), ranks(b)) : null);

// Sorteio com semente (as mesmas variações em cada execução)
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

it.skipIf(!RUN)('montador: batalhas simuladas', () => {
  if (!showdown()) throw new Error('Instale o simulador: npm i --no-save pokemon-showdown@0.11.11');
  const { Dex } = showdown();
  const NOPP = +(process.env.SIM_N || 20), NVAR = +(process.env.SIM_VARIANTS || 2), RR = +(process.env.SIM_RR || 5);
  let files = FILES.map(f => ['fixtures/' + f, f]);
  if (process.env.BENCH_USER_SAVE) files.unshift([process.env.BENCH_USER_SAVE, 'user.sav']);
  if (process.env.SIM_ONLY) files = files.filter(([, n]) => process.env.SIM_ONLY.split(',').includes(n));
  const out = [], lines = [];
  const all = { dScore: [], dWin: [], dRand: [], planScore: [], planWin: [] };
  for (const [p, name] of files) {
    if (!existsSync(p)) continue;
    const { data: d, T } = loadSave(readFileSync(p), BASE, G3, U, N, Q, SG);
    const mons = [...d.party, ...d.pc.boxes.flatMap(b => b.slots)];
    const g = d.game.id;
    const dex = g === 'quetzal' ? quetzalLearnDex(QL) : g === 'unbound' ? unboundLearnDex(UL, T.unbound) : g === 'soulgold' ? soulgoldLearnDex(SL, T.soulgold) : null;
    const types = B.attackTypes(T);
    const fmt = formatsFor(d.game);
    const sdex = Dex.forFormat(fmt.battle);
    const mains = B.buildTeams(mons, T, { dex, comp: compIndex(d.game), game: process.env.SIM_THREATS ? d.game : null, ready: !!process.env.SIM_READY });
    const pool = mains.pool;
    const opp = opponents(fmt.opp, NOPP, 1);
    const save = { save: name, game: g, teams: [] };
    const rand = rng(name.length * 7919 + 17);
    // As equipes: a de cada plano e NVAR variações dela (um membro trocado por um dos 60 melhores candidatos sozinho)
    const list = [];
    for (const r of mains) {
      const plan = r.plan;
      B.setPlanFlags(pool, plan);
      const label = plan.field || (plan.kind === 'offense' ? 'hiperofensiva' : 'equilibrada');
      const mk = (team, parent, swap) => {
        const sets = leadOrder(team, plan).map(e => toSet(e, plan, sdex));
        if (sets.some(x => !x)) return null;
        const parts = B.scoreParts(team, plan, types);
        return { label, plan, team, sets, score: parts.total, planPart: parts.plan, parent, swap, names: team.map(e => e.m.species.name) };
      };
      const main = mk(r.team, null, null);
      if (!main) { lines.push(`${name.padEnd(16)} ${label.padEnd(20)} (o Showdown não conhece algum membro)`); continue; }
      list.push(main);
      const cands = pool.filter(e => !e.conflict).sort((a, b) => B.solo(b, plan) - B.solo(a, plan)).slice(0, 60);
      for (let v = 0, tries = 0; v < NVAR && tries < 60; tries++) {
        const i = Math.floor(rand() * 6), c = cands[Math.floor(rand() * cands.length)];
        const rest = r.team.filter((_, j) => j !== i);
        if (c.key === r.team[i].key || !B.allowed(rest, c, plan)) continue;
        const x = mk([...rest, c], main, `${r.team[i].m.species.name} → ${c.m.species.name}`);
        if (x) { list.push(x); v++; }
      }
    }
    const t0 = performance.now();
    // Contra os times do random battle (medida absoluta; satura nos saves cheios de lendários)
    for (const x of list) {
      let w = 0;
      opp.forEach((o, i) => { w += battle(fmt.battle, x.sets, o, x.plan, [11, i + 1, 13, 17]); });
      x.rand = w / opp.length;
    }
    // Torneio entre as equipes do save: cada par joga RR batalhas com cada um começando como p1 (mesmas sementes)
    for (const x of list) { x.rr = 0; x.games = 0; }
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const A = list[a], Bt = list[b];
        for (let k = 0; k < RR; k++) {
          const w1 = battle(fmt.battle, A.sets, Bt.sets, A.plan, [21, a + 1, b + 1, k + 1], Bt.plan);
          const w2 = battle(fmt.battle, Bt.sets, A.sets, Bt.plan, [23, a + 1, b + 1, k + 1], A.plan);
          A.rr += w1 + (1 - w2); Bt.rr += (1 - w1) + w2; A.games += 2; Bt.games += 2;
        }
      }
    }
    for (const x of list) x.str = x.games ? x.rr / x.games : null;
    const ms = Math.round(performance.now() - t0);
    for (const x of list) {
      const row = { plan: x.label, main: !x.parent, swap: x.swap, score: r2(x.score), planPart: r2(x.planPart), rand: r2(x.rand), str: x.str === null ? null : r2(x.str), names: x.names };
      save.teams.push(row);
      if (x.parent) {
        all.dScore.push(x.score - x.parent.score); all.dWin.push(x.str - x.parent.str); all.dRand.push(x.rand - x.parent.rand);
        lines.push(`    ${x.swap}: nota ${r2(x.score)} (${r2(x.score - x.parent.score)}), torneio ${Math.round(100 * x.str)}% (${Math.round(100 * (x.str - x.parent.str))}), aleatórios ${Math.round(100 * x.rand)}%`);
      } else {
        lines.push(`${name.padEnd(16)} ${x.label.padEnd(20)} nota ${String(r2(x.score)).padStart(6)} (plano ${r2(x.planPart)}) torneio ${Math.round(100 * x.str)}% aleatórios ${Math.round(100 * x.rand)}% ${x.names.join(', ')}`);
      }
    }
    const ok = list.filter(x => !x.parent);
    save.planRho = spearman(ok.map(x => x.score), ok.map(x => x.str));
    save.planRhoNoPlan = spearman(ok.map(x => x.score - x.planPart), ok.map(x => x.str));
    save.allRho = spearman(list.map(x => x.score), list.map(x => x.str));
    for (const x of ok) { all.planScore.push(x.score); all.planWin.push(x.str); }
    lines.push(`  ${name}: ${list.length} equipes, ${ms} ms; nota × torneio: todas ${save.allRho === null ? '—' : r2(save.allRho)}, entre os planos ${save.planRho === null ? '—' : r2(save.planRho)}, sem a parte Plano ${save.planRhoNoPlan === null ? '—' : r2(save.planRhoNoPlan)}`);
    out.push(save);
  }
  const sig = (xs, ys, dx, dy) => {
    const n = xs.filter((x, i) => Math.abs(x) > dx && Math.abs(ys[i]) > dy).length;
    const ok = xs.filter((x, i) => Math.abs(x) > dx && Math.abs(ys[i]) > dy && Math.sign(x) === Math.sign(ys[i])).length;
    return { n, agree: n ? ok / n : null };
  };
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const per = k => mean(out.map(s => s[k]).filter(x => x !== null && x !== undefined));
  const summary = {
    variants: all.dScore.length,
    rhoVariants: spearman(all.dScore, all.dWin), rhoVariantsRand: spearman(all.dScore, all.dRand),
    sign: sig(all.dScore, all.dWin, 1, 0.02),
    dropWin: mean(all.dWin.filter((_, i) => all.dScore[i] < -1)),
    plans: all.planScore.length,
    allRho: per('allRho'), planRho: per('planRho'), planRhoNoPlan: per('planRhoNoPlan'),
  };
  const f = x => (x === null || x === undefined ? '—' : r2(x));
  lines.push(`RESUMO: ${summary.plans} equipes do app e ${summary.variants} variações. Variações: Spearman Δnota × Δtorneio ${f(summary.rhoVariants)} (× Δaleatórios ${f(summary.rhoVariantsRand)}), `
    + `sinal igual em ${summary.sign.n ? Math.round(100 * summary.sign.agree) : '—'}% de ${summary.sign.n}; quando a nota cai, o torneio muda ${summary.dropWin === null ? '—' : Math.round(100 * summary.dropWin)} pontos em média. `
    + `Por save (média): nota × torneio em todas as equipes ${f(summary.allRho)}; entre os planos ${f(summary.planRho)}, sem a parte Plano ${f(summary.planRhoNoPlan)}`);
  console.log(lines.join('\n'));
  if (process.env.SIM_OUT) writeFileSync(process.env.SIM_OUT, JSON.stringify({ summary, saves: out }, null, 1));
  if (process.env.SIM_LOG) writeFileSync(process.env.SIM_LOG, lines.join('\n') + '\n');
}, 7200000);

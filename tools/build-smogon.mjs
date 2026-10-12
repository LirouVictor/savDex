#!/usr/bin/env node
// Gera src/data/smogon/<formato>.json: a referência competitiva do montador de equipes.
// Fonte: estatísticas de uso públicas do Smogon (https://www.smogon.com/stats/, arquivos "chaos" do Pokémon Showdown),
// do mês mais recente ou do mês pedido. As páginas não declaram licença, então só vão para o app NÚMEROS DERIVADOS:
// quanto cada espécie é usada e quanto cada dupla aparece junta além do acaso. Nada dos arquivos é copiado como está.
//
// Sinergia de uma dupla = lift = vezes que as duas aparecem na mesma equipe ÷ o esperado pelo acaso (uso de uma × uso
// da outra). Pokémon pouco usados dão lifts enormes com poucos times (Vanilluxe + Cetitan 74× com 38 times), então o
// lift é suavizado com PRIOR equipes "de acaso": (juntas + PRIOR) ÷ (esperado + PRIOR). Com muita evidência quase não
// muda (Pelipper + Barraskewda: 19,6× → 16,5×); com pouca, volta para perto de 1× (Swampert + Raichu: 14,8× → 1,2×).
// Fica o log2 do lift suavizado: 0 = acaso, 1 = o dobro, −1 = metade (Pelipper + Torkoal, chuva com sol: −1,2).
//
// Golpes: de cada espécie, a fração dos sets que leva cada golpe (o peso do golpe ÷ o peso da espécie; os 12 mais usados,
// com 4% ou mais). O montador usa como referência para o moveset de cada Pokémon (src/builder/moveset.js).
//
// Uso: npm run smogon [-- AAAA-MM]   (precisa de rede; o resultado é versionado no git)

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/smogon');
const BASE = 'https://www.smogon.com/stats';
// Formato de referência de cada jogo do app (o mesmo mapa fica em src/builder/smogon.js). Um formato que já não é o
// atual tem poucas batalhas hoje: fica fixo no último mês completo em que era (Gen 8 National Dex em 2022-10, 824 mil
// batalhas, contra 4 mil em 2026-09)
const FORMATS = [['gen3ou'], ['gen4ou'], ['gen5ou'], ['gen8nationaldex', '2022-10'], ['gen9nationaldex'], ['gen9nationaldexubers']];
const CUTOFF = 1500; // jogadores de nível médio para cima: muitos times e sem o ruído das partidas de iniciante
const MIN_USAGE = 0.0005; // espécies em pelo menos 0,05% dos times
const PRIOR = 50; // equipes "de acaso" somadas na suavização
const MIN_LOG = Math.log2(1.5); // duplas guardadas: 1,5× ou mais (ou 1/1,5 ou menos)
const TOP_POS = 15, TOP_NEG = 5; // por espécie: as duplas mais fortes e as que mais se evitam
const MOVE_MIN = 0.04, MOVE_TOP = 12; // golpes por espécie: em 4% ou mais dos sets, os 12 mais usados

const toId = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Regras do Smogon que o app não tem: um time leva uma mega só (no app podem ser duas, e só uma megaevolui por batalha)
// e nunca duas formas da mesma espécie (Zapdos e Zapdos de Galar; Garchomp e Garchomp-Mega). Essas duplas se evitam
// por regra, não por falta de sinergia (Lopunny-Mega + Charizard-Mega-Y 1/45), e ficam de fora da tabela
const MEGA = /-(Mega(-[XYZ])?|Primal)$/;
const HYPHEN_BASE = ['Ho-Oh', 'Porygon-Z', 'Jangmo-o', 'Hakamo-o', 'Kommo-o', 'Chi-Yu', 'Ting-Lu', 'Wo-Chien', 'Chien-Pao', 'Nidoran-F', 'Nidoran-M'];
const baseOf = n => HYPHEN_BASE.find(b => n === b || n.startsWith(b + '-')) || n.split('-')[0];
const byRule = (a, b) => (MEGA.test(a) && MEGA.test(b)) || baseOf(a) === baseOf(b);
const r2 = x => Math.round(x * 100) / 100;

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.text();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(res => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
}

/** O mês mais recente publicado (pastas AAAA-MM/ do índice). */
async function latestMonth() {
  const html = await get(`${BASE}/`);
  const months = [...html.matchAll(/href="(\d{4}-\d{2})\/"/g)].map(m => m[1]).sort();
  if (!months.length) throw new Error('Não achei os meses no índice do Smogon');
  return months.at(-1);
}

function build(format, month, chaos) {
  const { info, data } = chaos;
  // Contagem ponderada de times com cada espécie (soma das habilidades) e o total de times (cada time tem 6)
  const W = {};
  for (const [name, e] of Object.entries(data)) W[name] = Object.values(e.Abilities).reduce((a, b) => a + b, 0);
  const N = Object.values(W).reduce((a, b) => a + b, 0) / 6;
  const names = Object.keys(data).filter(n => data[n].usage >= MIN_USAGE).sort((a, b) => data[b].usage - data[a].usage);
  const index = new Map(names.map((n, i) => [n, i]));
  const together = (a, b) => ((data[a].Teammates[b] || 0) + (data[b].Teammates[a] || 0)) / 2;
  const keep = new Map(); // "i,j" (i < j) → log2 do lift suavizado
  for (const a of names) {
    const scored = [];
    for (const b of names) {
      if (b === a || byRule(a, b)) continue;
      const expected = N * data[a].usage * data[b].usage;
      const v = Math.log2((together(a, b) + PRIOR) / (expected + PRIOR));
      if (Math.abs(v) >= MIN_LOG) scored.push([b, v]);
    }
    const pos = scored.filter(x => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, TOP_POS);
    const neg = scored.filter(x => x[1] < 0).sort((x, y) => x[1] - y[1]).slice(0, TOP_NEG);
    for (const [b, v] of [...pos, ...neg]) {
      const i = index.get(a), j = index.get(b);
      keep.set(i < j ? `${i},${j}` : `${j},${i}`, r2(v));
    }
  }
  const pairs = [...keep].map(([k, v]) => [...k.split(',').map(Number), v]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return {
    format, month, cutoff: CUTOFF, battles: info['number of battles'], prior: PRIOR,
    // IDs do Showdown (minúsculas, sem pontuação), do mais usado ao menos
    ids: names.map(toId),
    usage: names.map(n => Math.round(data[n].usage * 1e5) / 1e5),
    // [i, j, log2 do lift suavizado], i < j nos índices de ids
    pairs,
    // Golpes de cada espécie (na ordem de ids): [ID do golpe, fração dos sets, ...]
    moves: names.map(n => {
      const w = W[n] || 1;
      return Object.entries(data[n].Moves || {}).filter(([m]) => m).map(([m, v]) => [m, v / w])
        .filter(x => x[1] >= MOVE_MIN).sort((a, b) => b[1] - a[1]).slice(0, MOVE_TOP).flatMap(([m, v]) => [m, r2(v)]);
    }),
  };
}

const latest = process.argv[2] || await latestMonth();
await mkdir(OUT, { recursive: true });
for (const [format, fixed] of FORMATS) {
  const month = fixed || latest;
  const chaos = JSON.parse(await get(`${BASE}/${month}/chaos/${format}-${CUTOFF}.json`));
  const table = build(format, month, chaos);
  const json = JSON.stringify(table);
  await writeFile(path.join(OUT, `${format}.json`), json + '\n');
  console.log(`${format} (${month}): ${table.ids.length} espécies, ${table.pairs.length} duplas, ${table.battles} batalhas, ${(json.length / 1024).toFixed(0)} KB`);
}

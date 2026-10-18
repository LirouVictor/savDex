#!/usr/bin/env node
// Acrescenta natureza e EVs (`natures`, `spreads`) às tabelas de src/data/smogon/*.json que já existem, sem mexer no
// resto (uso, duplas, golpes, itens, habilidades). Para quando o smogon.com não responde daqui: a fonte é o projeto
// pkmn/smogon (https://raw.githubusercontent.com/pkmn/smogon/main/data/stats/<formato>.json), que processa os mesmos
// arquivos "chaos" do Smogon (mês mais recente; nível de corte escolhido por ele). Só vão para o repositório os números
// derivados, como no build-smogon.mjs: as naturezas mais usadas (soma dos spreads de cada uma) e os spreads mais usados.
//
// Conferido em 2026-10: as batalhas do pkmn/smogon batem com as das tabelas de 2026-09 (Gen 3–5 OU, National Dex,
// Ubers). A Gen 8 National Dex fica fixa em 2022-10 nas outras partes; aqui vale o mês atual (poucas batalhas).
//
// Uso: node tools/build-spreads.mjs   (precisa de rede)

import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { shares, natureSum, NATURE_TOP, SPREAD_TOP, SPREAD_MIN } from './build-smogon.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/smogon');
const BASE = 'https://raw.githubusercontent.com/pkmn/smogon/main/data/stats';
const FORMATS = ['gen3ou', 'gen4ou', 'gen5ou', 'gen8nationaldex', 'gen9nationaldex', 'gen9nationaldexubers'];
const toId = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Com proxy (HTTPS_PROXY), pelo curl, que o respeita (o fetch do Node 22 não); sem proxy, pelo fetch
const run = promisify(execFile);
async function get(url) {
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    const { stdout } = await run('curl', ['-sS', '-L', '--fail', '--max-time', '120', url], { maxBuffer: 256 << 20 });
    return stdout;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

for (const format of FORMATS) {
  const file = path.join(OUT, `${format}.json`);
  const table = JSON.parse(await readFile(file, 'utf8'));
  const stats = JSON.parse(await get(`${BASE}/${format}.json`));
  const byId = new Map(Object.entries(stats.pokemon).map(([name, p]) => [toId(name), p]));
  let found = 0;
  // Frações já normalizadas no pkmn/smogon (peso 1)
  table.natures = table.ids.map(id => { const p = byId.get(id); if (p) found++; return p ? shares(natureSum(p.spreads), 1, NATURE_TOP) : []; });
  table.spreads = table.ids.map(id => { const p = byId.get(id); return p ? shares(p.spreads, 1, SPREAD_TOP, SPREAD_MIN) : []; });
  table.spreadSource = { from: 'pkmn/smogon', battles: stats.battles };
  await writeFile(file, JSON.stringify(table) + '\n');
  console.log(`${format}: natureza e EVs de ${found} de ${table.ids.length} espécies (${stats.battles} batalhas)`);
}

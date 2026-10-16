#!/usr/bin/env node
// Gera as descrições das habilidades e as descrições da época dos golpes e habilidades nos jogos oficiais.
//
// Fontes:
//   - rh-hideout/pokeemerald-expansion (master), src/data/abilities.h: a descrição que o jogo mostra no resumo
//     (a mesma engine do Quetzal e do SoulGold; usada também no Unbound e onde a época não tem texto).
//   - PokeAPI/pokeapi (CSV): ability_flavor_text e move_flavor_text da versão de cada geração (Emerald, Platinum,
//     Black 2/White 2), para os jogos oficiais mostrarem o texto da época (Lightning Rod na Gen 3 não dá imunidade).
//
// Saída (versionada; carregada só quando o jogador toca numa habilidade ou num golpe):
//   - src/data/ability-text.json: { nome normalizado: descrição }
//   - src/data/text-gen3.json, text-gen4.json, text-gen5.json: { moves: [por nº nacional], abilities: { nome: texto } }
//
// Uso: npm run texts   (precisa de rede)

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data');
const EXP = 'https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/master';
const PAPI = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const ENGLISH = 9;
// Geração → [grupo de versões da PokeAPI, último golpe da geração]
const ERAS = { 3: [6, 354], 4: [9, 467], 5: [14, 559] };

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

// CSV com campos entre aspas que podem ter vírgulas e quebras de linha (os textos da PokeAPI têm)
function csv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1);
  return body.map(r => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ''])));
}

export const normName = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// Texto do jogo numa linha: quebras viram espaço; "POKéMON" da Gen 3 vira "Pokémon"
const clean = s => s.replace(/[\n\f­]+/g, ' ').replace(/\s+/g, ' ').replace(/POKéMON/g, 'Pokémon').replace(/POKé/g, 'Poké').trim();

/** As descrições do abilities.h: o texto de `.description`, só o primeiro ramo dos `#if` (o padrão da engine). */
function parseAbilities(src) {
  const out = new Map();
  const re = /\[ABILITY_([A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s{4}\},/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[2];
    const name = (body.match(/\.name\s*=\s*_\("([^"]*)"\)/) || [])[1];
    const at = body.indexOf('.description');
    if (!name || at < 0) continue;
    let desc = body.slice(at).split(/\n\s*\.(?!description)[a-zA-Z]+\s*=/)[0];
    desc = desc.replace(/#else[\s\S]*?#endif/g, '').replace(/#\w+.*$/gm, '');
    const text = [...desc.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]).join('').replace(/\\n/g, ' ');
    if (text) out.set(m[1], { name, text: clean(text) });
  }
  return out;
}

const [abH, pAbilities, pAbFlavor, pMvFlavor] = await Promise.all([
  get(`${EXP}/src/data/abilities.h`), get(`${PAPI}/abilities.csv`),
  get(`${PAPI}/ability_flavor_text.csv`), get(`${PAPI}/move_flavor_text.csv`),
]);

const abilityText = {};
for (const [constant, { name, text }] of parseAbilities(abH)) {
  if (name === '-------' || text === 'No special ability.') continue;
  abilityText[normName(name)] = text;
  // Pelo nome da constante também (nomes curtos nas ROMs: o Unbound escreve "Neutralize Gas")
  abilityText[normName(constant)] ??= text;
}
if (Object.keys(abilityText).length < 300 || !/flinch/i.test(abilityText.stench || '')) throw new Error('abilities.h não bateu');

const write = (file, data) => writeFile(path.join(OUT, file), JSON.stringify(data) + '\n');
await write('ability-text.json', abilityText);

const abIdent = new Map(csv(pAbilities).map(r => [+r.id, normName(r.identifier)]));
const abRows = csv(pAbFlavor).filter(r => +r.language_id === ENGLISH);
const mvRows = csv(pMvFlavor).filter(r => +r.language_id === ENGLISH);
for (const [gen, [vg, maxMove]] of Object.entries(ERAS)) {
  const moves = Array(maxMove + 1).fill(null);
  for (const r of mvRows) if (+r.version_group_id === vg && +r.move_id <= maxMove) moves[+r.move_id] = clean(r.flavor_text);
  const abilities = {};
  for (const r of abRows) if (+r.version_group_id === vg && abIdent.has(+r.ability_id)) abilities[abIdent.get(+r.ability_id)] = clean(r.flavor_text);
  const missing = moves.slice(1).filter(x => !x).length;
  if (missing > 5) throw new Error(`Gen ${gen}: ${missing} golpes sem texto`);
  await write(`text-gen${gen}.json`, { moves, abilities });
  console.log(`Gen ${gen}: ${maxMove - missing} golpes, ${Object.keys(abilities).length} habilidades`);
}
console.log(`ability-text.json: ${Object.keys(abilityText).length} nomes`);

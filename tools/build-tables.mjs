#!/usr/bin/env node
// Gera as tabelas estáticas em src/data/*.json.
//
// Fontes:
//   - rh-hideout/pokeemerald-expansion (master): IDs e nomes de golpes, itens e Poké Balls
//     (é a numeração que o Quetzal usa nesses campos).
//   - PokeAPI/pokeapi (CSV do repositório): nomes de espécies 1–905, tipos e habilidades
//     (1ª, 2ª, oculta) e taxa de gênero das espécies, tipos de golpes e as formas referenciadas em
//     src/data/quetzal-overrides.json; stats base e tabela de tipos (efetividade).
//   - Golpes: poder, precisão, PP, categoria e descrição vêm do moves_info.h do expansion.
//
// Uso: npm run tables   (precisa de rede; o resultado é versionado no git)

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data');
const EXP = 'https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/master';
const PAPI = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const MAX_DEX = 905;
const ENGLISH = 9;

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

async function exists(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

function csv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const keys = head.split(',');
  return rows.map(line => {
    // Os CSVs usados aqui não têm vírgulas dentro de aspas nas colunas que lemos,
    // mas tratamos aspas simples por segurança.
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? '']));
  });
}

// Avalia um `enum { A = 1, B, C = A, D = C + 2, ... }` de C. Devolve Map nome -> valor.
function parseEnum(src, enumName) {
  const start = src.search(new RegExp(`enum\\s+(?:__attribute__\\(\\(packed\\)\\)\\s+)?${enumName}\\b`));
  if (start < 0) throw new Error(`enum ${enumName} não encontrado`);
  const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('};', start));
  const values = new Map();
  let next = 0;
  for (let line of body.split('\n')) {
    line = line.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    for (const part of line.split(',')) {
      const m = part.trim().match(/^([A-Z0-9_]+)\s*(?:=\s*(.+))?$/);
      if (!m) continue;
      const [, name, expr] = m;
      let v = next;
      if (expr !== undefined) {
        v = 0;
        for (const term of expr.split('+').map(t => t.trim())) {
          if (/^\d+$/.test(term)) v += Number(term);
          else if (/^0x[0-9a-f]+$/i.test(term)) v += parseInt(term, 16);
          else if (values.has(term)) v += values.get(term);
          else throw new Error(`Não sei avaliar "${expr}" em ${enumName}.${name}`);
        }
      }
      values.set(name, v);
      next = v + 1;
    }
  }
  return values;
}

// Primeiro nome canônico para cada valor, ignorando contadores e aliases que vêm depois.
function byValue(values, prefix) {
  const out = new Map();
  for (const [name, v] of values) {
    if (!name.startsWith(prefix) || /_COUNT$/.test(name) || name === 'ITEM_FIELD_ARROW') continue;
    if (!out.has(v)) out.set(v, name);
  }
  return out;
}

// Lê `[CONST] = { ... .name = X("...") ... .type = TYPE_Y ... }` do arquivo de dados.
function parseInfo(src) {
  const out = new Map();
  const re = /^\s{4}\[([A-Z0-9_]+)\]\s*=\s*\n\s{4}\{([\s\S]*?)\n\s{4}\},?/gm;
  let m;
  while ((m = re.exec(src))) {
    const [, key, block] = m;
    const name = block.match(/\.name\s*=\s*(?:[A-Z_]+\()?_?\(?"((?:[^"\\]|\\.)*)"/);
    const type = block.match(/\.type\s*=\s*(TYPE_[A-Z]+)/);
    // Campos numéricos: com #if por geração, vale o primeiro valor (o da geração mais nova)
    // Aceita `X >= GEN_n ? A : B` (vale A, a geração mais nova)
    const num = f => { const r = block.match(new RegExp(`\\.${f}\\s*=\\s*(?:[^,;\\n?]*\\?\\s*)?(\\d+)`)); return r ? +r[1] : null; };
    const cat = block.match(/\.category\s*=\s*DAMAGE_CATEGORY_([A-Z]+)/);
    // Descrição: strings do COMPOUND_STRING até o `)` final; com #if dentro, vale o primeiro ramo
    let desc = null;
    const di = block.search(/\.description\s*=\s*COMPOUND_STRING\(/);
    if (di >= 0) {
      let seg = block.slice(di);
      const end = seg.search(/"\s*\)\s*,/);
      seg = end >= 0 ? seg.slice(0, end + 1) : seg;
      const els = seg.search(/^\s*#(?:else|elif)/m);
      if (els >= 0) seg = seg.slice(0, els);
      desc = [null, seg.split('\n').filter(l => !/^\s*#/.test(l)).join('\n')];
    }
    out.set(key, {
      name: name ? name[1] : null,
      type: type ? type[1] : null,
      power: num('power'), accuracy: num('accuracy'), pp: num('pp'),
      category: cat ? cat[1] : null,
      description: desc ? [...desc[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]).join('').replace(/-\\n/g, '-').replace(/\\n/g, ' ').replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim() : null,
    });
  }
  return out;
}

const titleCase = s => s.toLowerCase().split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function denseArray(map, max, fallback) {
  const arr = [];
  for (let i = 0; i <= max; i++) arr.push(map.has(i) ? map.get(i) : fallback);
  return arr;
}

async function main() {
  console.log('Baixando fontes…');
  const [movesH, movesInfo, itemsH, itemsInfo, ballsH,
    pTypes, pPokemon, pSpeciesNames, pPokemonTypes, pMoves, pPokemonAbilities, pAbilityNames, pSpecies, pStats, pEfficacy] = await Promise.all([
    get(`${EXP}/include/constants/moves.h`), get(`${EXP}/src/data/moves_info.h`),
    get(`${EXP}/include/constants/items.h`), get(`${EXP}/src/data/items.h`),
    get(`${EXP}/include/constants/pokeball.h`),
    get(`${PAPI}/types.csv`), get(`${PAPI}/pokemon.csv`), get(`${PAPI}/pokemon_species_names.csv`),
    get(`${PAPI}/pokemon_types.csv`), get(`${PAPI}/moves.csv`),
    get(`${PAPI}/pokemon_abilities.csv`), get(`${PAPI}/ability_names.csv`),
    get(`${PAPI}/pokemon_species.csv`), get(`${PAPI}/pokemon_stats.csv`), get(`${PAPI}/type_efficacy.csv`),
  ]);

  // Tipos (índice = type_id da PokeAPI, 0 = nenhum)
  const typeRows = csv(pTypes).filter(r => +r.id < 10000);
  const typeIds = new Map(typeRows.map(r => [+r.id, r.identifier]));
  const types = denseArray(typeIds, Math.max(...typeIds.keys()), null);
  const typeIndexByName = new Map(types.map((t, i) => [t, i]).filter(([t]) => t));

  // Espécies 1..905
  const speciesNames = new Map(csv(pSpeciesNames)
    .filter(r => +r.local_language_id === ENGLISH && +r.pokemon_species_id <= MAX_DEX)
    .map(r => [+r.pokemon_species_id, r.name]));
  const pokemonTypes = new Map();
  for (const r of csv(pPokemonTypes)) {
    const id = +r.pokemon_id;
    if (!pokemonTypes.has(id)) pokemonTypes.set(id, []);
    pokemonTypes.get(id)[+r.slot - 1] = +r.type_id;
  }
  // Habilidades por Pokémon: [slot 1, slot 2, oculta], como índices em abilityNames (0 = nenhuma)
  const papiAbilityName = new Map(csv(pAbilityNames).filter(r => +r.local_language_id === ENGLISH).map(r => [+r.ability_id, r.name]));
  const abilityNames = [null];
  const abilityIndex = new Map();
  const nameIdx = name => {
    if (!abilityIndex.has(name)) { abilityIndex.set(name, abilityNames.length); abilityNames.push(name); }
    return abilityIndex.get(name);
  };
  const pokemonAbilities = new Map();
  for (const r of csv(pPokemonAbilities)) {
    const id = +r.pokemon_id;
    if (!pokemonAbilities.has(id)) pokemonAbilities.set(id, [0, 0, 0]);
    pokemonAbilities.get(id)[+r.slot - 1] = nameIdx(papiAbilityName.get(+r.ability_id));
  }
  // Taxa de gênero por espécie (PokeAPI gender_rate: -1 = sem gênero, 0 = só macho, 8 = só fêmea, 1–7 = oitavos de fêmea)
  const genderRate = new Map(csv(pSpecies).map(r => [+r.id, +r.gender_rate]));
  const speciesGender = [null];
  // Stats base por Pokémon (PokeAPI stat_id 1..6 = HP, Atk, Def, SpA, SpD, Spe)
  const baseStats = new Map();
  for (const r of csv(pStats)) {
    const id = +r.pokemon_id, k = +r.stat_id;
    if (k < 1 || k > 6) continue;
    if (!baseStats.has(id)) baseStats.set(id, [0, 0, 0, 0, 0, 0]);
    baseStats.get(id)[k - 1] = +r.base_stat;
  }
  const speciesBase = [null];
  const speciesAbilities = [null];
  const species = [null];
  for (let id = 1; id <= MAX_DEX; id++) {
    if (!speciesNames.has(id)) throw new Error(`Sem nome para a espécie ${id}`);
    species.push([speciesNames.get(id), ...(pokemonTypes.get(id) || [])]);
    speciesAbilities.push(pokemonAbilities.get(id) || [0, 0, 0]);
    speciesGender.push(genderRate.get(id) ?? null);
    speciesBase.push(baseStats.get(id) || null);
  }

  // Formas referenciadas na tabela manual
  const custom = JSON.parse(await readFile(path.join(OUT, 'quetzal-overrides.json'), 'utf8'));
  const pokemonByIdent = new Map(csv(pPokemon).map(r => [r.identifier, r]));
  const forms = {};
  for (const [qid, entry] of Object.entries(custom.species)) {
    if (!entry.pokeapi) continue;
    const row = pokemonByIdent.get(entry.pokeapi);
    if (!row) throw new Error(`custom.species ${qid}: forma "${entry.pokeapi}" não existe na PokeAPI`);
    const pid = +row.id;
    forms[entry.pokeapi] = {
      id: pid,
      types: pokemonTypes.get(pid) || [],
      abilities: (pokemonAbilities.get(pid) || [0, 0, 0]).map(i => abilityNames[i]),
      genderRate: genderRate.get(+row.species_id) ?? null,
      baseStats: baseStats.get(pid) || null,
      icon: pid <= 898 || await exists(`${SPRITES}/versions/generation-viii/icons/${pid}.png`),
    };
  }

  // Golpes
  const moveEnum = byValue(parseEnum(movesH, 'Move'), 'MOVE_');
  const moveInfo = parseInfo(movesInfo);
  const papiMoveType = new Map(csv(pMoves).map(r => [norm(r.identifier), +r.type_id]));
  const maxMove = Math.max(...moveEnum.keys());
  const moves = [];
  const moveDetails = []; // [poder, precisão, PP base, categoria 0 físico/1 especial/2 status]
  const moveText = [];
  const moveTypeFallback = [];
  for (let id = 0; id <= maxMove; id++) {
    const c = moveEnum.get(id);
    if (!c) { moves.push(null); continue; }
    const info = moveInfo.get(c) || {};
    const name = id === 0 ? '-' : (info.name || titleCase(c.slice(5)));
    let t = papiMoveType.get(norm(name)) ?? papiMoveType.get(norm(c.slice(5)));
    if (t === undefined && info.type) {
      t = typeIndexByName.get(info.type.slice(5).toLowerCase());
      moveTypeFallback.push(name);
    }
    moves.push(id === 0 ? null : [name, t ?? 0]);
    if (id !== 0) {
      const catIndex = { PHYSICAL: 0, SPECIAL: 1, STATUS: 2 }[info.category] ?? null;
      moveDetails.push([info.power ?? 0, info.accuracy ?? 0, info.pp ?? 0, catIndex]);
      moveText.push(info.description || null);
    } else { moveDetails.push(null); moveText.push(null); }
  }

  // Itens
  const itemEnum = byValue(parseEnum(itemsH, 'Item'), 'ITEM_');
  const itemInfo = parseInfo(itemsInfo);
  const maxItem = Math.max(...itemEnum.keys());
  const items = [];
  for (let id = 0; id <= maxItem; id++) {
    const c = itemEnum.get(id);
    if (!c || id === 0) { items.push(null); continue; }
    const info = itemInfo.get(c);
    let name = info && info.name;
    if (!name) name = /^ITEM_(TM|HM)\d+$/.test(c) ? c.slice(5) : titleCase(c.slice(5));
    items.push(name);
  }


  const meta = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: { expansion: `${EXP}`, pokeapi: PAPI },
  };
  const write = (file, data) => writeFile(path.join(OUT, file), JSON.stringify(data) + '\n');
  await write('types.json', types);
  // Lendários e míticos da Dex Nacional inteira (o montador pode deixá-los de fora), pelo nome sem pontuação,
  // que é o que todos os jogos têm em comum (Ho-Oh → hooh, Type: Null → typenull)
  const legendary = csv(pSpecies).filter(r => +r.id <= 1025 && (r.is_legendary === '1' || r.is_mythical === '1'))
    .map(r => r.identifier.replace(/[^a-z0-9]/g, ''));
  await write('species.json', { meta, species, abilities: speciesAbilities, abilityNames, genderRates: speciesGender, baseStats: speciesBase, legendary });
  await write('moves.json', { meta, moves, details: moveDetails });
  // Descrições ficam num arquivo à parte, carregado sob demanda pela UI
  await write('move-text.json', moveText);

  // Tabela de tipos: chart[atacante][defensor] = multiplicador (índices = type_id da PokeAPI)
  const nTypes = types.length;
  const chart = Array.from({ length: nTypes }, () => Array(nTypes).fill(1));
  for (const r of csv(pEfficacy)) {
    const a = +r.damage_type_id, d = +r.target_type_id;
    if (a < nTypes && d < nTypes) chart[a][d] = +r.damage_factor / 100;
  }
  await write('typechart.json', chart);
  // Poké Balls (enum PokeBall; nome = item ITEM_<X>_BALL)
  const ballEnum = byValue(parseEnum(ballsH, 'PokeBall'), 'BALL_');
  const itemValue = new Map([...itemEnum].map(([v, c]) => [c, v]));
  const balls = denseArray(new Map([...ballEnum].map(([v, c]) => {
    const itemId = itemValue.get(`ITEM_${c.slice(5)}_BALL`);
    return [v, itemId !== undefined ? items[itemId] : titleCase(c.slice(5)) + ' Ball'];
  })), Math.max(...ballEnum.keys()), null);

  await write('items.json', { meta, items });
  await write('balls.json', { meta, balls });
  await write('forms.json', forms);

  console.log(`types ${types.length - 1}, species ${species.length - 1}, moves ${maxMove}, items ${maxItem}, forms ${Object.keys(forms).length}`);
  if (moveTypeFallback.length) console.log(`Golpes sem par na PokeAPI (tipo tirado do expansion): ${moveTypeFallback.length}: ${moveTypeFallback.slice(0, 20).join(', ')}${moveTypeFallback.length > 20 ? '…' : ''}`);
}

main().catch(e => { console.error(e); process.exit(1); });

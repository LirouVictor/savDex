#!/usr/bin/env node
// Gera src/data/quetzal.json com as tabelas do próprio Pokémon Quetzal, lidas da ROM do jogador.
//
// A ROM NUNCA vai para o repositório (fica em fixtures/, fora do git). Daqui só sai o que o app precisa
// para ler o save: nomes de itens e golpes, e nome/tipos/stats/habilidades/gênero das espécies com ID
// próprio do Quetzal (> 898). Nada de imagens, sons ou código do jogo.
//
// As tabelas são achadas por assinatura (nomes e stats conhecidos), não por posição fixa, e conferidas
// com o que já foi confirmado nos saves reais. Se algo não bater, o script para sem gravar.
//
// Fontes:
//   - ROM do Quetzal (argumento ou fixtures/rom/*.gba): itens (nome de 20 bytes), golpes (17), habilidades
//     (17), nomes das espécies (13) e dados das espécies (36 bytes: stats, tipos, gênero, curva, habilidades).
//   - PokeAPI (CSV): forma correspondente de cada espécie > 898 (sprite, nome no Showdown, linha evolutiva),
//     pelo nome da espécie + tipos + stats base.
//
// Uso: npm run quetzal -- caminho/da/rom.gba   (precisa de rede para a PokeAPI)

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeText, encodeText } from '../src/parser/charset.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/quetzal.json');
const PAPI = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const ENGLISH = 9;
/** Até aqui a numeração do Quetzal é a Dex Nacional (conferido: nomes, tipos e stats iguais aos da PokeAPI). */
const NATIONAL_UP_TO = 898;

// Ordem dos tipos na ROM (enum do pokeemerald, com Mystery no 9)
const ROM_TYPES = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'mystery',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];

// Já confirmados nos saves e no jogo (CLAUDE.md): a tabela só é aceita se bater com todos
const KNOWN_ITEMS = { 156: 'Pretty Feather', 294: 'Charizardite Y', 309: 'Scizorite', 314: 'Blazikenite', 389: 'Aloraichium Z',
  429: 'Miracle Seed', 442: 'Choice Band', 472: 'Leftovers', 479: 'Life Orb', 503: 'Assault Vest', 510: 'Heavy-Duty Boots',
  860: 'Raichunite Y', 865: 'Lucarionite Z', 871: 'Golisopite', 877: 'Baxcalibrite' };
const KNOWN_SPECIES = { 951: ['Raichu', 'electric', 'psychic'], 973: ['Weezing', 'poison', 'fairy'], 1210: ['Basculegion', 'water', 'ghost'],
  1224: ['Arcanine', 'fire', 'rock'], 1308: ['Annihilape', 'fighting', 'ghost'], 1327: ['Baxcalibur', 'dragon', 'ice'], 1469: ['Pikachu', 'electric', 'electric'] };

const fail = msg => { throw new Error(msg); };

async function findRom() {
  if (process.argv[2]) return process.argv[2];
  const dir = path.join(ROOT, 'fixtures/rom');
  const gba = (await readdir(dir).catch(() => [])).find(f => f.endsWith('.gba'));
  return gba ? path.join(dir, gba) : fail('Passe o caminho da ROM: npm run quetzal -- caminho/da/rom.gba');
}

async function get(url) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.text();
    } catch (e) {
      if (i >= 3) throw e;
      await new Promise(res => setTimeout(res, 1000 * 2 ** i));
    }
  }
}

function csv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const keys = head.split(',');
  return rows.map(line => {
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(keys.map((k, i) => [k, cells[i]]));
  });
}

/** A ROM abrevia nomes longos tirando letras ("Floral Healng"): as letras curtas aparecem em ordem na longa. */
const abbrev = (full, short) => {
  if (!short || short.length >= full.length || full.slice(0, 3) !== short.slice(0, 3)) return false;
  let k = 0;
  for (const c of full) if (c === short[k]) k++;
  return k === short.length;
};
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function tables(rom) {
  const enc = s => Buffer.concat([Buffer.from(encodeText(s, s.length)), Buffer.from([0xff])]);
  const text = (o, len) => decodeText(rom, o, len).replace(/’/g, "'");
  /** Posição de uma lista de nomes de tamanho fixo, achada por dois nomes vizinhos. */
  function list(first, second, index, width) {
    const a = enc(first), b = enc(second);
    for (let i = rom.indexOf(a); i >= 0; i = rom.indexOf(a, i + 1)) {
      if (rom.subarray(i + width, i + width + b.length).equals(b)) return i - index * width;
    }
    return fail(`Lista com "${first}" não encontrada na ROM.`);
  }

  // Itens: 20 bytes por nome; a lista em inglês termina onde começa a de outro idioma (de novo "????????")
  const itemBase = list('Poké Ball', 'Great Ball', 1, 20);
  const items = [null];
  for (let i = 1; ; i++) {
    const o = itemBase + i * 20, raw = rom.subarray(o, o + 20);
    if (raw.every(x => x === 0)) { items.push(null); continue; }
    const name = text(o, 20);
    if (name === '????????' || !raw.includes(0xff) || i > 2000) break;
    items.push(name.replace(/^\?\? /, 'Pokémon '));
  }
  while (items[items.length - 1] === null) items.pop();
  for (const [id, n] of Object.entries(KNOWN_ITEMS)) if (items[id] !== n) fail(`Item ${id}: ROM "${items[id]}", esperado "${n}".`);

  // Golpes: 17 bytes por nome (alguns vêm abreviados, ex.: "Floral Healng")
  const moveBase = list('Pound', 'Karate Chop', 1, 17);
  const moves = [null];
  for (let i = 1; i < 2000; i++) { const n = text(moveBase + i * 17, 17); if (!n) break; moves.push(n); }

  // Habilidades: 17 bytes por nome, na numeração nacional (65 = Overgrow)
  const abilityBase = list('Overgrow', 'Blaze', 65, 17);
  const abilities = [null];
  for (let i = 1; i < 1000; i++) { const n = text(abilityBase + i * 17, 17); if (!n) break; abilities.push(n); }
  if (abilities[154] !== 'Justified' || abilities[34] !== 'Chlorophyll') fail('Tabela de habilidades não confere.');

  // Espécies: nomes de 13 bytes; a lista acaba no próximo "??????????"
  const nameBase = list('Bulbasaur', 'Ivysaur', 1, 13);
  const names = [null];
  for (let i = 1; i < 3000; i++) { const n = text(nameBase + i * 13, 13); if (n === '??????????' || !n) break; names.push(n); }

  // Dados das espécies: 36 bytes. 0–5 stats (HP Atk Def Spe SpA SpD), 6–7 tipos, 18 gênero, 21 curva, 24–29 habilidades
  const sig = Buffer.from([45, 49, 49, 45, 65, 65]), sig2 = Buffer.from([60, 62, 63, 60, 80, 80]);
  let infoBase = -1;
  for (let i = rom.indexOf(sig); i >= 0; i = rom.indexOf(sig, i + 1)) if (rom.subarray(i + 36, i + 42).equals(sig2)) { infoBase = i - 36; break; }
  if (infoBase < 0) fail('Tabela de dados das espécies não encontrada.');
  const info = id => {
    const o = infoBase + id * 36;
    const ab = [rom.readUInt16LE(o + 24), rom.readUInt16LE(o + 26), rom.readUInt16LE(o + 28)].map(x => (x ? abilities[x] || null : null));
    return {
      name: names[id],
      types: [ROM_TYPES[rom[o + 6]], ROM_TYPES[rom[o + 7]]],
      stats: [rom[o], rom[o + 1], rom[o + 2], rom[o + 4], rom[o + 5], rom[o + 3]], // ordem do app: HP Atk Def SpA SpD Spe
      gender: rom[o + 18], growth: rom[o + 21], abilities: ab,
    };
  };
  for (const [id, [n, t1, t2]] of Object.entries(KNOWN_SPECIES)) {
    const s = info(+id);
    if (s.name !== n || s.types[0] !== t1 || s.types[1] !== t2) fail(`Espécie ${id}: ROM ${s.name} ${s.types}, esperado ${n} ${t1}/${t2}.`);
  }
  return { items, moves, abilities, count: names.length - 1, info };
}

// Taxa de gênero da ROM (0 só macho, 254 só fêmea, 255 sem gênero, senão limite) → escala da PokeAPI (−1, 0..8)
const genderRate = g => (g === 255 ? -1 : g === 254 ? 8 : g === 0 ? 0 : Math.round((g + 1) / 32));

// Nome no Showdown a partir do identificador da forma na PokeAPI (raichu-alola → Raichu-Alola)
function showdownName(name, ident, speciesIdent) {
  const rest = ident.slice(speciesIdent.length).replace(/^-/, '').split('-').filter(p => p && p !== 'breed' && p !== 'male');
  const parts = rest.map(p => (p === 'female' ? 'F' : p[0].toUpperCase() + p.slice(1)));
  return [name, ...parts].join('-');
}
const formLabel = (ident, speciesIdent) => {
  const rest = ident.slice(speciesIdent.length).replace(/^-/, '').split('-').filter(p => p && p !== 'breed');
  return rest.length ? rest.map(p => p[0].toUpperCase() + p.slice(1)).join(' ') : null;
};

async function exists(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

async function main() {
  const romPath = await findRom();
  const rom = await readFile(romPath);
  const sha1 = createHash('sha1').update(rom).digest('hex');
  console.log(`ROM: ${path.basename(romPath)} (${rom.length} bytes, sha1 ${sha1})`);
  const T = tables(rom);

  console.log('Baixando a PokeAPI…');
  const [pPokemon, pSpeciesNames, pTypes, pPokemonTypes, pStats, pSpecies] = await Promise.all([
    get(`${PAPI}/pokemon.csv`), get(`${PAPI}/pokemon_species_names.csv`), get(`${PAPI}/types.csv`),
    get(`${PAPI}/pokemon_types.csv`), get(`${PAPI}/pokemon_stats.csv`), get(`${PAPI}/pokemon_species.csv`),
  ]);
  const typeIdent = new Map(csv(pTypes).map(r => [+r.id, r.identifier]));
  const appTypes = JSON.parse(await readFile(path.join(ROOT, 'src/data/types.json'), 'utf8'));
  const appType = name => { const i = appTypes.indexOf(name); return i > 0 ? i : 0; };
  const speciesName = new Map(csv(pSpeciesNames).filter(r => +r.local_language_id === ENGLISH).map(r => [+r.pokemon_species_id, r.name]));
  const speciesIdent = new Map(csv(pSpecies).map(r => [+r.id, r.identifier]));
  const nationalByName = new Map([...speciesName].map(([id, n]) => [norm(n), id]));
  const pokemon = csv(pPokemon).map(r => ({ id: +r.id, ident: r.identifier, species: +r.species_id, types: [], stats: [0, 0, 0, 0, 0, 0] }));
  const byId = new Map(pokemon.map(p => [p.id, p]));
  for (const r of csv(pPokemonTypes)) { const p = byId.get(+r.pokemon_id); if (p) p.types[+r.slot - 1] = typeIdent.get(+r.type_id); }
  for (const r of csv(pStats)) { const p = byId.get(+r.pokemon_id); if (p && +r.stat_id >= 1 && +r.stat_id <= 6) p.stats[+r.stat_id - 1] = +r.base_stat; }

  // 1–898: confere que a ROM usa os dados oficiais (é o que o app já usa para esses IDs)
  let diff = 0;
  for (let id = 1; id <= NATIONAL_UP_TO; id++) {
    const s = T.info(id), p = byId.get(id);
    const types = [p.types[0], p.types[1] || p.types[0]];
    if (norm(s.name) !== norm(speciesName.get(id)) || s.types.join() !== types.join() || s.stats.join() !== p.stats.join()) diff++;
  }
  if (diff) fail(`${diff} espécies entre 1 e ${NATIONAL_UP_TO} diferem da PokeAPI; o app supõe que são iguais.`);
  const growth = new Set(Array.from({ length: T.count }, (_, i) => T.info(i + 1).growth));
  if (growth.size !== 1 || !growth.has(3)) fail(`Curvas de experiência inesperadas: ${[...growth]}`);

  // > 898: forma da PokeAPI com o mesmo nome de espécie, tipos e stats. Várias iguais (formas só de
  // aparência, ex.: Vivillon, Alcremie) = forma não identificada: sprite e evoluções da forma padrão.
  const species = {};
  const stat = { unica: 0, aparencia: 0, sem: 0 };
  const icons = [];
  for (let id = NATIONAL_UP_TO + 1; id <= T.count; id++) {
    const s = T.info(id);
    const national = nationalByName.get(norm(s.name)) || null;
    const types = s.types[1] === s.types[0] ? [s.types[0]] : s.types;
    const cands = pokemon.filter(p => p.species === national && p.types.filter(Boolean).join() === types.join() && p.stats.join() === s.stats.join());
    let form = null, ambiguous = false;
    if (cands.length === 1) { form = cands[0]; stat.unica++; } else if (cands.length > 1) { ambiguous = true; stat.aparencia++; } else stat.sem++;
    const sIdent = national ? speciesIdent.get(national) : null;
    const entry = {
      name: s.name,
      types: types.map(appType),
      stats: s.stats,
      abilities: s.abilities,
      genderRate: genderRate(s.gender),
      national,
    };
    if (form) {
      entry.pokeapi = form.ident;
      entry.spriteId = form.id;
      entry.form = formLabel(form.ident, sIdent);
      entry.showdown = showdownName(s.name, form.ident, sIdent);
      if (form.id > NATIONAL_UP_TO) icons.push(entry); else entry.icon = true;
    } else if (ambiguous) {
      entry.cosmetic = true; // forma de aparência: os dados batem com a padrão
    }
    species[id] = entry;
  }
  console.log('Conferindo ícones de menu…');
  for (let i = 0; i < icons.length; i += 16) {
    await Promise.all(icons.slice(i, i + 16).map(async e => { e.icon = await exists(`${SPRITES}/versions/generation-viii/icons/${e.spriteId}.png`); }));
  }

  // Compacta: [nome, [tipos], [stats], [habilidades], gênero, nº nacional, forma da PokeAPI, sprite, ícone, rótulo, Showdown, aparência]
  const pack = e => [e.name, e.types, e.stats, e.abilities, e.genderRate, e.national, e.pokeapi || null, e.spriteId || null,
    e.icon ? 1 : 0, e.form || null, e.showdown || null, e.cosmetic ? 1 : 0];
  const meta = {
    source: 'ROM do Pokémon Quetzal (lida por tools/build-quetzal.mjs; a ROM não é versionada)',
    rom: path.basename(romPath), sha1, generatedAt: new Date().toISOString().slice(0, 10),
    nationalUpTo: NATIONAL_UP_TO, species: T.count, items: T.items.length - 1, moves: T.moves.length - 1,
    fields: ['nome', 'tipos', 'stats HP/Atk/Def/SpA/SpD/Spe', 'habilidades 1/2/oculta', 'taxa de gênero (PokeAPI)', 'Dex Nacional',
      'forma na PokeAPI', 'sprite', 'ícone', 'forma', 'Showdown', 'forma de aparência'],
  };
  const out = { meta, items: T.items, movesUpTo: T.moves.length - 1, moveNames: {}, species: Object.fromEntries(Object.entries(species).map(([k, v]) => [k, pack(v)])) };
  // Golpes: a numeração bate com a do app; só guarda os nomes que diferem (sem contar abreviações)
  const appMoves = JSON.parse(await readFile(path.join(ROOT, 'src/data/moves.json'), 'utf8')).moves;
  for (let i = 1; i < T.moves.length; i++) {
    const app = appMoves[i] ? appMoves[i][0] : '';
    if (norm(app) !== norm(T.moves[i]) && !abbrev(norm(app), norm(T.moves[i]))) out.moveNames[i] = T.moves[i];
  }
  await writeFile(OUT, JSON.stringify(out) + '\n');
  console.log(`itens ${meta.items}, golpes ${meta.moves} (${Object.keys(out.moveNames).length} com nome próprio), espécies ${T.count}` +
    ` (> ${NATIONAL_UP_TO}: ${stat.unica} com forma, ${stat.aparencia} de aparência, ${stat.sem} sem correspondência)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

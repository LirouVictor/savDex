#!/usr/bin/env node
// Gera src/data/soulgold.json: tabelas do Pokémon SoulGold (ROM hack de Emerald sobre uma versão recente do
// pokeemerald-expansion), lidas da ROM do jogador.
//
// A ROM NUNCA vai para o repositório (fica em fixtures/rom/, fora do git). Daqui só saem nomes e números:
// espécies (nome, tipos, stats, habilidades, gênero, curva, Dex Nacional), golpes (nome, tipo, poder, precisão,
// PP, categoria), itens, habilidades, Poké Balls e a lista da Pokédex de Johto. Nada de imagens, sons ou código.
//
// As tabelas vêm do cabeçalho da Game Freak (ponteiros em posições fixas do início da ROM: espécies 0x1BC,
// itens 0x1C8, golpes 0x1CC) ou são achadas por assinatura, e são conferidas com fatos vistos no próprio jogo
// (emulador, tools/gbarun.c) antes de gravar. Se algo não bater, o script para sem gravar.
//   - Espécies: SpeciesInfo de 288 bytes (stats 0–5, tipos 6–7 no enum do expansion com NONE = 0, gênero 0x12,
//     curva 0x15, habilidades u16 em 0x18/0x1A/0x1C, nome 0x33 (13 bytes), Dex Nacional u16 em 0x42). A
//     numeração NÃO é a Dex Nacional (o hack tirou e reordenou espécies: o Sprigatito é o 1289).
//   - Golpes: 72 bytes (ponteiro do nome, ponteiro da descrição, efeito u16, u16 tipo:5 categoria:2 poder:9,
//     u16 precisão:7 alvo:9, PP u8).
//   - Itens: 44 bytes (preço u32, id secundário u16 em 6 = nº da Poké Ball nas bolas, ponteiro do nome em 20).
//   - Habilidades: 32 bytes, nome no começo.
//   - Pokédex de Johto: lista de espécies (u16) que acaba em 0; achada pelos números vistos no jogo.
//   - Golpes por nível: ponteiro em 0xA8 da espécie para uma lista de golpe u16 + nível u16 que acaba em 0xFFFF
//     (struct LevelUpMove do expansion; os campos seguintes são TM/tutor 0xAC, ovo 0xB0 e evoluções 0xB4).
//   - Evoluções: ponteiro em 0xB4 para entradas de 12 bytes (método u16, parâmetro u16, espécie alvo u16,
//     ponteiro das condições), até o método 0xFFFF; condições de 8 bytes (condição u16 + 3 valores u16) até a
//     39 (CONDITIONS_END). Métodos e condições = enums EvolutionMethods/EvolutionConditions do expansion atual.
//   - Nomes dos lugares (região do mapa: ponteiro do nome + posição, 8 bytes), para a condição "num lugar";
//     achados pelo "Route 29" seguido do "Route 30" e conferidos com o local de captura dos Pokémon do save.
// Formas: a da PokeAPI (sprite, nome no Showdown) pela Dex Nacional + tipos + stats.
//
// Gera também src/data/soulgold-learn.json (golpes por nível, carregado só ao abrir o detalhe).
//
// Uso: npm run soulgold [-- rom.gba]   (precisa de rede para a PokeAPI)

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeText, encodeText } from '../src/parser/charset.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/soulgold.json');
const LEARN_OUT = path.join(ROOT, 'src/data/soulgold-learn.json');
const PAPI = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const ROM_BASE = 0x08000000;
const SPECIES_SIZE = 288, MOVE_SIZE = 72, ITEM_SIZE = 44, ABILITY_SIZE = 32;
// Enum de tipos do expansion recente (NONE = 0, Mystery = 10, Stellar = 20)
const ROM_TYPES = [null, 'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', null,
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy', null];
const LAST_ICON = 898;
const CONDITIONS_END = 39, IF_IN_MAPSEC = 18; // ícones de menu da PokeAPI (geração VIII) só até aqui sem conferir

const fail = msg => { throw new Error(`SoulGold: ${msg}`); };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

async function findRom() {
  if (process.argv[2]) return process.argv[2];
  const dir = path.join(ROOT, 'fixtures/rom');
  const gba = (await readdir(dir).catch(() => [])).find(f => /soulgold/i.test(f) && f.endsWith('.gba'));
  return gba ? path.join(dir, gba) : fail('não achei a ROM. Coloque o .gba em fixtures/rom/ (nome com "soulgold") ou passe o caminho: npm run soulgold -- rom.gba');
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
  return rows.map(line => Object.fromEntries(line.split(',').map((c, i) => [keys[i], c])));
}

async function exists(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

function tables(rom) {
  const ptr = o => { const v = rom.readUInt32LE(o); return v >= ROM_BASE && v < ROM_BASE + rom.length ? v - ROM_BASE : -1; };
  const text = (o, len) => decodeText(rom, o, len).replace(/’/g, "'").trim();
  const H = { species: ptr(0x1BC), items: ptr(0x1C8), moves: ptr(0x1CC) };
  if (Object.values(H).some(v => v < 0)) fail('cabeçalho sem as tabelas esperadas');

  // Espécies
  const info = id => {
    const o = H.species + id * SPECIES_SIZE;
    return {
      name: text(o + 0x33, 13),
      stats: [0, 1, 2, 4, 5, 3].map(i => rom[o + i]), // ordem do app: HP/Atk/Def/SpA/SpD/Spe
      types: [ROM_TYPES[rom[o + 6]], ROM_TYPES[rom[o + 7]]],
      gender: rom[o + 0x12], growth: rom[o + 0x15],
      abilities: [0x18, 0x1A, 0x1C].map(i => rom.readUInt16LE(o + i)),
      national: rom.readUInt16LE(o + 0x42),
    };
  };
  if (info(1).name !== 'Bulbasaur' || info(1).stats.join() !== '45,49,49,65,65,45') fail('espécies fora do lugar');
  let count = 0;
  for (let id = 1, empty = 0; empty < 64; id++) {
    const s = info(id);
    if (s.name && s.national > 0 && s.national <= 1025 && s.types[0]) { count = id; empty = 0; } else empty++;
  }

  // Golpes
  const move = id => {
    const o = H.moves + id * MOVE_SIZE;
    const name = ptr(o) >= 0 ? text(ptr(o), 24) : '';
    const a = rom.readUInt16LE(o + 10), b = rom.readUInt16LE(o + 12);
    return { name, type: ROM_TYPES[a & 31], category: (a >> 5) & 3, power: a >> 7, accuracy: b & 0x7F, pp: rom[o + 14] };
  };
  if (move(1).name !== 'Pound') fail('golpes fora do lugar');
  let moves = 0;
  for (let id = 1; id < 2000; id++) { if (!move(id).name || ptr(H.moves + id * MOVE_SIZE) < 0) break; moves = id; }

  // Itens
  const item = id => {
    const o = H.items + id * ITEM_SIZE, p = ptr(o + 20);
    return { name: p >= 0 ? text(p, 24) : null, secondary: rom.readUInt16LE(o + 6) };
  };
  if (item(1).name !== 'Poké Ball' || item(4).name !== 'Master Ball') fail('itens fora do lugar');
  let items = 0;
  for (let id = 1; id < 3000; id++) { if (ptr(H.items + id * ITEM_SIZE + 20) < 0) break; items = id; }

  // Habilidades: tabela achada pelo "Stench" (1) seguido do "Drizzle" (2)
  const enc = s => Buffer.from([...s].map(c => (c >= 'A' && c <= 'Z' ? 0xBB + c.charCodeAt(0) - 65 : 0xD5 + c.charCodeAt(0) - 97)).concat(0xFF));
  let abil = -1;
  for (let i = rom.indexOf(enc('Stench')); i >= 0 && abil < 0; i = rom.indexOf(enc('Stench'), i + 1)) {
    if (text(i + ABILITY_SIZE, 17) === 'Drizzle') abil = i - ABILITY_SIZE;
  }
  if (abil < 0) fail('habilidades não encontradas');
  const ability = id => text(abil + id * ABILITY_SIZE, 17);
  let abilities = 0;
  for (let id = 1; id < 1000; id++) { if (!ability(id) || /[^A-Za-z0-9 '.-]/.test(ability(id))) break; abilities = id; }

  // Pokédex de Johto: espécies em ordem, acaba em 0. Achada pelos números vistos no jogo (Pidgey 16,
  // Hoothoot 142, Marill 160, Hoppip 164, Zigzagoon 225, Froakie 473).
  const seenInGame = [[16, 'Pidgey'], [142, 'Hoothoot'], [160, 'Marill'], [164, 'Hoppip'], [225, 'Zigzagoon'], [473, 'Froakie']];
  let johto = -1;
  const byName = new Map(); for (let id = 1; id <= count; id++) if (!byName.has(info(id).name)) byName.set(info(id).name, id);
  const want = seenInGame.map(([n, name]) => [n, byName.get(name)]);
  for (let o = 0; o + 2 * 1200 < rom.length && johto < 0; o += 2) {
    if (want.every(([n, id]) => rom.readUInt16LE(o + 2 * (n - 1)) === id)) johto = o;
  }
  if (johto < 0) fail('Pokédex de Johto não encontrada');
  const johtoList = [];
  for (let k = 0; ; k++) {
    const id = rom.readUInt16LE(johto + 2 * k);
    if (!id || id > count || !info(id).name) break;
    johtoList.push(id);
  }

  // Golpes por nível e evoluções (ponteiros na espécie)
  const learnset = id => {
    const p = ptr(H.species + id * SPECIES_SIZE + 0xA8);
    if (p < 0) return null;
    const out = [];
    for (let k = 0; k < 200; k++) {
      const mv = rom.readUInt16LE(p + 4 * k), lv = rom.readUInt16LE(p + 4 * k + 2);
      if (mv === 0xFFFF) return out;
      out.push(lv, mv);
    }
    return fail(`golpes por nível da espécie ${id} sem fim`);
  };
  const evolutions = id => {
    const p = ptr(H.species + id * SPECIES_SIZE + 0xB4);
    if (p < 0) return null;
    const out = [];
    for (let k = 0; k < 32; k++) {
      const o = p + 12 * k, method = rom.readUInt16LE(o);
      if (method === 0xFFFF) return out;
      const evo = [method, rom.readUInt16LE(o + 2), rom.readUInt16LE(o + 4)];
      const c = ptr(o + 8);
      if (c >= 0) {
        const conds = [];
        for (let j = 0; ; j++) {
          const cond = rom.readUInt16LE(c + 8 * j);
          if (cond === CONDITIONS_END) break;
          if (cond > CONDITIONS_END || j > 8) fail(`condição de evolução estranha na espécie ${id}`);
          conds.push([cond, rom.readUInt16LE(c + 8 * j + 2), rom.readUInt16LE(c + 8 * j + 4)]);
        }
        if (conds.length) evo.push(conds);
      }
      out.push(evo);
    }
    return fail(`evoluções da espécie ${id} sem fim`);
  };

  // Lugares: tabela de [ponteiro do nome, x, y, largura, altura]
  let places = -1;
  const route = n => { const e = Buffer.from([...encodeText(`Route ${n}`, 8), 0xFF]); const hits = []; for (let i = rom.indexOf(e); i >= 0; i = rom.indexOf(e, i + 1)) if (rom[i - 1] === 0 || rom[i - 1] === 0xFF) hits.push(i); return hits; };
  const r30 = new Set(route(30).map(i => i + ROM_BASE));
  for (const i of route(29)) {
    const b = Buffer.alloc(4); b.writeUInt32LE(i + ROM_BASE);
    for (let r = rom.indexOf(b); r >= 0 && places < 0; r = rom.indexOf(b, r + 1)) if (r % 4 === 0 && r30.has(rom.readUInt32LE(r + 8))) places = r;
  }
  if (places < 0) fail('nomes dos lugares não encontrados');
  while (ptr(places - 8) >= 0) places -= 8; // há lugares sem nome no meio
  const placeList = [];
  for (let k = 0; ptr(places + 8 * k) >= 0; k++) placeList.push(text(ptr(places + 8 * k), 30));

  return { H, info, count, move, moves, item, items, ability, abilities, abil, johto, johtoList, learnset, evolutions, places, placeList };
}

// Nome no Showdown e rótulo da forma a partir do identificador da PokeAPI (raichu-alola → Raichu-Alola)
function showdownName(name, ident, speciesIdent) {
  const rest = ident.slice(speciesIdent.length).replace(/^-/, '').split('-').filter(p => p && p !== 'breed' && p !== 'male');
  return [name, ...rest.map(p => (p === 'female' ? 'F' : p[0].toUpperCase() + p.slice(1)))].join('-');
}
const formLabel = (ident, speciesIdent) => {
  const rest = ident.slice(speciesIdent.length).replace(/^-/, '').split('-').filter(p => p && p !== 'breed');
  return rest.length ? rest.map(p => p[0].toUpperCase() + p.slice(1)).join(' ') : null;
};

async function main() {
  const romPath = await findRom();
  const rom = await readFile(romPath);
  const sha1 = createHash('sha1').update(rom).digest('hex');
  console.log(`ROM: ${path.basename(romPath)} (sha1 ${sha1.slice(0, 12)})`);
  const T = tables(rom);

  console.log('Baixando a PokeAPI…');
  const [pPokemon, pTypes, pPokemonTypes, pStats, pSpecies] = await Promise.all([
    get(`${PAPI}/pokemon.csv`), get(`${PAPI}/types.csv`), get(`${PAPI}/pokemon_types.csv`), get(`${PAPI}/pokemon_stats.csv`), get(`${PAPI}/pokemon_species.csv`),
  ]);
  const read = f => readFile(path.join(ROOT, 'src/data', f), 'utf8').then(JSON.parse);
  const [appTypes, appMoves, appItems] = await Promise.all([read('types.json'), read('moves.json'), read('items.json')]);
  const typeIdx = t => { const i = appTypes.indexOf(t); return i > 0 ? i : 0; };
  const typeIdent = new Map(csv(pTypes).map(r => [+r.id, r.identifier]));
  const speciesIdent = new Map(csv(pSpecies).map(r => [+r.id, r.identifier]));
  const pokemon = csv(pPokemon).map(r => ({ id: +r.id, ident: r.identifier, species: +r.species_id, types: [], stats: [0, 0, 0, 0, 0, 0] }));
  const byId = new Map(pokemon.map(p => [p.id, p]));
  for (const r of csv(pPokemonTypes)) { const p = byId.get(+r.pokemon_id); if (p) p.types[+r.slot - 1] = typeIdent.get(+r.type_id); }
  // PokeAPI: HP/Atk/Def/SpA/SpD/Spe (stat_id 1–6), a mesma ordem usada aqui
  for (const r of csv(pStats)) { const p = byId.get(+r.pokemon_id); if (p && +r.stat_id >= 1 && +r.stat_id <= 6) p.stats[+r.stat_id - 1] = +r.base_stat; }

  // Espécies: [nome, forma, Dex Nacional, sprite, ícone, tipo1, tipo2, hab1, hab2, oculta, gênero, curva, HP, Atk, Def, SpA, SpD, Spe]
  // (o mesmo formato do unbound.json). Forma da PokeAPI: mesma Dex Nacional, tipos e stats; várias iguais = só de
  // aparência (sprite da padrão); nenhuma = forma própria (sprite da espécie).
  const species = [];
  const stat = { padrao: 0, forma: 0, aparencia: 0, sem: 0 };
  const icons = [];
  for (let id = 1; id <= T.count; id++) {
    const s = T.info(id);
    if (!s.name || !s.national || s.national > 1025 || !s.types[0]) continue;
    const types = s.types[1] && s.types[1] !== s.types[0] ? [s.types[0], s.types[1]] : [s.types[0]];
    const cands = pokemon.filter(p => p.species === s.national && p.types.filter(Boolean).join() === types.join() && p.stats.join() === s.stats.join());
    const sIdent = speciesIdent.get(s.national);
    let form = null, spriteId = s.national, icon = s.national <= LAST_ICON, label = null, showdown = s.name;
    if (cands.length === 1) {
      form = cands[0];
      if (form.id !== s.national) { spriteId = form.id; label = formLabel(form.ident, sIdent); showdown = showdownName(s.name, form.ident, sIdent); icon = false; icons.push(id); stat.forma++; } else stat.padrao++;
    } else if (cands.some(p => p.id === s.national)) stat.padrao++;
    else if (cands.length > 1) stat.aparencia++;
    else stat.sem++;
    species[id] = [s.name, label, s.national, spriteId, icon ? 1 : 0, typeIdx(types[0]), types[1] ? typeIdx(types[1]) : 0,
      ...s.abilities, s.gender, s.growth, ...s.stats];
    species[id].showdown = showdown;
  }
  console.log('Conferindo ícones de menu das formas…');
  for (let i = 0; i < icons.length; i += 16) {
    await Promise.all(icons.slice(i, i + 16).map(async id => { if (await exists(`${SPRITES}/versions/generation-viii/icons/${species[id][3]}.png`)) species[id][4] = 1; }));
  }

  // Golpes: ID do app pelo nome (descrição, golpes por nível do dex.json) ou o nome (texto); dados da ROM
  const appMoveByName = new Map(); appMoves.moves.forEach((r, i) => { if (r && !appMoveByName.has(norm(r[0]))) appMoveByName.set(norm(r[0]), i); });
  const moves = [], moveData = [];
  for (let id = 1; id <= T.moves; id++) {
    const m = T.move(id);
    const app = appMoveByName.get(norm(m.name));
    moves[id] = app !== undefined ? app : m.name;
    moveData[id] = [m.type ? typeIdx(m.type) : null, m.power === 1 ? 0 : m.power, m.accuracy, m.pp, m.category];
  }
  // Itens (nome oficial do app quando é o mesmo, para o Showdown) e Poké Balls (nº da bola = id secundário)
  const appItemByName = new Map(appItems.items.filter(Boolean).map(n => [norm(n), n]));
  const items = [], balls = [];
  for (let id = 1; id <= T.items; id++) {
    const it = T.item(id);
    if (!it.name || /^\?+$/.test(it.name)) continue;
    items[id] = appItemByName.get(norm(it.name)) || it.name;
    if (/ Ball$/.test(it.name) && it.secondary && !balls[it.secondary]) balls[it.secondary] = items[id];
  }
  const abilities = [null]; for (let id = 1; id <= T.abilities; id++) abilities[id] = T.ability(id);
  const johto = T.johtoList.map(id => T.info(id).national);

  // Golpes por nível (listas iguais guardadas uma vez) e evoluções, na numeração do SoulGold
  const learnSets = [null], setIndex = new Map(), learnOf = [];
  const evolutions = {};
  species.forEach((r, id) => {
    if (!r) return;
    const ls = T.learnset(id);
    if (ls && ls.length) {
      const key = ls.join();
      if (!setIndex.has(key)) { setIndex.set(key, learnSets.length); learnSets.push(ls); }
      learnOf[id] = setIndex.get(key);
    }
    const evo = (T.evolutions(id) || []).filter(e => e[0] && species[e[2]]);
    if (evo.length) evolutions[id] = evo;
  });
  // Só os nomes dos lugares usados nas evoluções
  const places = {};
  for (const list of Object.values(evolutions)) for (const e of list) for (const [c, a] of e[3] || []) if (c === IF_IN_MAPSEC) places[a] = T.placeList[a];

  // Conferências com o que o jogo mostra (emulador)
  const problems = [];
  const check = (ok, msg) => { if (!ok) problems.push(msg); };
  const froakie = species[656] || [];
  const sid = name => species.findIndex(r => r && r[0] === name && !r[1]);
  check(froakie[0] === 'Froakie' && froakie[2] === 656 && appTypes[froakie[5]] === 'water' && froakie.slice(12).join() === '41,56,40,62,44,71', 'Froakie (656) diferente do jogo');
  check(abilities[froakie[7]] === 'Torrent', 'habilidade do Froakie não é Torrent');
  check(['Pound', 'Growl', 'Bubble', 'Water Gun'].every(n => moves.some((m, i) => i && (typeof m === 'number' ? appMoves.moves[m][0] : m) === n)), 'golpes do Froakie não achados');
  const md = name => moveData[moves.findIndex((m, i) => i && (typeof m === 'number' ? appMoves.moves[m][0] : m) === name)] || [];
  check(md('Pound').join() === [typeIdx('normal'), 40, 100, 35, 0].join(), 'Pound: dados diferentes de Normal 40/100/35 físico');
  check(md('Bubble')[3] === 30 && md('Water Gun')[3] === 25, 'PP de Bubble/Water Gun diferentes do jogo (30/25)');
  check(md('Thunderbolt')[0] === typeIdx('electric') && md('Thunderbolt')[4] === 1, 'Thunderbolt não é Electric especial');
  check(balls[1] === 'Poké Ball' && balls[4] === 'Master Ball', 'Poké Balls fora de ordem');
  check(johto[472] === 656 && johto.length > 600, 'Pokédex de Johto: Froakie não é o 473');
  // Golpes por nível do Froakie: o do save (Nv. 9) tem Pound, Quick Attack, Bubble e Water Gun (Growl esquecido)
  const learned = id => { const ls = learnSets[learnOf[id]] || []; return ls.map((v, i) => (i % 2 ? (typeof moves[v] === 'number' ? appMoves.moves[moves[v]][0] : moves[v]) : v)); };
  check(learned(656).slice(0, 10).join() === '1,Pound,1,Growl,5,Bubble,7,Water Gun,9,Quick Attack', 'golpes por nível do Froakie diferentes do jogo');
  // Evoluções: Froakie Nv. 16 → Frogadier; Tyrogue pelo Ataque × Defesa (condições 4–6)
  const evoTo = (id, name) => (evolutions[id] || []).find(e => species[e[2]][0] === name);
  check(evoTo(656, 'Frogadier')?.slice(0, 2).join() === '1,16', 'Froakie não evolui no Nv. 16');
  check(['Hitmonlee:4', 'Hitmontop:5', 'Hitmonchan:6'].every(x => { const [n, c] = x.split(':'); return evoTo(sid('Tyrogue'), n)?.[3]?.[0]?.[0] === +c; }), 'condições do Tyrogue fora do enum esperado');
  // Lugares: o local de captura dos Pokémon do save, como o jogo mostra no resumo
  check(T.placeList[232] === 'New Bark Town' && T.placeList[210] === 'Route 29' && T.placeList[211] === 'Route 30', 'nomes dos lugares fora de ordem');
  if (problems.length) fail(`a ROM não bate com o esperado (nada foi gravado):\n  ${problems.join('\n  ')}`);

  const showdown = {};
  species.forEach((r, id) => { if (r && r.showdown !== r[0]) showdown[id] = r.showdown; });
  const data = {
    meta: { generatedAt: new Date().toISOString().slice(0, 10), rom: { file: path.basename(romPath), sha1 }, source: 'ROM do Pokémon SoulGold (tools/build-soulgold.mjs; a ROM não é versionada) + PokeAPI' },
    species: species.map(r => (r ? [...r] : null)), showdown, abilities, moves, moveData, items, balls, johto, evolutions, places,
  };
  await writeFile(OUT, JSON.stringify(data) + '\n');
  await writeFile(LEARN_OUT, JSON.stringify({ meta: { rom: data.meta.rom, generatedAt: data.meta.generatedAt }, sets: learnSets, species: learnOf }) + '\n');
  console.log(`golpes por nível: ${learnOf.filter(Boolean).length} espécies, ${learnSets.length - 1} listas; evoluções: ${Object.keys(evolutions).length} espécies; lugares ${T.placeList.length}`);
  console.log(`espécies ${species.filter(Boolean).length} (até ${T.count}; formas: ${JSON.stringify(stat)}), golpes ${T.moves}, itens ${items.filter(Boolean).length}, habilidades ${T.abilities}, bolas ${balls.filter(Boolean).length}, Johto ${johto.length}`);
  console.log(`posições: lugares ${T.places.toString(16)}, espécies ${T.H.species.toString(16)}, golpes ${T.H.moves.toString(16)}, itens ${T.H.items.toString(16)}, habilidades ${T.abil.toString(16)}, Johto ${T.johto.toString(16)}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

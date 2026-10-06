// Tabelas do Pokémon Unbound lidas da ROM do jogador (usado por tools/build-unbound.mjs).
//
// A ROM NUNCA vai para o repositório (fica em fixtures/rom/, fora do git). Daqui só saem nomes e números:
// itens, dados das espécies e dos golpes, evoluções, golpes por nível e os nomes dos locais citados nas
// evoluções. Nada de imagens, sons ou código do jogo.
//
// O Unbound é um FireRed com o motor CFRU. Algumas tabelas vêm do cabeçalho da Game Freak (ponteiros em
// posições fixas do início da ROM, os mesmos do FireRed); as outras são achadas por assinatura. Tudo é
// conferido com fatos conhecidos antes de ser usado: se algo não bater, o script para sem gravar.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { decodeText, encodeText } from '../src/parser/charset.js';

const ROM_BASE = 0x08000000;
// Ordem dos tipos no CFRU (TYPE_FAIRY = 0x17; 0x09 Mystery, 0x13/0x14 internos)
const ROM_TYPES = { 0: 'normal', 1: 'fighting', 2: 'flying', 3: 'poison', 4: 'ground', 5: 'rock', 6: 'bug', 7: 'ghost', 8: 'steel',
  10: 'fire', 11: 'water', 12: 'grass', 13: 'electric', 14: 'psychic', 15: 'ice', 16: 'dragon', 17: 'dark', 23: 'fairy' };
const EVOS_PER_MON = 16;
const EVO_MAP = 19; // param = seção do mapa (nome em `places`)
const EVO_MEGA = 0xFE, EVO_GIGANTAMAX = 0xFD; // não são evoluções (ficam de fora)
const MAPSEC_FIRST = 0x58; // a tabela de nomes de locais do FireRed começa na seção 0x58

const fail = msg => { throw new Error(`ROM do Unbound: ${msg}`); };

export async function findUnboundRom(root, arg) {
  if (arg) return arg;
  const dir = path.join(root, 'fixtures/rom');
  const gba = (await readdir(dir).catch(() => [])).find(f => /unbound/i.test(f) && f.endsWith('.gba'));
  return gba ? path.join(dir, gba) : fail('não achei a ROM. Coloque o .gba em fixtures/rom/ (nome com "unbound") ou passe o caminho: npm run unbound -- rom.gba');
}

export async function readUnboundRom(file) {
  const rom = await readFile(file);
  if (rom.toString('latin1', 0xAC, 0xB0) !== 'BPRE') fail('não é uma ROM de FireRed (código do jogo diferente de BPRE)');
  const ptr = o => { const v = rom.readUInt32LE(o); return v >= ROM_BASE && v < ROM_BASE + rom.length ? v - ROM_BASE : -1; };
  const text = (o, len) => decodeText(rom, o, len).replace(/’/g, "'");
  const enc = s => Buffer.concat([Buffer.from(encodeText(s, s.length)), Buffer.from([0xFF])]);
  const ptrTo = off => { const b = Buffer.alloc(4); b.writeUInt32LE(off + ROM_BASE); return b; };

  // Cabeçalho da Game Freak (mesmas posições do FireRed): nomes das espécies, golpes, stats base, itens, dados dos golpes
  const H = { speciesNames: ptr(0x144), moveNames: ptr(0x148), baseStats: ptr(0x1BC), abilityNames: ptr(0x1C0), items: ptr(0x1C8), battleMoves: ptr(0x1CC) };
  if (text(H.speciesNames + 11, 11) !== 'Bulbasaur' || text(H.speciesNames + 4 * 11, 11) !== 'Charmander') fail('nomes das espécies fora do lugar');
  if (text(H.moveNames + 13, 13) !== 'Pound') fail('nomes dos golpes fora do lugar');
  if (text(H.items + 44, 14) !== 'Master Ball') fail('itens fora do lugar');
  if (text(H.abilityNames + 17, 17) !== 'Stench' || text(H.abilityNames + 2 * 17, 17) !== 'Drizzle') fail('nomes das habilidades fora do lugar');
  const base = id => H.baseStats + id * 28;
  if (rom.subarray(base(1), base(1) + 6).join() !== '45,49,49,45,65,65') fail('stats base fora do lugar');
  const bm = id => H.battleMoves + id * 12;
  if (rom.subarray(bm(1), bm(1) + 5).join() !== '0,40,0,100,35') fail('dados dos golpes fora do lugar (Pound)');

  // Espécies: dados de 28 bytes (stats HP/Atk/Def/Spe/SpA/SpD, tipos, gênero 16, curva 19, habilidades 22/23 e oculta 26)
  const species = id => {
    const o = base(id);
    return {
      stats: [0, 1, 2, 4, 5, 3].map(i => rom[o + i]), // na ordem do app: HP/Atk/Def/SpA/SpD/Spe
      types: [rom[o + 6], rom[o + 7]].map(x => ROM_TYPES[x] ?? null),
      gender: rom[o + 16], growth: rom[o + 19], abilities: [rom[o + 22], rom[o + 23], rom[o + 26]],
      name: text(H.speciesNames + id * 11, 11),
    };
  };

  const abilityName = id => text(H.abilityNames + id * 17, 17);
  const moveName = id => text(H.moveNames + id * 13, 13);

  // Itens: 44 bytes; nome de 14 bytes ou, nos nomes longos, um ponteiro para o texto
  const item = id => {
    const o = H.items + id * 44;
    const p = ptr(o);
    return ((rom[o + 3] & 0xFE) === 0x08 && p >= 0 ? text(p, 30) : text(o, 14)).trim();
  };

  // Golpes: 12 bytes (efeito, poder, tipo, precisão, PP, chance, alvo, prioridade, flags, poder Z, categoria, efeito Z)
  const move = id => {
    const o = bm(id);
    return { power: rom[o + 1], type: ROM_TYPES[rom[o + 2]] ?? null, accuracy: rom[o + 3], pp: rom[o + 4], category: rom[o + 10] };
  };

  // Evoluções: 16 × (método u16, parâmetro u16, espécie alvo u16, extra u16) por espécie; achadas por
  // Bulbasaur → Ivysaur no Nv. 16 seguido do Ivysaur → Venusaur no Nv. 32, 128 bytes depois
  const bulba = Buffer.from([4, 0, 16, 0, 2, 0, 0, 0]), ivy = Buffer.from([4, 0, 32, 0, 3, 0, 0, 0]);
  let evoTable = -1;
  for (let i = rom.indexOf(bulba); i >= 0; i = rom.indexOf(bulba, i + 1)) {
    if (rom.subarray(i + EVOS_PER_MON * 8, i + EVOS_PER_MON * 8 + 8).equals(ivy)) { evoTable = i - EVOS_PER_MON * 8; break; }
  }
  if (evoTable < 0) fail('tabela de evoluções não encontrada');
  const evolutions = id => {
    const out = [];
    for (let k = 0; k < EVOS_PER_MON; k++) {
      const o = evoTable + id * EVOS_PER_MON * 8 + k * 8;
      const [method, param, target, extra] = [0, 2, 4, 6].map(i => rom.readUInt16LE(o + i));
      if (method && method !== EVO_MEGA && method !== EVO_GIGANTAMAX) out.push([method, param, target, extra]);
    }
    return out;
  };

  // Golpes por nível: tabela de ponteiros (um por espécie) para listas de golpe u16 + nível u8, que acabam
  // em golpe 0 / nível 0xFF. Achada como a sequência de ponteiros cuja entrada 1 (Bulbasaur) começa com
  // Tackle e Growl no Nv. 1 e a 4 (Charmander) com Scratch e Growl no Nv. 1.
  const listAt = p => {
    if (p < 0) return null;
    const out = [];
    for (let o = p; o + 3 <= rom.length && out.length < 256; o += 3) {
      const mv = rom.readUInt16LE(o), lv = rom[o + 2];
      if (mv === 0 && lv === 0xFF) return out;
      if (lv > 100) return null;
      out.push([lv, mv]);
    }
    return null;
  };
  const starts = (p, pairs) => { const l = listAt(p); return !!l && pairs.every(([lv, mv], i) => l[i] && l[i][0] === lv && l[i][1] === mv); };
  let learnTable = -1;
  for (let o = 0; o + 20 < rom.length && learnTable < 0; o += 4) {
    if ((rom[o + 7] & 0xFE) !== 0x08 || (rom[o + 19] & 0xFE) !== 0x08) continue; // ponteiros 0x08…/0x09…
    if (starts(ptr(o + 4), [[1, 33], [1, 45]]) && starts(ptr(o + 16), [[1, 10], [1, 45]])) learnTable = o;
  }
  if (learnTable < 0) fail('tabela de golpes por nível não encontrada');
  const learnset = id => listAt(ptr(learnTable + id * 4));

  // Nomes dos locais (seção do mapa → texto): tabela de ponteiros do FireRed, achada por "Dresco Town"
  let mapNames = -1;
  const dresco = rom.indexOf(enc('Dresco Town'));
  for (let i = dresco; i >= 0 && mapNames < 0; i = rom.indexOf(enc('Dresco Town'), i + 1)) {
    const at = rom.indexOf(ptrTo(i));
    if (at >= 0 && text(ptr(at - 4), 20) === 'Bellin Town') mapNames = at - 8;
  }
  if (mapNames < 0) fail('nomes dos locais não encontrados');
  const place = mapsec => { const p = ptr(mapNames + (mapsec - MAPSEC_FIRST) * 4); return mapsec >= MAPSEC_FIRST && p >= 0 ? text(p, 30) : null; };

  return { rom, species, abilityName, moveName, item, move, evolutions, learnset, place, positions: { ...H, evoTable, learnTable, mapNames } };
}

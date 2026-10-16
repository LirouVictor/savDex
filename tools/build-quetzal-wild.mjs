#!/usr/bin/env node
// Gera os locais de captura do Pokémon Quetzal e os mapas das regiões, lidos da ROM do jogador.
//
// A ROM NUNCA vai para o repositório (fica em fixtures/rom/, fora do git). Daqui saem:
//   - src/data/quetzal-wild.json: os lugares (nome em inglês e em português, região, retângulo no mapa) e, por
//     espécie, onde aparece (lugar, jeito de encontrar, níveis, chance).
//   - src/data/maps/quetzal-*.png: o mapa de cada região (Hoenn, Johto, Kanto e as Ilhas Sete), como o jogo desenha.
//     Exceção à regra "nada de assets dos jogos", decidida pelo autor (2026-10) só para o mapa da região.
//
// Tudo é achado por assinatura, não por posição fixa, e conferido; se algo não bater, o script para sem gravar:
//   - Encontros (gWildMonHeaders do pokeemerald, com um campo a mais no Quetzal): 28 bytes por mapa = grupo, número,
//     2 de enchimento e 6 ponteiros: grama (12), água (5), escondidos do DexNav (3), Rock Smash (5), vara (10) e um sem
//     uso. Cada ponteiro leva a {taxa u8, ponteiro} e a lista de {nível mín., nível máx., espécie u16}.
//   - Mapas (gMapGroups): 40 grupos de ponteiros para cabeçalhos de 28 bytes; o lugar (mapsec) fica em +0x14. Johto
//     (grupos 34–35) tem a própria tabela de lugares; Hoenn e Kanto usam a mesma.
//   - Lugares (gRegionMapEntries): 8 bytes = x, y, largura, altura (em quadros de 8 px) e um ponteiro para 4 nomes
//     (inglês, espanhol, espanhol, português).
//   - Mapas das regiões: blocos 8bpp comprimidos (LZ77, 256 blocos), o mapa dos blocos (64 × 64, um byte por bloco) e
//     32 cores carregadas a partir da cor 112.
//
// Uso: npm run quetzal-wild [-- caminho/da/rom.gba] [--debug pasta]   (não precisa de rede)

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeText, encodeText } from '../src/parser/charset.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/quetzal-wild.json');
const MAPS = path.join(ROOT, 'src/data/maps');
const fail = msg => { throw new Error(msg); };

// Jeitos de encontrar, na ordem dos ponteiros do cabeçalho. Chances de cada posição: as do pokeemerald (o Quetzal pode
// ter mudado; a tela diz que são as do motor). Vara: posições 0–1 Old Rod, 2–4 Good Rod, 5–9 Super Rod.
const FIELDS = [
  { n: 12, rates: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1], kind: ['grass'] },
  { n: 5, rates: [60, 30, 5, 4, 1], kind: ['surf'] },
  { n: 3, rates: null, kind: ['hidden'] },
  { n: 5, rates: [60, 30, 5, 4, 1], kind: ['rock'] },
  { n: 10, rates: [70, 30, 60, 20, 20, 40, 40, 15, 4, 1], kind: ['old', 'old', 'good', 'good', 'good', 'super', 'super', 'super', 'super', 'super'] },
  { n: 0 },
];
// 'static': encontro único de um Pokémon parado no mapa (lendários e afins), da tabela própria do Quetzal
const METHODS = ['grass', 'surf', 'hidden', 'rock', 'old', 'good', 'super', 'static'];
const RECORD = 28;
const STATIC = 32;
const JOHTO_GROUPS = [34, 35];
const KANTO_GROUPS = [36, 37, 38, 39];
// Ilhas Sete: cada mapa do jogo mostra um grupo de ilhas (lista do pokefirered, sSeviiMapsecs), pelos nomes em inglês
const SEVII = {
  sevii123: ['ONE ISLAND', 'TWO ISLAND', 'THREE ISLAND', 'KINDLE ROAD', 'TREASURE BEACH', 'CAPE BRINK', 'BOND BRIDGE', 'THREE ISLE PORT', 'MT. EMBER', 'BERRY FOREST', 'THREE ISLE PATH', 'EMBER SPA'],
  sevii45: ['FOUR ISLAND', 'FIVE ISLAND', 'SEVII ISLE 6', 'SEVII ISLE 7', 'SEVII ISLE 8', 'SEVII ISLE 9', 'RESORT GORGEOUS', 'WATER LABYRINTH', 'FIVE ISLE MEADOW', 'MEMORIAL PILLAR', 'NAVEL ROCK', 'ICEFALL CAVE', 'ROCKET WAREHOUSE', 'LOST CAVE'],
  sevii67: ['SEVEN ISLAND', 'SIX ISLAND', 'OUTCAST ISLAND', 'GREEN PATH', 'WATER PATH', 'RUIN VALLEY', 'TRAINER TOWER', 'CANYON ENTRANCE', 'SEVAULT CANYON', 'TANOBY RUINS', 'SEVII ISLE 22', 'SEVII ISLE 23', 'SEVII ISLE 24', 'DOTTED HOLE', 'PATTERN BUSH', 'ALTERING CAVE', 'TANOBY CHAMBERS', 'BIRTH ISLAND'],
};
// Lugares já conferidos (nome em inglês, número do mapsec) e encontros conhecidos: a leitura só vale se bater
const KNOWN = { hoenn: { 0: 'LITTLEROOT TOWN', 16: 'ROUTE 101', 55: 'GRANITE CAVE', 88: 'PALLET TOWN', 126: 'VIRIDIAN FOREST' }, johto: { 0: 'NEW BARK TOWN', 60: 'RUINS OF ALPH', 88: 'ROUTE 29' } };

async function findRom() {
  const arg = process.argv.slice(2).find(a => a.endsWith('.gba'));
  if (arg) return arg;
  const dir = path.join(ROOT, 'fixtures/rom');
  const gba = (await readdir(dir).catch(() => [])).find(f => /quetzal/i.test(f) && f.endsWith('.gba'));
  return gba ? path.join(dir, gba) : fail('Coloque o .gba em fixtures/rom/ (nome com "quetzal") ou passe o caminho: npm run quetzal-wild -- rom.gba');
}

/** Descompressão LZ77 da BIOS do GBA (tipo 0x10). */
function lz77(R, o, maxOut = 0x40000) {
  if (R[o] !== 0x10) return null;
  const size = R[o + 1] | R[o + 2] << 8 | R[o + 3] << 16;
  if (size < 0x20 || size > maxOut) return null;
  const out = new Uint8Array(size);
  let p = o + 4, n = 0;
  while (n < size) {
    if (p >= R.length) return null;
    const flags = R[p++];
    for (let b = 7; b >= 0 && n < size; b--) {
      if (flags & (1 << b)) {
        const b1 = R[p++], b2 = R[p++], len = (b1 >> 4) + 3, disp = ((b1 & 15) << 8 | b2) + 1;
        if (disp > n) return null;
        for (let k = 0; k < len && n < size; k++, n++) out[n] = out[n - disp];
      } else out[n++] = R[p++];
    }
  }
  return out;
}

// PNG RGBA sem dependências
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgba) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Nome do lugar: o jogo escreve em maiúsculas; o app mostra "Rota 101", "Caverna Granito", "Pokémon". */
function nice(s) {
  const small = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'of', 'the', 'del', 'la']);
  return s.toLowerCase().replace(/pokémon/g, 'Pokémon').split(' ').map((w, i) => {
    if (i && small.has(w)) return w;
    return w.replace(/(^|[.’'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  }).join(' ').replace(/\bS\.s\./, 'S.S.').replace(/\bMt\b(?!\.)/, 'Mt.').replace(/\bCo\./, 'Co.');
}

function read(R) {
  const u16 = o => R.readUInt16LE(o), u32 = o => R.readUInt32LE(o);
  const P = p => ((p >>> 24) === 8 || (p >>> 24) === 9) ? p - 0x08000000 : -1;
  // A tradução usa 0x30 para Ã (PORTÃO, UNIÃO, DRAGÃO), que o charset ocidental não tem
  const text = o => { let s = ''; for (let i = 0; i < 40 && R[o + i] !== 0xff; i++) s += R[o + i] === 0x30 ? 'Ã' : decodeText(R, o + i, 1) || ' '; return s.replace(/\s+/g, ' ').trim(); };

  // Lista de Pokémon selvagens: n × {mín., máx., espécie}
  const monsOk = (o, n) => { if (o < 0 || o + n * 4 > R.length) return false; for (let i = 0; i < n; i++) { const a = R[o + i * 4], b = R[o + i * 4 + 1], s = u16(o + i * 4 + 2); if (!a || a > 100 || b < a || b > 100 || !s || s > 1600) return false; } return true; };
  const infoOk = (p, n) => { if (p === 0) return true; if (!n) return false; const o = P(p); return o >= 0 && R[o] <= 100 && monsOk(P(u32(o + 4)), n); };
  // Registros vazios (sem nenhum ponteiro) aparecem no fim da tabela, antes do 0xFF 0xFF
  const recOk = o => R[o] !== 0xff && R[o + 2] === 0 && R[o + 3] === 0 && FIELDS.every((f, k) => infoOk(u32(o + 4 + k * 4), f.n));
  const used = o => FIELDS.some((_, k) => u32(o + 4 + k * 4));

  // 1. Cabeçalhos dos encontros: a sequência mais longa de registros válidos que acaba em 0xFF 0xFF
  let wildBase = -1, wildCount = 0;
  for (let o = 0; o < R.length - RECORD; o += 4) {
    if (!recOk(o) || !used(o)) continue;
    let k = o, n = 0, real = 0;
    while (recOk(k)) { n++; if (used(k)) real++; k += RECORD; }
    if (real > 100 && n > wildCount && R[k] === 0xff && R[k + 1] === 0xff) { wildBase = o; wildCount = n; }
    o = k - 4;
  }
  if (wildCount < 200) fail(`Tabela de encontros não encontrada (${wildCount} registros).`);

  // 2. Grupos de mapas: ponteiros para listas de cabeçalhos; cada cabeçalho começa com o layout (largura, altura, 4 ponteiros)
  const layoutOk = p => { const o = P(p); if (o < 0 || o % 4) return false; const w = u32(o), h = u32(o + 4); return w > 0 && w < 300 && h > 0 && h < 300 && [8, 12, 16, 20].every(k => P(u32(o + k)) >= 0); };
  const headerOk = p => { const o = P(p); return o >= 0 && o % 4 === 0 && layoutOk(u32(o)) && P(u32(o + 4)) >= 0 && P(u32(o + 8)) >= 0; };
  const groupOk = p => { const o = P(p); return o >= 0 && o % 4 === 0 && headerOk(u32(o)); };
  let groupsBase = -1, groupCount = 0;
  for (let o = 0; o < R.length - 4; o += 4) {
    if (!groupOk(u32(o))) continue;
    let n = 0;
    while (groupOk(u32(o + n * 4))) n++;
    if (n > groupCount) { groupsBase = o; groupCount = n; }
    o += n * 4;
  }
  if (groupCount !== 40) fail(`Grupos de mapas: ${groupCount}, esperado 40.`);
  const starts = [...Array(groupCount).keys()].map(g => P(u32(groupsBase + g * 4)));
  const bounds = [...starts, groupsBase].sort((a, b) => a - b);
  const header = (g, m) => {
    const s = starts[g], end = bounds.find(x => x > s), n = (end - s) / 4;
    return m < n ? P(u32(s + m * 4)) : -1;
  };

  // 3. Tabelas de lugares, achadas pelo nome do primeiro lugar de cada uma
  const places = (first, count) => {
    const e = Buffer.from([...encodeText(first, first.length), 0xff]);
    for (let i = R.indexOf(e); i >= 0; i = R.indexOf(e, i + 1)) {
      const grp = R.indexOf(Buffer.from(new Uint32Array([i + 0x08000000]).buffer));
      for (let g = grp; g >= 0; g = R.indexOf(Buffer.from(new Uint32Array([i + 0x08000000]).buffer), g + 1)) {
        if (g % 4) continue;
        const ref = R.indexOf(Buffer.from(new Uint32Array([g + 0x08000000]).buffer));
        if (ref < 4 || ref % 4) continue;
        const base = ref - 4; // x, y, largura, altura antes do ponteiro
        return [...Array(count).keys()].map(k => {
          const o = base + k * 8, q = P(u32(o + 4));
          if (q < 0 || [0, 4, 8, 12].some(j => P(u32(q + j)) < 0)) return null;
          return { en: text(P(u32(q))), pt: text(P(u32(q + 12))), x: R[o], y: R[o + 1], w: R[o + 2], h: R[o + 3] };
        });
      }
    }
    return fail(`Tabela de lugares com "${first}" não encontrada.`);
  };
  const mainSecs = places('LITTLEROOT TOWN', 212), johtoSecs = places('NEW BARK TOWN', 256);
  for (const [k, n] of Object.entries(KNOWN.hoenn)) if (mainSecs[k]?.en !== n) fail(`Lugar ${k}: "${mainSecs[k]?.en}", esperado "${n}".`);
  for (const [k, n] of Object.entries(KNOWN.johto)) if (johtoSecs[k]?.en !== n) fail(`Lugar de Johto ${k}: "${johtoSecs[k]?.en}", esperado "${n}".`);

  // 4. Mapas das regiões: no código, ponteiros seguidos para os blocos (LZ, 0x4000), o mapa dos blocos (LZ, 0x1000) e as
  // cores; Kanto e as Ilhas Sete vêm em duas listas de 4 (blocos, mapas) e uma paleta só
  const lzSize = p => { const o = P(p); if (o < 0 || R[o] !== 0x10) return 0; return R[o + 1] | R[o + 2] << 8 | R[o + 3] << 16; };
  const isGfx = p => { const n = lzSize(p); return n >= 0x2000 && n <= 0x4000 && n % 64 === 0; };
  const isPal = p => { const o = P(p); return o >= 0 && !(o % 2) && !lzSize(p) && [...Array(32).keys()].every(i => u16(o + i * 2) < 0x8000); };
  const arr4 = (p, ok) => { const o = P(p); return o >= 0 && !(o % 4) && [0, 1, 2, 3].every(i => ok(u32(o + i * 4))); };
  const triples = [], quads = [];
  for (let o = 0; o < R.length - 20; o += 4) {
    if (isGfx(u32(o)) && lzSize(u32(o + 4)) === 0x1000 && isPal(u32(o + 8))) triples.push([u32(o), u32(o + 4), u32(o + 8)]);
    if (!arr4(u32(o), isGfx)) continue;
    for (let k = 4; k <= 12; k += 4) {
      if (!arr4(u32(o + k), p => lzSize(p) === 0x1000)) continue;
      const pal = [4, 8].map(j => u32(o + k + j)).find(isPal);
      const a = P(u32(o)), b = P(u32(o + k));
      if (pal) quads.push([0, 1, 2, 3].flatMap(i => [u32(a + i * 4), u32(b + i * 4), pal]));
    }
  }
  const uniq = list => [...new Map(list.map(t => [t.join(','), t])).values()];
  const images = { triples: uniq(triples), quads: uniq(quads).map(f => [0, 1, 2, 3].map(i => f.slice(i * 3, i * 3 + 3))) };
  if (images.triples.length !== 2 || images.quads.length !== 1) fail(`Mapas das regiões: ${images.triples.length} pares e ${images.quads.length} listas, esperados 2 e 1.`);

  const render = ([gfx, map, pal]) => {
    const tiles = lz77(R, P(gfx)), tm = lz77(R, P(map));
    if (!tiles || !tm) fail('Mapa da região não descomprime.');
    const colors = [...Array(32).keys()].map(i => { const c = u16(P(pal) + i * 2); return [(c & 31) * 255 / 31 | 0, (c >> 5 & 31) * 255 / 31 | 0, (c >> 10 & 31) * 255 / 31 | 0]; });
    const W = 240, H = 160, img = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tm[(y >> 3) * 64 + (x >> 3)], ci = tiles[t * 64 + (y & 7) * 8 + (x & 7)];
      const c = colors[ci - 112] || [0, 0, 0], o = (y * W + x) * 4;
      img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = ci >= 112 && ci < 144 ? 255 : 0;
    }
    return img;
  };

  return { u16, u32, P, wildBase, wildCount, header, mainSecs, johtoSecs, images, render };
}

async function main() {
  const Q = JSON.parse(await readFile(path.join(ROOT, 'src/data/quetzal.json'), 'utf8'));
  const romPath = await findRom();
  const debugIdx = process.argv.indexOf('--debug');
  const debug = debugIdx > 0 ? process.argv[debugIdx + 1] : null;
  const R = await readFile(romPath);
  const sha1 = createHash('sha1').update(R).digest('hex');
  console.log(`ROM: ${path.basename(romPath)} (${R.length} bytes, sha1 ${sha1})`);
  const X = read(R);
  const { u16, u32, P } = X;

  // Lugares usados: índice próprio no JSON; região pelo grupo do mapa
  const places = [], placeIdx = new Map();
  const regionOf = (g, sec) => {
    if (JOHTO_GROUPS.includes(g)) return 'johto';
    if (!KANTO_GROUPS.includes(g)) return 'hoenn';
    for (const [k, names] of Object.entries(SEVII)) if (names.includes(sec.en)) return k;
    return 'kanto';
  };
  const placeOf = (g, m) => {
    const h = X.header(g, m);
    if (h < 0) fail(`Mapa ${g}.${m} sem cabeçalho.`);
    const n = R[h + 0x14];
    const johto = JOHTO_GROUPS.includes(g);
    const sec = (johto ? X.johtoSecs : X.mainSecs)[n];
    if (!sec || !sec.en) return -1;
    const region = regionOf(g, sec);
    const key = `${johto ? 'j' : 'm'}${n}`;
    if (!placeIdx.has(key)) { placeIdx.set(key, places.length); places.push([nice(sec.en), nice(sec.pt), region, sec.x, sec.y, sec.w, sec.h]); }
    return placeIdx.get(key);
  };

  // Encontros por espécie: [lugar, jeito, nível mín., nível máx., chance %]; a mesma espécie em vários mapas do mesmo
  // lugar (andares de uma caverna) fica com a faixa de níveis de todos e a maior chance
  const wild = {};
  let slots = 0, skipped = 0;
  for (let i = 0; i < X.wildCount; i++) {
    const o = X.wildBase + i * RECORD, g = R[o], m = R[o + 1];
    const place = placeOf(g, m);
    if (place < 0) { skipped++; continue; }
    FIELDS.forEach((f, k) => {
      const p = u32(o + 4 + k * 4);
      if (!p || !f.n) return;
      const io = P(p), list = P(u32(io + 4));
      const sum = new Map();
      for (let s = 0; s < f.n; s++) {
        const min = R[list + s * 4], max = R[list + s * 4 + 1], sp = u16(list + s * 4 + 2);
        const how = METHODS.indexOf(f.kind[s] || f.kind[0]);
        const key = `${sp}|${how}`;
        const cur = sum.get(key) || { sp, how, min, max, pct: 0 };
        cur.min = Math.min(cur.min, min); cur.max = Math.max(cur.max, max);
        if (f.rates) cur.pct += f.rates[s];
        sum.set(key, cur);
        slots++;
      }
      for (const e of sum.values()) {
        const rows = (wild[e.sp] ||= []);
        const same = rows.find(r => r[0] === place && r[1] === e.how);
        if (same) { same[2] = Math.min(same[2], e.min); same[3] = Math.max(same[3], e.max); same[4] = Math.max(same[4], e.pct); }
        else rows.push([place, e.how, e.min, e.max, f.rates ? e.pct : 0]);
      }
    });
  }
  for (const rows of Object.values(wild)) rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Conferências: espécies e lugares conhecidos dos saves e do jogo
  const has = (sp, en, how) => (wild[sp] || []).some(r => places[r[0]][0] === en && (how == null || METHODS[r[1]] === how));
  if (!has(263, 'Route 101', 'grass')) fail('Zigzagoon não está na grama da Rota 101.');
  if (!has(201, 'Ruins of Alph')) fail('Unown não está nas Ruins of Alph.');
  if (!has(129, 'Route 104', 'old')) fail('Magikarp não está na Old Rod da Rota 104.');
  if (!has(74, 'Route 111', 'rock')) fail('Geodude não está no Rock Smash da Rota 111.');

  // Encontros únicos (lendários e afins): tabela própria do Quetzal, 32 bytes por espécie = grupo do mapa, mapa, nº do
  // objeto no mapa, 0, espécie u16, nível u16, 0 u16 e 3 flags seguidas (as das espécies seguintes continuam a conta); o
  // resto (requisitos, natureza?) não foi decodificado. Conferido pelo mapa: o objeto com esse número usa a 1ª flag
  // (a que esconde o Pokémon do mapa depois do encontro)
  const staticOk = o => {
    const f = u16(o + 10), lv = u16(o + 6), sp = u16(o + 4);
    return R[o] < 40 && R[o + 3] === 0 && sp > 0 && sp < 1600 && lv > 0 && lv <= 100 && f > 0 && u16(o + 12) === f + 1 && u16(o + 14) === f + 2 && X.header(R[o], R[o + 1]) >= 0;
  };
  let stBase = -1, stCount = 0;
  for (let o = 0; o < R.length - STATIC; o += 4) {
    if (!staticOk(o)) continue;
    let n = 1;
    while (staticOk(o + n * STATIC) && u16(o + n * STATIC + 10) === u16(o + (n - 1) * STATIC + 10) + 3) n++;
    if (n > stCount) { stBase = o; stCount = n; }
  }
  if (stCount < 50) fail(`Tabela dos encontros únicos não encontrada (${stCount} registros).`);
  // flags dos objetos do mapa (alguns registros têm o nº do objeto 0: Lugia, Ho-Oh; vale qualquer objeto com a flag)
  const objectFlags = (g, m) => {
    const ev = P(u32(X.header(g, m) + 4)), objs = P(u32(ev + 4)), out = new Set();
    for (let i = 0; i < R[ev]; i++) out.add(u16(objs + i * 24 + 0x14));
    return out;
  };
  let statics = 0; const noObj = [];
  // Requisitos lidos da ROM (a função que confere o encontro, em 0x82AA894 na Alpha 9, usa estes campos): +0x10 nº
  // mínimo de insígnias da região, +0x11 ter vencido a Liga da região, +0x12 tipo (0xFF = nenhum; a regra de cada
  // encontro é uma função própria, nº = byte +0x1F >> 2, não decodificada), +0x16 item na mochila, +0x18 flag da
  // história, +0x1A/+0x1C variável ≥ valor. Os textos dos requisitos vêm do guia (src/data/quetzal-legends.json)
  const legend = {};
  for (let i = 0; i < stCount; i++) {
    const o = stBase + i * STATIC, g = R[o], m = R[o + 1], sp = u16(o + 4), lv = u16(o + 6);
    if (!objectFlags(g, m).has(u16(o + 10))) noObj.push(`${sp}@${g}.${m}`);
    const place = placeOf(g, m);
    if (place < 0) fail(`Encontro único ${i} (espécie ${sp}) sem lugar.`);
    const rows = (wild[sp] ||= []);
    if (!rows.some(r => r[0] === place && r[1] === METHODS.indexOf('static') && r[2] === lv)) rows.push([place, METHODS.indexOf('static'), lv, lv, 0]);
    statics++;
    const item = u16(o + 0x16);
    if (item && !Q.items[item]) fail(`Encontro único ${i} (espécie ${sp}): item ${item} desconhecido.`);
    legend[sp] = { badges: R[o + 0x10], league: R[o + 0x11] ? 1 : 0, type: R[o + 0x12] === 0xFF ? null : R[o + 0x12], item: item || null, rule: R[o + 0x1F] >> 2 };
  }
  if (!Object.values(legend).some(l => Q.items[l.item] === 'Prison Bottle')) fail('Nenhum encontro pede a Prison Bottle (Hoopa).');
  if (legend[249]?.badges !== 8) fail('Lugia não pede 8 insígnias.');
  const hasStatic = (sp, en) => (wild[sp] || []).some(r => places[r[0]][0] === en && METHODS[r[1]] === 'static');
  if (!hasStatic(150, 'Rocket Hideout') && !hasStatic(150, 'Team Rocket Hideout')) fail(`Mewtwo não está no esconderijo da Equipe Rocket (${(wild[150] || []).map(r => places[r[0]][0])}).`);
  if (!hasStatic(382, 'Embedded Tower')) fail('Kyogre não está na Embedded Tower.');
  for (const rows of Object.values(wild)) rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Mapas das regiões: qual imagem é de qual região, pelo quanto os retângulos das cidades caem fora do mar
  const imgs = [...X.images.triples, ...X.images.quads[0]].map(t => X.render(t));
  const sea = img => { const n = new Map(); for (let i = 0; i < img.length; i += 4) { const k = img[i] << 16 | img[i + 1] << 8 | img[i + 2]; n.set(k, (n.get(k) || 0) + 1); } return [...n].sort((a, b) => b[1] - a[1])[0][0]; };
  const seaOf = imgs.map(sea);
  const towns = region => places.filter(p => p[2] === region);
  const score = (i, region) => {
    const img = imgs[i]; let land = 0, all = 0;
    for (const [, , , x, y, w, h] of towns(region)) {
      const px = (x + 1) * 8 + w * 4, py = (y + 2) * 8 + h * 4;
      if (px >= 240 || py >= 160) continue;
      const o = (py * 240 + px) * 4; all++;
      if ((img[o] << 16 | img[o + 1] << 8 | img[o + 2]) !== seaOf[i] && img[o + 3]) land++;
    }
    return all ? land / all : 0;
  };
  // Pares (Hoenn/Johto) e a lista (Kanto + 3 das Ilhas Sete, nessa ordem, como no pokefirered)
  const [a, b] = [score(0, 'hoenn') + score(1, 'johto'), score(1, 'hoenn') + score(0, 'johto')];
  if (a === b) fail('Não deu para saber qual mapa é Hoenn e qual é Johto.');
  const order = { hoenn: a >= b ? 0 : 1, johto: a >= b ? 1 : 0, kanto: 2, sevii123: 3, sevii45: 4, sevii67: 5 };
  for (const [region, i] of Object.entries(order)) {
    const s = score(i, region);
    console.log(`mapa ${region}: ${(s * 100).toFixed(0)}% dos lugares fora do mar`);
    if (towns(region).length && s < 0.7) fail(`O mapa de ${region} não confere com os lugares (${(s * 100).toFixed(0)}%).`);
  }

  // Kanto e as Ilhas Sete são desenhados como no FireRed: à direita e embaixo ficam a moldura e o botão de trocar de mapa
  const size = region => (region === 'hoenn' || region === 'johto' ? [240, 160] : [192, 144]);
  for (const p of places) { const [w, h] = size(p[2]); if ((p[3] + 1 + p[5]) * 8 > w || (p[4] + 2 + p[6]) * 8 > h) fail(`Lugar fora do mapa: ${p[0]}.`); }
  const crop = (img, w, h) => { const out = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) out.set(img.subarray(y * 240 * 4, (y * 240 + w) * 4), y * w * 4); return out; };
  await mkdir(MAPS, { recursive: true });
  for (const [region, i] of Object.entries(order)) { const [w, h] = size(region); await writeFile(path.join(MAPS, `quetzal-${region}.png`), png(w, h, crop(imgs[i], w, h))); }
  if (debug) {
    await mkdir(debug, { recursive: true });
    for (const [region, i] of Object.entries(order)) {
      const img = imgs[i].slice();
      for (const [, , r, x, y, w, h] of places) if (r === region) for (let py = (y + 2) * 8; py < (y + 2 + h) * 8 && py < 160; py++) for (let px = (x + 1) * 8; px < (x + 1 + w) * 8 && px < 240; px++) {
        const edge = py === (y + 2) * 8 || px === (x + 1) * 8 || py === (y + 2 + h) * 8 - 1 || px === (x + 1 + w) * 8 - 1;
        if (edge) { const o = (py * 240 + px) * 4; img[o] = 255; img[o + 1] = 0; img[o + 2] = 255; img[o + 3] = 255; }
      }
      await writeFile(path.join(debug, `${region}.png`), png(240, 160, img));
    }
  }

  const out = {
    meta: { source: 'ROM do Pokémon Quetzal (lida por tools/build-quetzal-wild.mjs; a ROM não é versionada)', rom: path.basename(romPath), sha1, generatedAt: new Date().toISOString().slice(0, 10),
      fields: { places: ['inglês', 'português', 'região', 'x', 'y', 'largura', 'altura'], wild: ['lugar', 'jeito', 'nível mín.', 'nível máx.', 'chance %'], legend: 'requisitos dos encontros únicos lidos da ROM: insígnias mínimas da região, Liga vencida, tipo, item na mochila, nº da regra própria' }, methods: METHODS,
      grid: { x: 1, y: 2, cell: 8 }, maps: { hoenn: [240, 160], johto: [240, 160], kanto: [192, 144], sevii123: [192, 144], sevii45: [192, 144], sevii67: [192, 144] } },
    places, wild, legend,
  };
  await writeFile(OUT, JSON.stringify(out) + '\n');
  if (noObj.length) console.log(`encontros únicos sem objeto com a flag no mapa: ${noObj.join(" ")}`);
  console.log(`encontros: ${X.wildCount} mapas (${skipped} sem lugar), ${slots} posições, ${statics} únicos, ${Object.keys(wild).length} espécies, ${places.length} lugares`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

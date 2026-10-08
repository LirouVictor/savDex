// Jogos oficiais de DS: Diamond/Pearl, Platinum, HeartGold/SoulSilver (Gen 4) e Black/White, Black 2/White 2 (Gen 5).
// Formato público (Project Pokémon/PKHeX), conferido com saves reais de Diamond/Pearl, Platinum, HeartGold/SoulSilver,
// Black e Black 2 (exports do Action Replay, .duc): checksums de todos os Pokémon e os stats salvos da equipe.
//
// Pokémon de 136 bytes (+ 100 de batalha na equipe; 84 na Gen 5): PID, checksum e 4 blocos de 32 bytes
// embaralhados pela ordem ((PID >> 13) & 31) % 24 e criptografados com o gerador do jogo
// (semente = checksum; cada u16 XOR (semente >> 16) depois de semente = semente × 0x41C64E6D + 0x6073).
// Os dados de batalha da equipe usam o PID como semente.

import { t } from '../i18n.js';
import { natureFromId } from './natures.js';
import { calcStats, hiddenPowerType } from './stats.js';
import { STAT_ORDER } from './save.js';
import { levelForExp } from './gen3.js';
import { countBits, dexBits, dexSummary, playTime, summary } from './summary.js';

const ORDERS = ['ABCD', 'ABDC', 'ACBD', 'ACDB', 'ADBC', 'ADCB', 'BACD', 'BADC', 'BCAD', 'BCDA', 'BDAC', 'BDCA',
  'CABD', 'CADB', 'CBAD', 'CBDA', 'CDAB', 'CDBA', 'DABC', 'DACB', 'DBAC', 'DBCA', 'DCAB', 'DCBA'];
const BOX = 136;
export const NDS_GAMES = {
  dp: { id: 'dp', name: 'Pokémon Diamond/Pearl', short: 'Diamond/Pearl', gen: 4 },
  pt: { id: 'pt', name: 'Pokémon Platinum', short: 'Platinum', gen: 4 },
  hgss: { id: 'hgss', name: 'Pokémon HeartGold/SoulSilver', short: 'HG/SS', gen: 4 },
  bw: { id: 'bw', name: 'Pokémon Black/White', short: 'Black/White', gen: 5 },
  b2w2: { id: 'b2w2', name: 'Pokémon Black 2/White 2', short: 'Black 2/White 2', gen: 5 },
};
// Gen 4: bloco geral e bloco das caixas, cada um com rodapé (contador, ..., tamanho, assinatura, id, CRC-16);
// duas cópias, em 0 e em 0x40000. Diamond/Pearl e Platinum: rodapé de 20 bytes, caixas seguidas (sem espaço entre elas).
// HeartGold/SoulSilver: rodapé de 16 bytes, cada caixa em 0x1000 bytes.
const GEN4 = {
  dp: { general: [0, 0xC100], storage: [0xC100, 0x121E0], footer: 0x14, trainer: 0x64, party: 0x94, boxes: 4, boxSize: 30 * BOX, names: 0x11EE4 },
  pt: { general: [0, 0xCF2C], storage: [0xCF2C, 0x121E4], footer: 0x14, trainer: 0x68, party: 0x9C, boxes: 4, boxSize: 30 * BOX, names: 0x11EE4 },
  hgss: { general: [0, 0xF628], storage: [0xF700, 0x12310], footer: 0x10, trainer: 0x64, party: 0x94, boxes: 0, boxSize: 0x1000, names: 0x12008 },
};
const PARTITION = 0x40000, MAGIC = 0x20060623;
// Resumo: dinheiro, insígnias e tempo de jogo logo depois do treinador; Pokédex com a marca 0xBEEFCAFE
// e os capturados logo depois (Gen 4: +4; Gen 5: +8). HG/SS também guarda as 8 insígnias de Kanto.
// Conferido com os saves reais (D/P 24h49m; nos outros, os valores máximos do jogo).
const DEX_MAGIC = 0xBEEFCAFE;
const GEN4_DEX = { dp: 0x12DC, pt: 0x1328, hgss: 0x12B8 };
const GEN5_MISC = { bw: { money: 0x21200, dex: 0x21600 }, b2w2: { money: 0x21100, dex: 0x21400 } };
// Gen 5: cópia de segurança das caixas (e dos nomes delas)
const GEN5_BACKUP = { bw: 0x24000, b2w2: 0x26000 };
const BALLS = [null, 'Master Ball', 'Ultra Ball', 'Great Ball', 'Poké Ball', 'Safari Ball', 'Net Ball', 'Dive Ball', 'Nest Ball',
  'Repeat Ball', 'Timer Ball', 'Luxury Ball', 'Premier Ball', 'Dusk Ball', 'Heal Ball', 'Quick Ball', 'Cherish Ball', 'Fast Ball',
  'Level Ball', 'Lure Ball', 'Heavy Ball', 'Love Ball', 'Friend Ball', 'Moon Ball', 'Sport Ball', 'Park Ball', 'Dream Ball'];

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const view = u8 => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

function crc16(u8) {
  let c = 0xFFFF;
  for (const x of u8) {
    c ^= x << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c;
}

/** XOR com o gerador do jogo (u16 a u16), devolvendo uma cópia. */
function crypt(src, seed) {
  const out = new Uint8Array(src);
  const dv = view(out);
  let s = seed >>> 0;
  for (let i = 0; i + 1 < out.length; i += 2) {
    s = (Math.imul(s, 0x41C64E6D) + 0x6073) >>> 0;
    dv.setUint16(i, dv.getUint16(i, true) ^ (s >>> 16), true);
  }
  return out;
}

// Texto da Gen 4: tabela própria de 16 bits. Só os caracteres conferidos; o resto vira "?".
function gen4Char(c) {
  if (c >= 0x121 && c <= 0x12A) return String.fromCharCode(48 + c - 0x121);
  if (c >= 0x12B && c <= 0x144) return String.fromCharCode(65 + c - 0x12B);
  if (c >= 0x145 && c <= 0x15E) return String.fromCharCode(97 + c - 0x145);
  return { 0x1DE: ' ', 0x1AE: '.', 0x1B3: '’', 0x1BE: '-', 0x1AC: '?' }[c] ?? '?';
}
function text(u8, o, len, gen) {
  const dv = view(u8);
  let s = '';
  for (let i = 0; i < len; i += 2) {
    const c = dv.getUint16(o + i, true);
    if (c === 0xFFFF || c === 0) break;
    s += gen === 4 ? gen4Char(c) : String.fromCharCode(c);
  }
  return s.trim();
}

/** Decodifica um Pokémon (136 bytes do PC ou o registro inteiro da equipe). */
function decodeMon(src, gen) {
  const dv = view(src);
  const pid = dv.getUint32(0, true), checksum = dv.getUint16(6, true);
  if (!pid && !checksum) return null; // posição vazia
  const data = crypt(src.subarray(8, BOX), checksum);
  let sum = 0;
  const ddv = view(data);
  for (let i = 0; i < 128; i += 2) sum = (sum + ddv.getUint16(i, true)) & 0xFFFF;
  if (sum !== checksum) return { bad: true };
  // Blocos na ordem A, B, C, D (cada um com 32 bytes)
  const order = ORDERS[((pid >>> 13) & 31) % 24];
  const p = new Uint8Array(BOX);
  p.set(src.subarray(0, 8));
  for (const [i, c] of [...order].entries()) p.set(data.subarray(i * 32, i * 32 + 32), 8 + 'ABCD'.indexOf(c) * 32);
  const v = view(p);
  const species = v.getUint16(8, true);
  if (!species) return null;
  const ivWord = v.getUint32(0x38, true);
  const flags = p[0x40];
  const mon = {
    pid, speciesId: species, itemId: v.getUint16(0x0A, true), otId: v.getUint32(0x0C, true), exp: v.getUint32(0x10, true),
    friendship: p[0x14], abilityId: p[0x15],
    evs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, p[0x18 + j]])),
    moves: [0, 1, 2, 3].map(j => ({ id: v.getUint16(0x28 + 2 * j, true), pp: p[0x30 + j] })).filter(m => m.id),
    ivs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, (ivWord >>> (5 * j)) & 31])),
    isEgg: !!((ivWord >>> 30) & 1), nicknamed: !!(ivWord >>> 31),
    female: !!(flags & 2), genderless: !!(flags & 4), form: flags >>> 3,
    natureId: gen === 5 ? p[0x41] : null, hiddenAbility: gen === 5 && !!(p[0x42] & 1),
    nickname: text(p, 0x48, 22, gen), otName: text(p, 0x68, 16, gen),
    ballId: (gen === 4 && p[0x86]) || p[0x83], metLevel: p[0x84] & 0x7F,
    raw: hex(src.subarray(0, BOX)),
  };
  if (src.length > BOX) {
    const b = crypt(src.subarray(BOX), pid);
    const bv = view(b);
    mon.level = b[4];
    mon.hp = bv.getUint16(6, true);
    // Ordem no save: HP, Atk, Def, Spe, SpA, SpD (a mesma de STAT_ORDER)
    mon.stats = Object.fromEntries(STAT_ORDER.map((k, j) => [k, bv.getUint16(8 + 2 * j, true)]));
  }
  return mon;
}

/** Blocos válidos de um jogo da Gen 4 (o mais novo de cada um entre as duas cópias do save). */
function gen4Blocks(u8, L) {
  const dv = view(u8);
  const pick = ([off, size]) => {
    let best = null;
    for (const base of [0, PARTITION]) {
      const o = base + off;
      if (o + size > u8.length) continue;
      const end = o + size;
      if (dv.getUint32(end - 12, true) !== size || dv.getUint32(end - 8, true) !== MAGIC) continue;
      if (crc16(u8.subarray(o, end - L.footer)) !== dv.getUint16(end - 2, true)) continue;
      const count = dv.getUint32(end - L.footer, true);
      if (!best || count > best.count) best = { o, count };
    }
    return best;
  };
  const general = pick(L.general), storage = pick(L.storage);
  return general && storage ? { general: general.o, storage: storage.o, index: general.count } : null;
}

/** Black/White e Black 2/White 2: equipe e treinador em posições fixas; confere pelos checksums dos Pokémon. */
function gen5Version(u8) {
  if (u8.length < 0x24000) return null;
  const dv = view(u8);
  const count = dv.getUint32(0x18E04, true);
  if (count < 1 || count > 6) return null;
  for (let i = 0; i < count; i++) {
    const m = decodeMon(u8.subarray(0x18E08 + i * 220, 0x18E08 + (i + 1) * 220), 5);
    if (!m || m.bad) return null;
  }
  const version = u8[0x1941F];
  return version === 22 || version === 23 ? 'b2w2' : 'bw';
}

/** Qual jogo de DS é o save (ou null). */
export function detectNds(u8) {
  if (u8.length < 0x40000) return null;
  for (const id of Object.keys(GEN4)) if (gen4Blocks(u8, GEN4[id])) return id;
  return gen5Version(u8);
}

/**
 * @param {Uint8Array} u8 save
 * @param {string} gameId de detectNds
 * @param {{ lost?: number }} [opts] lost = bytes do começo do save que o cabeçalho do .duc apagou
 */
export function parseNds(u8, gameId, { lost = 0 } = {}) {
  const game = NDS_GAMES[gameId];
  const gen = game.gen;
  const dv = view(u8);
  const warnings = [];
  let bad = 0;
  const read = (o, len) => {
    const m = decodeMon(u8.subarray(o, o + len), gen);
    if (m && m.bad) { bad++; return null; }
    return m;
  };
  let trainer, info, party = [], boxes = [];
  if (GEN4[gameId]) {
    const L = GEN4[gameId];
    const { general: g, storage: s, index } = gen4Blocks(u8, L);
    trainer = { name: text(u8, g + L.trainer, 16, 4), tid: dv.getUint16(g + L.trainer + 0x10, true), sid: dv.getUint16(g + L.trainer + 0x12, true), saveIndex: index };
    const count = Math.min(6, dv.getUint32(g + L.party, true));
    for (let i = 0; i < count; i++) { const m = read(g + L.party + 4 + i * 236, 236); if (m) party.push({ ...m, slot: i + 1 }); }
    const tr = g + L.trainer, dex = g + GEN4_DEX[gameId];
    const badges = countBits(u8, tr + 0x1A, 8) + (gameId === 'hgss' ? countBits(u8, tr + 0x1F, 8) : 0);
    info = summary({
      playTime: playTime(dv.getUint16(tr + 0x22, true), u8[tr + 0x24], u8[tr + 0x25], 'confirmado'),
      money: { value: dv.getUint32(tr + 0x14, true), confidence: 'confirmado' },
      badges: { count: badges, total: gameId === 'hgss' ? 16 : 8, confidence: 'confirmado' },
      dex: dv.getUint32(dex, true) === DEX_MAGIC ? dexSummary(dexBits(u8, dex + 4, 493), 493) : null,
    });
    for (let b = 0; b < 18; b++) {
      const slots = [];
      const o = s + L.boxes + b * L.boxSize;
      for (let k = 0; k < 30; k++) { const m = read(o + k * BOX, BOX); if (m) slots.push({ ...m, slot: k + 1 }); }
      boxes.push({ index: b, name: text(u8, s + L.names + b * 0x28, 0x28, 4) || `BOX ${b + 1}`, slots, partial: false });
    }
  } else {
    trainer = { name: text(u8, 0x19404, 16, 5), tid: dv.getUint16(0x19414, true), sid: dv.getUint16(0x19416, true), saveIndex: null };
    const count = Math.min(6, dv.getUint32(0x18E04, true));
    for (let i = 0; i < count; i++) { const m = read(0x18E08 + i * 220, 220); if (m) party.push({ ...m, slot: i + 1 }); }
    const M = GEN5_MISC[gameId];
    info = summary({
      playTime: playTime(dv.getUint16(0x19424, true), u8[0x19426], u8[0x19427], 'confirmado'),
      money: { value: dv.getUint32(M.money, true), confidence: 'confirmado' },
      badges: { count: countBits(u8, M.money + 4, 8), total: 8, confidence: 'confirmado' },
      dex: dv.getUint32(M.dex, true) === DEX_MAGIC ? dexSummary(dexBits(u8, M.dex + 8, 649), 649) : null,
    });
    // Nomes apagados pelo cabeçalho do .duc: vale a cópia de segurança, se as caixas dela forem iguais às principais
    const backup = GEN5_BACKUP[gameId];
    const same = lost && u8.length >= backup + 0x400 + 24 * 0x1000
      && u8.subarray(0x400, 0x400 + 24 * 0x1000).every((x, i) => x === u8[backup + 0x400 + i]);
    for (let b = 0; b < 24; b++) {
      const slots = [];
      for (let k = 0; k < 30; k++) { const m = read(0x400 + b * 0x1000 + k * BOX, BOX); if (m) slots.push({ ...m, slot: k + 1 }); }
      const o = 0x04 + b * 0x28;
      const name = o >= lost ? text(u8, o, 0x28, 5) : same ? text(u8, backup + o, 0x28, 5) : '';
      boxes.push({ index: b, name: name || `BOX ${b + 1}`, slots, partial: false });
    }
  }
  if (bad) warnings.push(t('{n} Pokémon com checksum inválido (dados corrompidos) foram ignorados.', { n: bad }));
  return { game, trainer, warnings, summary: info, party, pc: { boxes } };
}

/** Tabelas do app com os golpes da geração do save e a tabela de tipos sem Fairy. */
export function ndsTables(T, G, N, gen) {
  const moves = T.moves.slice(), moveDetails = T.moveDetails.slice();
  N.moves[gen].forEach((row, id) => {
    if (!row) return;
    const [type, power, accuracy, pp, category] = row;
    moves[id] = [moves[id] ? moves[id][0] : t('Golpe {n}', { n: id }), type];
    moveDetails[id] = [power, accuracy, pp, category];
  });
  return { ...T, moves, moveDetails, typechart: G.typechart, nds: N };
}

/** Converte a leitura crua no mesmo formato de describe() do Quetzal. */
export function describeNds(raw, T) {
  const N = T.nds, gen = raw.game.gen;
  const typeName = i => T.types[i] || null;
  const shiny = (pid, otId) => (((otId & 0xFFFF) ^ (otId >>> 16) ^ (pid & 0xFFFF) ^ (pid >>> 16)) >>> 0) < 8;

  function species(p) {
    const n = p.speciesId;
    const row = N.species[gen][n];
    if (!row || !T.species[n]) return { name: t('Espécie {id}', { id: n }), form: null, showdown: null, confidence: 'desconhecido', evidence: null, spriteId: null, dexId: null, hasIcon: false, types: [], abilities: [null, null, null], baseStats: null, growth: 0 };
    const formRow = p.form ? N.forms[gen][`${n}:${p.form}`] : null;
    const [spriteForm, label, ...formData] = formRow || [0, null];
    const [t1, t2, ...base] = formData.length ? formData : [row[0], row[1], ...row.slice(3)];
    const name = T.species[n][0];
    const spriteId = spriteForm || n;
    return {
      name, form: p.isEgg ? 'ovo' : label, showdown: label && spriteForm ? `${name}-${label.replace(/ /g, '-')}` : name,
      confidence: 'confirmado', evidence: null, spriteId, dexId: spriteId, hasIcon: !spriteForm && n <= 898,
      types: [t1, t2].filter(Boolean).map(typeName), abilities: [null, null, null], baseStats: base, growth: row[2],
    };
  }
  const move = m => {
    const row = T.moves[m.id], det = T.moveDetails[m.id];
    return { id: m.id, name: row ? row[0] : t('Golpe {n}', { n: m.id }), type: row ? typeName(row[1]) : null, pp: m.pp, power: det ? det[0] : null, accuracy: det ? det[1] : null, category: det ? det[3] : null };
  };
  const item = id => (id ? { id, name: N.items[gen][id] || `Item ${id}`, confidence: N.items[gen][id] ? 'confirmado' : 'desconhecido', evidence: null } : null);
  const ball = id => ({ id, name: BALLS[id] || t('Bola {id}', { id }), confidence: BALLS[id] ? 'confirmado' : 'desconhecido', evidence: null });

  function mon(p, location, box) {
    const sp = species(p);
    const nature = natureFromId(p.natureId ?? p.pid % 25);
    const level = p.level ?? levelForExp(sp.growth, p.exp);
    const stats = p.stats || (sp.baseStats ? calcStats(sp.baseStats, p.ivs, p.evs, level, nature) : null);
    const abilityName = N.abilities[p.abilityId] || null;
    const nickname = p.isEgg ? t('Ovo') : p.nickname;
    return {
      location, where: box ? box.name : 'Equipe', boxIndex: box ? box.index : null, slot: p.slot,
      speciesId: p.speciesId, species: sp, dexNo: p.speciesId,
      nickname: nickname || sp.name, hasNickname: p.isEgg || (p.nicknamed && !!nickname),
      complete: true,
      level, levelFromExp: !p.stats, exp: p.exp,
      nature, pidNature: null,
      item: item(p.itemId),
      ability: { num: p.hiddenAbility ? 2 : 0, name: abilityName || t('Habilidade nº {n}', { n: p.abilityId }), hidden: p.hiddenAbility, confidence: abilityName ? 'confirmado' : 'desconhecido' },
      ball: ball(p.ballId),
      shiny: shiny(p.pid, p.otId),
      gender: p.genderless ? { symbol: null, name: 'sem gênero', confidence: 'confirmado' }
        : { symbol: p.female ? '♀' : '♂', name: p.female ? 'fêmea' : 'macho', confidence: 'confirmado' },
      friendship: p.friendship,
      ot: { name: p.otName, tid: p.otId & 0xFFFF, sid: p.otId >>> 16 },
      pid: p.pid,
      moves: p.moves.map(move),
      stats, statsCalculated: !p.stats && !!stats, ivs: p.ivs, evs: p.evs,
      hiddenPower: hiddenPowerType(p.ivs),
      hp: p.hp ?? null, egg: p.isEgg,
      raw: p.raw,
    };
  }

  const boxes = raw.pc.boxes.map(b => ({ ...b, slots: b.slots.map(s => mon(s, 'pc', b)) }));
  return {
    game: raw.game, trainer: raw.trainer, warnings: raw.warnings, summary: raw.summary || {},
    party: raw.party.map(p => mon(p, 'party', null)),
    pc: { ...raw.pc, boxes },
  };
}

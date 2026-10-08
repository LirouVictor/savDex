// Leitura dos saves dos jogos oficiais da Gen 3 (Ruby/Sapphire/Emerald/FireRed/LeafGreen).
// Formato público e documentado (Bulbapedia, PKHeX): Pokémon de 80 bytes (PC) e 100 bytes (equipe),
// com os 48 bytes de dados criptografados (XOR com PID ^ OT ID) e embaralhados em 4 blocos (PID % 24).

import { t } from '../i18n.js';
import { decodeText } from './charset.js';
import { natureFromId } from './natures.js';
import { calcStats, hiddenPowerType } from './stats.js';
import { SaveError, STAT_ORDER } from './save.js';
import { dexBits, dexSummary, playTime, summary } from './summary.js';

export const SECTORS_PER_SLOT = 14;
const SECTOR_SIZE = 0x1000;
const SIGNATURE = 0x08012025;
/** Bytes cobertos pelo checksum de cada seção (Emerald/FireRed/LeafGreen; Ruby/Sapphire mudam as seções 0 e 4). */
const CHECKSUM_SIZES = [0xF2C, 0xF80, 0xF80, 0xF80, 0xF08, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0x7D0];
const CHECKSUM_SIZES_RS = { 0: 0x890, 4: 0xC40 };
const PC_SIZES = [0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0x7D0];

export const GEN3 = {
  trainer: { name: 0x00, gender: 0x08, tid: 0x0A, sid: 0x0C, gameCode: 0xAC },
  party: { rse: { count: 0x234, start: 0x238 }, frlg: { count: 0x34, start: 0x38 }, size: 100 },
  pc: { currentBox: 0, monStart: 4, monSize: 80, perBox: 30, boxes: 14, boxNames: 0x8344, boxNameLen: 9 },
};

export const GAMES = {
  emerald: { id: 'emerald', name: 'Pokémon Emerald', short: 'Emerald' },
  rs: { id: 'rs', name: 'Pokémon Ruby/Sapphire', short: 'Ruby/Sapphire' },
  frlg: { id: 'frlg', name: 'Pokémon FireRed/LeafGreen', short: 'FireRed/LeafGreen' },
};

// Resumo: tempo de jogo e Pokédex na seção 0 (SaveBlock2); dinheiro e insígnias (flags) no SaveBlock1,
// que ocupa as seções 1–4 (0xF80 bytes cada). O dinheiro do Emerald e do FireRed/LeafGreen é guardado
// com XOR da chave da seção 0 (o Ruby/Sapphire não tem chave). Conferido com saves reais de Emerald, FireRed, Ruby e Sapphire.
const SUMMARY = {
  emerald: { key: 0xAC, money: 0x490, flags: 0x1270, badge: 0x867 },
  rs: { key: null, money: 0x490, flags: 0x1220, badge: 0x807 },
  frlg: { key: 0xF20, money: 0x290, flags: 0xEE0, badge: 0x820 },
};
const DEX3 = 386;

function gen3Summary(u8, dv, S, gameId) {
  const L = SUMMARY[gameId];
  const confidence = 'confirmado';
  const s0 = S[0];
  // Posição no SaveBlock1 → posição no arquivo
  const sb1 = o => S[1 + Math.floor(o / 0xF80)] + (o % 0xF80);
  const key = L.key == null ? 0 : dv.getUint32(s0 + L.key, true);
  let badges = 0;
  for (let i = 0; i < 8; i++) {
    const f = L.badge + i;
    badges += (u8[sb1(L.flags + (f >> 3))] >> (f & 7)) & 1;
  }
  return summary({
    playTime: playTime(dv.getUint16(s0 + 0x0E, true), u8[s0 + 0x10], u8[s0 + 0x11], confidence),
    money: { value: (dv.getUint32(sb1(L.money), true) ^ key) >>> 0, confidence },
    badges: { count: badges, total: 8, confidence },
    dex: dexSummary(dexBits(u8, s0 + 0x28, DEX3), DEX3),
  });
}

// Ordem dos 4 blocos de 12 bytes (Growth, Attacks, EVs/condição, Misc) para cada PID % 24
const ORDERS = ['GAEM', 'GAME', 'GEAM', 'GEMA', 'GMAE', 'GMEA', 'AGEM', 'AGME', 'AEGM', 'AEMG', 'AMGE', 'AMEG',
  'EGAM', 'EGMA', 'EAGM', 'EAMG', 'EMGA', 'EMAG', 'MGAE', 'MGEA', 'MAGE', 'MAEG', 'MEGA', 'MEAG'];

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function checksum(dv, o, size) {
  let sum = 0;
  for (let k = 0; k < size; k += 4) sum = (sum + dv.getUint32(o + k, true)) >>> 0;
  return ((sum >>> 16) + (sum & 0xFFFF)) & 0xFFFF;
}

/** Os 2 slots de 14 setores. `usable` = as 14 seções presentes. */
export function gen3Slots(dv) {
  return [0, 1].map(slot => {
    const sections = {};
    let saveIndex = -1, badChecksums = [];
    for (let i = 0; i < SECTORS_PER_SLOT; i++) {
      const o = (slot * SECTORS_PER_SLOT + i) * SECTOR_SIZE;
      if (o + SECTOR_SIZE > dv.byteLength || dv.getUint32(o + 0xFF8, true) !== SIGNATURE) continue;
      const id = dv.getUint16(o + 0xFF4, true);
      if (id >= SECTORS_PER_SLOT || sections[id] !== undefined) continue;
      sections[id] = o;
      saveIndex = Math.max(saveIndex, dv.getUint32(o + 0xFFC, true));
      const stored = dv.getUint16(o + 0xFF6, true);
      const ok = checksum(dv, o, CHECKSUM_SIZES[id]) === stored
        || (CHECKSUM_SIZES_RS[id] !== undefined && checksum(dv, o, CHECKSUM_SIZES_RS[id]) === stored);
      if (!ok) badChecksums.push(id);
    }
    const usable = Object.keys(sections).length === SECTORS_PER_SLOT;
    return { slot, sections, saveIndex, badChecksums, usable };
  });
}

/** Descriptografa um Pokémon (80 bytes) e confere o checksum. Devolve null se o espaço estiver vazio. */
export function decodeBoxMon(u8, o) {
  const dv = new DataView(u8.buffer, u8.byteOffset + o, 80);
  const pid = dv.getUint32(0, true), otId = dv.getUint32(4, true);
  if (!pid && !otId && !dv.getUint32(32, true)) return null;
  const key = (pid ^ otId) >>> 0;
  const data = new DataView(new ArrayBuffer(48));
  for (let k = 0; k < 48; k += 4) data.setUint32(k, (dv.getUint32(32 + k, true) ^ key) >>> 0, true);
  let sum = 0;
  for (let k = 0; k < 48; k += 2) sum = (sum + data.getUint16(k, true)) & 0xFFFF;
  const order = ORDERS[pid % 24];
  const at = c => order.indexOf(c) * 12;
  const G = at('G'), A = at('A'), E = at('E'), M = at('M');
  const speciesId = data.getUint16(G, true);
  if (!speciesId) return null;
  const origins = data.getUint16(M + 2, true);
  const ivWord = data.getUint32(M + 4, true);
  const evs = {}, ivs = {};
  STAT_ORDER.forEach((k, j) => { evs[k] = data.getUint8(E + j); ivs[k] = (ivWord >>> (5 * j)) & 31; });
  return {
    pid, otId,
    checksumOk: sum === dv.getUint16(28, true),
    nickname: decodeText(u8, o + 8, 10),
    otName: decodeText(u8, o + 20, 7),
    flags: u8[o + 19],
    speciesId,
    itemId: data.getUint16(G + 2, true),
    exp: data.getUint32(G + 4, true),
    friendship: data.getUint8(G + 9),
    moves: [0, 1, 2, 3].map(j => ({ id: data.getUint16(A + 2 * j, true), pp: data.getUint8(A + 8 + j) })).filter(m => m.id),
    evs, ivs,
    metLocation: data.getUint8(M + 1),
    metLevel: origins & 0x7F,
    ballId: (origins >>> 11) & 0xF,
    isEgg: ((ivWord >>> 30) & 1) === 1,
    abilityNum: ivWord >>> 31,
    raw: hex(u8.subarray(o, o + 80)),
  };
}

function readParty(u8, dv, s1, layout) {
  const count = dv.getUint32(s1 + layout.count, true);
  if (count > 6) return null;
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = s1 + layout.start + i * GEN3.party.size;
    const m = decodeBoxMon(u8, r);
    if (!m) return null;
    const stats = {};
    STAT_ORDER.forEach((k, j) => { stats[k] = dv.getUint16(r + 88 + 2 * j, true); });
    out.push({ ...m, slot: i + 1, level: u8[r + 84], hp: dv.getUint16(r + 86, true), stats, raw: hex(u8.subarray(r, r + 100)) });
  }
  return out;
}

/**
 * Ruby/Sapphire × Emerald (mesma posição da equipe). 0 em 0xAC só aparece em Ruby/Sapphire, mas lá esse campo é
 * do recorde da Battle Tower e pode ter dado. O SaveBlock2 do Ruby/Sapphire acaba em 0x890 (tamanho do checksum
 * da seção 0); o do Emerald usa a seção até 0xF2C. Conferido com saves reais de Ruby e Sapphire (0xAC ≠ 0 e tudo
 * zerado depois de 0x890) e de Emerald (dados depois de 0x890).
 */
function isRubySapphire(u8, dv, s0) {
  if (dv.getUint32(s0 + GEN3.trainer.gameCode, true) === 0) return true;
  for (let k = 0x890; k < 0xF2C; k++) if (u8[s0 + k]) return false;
  return true;
}

/** Qual jogo da Gen 3: pela posição da equipe que tem checksums válidos e, entre Ruby/Sapphire e Emerald, pela seção 0. */
export function detectGen3(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const slots = gen3Slots(dv).filter(s => s.usable);
  if (!slots.length) return null;
  slots.sort((a, b) => (a.badChecksums.length ? 1 : 0) - (b.badChecksums.length ? 1 : 0) || b.saveIndex - a.saveIndex);
  const S = slots[0].sections;
  for (const [layout, games] of [['frlg', ['frlg']], ['rse', ['emerald', 'rs']]]) {
    const party = readParty(u8, dv, S[1], GEN3.party[layout]);
    if (!party || party.some(m => !m.checksumOk)) continue;
    if (!party.length && layout === 'frlg' && dv.getUint32(S[0] + GEN3.trainer.gameCode, true) !== 1) continue;
    let game = games[0];
    if (layout === 'rse') game = isRubySapphire(u8, dv, S[0]) ? 'rs' : 'emerald';
    return { game: GAMES[game], layout, slot: slots[0] };
  }
  return null;
}

/** Lê o save (já identificado por detectGen3). Só números e textos, como parseSave do Quetzal. */
export function parseGen3(u8, found) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const { slot, layout, game } = found;
  const S = slot.sections;
  const warnings = [];
  if (slot.badChecksums.length) warnings.push(t('Checksum inválido nos setores {list}; os dados podem estar corrompidos.', { list: slot.badChecksums.join(', ') }));
  const T0 = S[0];
  const trainer = {
    name: decodeText(u8, T0 + GEN3.trainer.name, 7),
    tid: dv.getUint16(T0 + GEN3.trainer.tid, true),
    sid: dv.getUint16(T0 + GEN3.trainer.sid, true),
  };
  const party = readParty(u8, dv, S[1], GEN3.party[layout]) || [];

  // PC: seções 5–13 concatenadas (3968 bytes cada, a última 2000)
  const parts = PC_SIZES.map((size, i) => u8.subarray(S[5 + i], S[5 + i] + size));
  const pc = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  { let o = 0; for (const p of parts) { pc.set(p, o); o += p.length; } }
  const P = GEN3.pc;
  const boxes = [];
  let bad = 0;
  for (let b = 0; b < P.boxes; b++) {
    const slots = [];
    for (let s = 0; s < P.perBox; s++) {
      const m = decodeBoxMon(pc, P.monStart + (b * P.perBox + s) * P.monSize);
      if (!m) continue;
      if (!m.checksumOk) { bad++; continue; }
      slots.push({ ...m, slot: s + 1 });
    }
    boxes.push({ index: b, name: decodeText(pc, P.boxNames + b * P.boxNameLen, P.boxNameLen) || `BOX ${b + 1}`, slots, partial: false });
  }
  if (bad) warnings.push(t('{n} Pokémon do PC com checksum inválido (dados corrompidos) foram ignorados.', { n: bad }));
  return {
    slot: { index: slot.slot, saveIndex: slot.saveIndex },
    warnings, trainer, party,
    summary: gen3Summary(u8, dv, S, game.id),
    pc: { currentBox: pc[P.currentBox], boxCount: P.boxes, capacity: P.boxes * P.perBox, boxes },
  };
}

// ---------- Descrição (nomes, tipos, nível…) ----------

/** Curvas de experiência (Gen 3): 0 Medium Fast, 1 Erratic, 2 Fluctuating, 3 Medium Slow, 4 Fast, 5 Slow. */
export function expForLevel(rate, n) {
  if (n <= 1) return 0;
  const c = n ** 3;
  switch (rate) {
    case 1: return Math.floor(n <= 50 ? (c * (100 - n)) / 50 : n <= 68 ? (c * (150 - n)) / 100 : n <= 98 ? (c * Math.floor((1911 - 10 * n) / 3)) / 500 : (c * (160 - n)) / 100);
    case 2: return Math.floor(n <= 15 ? (c * (Math.floor((n + 1) / 3) + 24)) / 50 : n <= 36 ? (c * (n + 14)) / 50 : (c * (Math.floor(n / 2) + 32)) / 50);
    case 3: return Math.floor((6 * c) / 5) - 15 * n * n + 100 * n - 140;
    case 4: return Math.floor((4 * c) / 5);
    case 5: return Math.floor((5 * c) / 4);
    default: return c;
  }
}
export function levelForExp(rate, exp) {
  let level = 1;
  while (level < 100 && expForLevel(rate, level + 1) <= exp) level++;
  return level;
}

// Na Gen 3 a categoria vem do tipo do golpe
const PHYSICAL = new Set(['normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel']);
const SHOWDOWN_NAMES = { 'Nidoran♀': 'Nidoran-F', 'Nidoran♂': 'Nidoran-M' };

/**
 * Tabelas do app ajustadas para a Gen 3: golpes 1–354 com tipo/poder/precisão/PP da época e a tabela de
 * tipos sem Fairy. O resto (nomes de golpes, espécies pela Dex Nacional) vem das tabelas normais.
 */
export function gen3Tables(T, G) {
  const moves = T.moves.slice();
  const moveDetails = T.moveDetails.slice();
  G.moves.forEach((mv, id) => {
    if (!mv || !moves[id]) return;
    const [power, accuracy, pp, type] = mv;
    moves[id] = [moves[id][0], type];
    moveDetails[id] = [power, accuracy, pp, power === 0 ? 2 : PHYSICAL.has(T.types[type]) ? 0 : 1];
  });
  return { ...T, moves, moveDetails, typechart: G.typechart, gen3: G };
}

/** Converte a leitura crua no mesmo formato de describe() do Quetzal. */
export function describeGen3(raw, T, game) {
  const G = T.gen3;
  const typeName = i => T.types[i] || null;

  function species(id, isEgg) {
    const row = G.species[id];
    if (!row) return { name: t('Espécie {id}', { id }), form: null, showdown: null, confidence: 'desconhecido', evidence: null, spriteId: null, dexId: null, hasIcon: false, types: [], abilities: [null, null, null], baseStats: null, growth: 0, genderByte: 255 };
    const [national, t1, t2, a1, a2, genderByte, growth, ...base] = row;
    const name = T.species[national] ? T.species[national][0] : `#${national}`;
    return {
      name, form: isEgg ? 'ovo' : null, showdown: SHOWDOWN_NAMES[name] || name, confidence: 'confirmado', evidence: null,
      spriteId: national, dexId: national, hasIcon: national <= 898,
      types: [t1, t2].filter(Boolean).map(typeName),
      abilities: [G.abilities[a1] || null, G.abilities[a2] || null, null],
      baseStats: base, growth, genderByte,
    };
  }
  const move = m => {
    const row = T.moves[m.id], det = T.moveDetails[m.id];
    return { id: m.id, name: row ? row[0] : `Golpe ${m.id}`, type: row ? typeName(row[1]) : null, pp: m.pp, power: det ? det[0] : null, accuracy: det ? det[1] : null, category: det ? det[3] : null };
  };
  const item = id => (id ? { id, name: G.items[id] || `Item ${id}`, confidence: G.items[id] ? 'confirmado' : 'desconhecido', evidence: null } : null);
  const ability = (sp, num) => {
    const name = sp.abilities[num] || sp.abilities[0];
    return { num, name: name || t('Habilidade {n}', { n: num + 1 }), hidden: false, confidence: name ? 'confirmado' : 'desconhecido' };
  };
  const ball = id => ({ id, name: G.balls[id] || t('Bola {id}', { id }), confidence: G.balls[id] ? 'confirmado' : 'desconhecido', evidence: null });
  const gender = (sp, pid) => {
    const g = sp.genderByte;
    if (g === 255) return { symbol: null, name: 'sem gênero', confidence: 'confirmado' };
    const female = g === 254 ? true : g === 0 ? false : (pid & 0xFF) < g;
    return { symbol: female ? '♀' : '♂', name: female ? 'fêmea' : 'macho', confidence: 'confirmado' };
  };
  const shiny = (pid, otId) => (((otId & 0xFFFF) ^ (otId >>> 16) ^ (pid & 0xFFFF) ^ (pid >>> 16)) >>> 0) < 8;

  function mon(p, location, box) {
    const sp = species(p.speciesId, p.isEgg);
    const nature = natureFromId(p.pid % 25);
    const level = p.level ?? levelForExp(sp.growth, p.exp);
    const stats = p.stats || (sp.baseStats ? calcStats(sp.baseStats, p.ivs, p.evs, level, nature) : null);
    const nick = p.isEgg ? t('Ovo') : p.nickname;
    return {
      location, where: box ? box.name : 'Equipe', boxIndex: box ? box.index : null, slot: p.slot,
      speciesId: p.speciesId, species: sp,
      dexNo: sp.dexId, // número da Dex Nacional (o save guarda a numeração interna da Gen 3)
      nickname: nick || sp.name,
      hasNickname: !!nick && nick.toLowerCase() !== sp.name.toLowerCase(),
      complete: true,
      level, levelFromExp: !p.stats, exp: p.exp,
      nature, pidNature: null,
      item: item(p.itemId), ability: ability(sp, p.abilityNum), ball: ball(p.ballId),
      shiny: shiny(p.pid, p.otId), gender: gender(sp, p.pid),
      friendship: p.friendship,
      ot: { name: p.otName, tid: p.otId & 0xFFFF, sid: p.otId >>> 16 },
      pid: p.pid,
      moves: p.moves.map(move),
      stats, statsCalculated: !p.stats && !!stats, ivs: p.ivs, evs: p.evs,
      hiddenPower: hiddenPowerType(p.ivs),
      met: { level: p.metLevel, location: p.metLocation },
      hp: p.hp ?? null,
      egg: p.isEgg,
      raw: p.raw,
    };
  }

  const boxes = raw.pc.boxes.map(b => ({ ...b, slots: b.slots.map(s => mon(s, 'pc', b)) }));
  return {
    game,
    trainer: { name: raw.trainer.name, tid: raw.trainer.tid, sid: raw.trainer.sid, saveIndex: raw.slot.saveIndex },
    warnings: raw.warnings,
    summary: raw.summary || {},
    party: raw.party.map(p => mon(p, 'party', null)),
    pc: { ...raw.pc, boxes },
  };
}

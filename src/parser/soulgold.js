// Pokémon SoulGold (ROM hack de Emerald sobre uma versão recente do pokeemerald-expansion, com Johto e a Pokédex
// própria). Formato conferido com um save real (começo do jogo, versão 1.0.5) aberto com a ROM 1.2 no emulador
// (tools/gbarun.c): equipe, cartão do treinador e Pokédex; as insígnias e a chave do dinheiro foram achadas
// mudando cópias do save e vendo o que o jogo mostra.
//
// - 2 slots de 14 setores, como o Emerald (assinatura 0x08012025, 0xF80 bytes de dados por seção). O SaveBlock2
//   tem 0xB30 bytes (o checksum da seção 0 só bate com esse tamanho); o resto da seção 0 tem outros dados.
// - Treinador no SaveBlock2 (nome 0x00, TID 0x0A, SID 0x0C, tempo 0x0E/0x10/0x11, chave do dinheiro 0xB4).
// - SaveBlock1 nas seções 1–4: dinheiro 0x478 (XOR a chave), flags 0x1898 (insígnias 0x993–0x99A), Pokédex pela
//   Dex Nacional (vistos 0x31F8, capturados 0x3279, 1025 bits), equipe: contagem 0x234, Pokémon de 96 bytes em 0x238.
// - Pokémon SEM criptografia e sem checksum, num layout próprio (ver readMon). O PC (seções 5–13) guarda os
//   primeiros 76 bytes do mesmo registro: caixa atual (u32), 15 caixas × 30, nomes em 0x859C (9 bytes cada).
//   Conferido no jogo com um save com 6 Pokémon na equipe e um no PC (o registro do PC copiado para a equipe
//   numa cópia do save aparece igual no resumo do jogo).

import { t } from '../i18n.js';
import { decodeText } from './charset.js';
import { natureFromId } from './natures.js';
import { calcStats, hiddenPowerType } from './stats.js';
import { SaveError, STAT_ORDER } from './save.js';
import { levelForExp } from './gen3.js';
import { countBits, playTime, summary } from './summary.js';

export const SOULGOLD = { id: 'soulgold', name: 'Pokémon SoulGold', short: 'SoulGold' };

const SIGNATURE = 0x08012025;
const DATA = 0xF80;
const SB2_SIZE = 0xB30;
const SECTION_SIZE = { 0: SB2_SIZE, 4: 0x3C54 - 3 * DATA }; // demais: os dados vão até o fim usado (o resto é zero)
const PARTY_COUNT = 0x234, PARTY = 0x238, MON = 96, BOX_MON = 76; // equipe: os 76 do PC + 20 (6 × 96 acaba no dinheiro, 0x478)
const MONEY = 0x478, MONEY_KEY = 0xB4;
const FLAGS = 0x1898, BADGE_FLAG = 0x993;
const DEX_SEEN = 0x31F8, DEX_CAUGHT = 0x3279, DEX_BITS = 1025;
const BOXES = 15, PER_BOX = 30, BOX_NAMES = 4 + BOXES * PER_BOX * BOX_MON; // 0x859C

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function checksum(dv, o, size) {
  let sum = 0;
  for (let k = 0; k < size; k += 4) sum = (sum + dv.getUint32(o + k, true)) >>> 0;
  return ((sum >>> 16) + (sum & 0xFFFF)) & 0xFFFF;
}

function slots(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return [0, 14].map(first => {
    const sections = {};
    let index = -1;
    const bad = [];
    for (let i = first; i < first + 14; i++) {
      const o = i * 0x1000;
      const id = dv.getUint16(o + 0xFF4, true);
      if (dv.getUint32(o + 0xFF8, true) !== SIGNATURE || id > 13) return null;
      sections[id] = o;
      index = dv.getUint32(o + 0xFFC, true);
      if (checksum(dv, o, SECTION_SIZE[id] ?? DATA) !== dv.getUint16(o + 0xFF6, true)) bad.push(id);
    }
    return Object.keys(sections).length === 14 ? { sections, index, bad } : null;
  }).filter(Boolean).sort((a, b) => (a.bad.length - b.bad.length) || (b.index - a.index));
}

/** Pokémon de 76 bytes (PC) ou 96 (equipe), sem criptografia. */
function readMon(u8, o, party) {
  const dv = new DataView(u8.buffer, u8.byteOffset + o, party ? MON : BOX_MON);
  const sp = dv.getUint16(0x20, true);
  const species = sp & 0x7FF;
  if (!species) return null;
  const itemBall = dv.getUint16(0x22, true);
  const ivWord = dv.getUint32(0x48, true);
  const hpWord = dv.getUint16(0x1E, true);
  const mon = {
    pid: dv.getUint32(0, true), otId: dv.getUint32(4, true),
    nickname: decodeText(u8, o + 0x08, 12), otName: decodeText(u8, o + 0x16, 7),
    hiddenNature: u8[o + 0x14] >> 3,
    speciesId: species, itemId: itemBall & 0x3FF, ballId: itemBall >> 10,
    exp: dv.getUint32(0x24, true) & 0x1FFFFF, friendship: u8[o + 0x2B],
    // Golpes de 11 bits (como no expansion); bits 12–13 do 4º = número da habilidade (conferido no jogo)
    moves: [0, 1, 2, 3].map(j => ({ id: dv.getUint16(0x2C + 2 * j, true) & 0x7FF, pp: u8[o + 0x34 + j] })).filter(m => m.id),
    abilityNum: (dv.getUint16(0x32, true) >> 12) & 3,
    evs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, u8[o + 0x38 + j]])),
    ivs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, (ivWord >>> (5 * j)) & 31])),
    isEgg: !!((ivWord >>> 30) & 1),
    metLevel: dv.getUint16(0x46, true) & 0x7F,
    hpLost: hpWord & 0x3FFF, shinyFlag: !!((hpWord >>> 14) & 1),
    raw: hex(u8.subarray(o, o + (party ? MON : BOX_MON))),
  };
  if (party) {
    mon.level = u8[o + 0x50];
    mon.hp = dv.getUint16(0x52, true);
    mon.stats = Object.fromEntries(STAT_ORDER.map((k, j) => [k, dv.getUint16(0x54 + 2 * j, true)]));
  }
  return mon;
}

/** Os dados da equipe parecem do SoulGold (registros sem criptografia, nível e stats coerentes)? */
function plausibleParty(u8, s1) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const count = dv.getUint32(s1 + PARTY_COUNT, true);
  if (count < 1 || count > 6) return false;
  for (let i = 0; i < count; i++) {
    const m = readMon(u8, s1 + PARTY + i * MON, true);
    if (!m || m.level < 1 || m.level > 100 || !m.stats.hp || m.hp > m.stats.hp || m.speciesId > 2047) return false;
    if (m.hp + m.hpLost !== m.stats.hp && !m.isEgg) return false; // HP perdido + HP atual = HP máximo
  }
  return true;
}

/** O save é do SoulGold? (as tabelas dele são carregadas à parte, só quando precisa) */
export function isSoulGoldSave(u8) {
  if (u8.length < 0x20000) return false;
  const [slot] = slots(u8);
  // A seção 0 com checksum certo só no tamanho do SaveBlock2 do SoulGold (0xB30), e a equipe sem criptografia
  return !!slot && !slot.bad.includes(0) && plausibleParty(u8, slot.sections[1]);
}

export function parseSoulGold(u8) {
  const [slot] = slots(u8);
  if (!slot) throw new SaveError(t('Este save parece ser do Pokémon SoulGold, mas está incompleto ou corrompido.'));
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const S = slot.sections;
  const warnings = [];
  if (slot.bad.length) warnings.push(t('Checksum inválido nos setores {list}; os dados podem estar corrompidos.', { list: slot.bad.join(', ') }));
  const s0 = S[0];
  const sb1 = o => S[1 + Math.floor(o / DATA)] + (o % DATA);
  const sb1Bytes = (o, n) => Uint8Array.from({ length: n }, (_, i) => u8[sb1(o + i)]);

  const count = Math.min(6, dv.getUint32(S[1] + PARTY_COUNT, true));
  const party = [];
  for (let i = 0; i < count; i++) {
    const m = readMon(u8, S[1] + PARTY + i * MON, true);
    if (m) party.push({ ...m, slot: i + 1 });
  }

  // PC: seções 5–13 juntas (0xF80 bytes de cada)
  const pc = new Uint8Array(9 * DATA);
  for (let id = 5; id <= 13; id++) pc.set(u8.subarray(S[id], S[id] + DATA), (id - 5) * DATA);
  const boxes = [];
  for (let b = 0; b < BOXES; b++) {
    const list = [];
    for (let k = 0; k < PER_BOX; k++) {
      const m = readMon(pc, 4 + (b * PER_BOX + k) * BOX_MON, false);
      if (m) list.push({ ...m, slot: k + 1 });
    }
    boxes.push({ index: b, name: decodeText(pc, BOX_NAMES + b * 9, 9) || `Box${b + 1}`, slots: list, partial: false });
  }

  const key = dv.getUint32(s0 + MONEY_KEY, true);
  const flags = sb1Bytes(FLAGS + (BADGE_FLAG >> 3), 2);
  return {
    trainer: { name: decodeText(u8, s0, 7), tid: dv.getUint16(s0 + 0xA, true), sid: dv.getUint16(s0 + 0xC, true), saveIndex: slot.index },
    summary: {
      playTime: playTime(dv.getUint16(s0 + 0x0E, true), u8[s0 + 0x10], u8[s0 + 0x11], 'confirmado'),
      money: { value: (new DataView(sb1Bytes(MONEY, 4).buffer).getUint32(0, true) ^ key) >>> 0, confidence: 'confirmado' },
      badges: { count: countBits(flags, 0, 8, BADGE_FLAG & 7), total: 8, confidence: 'confirmado' },
    },
    caught: sb1Bytes(DEX_CAUGHT, Math.ceil(DEX_BITS / 8)),
    seen: sb1Bytes(DEX_SEEN, Math.ceil(DEX_BITS / 8)),
    warnings, party, pc: { currentBox: pc[0], boxes },
  };
}

/** Espécie pela numeração do SoulGold (src/data/soulgold.json), no formato do app. */
export function soulgoldSpecies(id, SG, T, isEgg = false) {
  const row = SG.species[id];
  if (!row) return { name: t('Espécie {id}', { id }), form: null, showdown: null, confidence: 'desconhecido', evidence: null, spriteId: null, dexId: null, hasIcon: false, types: [], abilities: [null, null, null], baseStats: null, growth: 3, genderByte: 255 };
  const [name, form, national, spriteId, icon, t1, t2, a1, a2, ha, genderByte, growth, ...base] = row;
  return {
    name, form: isEgg ? 'ovo' : form, showdown: SG.showdown[id] || name,
    confidence: 'confirmado', evidence: null, spriteId, dexId: spriteId, nationalDex: national, hasIcon: !!icon,
    types: [t1, t2].filter(Boolean).map(i => T.types[i] || null),
    abilities: [SG.abilities[a1] || null, SG.abilities[a2] || null, SG.abilities[ha] || null],
    baseStats: base, growth, genderByte,
  };
}

/** Converte a leitura crua no mesmo formato de describe() do Quetzal. */
export function describeSoulGold(raw, T, SG) {
  const typeName = i => T.types[i] || null;
  // Shiny: fórmula das gerações 6+ (1/4096, como no expansion) ou a marca do registro
  const shiny = (p) => p.shinyFlag || (((p.otId & 0xFFFF) ^ (p.otId >>> 16) ^ (p.pid & 0xFFFF) ^ (p.pid >>> 16)) >>> 0) < 16;

  const species = (id, isEgg) => soulgoldSpecies(id, SG, T, isEgg);
  // Golpes: ID do app quando há par (nome, descrição, golpes por nível); tipo, poder, PP… da ROM
  const move = m => {
    const ref = SG.moves[m.id];
    const appId = typeof ref === 'number' ? ref : null;
    const row = appId ? T.moves[appId] : null;
    const md = SG.moveData[m.id] || null;
    return {
      id: appId ?? -m.id, name: row ? row[0] : typeof ref === 'string' ? ref : t('Golpe {n}', { n: m.id }),
      type: md && md[0] !== null ? typeName(md[0]) : row ? typeName(row[1]) : null,
      pp: m.pp, power: md ? md[1] : null, accuracy: md ? md[2] : null, category: md ? md[4] : null,
    };
  };
  const item = id => (id ? { id, name: SG.items[id] || `Item ${id}`, confidence: SG.items[id] ? 'confirmado' : 'desconhecido', evidence: null } : null);
  const ball = id => ({ id, name: SG.balls[id] || t('Bola {id}', { id }), confidence: SG.balls[id] ? 'confirmado' : 'desconhecido', evidence: null });
  // Número da habilidade (0 = 1ª, 1 = 2ª, 2 ou 3 = oculta, como o jogo mostra); slot vazio = a 1ª, como no expansion
  const ability = (sp, n) => {
    const num = Math.min(n, 2);
    const name = sp.abilities[num] || sp.abilities[0];
    return { num, name: name || t('Habilidade {n}', { n: num + 1 }), hidden: num === 2 && !!sp.abilities[2], confidence: name ? 'confirmado' : 'desconhecido' };
  };
  const gender = (sp, pid) => {
    const g = sp.genderByte;
    if (g === 255) return { symbol: null, name: 'sem gênero', confidence: 'confirmado' };
    const female = g === 254 ? true : g === 0 ? false : (pid & 0xFF) < g;
    return { symbol: female ? '♀' : '♂', name: female ? 'fêmea' : 'macho', confidence: 'confirmado' };
  };

  function mon(p, location, box) {
    const sp = species(p.speciesId, p.isEgg);
    const nature = natureFromId((p.pid % 25) ^ p.hiddenNature);
    const level = p.level ?? levelForExp(sp.growth, p.exp);
    const stats = p.stats || (sp.baseStats ? calcStats(sp.baseStats, p.ivs, p.evs, level, nature) : null);
    const nick = p.isEgg ? t('Ovo') : p.nickname;
    return {
      location, where: box ? box.name : 'Equipe', boxIndex: box ? box.index : null, slot: p.slot,
      speciesId: p.speciesId, species: sp, dexNo: sp.nationalDex ?? null,
      nickname: nick || sp.name,
      hasNickname: !!nick && nick.toLowerCase() !== sp.name.toLowerCase(),
      complete: true,
      level, levelFromExp: !p.stats, exp: p.exp,
      nature, pidNature: null,
      item: item(p.itemId), ability: ability(sp, p.abilityNum), ball: ball(p.ballId),
      shiny: shiny(p), gender: gender(sp, p.pid),
      friendship: p.friendship,
      ot: { name: p.otName, tid: p.otId & 0xFFFF, sid: p.otId >>> 16 },
      pid: p.pid,
      moves: p.moves.map(move),
      stats, statsCalculated: !p.stats && !!stats, ivs: p.ivs, evs: p.evs,
      hiddenPower: hiddenPowerType(p.ivs),
      hp: p.hp ?? (stats ? Math.max(0, stats.hp - p.hpLost) : null), egg: p.isEgg,
      raw: p.raw,
    };
  }

  // Pokédex como no jogo: capturados da Pokédex de Johto (702 espécies), pela Dex Nacional
  const bit = (arr, n) => (arr[(n - 1) >> 3] >> ((n - 1) & 7)) & 1;
  const dex = { owned: SG.johto.filter(n => bit(raw.caught, n)).length, total: SG.johto.length, confidence: 'confirmado' };
  const boxes = raw.pc.boxes.map(b => ({ ...b, slots: b.slots.map(s => mon(s, 'pc', b)) }));
  return {
    game: SOULGOLD,
    trainer: raw.trainer,
    warnings: raw.warnings,
    summary: summary({ ...raw.summary, dex }),
    party: raw.party.map(p => mon(p, 'party', null)),
    pc: { ...raw.pc, boxes },
  };
}

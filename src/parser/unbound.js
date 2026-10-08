// Pokémon Unbound (ROM hack de FireRed com o motor CFRU). Formato conferido com 2 saves reais da versão 2.1
// (os stats salvos da equipe batem com a fórmula usando os stats base do Unbound) e com o leitor do
// Unbound Cloud (Skeli789/Unbound-Cloud), do mesmo autor do Unbound.
//
// - 2 slots de 14 setores (como o FireRed), assinatura própria: 0x01121999 (2.1.0 a 2.1.1.1) ou
//   0x01122000 (versões seguintes). Checksum com 0xFF0 bytes (seções 0, 4 e 13: 0xF24, 0xD98, 0x450).
// - Equipe na seção 1 (contagem em 0x34, Pokémon de 100 bytes em 0x38) SEM criptografia e com os blocos
//   sempre na ordem Growth/Attacks/EVs/Misc; a Poké Ball fica no byte 10 do bloco Growth.
// - PC: 25 caixas de Pokémon "comprimidos" de 58 bytes (sem criptografia, golpes de 10 bits, sem stats):
//   caixas 1–19 nas seções 5–13 (depois da caixa atual, u32), 20–22 nos setores físicos 30–31,
//   23–24 nas seções 2–3 e 25 na seção 0. Nomes das caixas: seção 13, 0x361, 9 bytes cada.

import { t } from '../i18n.js';
import { decodeText } from './charset.js';
import { natureFromId } from './natures.js';
import { calcStats, hiddenPowerType } from './stats.js';
import { SaveError, STAT_ORDER } from './save.js';
import { levelForExp } from './gen3.js';
import { countBits, dexBits, dexSummary, playTime, summary } from './summary.js';

export const UNBOUND_SIGNATURES = { 0x01121999: '2.1', 0x01122000: '2.1.1.2+' };
const OLD_SIGNATURE = 0x01121998; // Unbound 2.0
const SECTION_SIZE = { 0: 0xF24, 4: 0xD98, 13: 0x450 };
const DATA = 0xFF0;
// Resumo, conferido no próprio jogo (save real de 11h48m aberto no emulador: cartão do treinador e Pokédex).
// O SaveBlock1 do CFRU ocupa as seções 1–4 em blocos de 0xFF0 bytes (não 0xF80 como no FireRed).
const MONEY = 0x290; // u32 sem chave (a chave do FireRed, 0xF20 da seção 0, é 0 nos saves)
const FLAGS = 0xEE0, BADGE_FLAG = 0x820; // insígnias = flags 0x820–0x827, como no FireRed (os scripts dos ginásios usam essas)
const CAUGHT = 0x38D, SEEN = 0x310; // Pokédex do DPE: capturados na RAM 0x020258B9 = SaveBlock1 (0x0202552C) + 0x38D; vistos em + 0x310
const DEX_TOTAL = 809; // a Pokédex Nacional do jogo vai até o Melmetal (a Gen 8 tem marca no save, mas não entra na lista nem na contagem)
const MON = 58;
const PER_BOX = 30;
export const UNBOUND = { id: 'unbound', name: 'Pokémon Unbound', short: 'Unbound' };

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function checksum(dv, o, size) {
  let sum = 0;
  for (let k = 0; k < size; k += 4) sum = (sum + dv.getUint32(o + k, true)) >>> 0;
  return ((sum >>> 16) + (sum & 0xFFFF)) & 0xFFFF;
}

/** Assinatura do Unbound no save (ou null). */
export function unboundSignature(u8) {
  if (u8.length < 0x20000) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for (const slot of [0, 14]) {
    const sig = dv.getUint32(slot * 0x1000 + 0xFF8, true);
    if (UNBOUND_SIGNATURES[sig] || sig === OLD_SIGNATURE) return sig;
  }
  return null;
}

/** O slot mais recente com as 14 seções e a assinatura do Unbound. */
function activeSlot(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const slots = [0, 14].map(first => {
    const sections = {};
    let index = -1, sig = 0;
    const bad = [];
    for (let i = first; i < first + 14; i++) {
      const o = i * 0x1000;
      const id = dv.getUint16(o + 0xFF4, true);
      sig = dv.getUint32(o + 0xFF8, true);
      if (!UNBOUND_SIGNATURES[sig] || id > 13) return null;
      sections[id] = o;
      index = dv.getUint32(o + 0xFFC, true);
      if (checksum(dv, o, SECTION_SIZE[id] ?? DATA) !== dv.getUint16(o + 0xFF6, true)) bad.push(id);
    }
    return Object.keys(sections).length === 14 ? { sections, index, sig, bad } : null;
  }).filter(Boolean);
  if (!slots.length) return null;
  slots.sort((a, b) => (a.bad.length - b.bad.length) || (b.index - a.index));
  return slots[0];
}

/** Pokémon de 58 bytes do PC. */
function compressed(u8, o) {
  const dv = new DataView(u8.buffer, u8.byteOffset + o, MON);
  const species = dv.getUint16(28, true);
  if (!species) return null;
  let moves = 0n;
  for (let k = 4; k >= 0; k--) moves = (moves << 8n) | BigInt(u8[o + 39 + k]);
  const ivWord = dv.getUint32(54, true);
  const ppBonuses = u8[o + 36];
  return {
    pid: dv.getUint32(0, true), otId: dv.getUint32(4, true),
    nickname: decodeText(u8, o + 8, 10), otName: decodeText(u8, o + 20, 7),
    speciesId: species, itemId: dv.getUint16(30, true), exp: dv.getUint32(32, true), friendship: u8[o + 37], ballId: u8[o + 38],
    moves: [0, 1, 2, 3].map(j => ({ id: Number((moves >> BigInt(10 * j)) & 0x3FFn), pp: null, ppUps: (ppBonuses >> (2 * j)) & 3 })).filter(m => m.id),
    evs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, u8[o + 44 + j]])),
    ivs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, (ivWord >>> (5 * j)) & 31])),
    isEgg: !!((ivWord >>> 30) & 1) || !!(u8[o + 19] & 4), hiddenAbility: !!(ivWord >>> 31),
    metLevel: dv.getUint16(52, true) & 0x7F,
    raw: hex(u8.subarray(o, o + MON)),
  };
}

/** Tempo de jogo, dinheiro, insígnias e Pokédex (capturados), como no cartão do treinador do jogo. */
function unboundSummary(s0, s0v, sec) {
  const sb1 = [1, 2, 3, 4].map(sec);
  const at = o => sb1[Math.floor(o / DATA)][o % DATA];
  const block = (o, n) => Uint8Array.from({ length: n }, (_, i) => at(o + i));
  const flags = block(FLAGS + (BADGE_FLAG >> 3), 2);
  return summary({
    playTime: playTime(s0v.getUint16(0x0E, true), s0[0x10], s0[0x11], 'confirmado'),
    money: { value: new DataView(block(MONEY, 4).buffer).getUint32(0, true), confidence: 'confirmado' },
    badges: { count: countBits(flags, 0, 8, BADGE_FLAG & 7), total: 8, confidence: 'confirmado' },
    // Vistos conferidos na tela da Pokédex do jogo (153 no save de 11h)
    dex: dexSummary(dexBits(block(CAUGHT, Math.ceil(DEX_TOTAL / 8)), 0, DEX_TOTAL), DEX_TOTAL,
      { seen: dexBits(block(SEEN, Math.ceil(DEX_TOTAL / 8)), 0, DEX_TOTAL) }),
  });
}

/** Pokémon de 100 bytes da equipe (sem criptografia, blocos na ordem G/A/E/M). */
function partyMon(u8, o) {
  const dv = new DataView(u8.buffer, u8.byteOffset + o, 100);
  const species = dv.getUint16(32, true);
  if (!species) return null;
  const ivWord = dv.getUint32(72, true);
  return {
    pid: dv.getUint32(0, true), otId: dv.getUint32(4, true),
    nickname: decodeText(u8, o + 8, 10), otName: decodeText(u8, o + 20, 7),
    speciesId: species, itemId: dv.getUint16(34, true), exp: dv.getUint32(36, true), friendship: u8[o + 41], ballId: u8[o + 42],
    moves: [0, 1, 2, 3].map(j => ({ id: dv.getUint16(44 + 2 * j, true), pp: u8[o + 52 + j] })).filter(m => m.id),
    evs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, u8[o + 56 + j]])),
    ivs: Object.fromEntries(STAT_ORDER.map((k, j) => [k, (ivWord >>> (5 * j)) & 31])),
    isEgg: !!((ivWord >>> 30) & 1), hiddenAbility: !!(ivWord >>> 31),
    metLevel: dv.getUint16(70, true) & 0x7F,
    level: u8[o + 84], hp: dv.getUint16(86, true),
    stats: Object.fromEntries(STAT_ORDER.map((k, j) => [k, dv.getUint16(88 + 2 * j, true)])),
    raw: hex(u8.subarray(o, o + 100)),
  };
}

export function parseUnbound(u8) {
  const sig = unboundSignature(u8);
  if (sig === OLD_SIGNATURE) throw new SaveError(t('Este save é do Pokémon Unbound 2.0, que o savDex ainda não lê. Saves da versão 2.1 em diante são suportados.'));
  const slot = activeSlot(u8);
  if (!slot) throw new SaveError(t('Este save parece ser do Pokémon Unbound, mas está incompleto ou corrompido.'));
  const sec = id => u8.subarray(slot.sections[id], slot.sections[id] + DATA);
  const s0 = sec(0), s0v = new DataView(s0.buffer, s0.byteOffset, DATA);
  const warnings = [];
  if (slot.bad.length) warnings.push(t('Checksum inválido nos setores {list}; os dados podem estar corrompidos.', { list: slot.bad.join(', ') }));
  if (sig !== 0x01121999) warnings.push(t('Save de uma versão do Unbound mais nova que a 2.1: espécies, golpes e itens novos podem aparecer como não mapeados.'));

  const s1 = sec(1);
  const count = Math.min(6, new DataView(s1.buffer, s1.byteOffset, DATA).getUint32(0x34, true));
  const party = [];
  for (let i = 0; i < count; i++) {
    const m = partyMon(s1, 0x38 + i * 100);
    if (m) party.push({ ...m, slot: i + 1 });
  }

  // Área das caixas, na ordem do jogo
  const parts = [sec(5).subarray(4)];
  for (let id = 6; id <= 13; id++) parts.push(sec(id));
  const physical = (n, a, b) => u8.subarray(n * 0x1000 + a, n * 0x1000 + b);
  const first19 = concat(parts).subarray(0, 19 * PER_BOX * MON);
  const all = concat([
    first19, physical(30, 0xB0C, DATA), physical(31, 0, 0xF80),
    sec(2).subarray(0xF18, DATA), sec(3).subarray(0, 0xCC0), s0.subarray(0xB0, 0xB0 + PER_BOX * MON),
  ]);
  const s13 = sec(13);
  const boxes = [];
  for (let b = 0; b < 25; b++) {
    const slots = [];
    for (let k = 0; k < PER_BOX; k++) {
      const o = (b * PER_BOX + k) * MON;
      if (o + MON > all.length) break;
      const m = compressed(all, o);
      if (m) slots.push({ ...m, slot: k + 1 });
    }
    boxes.push({ index: b, name: decodeText(s13, 0x361 + b * 9, 9) || `BOX${b + 1}`, slots, partial: false });
  }

  return {
    trainer: { name: decodeText(s0, 0, 7), tid: s0v.getUint16(0xA, true), sid: s0v.getUint16(0xC, true), saveIndex: slot.index },
    summary: unboundSummary(s0, s0v, sec),
    version: UNBOUND_SIGNATURES[sig], warnings, party, pc: { currentBox: sec(5)[0], boxes },
  };
}

function concat(list) {
  const out = new Uint8Array(list.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}

const SHOWDOWN_FORMS = { Alola: 'Alola', Galar: 'Galar', Hisui: 'Hisui', Mega: 'Mega', 'Mega X': 'Mega-X', 'Mega Y': 'Mega-Y', Gigantamax: 'Gmax', Primal: 'Primal' };

/** Espécie do Unbound pelo ID do save (unbound.json; tipos, stats, habilidades e gênero conferidos com a ROM). */
export function unboundSpecies(id, U, T, isEgg = false) {
  const row = U.species[id];
  if (!row) return { name: t('Espécie {id}', { id }), form: null, showdown: null, confidence: 'desconhecido', evidence: null, spriteId: null, dexId: null, hasIcon: false, types: [], abilities: [null, null, null], baseStats: null, growth: 3, genderByte: 255 };
  const [name, form, national, spriteId, icon, t1, t2, a1, a2, ha, genderByte, growth, ...base] = row;
  return {
    name, form: isEgg ? 'ovo' : form, showdown: form && SHOWDOWN_FORMS[form] ? `${name}-${SHOWDOWN_FORMS[form]}` : name,
    confidence: 'confirmado', evidence: null, spriteId, dexId: spriteId, nationalDex: national, hasIcon: !!icon,
    types: [t1, t2].filter(Boolean).map(i => T.types[i] || null),
    abilities: [U.abilities[a1] || null, U.abilities[a2] || null, U.abilities[ha] || null],
    baseStats: base, growth, genderByte,
  };
}

const fromApp = new WeakMap();
/**
 * ID do golpe no Unbound a partir do ID usado no app: os golpes com par no app usam o ID do app; os próprios do
 * Unbound (Leech Fang…), o ID do Unbound negativo.
 */
export function unboundMoveId(id, U) {
  if (id < 0) return -id;
  if (!fromApp.has(U)) { const m = []; U.moves.forEach((ref, i) => { if (typeof ref === 'number' && m[ref] === undefined) m[ref] = i; }); fromApp.set(U, m); }
  return fromApp.get(U)[id] ?? null;
}

/** Converte a leitura crua no mesmo formato de describe() do Quetzal. */
export function describeUnbound(raw, T, U) {
  const shiny = (pid, otId) => (((otId & 0xFFFF) ^ (otId >>> 16) ^ (pid & 0xFFFF) ^ (pid >>> 16)) >>> 0) < 16; // 1/4096, como no Unbound
  const species = (id, isEgg) => unboundSpecies(id, U, T, isEgg);
  // Tipo, poder, precisão, PP e categoria da ROM do Unbound (moveData); o nome, do app
  const move = m => {
    const ref = U.moves[m.id];
    const appId = typeof ref === 'number' ? ref : null;
    const row = appId ? T.moves[appId] : null;
    const md = U.moveData[m.id] || null;
    const pp = m.pp ?? (md && md[3] ? Math.floor((md[3] * (5 + (m.ppUps || 0))) / 5) : null);
    return {
      id: appId ?? -m.id, name: row ? row[0] : typeof ref === 'string' ? ref : t('Golpe {n}', { n: m.id }),
      type: md && md[0] !== null ? T.types[md[0]] || null : row ? T.types[row[1]] || null : null,
      pp, power: md ? md[1] : null, accuracy: md ? md[2] : null, category: md ? md[4] : null,
    };
  };
  const item = id => (id ? { id, name: U.items[id] || `Item ${id}`, confidence: U.items[id] ? 'confirmado' : 'desconhecido', evidence: null } : null);
  const ball = id => ({ id, name: U.balls[id] || t('Bola {id}', { id }), confidence: U.balls[id] ? 'confirmado' : 'desconhecido', evidence: null });
  const ability = (sp, p) => {
    const num = p.hiddenAbility && sp.abilities[2] ? 2 : (p.pid & 1) && sp.abilities[1] ? 1 : 0;
    const name = sp.abilities[num];
    return { num, name: name || t('Habilidade {n}', { n: num + 1 }), hidden: num === 2, confidence: name ? 'confirmado' : 'desconhecido' };
  };
  const gender = (sp, pid) => {
    const g = sp.genderByte;
    if (g === 255) return { symbol: null, name: 'sem gênero', confidence: 'confirmado' };
    const female = g === 254 ? true : g === 0 ? false : (pid & 0xFF) < g;
    return { symbol: female ? '♀' : '♂', name: female ? 'fêmea' : 'macho', confidence: 'confirmado' };
  };

  function mon(p, location, box) {
    const sp = species(p.speciesId, p.isEgg);
    const nature = natureFromId(p.pid % 25);
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
      item: item(p.itemId), ability: ability(sp, p), ball: ball(p.ballId),
      shiny: shiny(p.pid, p.otId), gender: gender(sp, p.pid),
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
    game: { ...UNBOUND, note: raw.version },
    trainer: raw.trainer,
    warnings: raw.warnings,
    summary: raw.summary || {},
    party: raw.party.map(p => mon(p, 'party', null)),
    pc: { ...raw.pc, boxes },
  };
}

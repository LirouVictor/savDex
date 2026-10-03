// Leitura "crua" do save do Pokémon Quetzal: devolve apenas números e textos lidos
// diretamente dos bytes. Nomes de espécie/golpe/item são resolvidos em describe.js.
// O formato está documentado em CLAUDE.md.

import { t } from '../i18n.js';
import { decodeText } from './charset.js';
import { playTime, summary } from './summary.js';

export const SAVE_SIZE = 0x20000;
export const SECTOR_SIZE = 0x1000;
export const SECTOR_DATA = 0xFF4;
export const SECTORS_PER_SLOT = 16;
export const SIGNATURE = 0x08012025;

export const FOOTER = { id: 0xFF4, checksum: 0xFF6, signature: 0xFF8, saveIndex: 0xFFC };

export const TRAINER = { name: 0x00, nameLen: 7, tid: 0x0A, sid: 0x0C };

/** Resumo: tempo de jogo (seção 0) e dinheiro (seção 1, XOR com a chave da seção 0). */
export const SUMMARY = { hours: 0x10, minutes: 0x14, seconds: 0x15, key: 0x2C, money: 0x918 };

export const PARTY = {
  count: 0x6A4,
  start: 0x6A8,
  size: 0x68,
  max: 6,
  pid: 0x00, otId: 0x04, nickname: 0x08, nicknameLen: 10, otName: 0x14, otNameLen: 7,
  /** Byte de flags: bit 3 (0x08) = shiny. */
  flags: 0x13, shinyFlag: 0x08,
  /** u16 desalinhado: provavelmente o HP atual (igual ao máximo em todos os Pokémon vistos, todos com HP cheio). */
  hp: 0x23,
  species: 0x28, item: 0x2A, exp: 0x2C, friendship: 0x31, ball: 0x32,
  moves: 0x34, pp: 0x3C, evs: 0x40, ivs: 0x50, misc: 0x54, level: 0x58, stats: 0x5A,
  /** Bits 28–29 do u32 em 0x54: número da habilidade (0 = 1ª, 1 = 2ª, 2 = oculta). */
  abilityShift: 28,
};

export const PC = {
  firstSection: 5,
  lastSection: 15,
  currentBox: 0x00,
  boxNames: 0x01,
  boxNameLen: 9,
  /** Nomes de caixa guardados no save (o jogo só usa as primeiras `boxCount`). */
  boxNameSlots: 67,
  /** Caixas que o jogo mostra (confirmado no jogo pelo autor). */
  boxCount: 37,
  wallpapers: 0x25C,
  monStart: 0x461,
  monSize: 38,
  perBox: 30,
  // Posições em bits (little-endian a partir do byte 0 do registro): [início, largura]
  bits: {
    species: [0, 11],
    item: [11, 10],
    exp10: [21, 17], // experiência ÷ 10
    ball: [38, 6], // Poké Ball (enum PokeBall do expansion; bit 43 sempre 0 nos saves vistos)
    shiny: [44, 1],
    female: [160, 1], // 1 = fêmea (ignorado pelo jogo em espécies sem gênero ou de gênero fixo)
    moves: [48, 58, 68, 78], moveWidth: 10,
    evs: 88, evWidth: 6, // EV ÷ 4, ordem HP/Atk/Def/Spe/SpA/SpD
    ivs: 124, ivWidth: 5,
    nature: [161, 5],
    ability: [166, 2],
  },
  pp: 24,
  nickname: 28,
  nicknameLen: 10,
};

/** Ordem em que o jogo guarda EVs, IVs e stats. */
export const STAT_ORDER = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'];

export class SaveError extends Error {
  constructor(msg) { super(msg); this.name = 'SaveError'; }
}

const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

/** Checksum de setor: soma u32 LE dos 0xFF4 bytes úteis, dobrada em 16 bits. */
export function sectorChecksum(dv, offset) {
  let sum = 0;
  for (let k = 0; k < SECTOR_DATA; k += 4) sum = (sum + dv.getUint32(offset + k, true)) >>> 0;
  return ((sum >>> 16) + (sum & 0xFFFF)) & 0xFFFF;
}

function readSlots(dv) {
  return [0, 1].map(slot => {
    const sections = {};
    let saveIndex = -1, found = 0, badChecksums = [];
    for (let i = 0; i < SECTORS_PER_SLOT; i++) {
      const o = (slot * SECTORS_PER_SLOT + i) * SECTOR_SIZE;
      if (dv.getUint32(o + FOOTER.signature, true) !== SIGNATURE) continue;
      const id = dv.getUint16(o + FOOTER.id, true);
      sections[id] = o;
      found++;
      saveIndex = Math.max(saveIndex, dv.getUint32(o + FOOTER.saveIndex, true));
      if (sectorChecksum(dv, o) !== dv.getUint16(o + FOOTER.checksum, true)) badChecksums.push(id);
    }
    const usable = found >= 6 && sections[0] !== undefined && sections[1] !== undefined;
    return { slot, sections, saveIndex, found, badChecksums, usable };
  });
}

/**
 * Layout do Quetzal: 16 setores por slot, com as seções 14 e 15 (os jogos oficiais da Gen 3 usam 14).
 * Só olha a estrutura; a coerência dos dados é conferida depois (load.js).
 */
export function isQuetzalLayout(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (u8.length < SAVE_SIZE) return false;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return readSlots(dv).some(s => s.sections[14] !== undefined && s.sections[15] !== undefined && s.sections[0] !== undefined && s.sections[1] !== undefined);
}

/**
 * Lê o save e devolve os dados crus.
 * @param {ArrayBuffer|Uint8Array} input
 */
export function parseSave(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (u8.length < SAVE_SIZE) {
    throw new SaveError(t('O arquivo tem {n} bytes; um save de Pokémon de GBA tem {size} (128 KB).', { n: u8.length, size: SAVE_SIZE }));
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const warnings = [];

  const slots = readSlots(dv).filter(s => s.usable);
  if (!slots.length) throw new SaveError(t('Não encontrei a assinatura de save do GBA neste arquivo. Confira se é o .sav do Quetzal.'));
  // Prefere o slot mais recente com todos os checksums válidos; se nenhum estiver íntegro, usa o mais recente.
  slots.sort((a, b) => (a.badChecksums.length === 0 ? 0 : 1) - (b.badChecksums.length === 0 ? 0 : 1) || b.saveIndex - a.saveIndex);
  const active = slots[0];
  if (active.badChecksums.length) {
    warnings.push(t('Checksum inválido nos setores {list}; os dados podem estar corrompidos.', { list: active.badChecksums.join(', ') }));
  }
  const S = active.sections;

  // Treinador
  const s0 = S[0];
  const trainer = {
    name: decodeText(u8, s0 + TRAINER.name, TRAINER.nameLen),
    tid: dv.getUint16(s0 + TRAINER.tid, true),
    sid: dv.getUint16(s0 + TRAINER.sid, true),
  };

  // Equipe: registros de 104 bytes sem criptografia
  const s1 = S[1];
  const partyCount = Math.min(u8[s1 + PARTY.count], PARTY.max);
  const party = [];
  for (let i = 0; i < partyCount; i++) {
    const r = s1 + PARTY.start + i * PARTY.size;
    const ivWord = dv.getUint32(r + PARTY.ivs, true);
    const evs = {}, ivs = {}, stats = {};
    STAT_ORDER.forEach((k, j) => {
      evs[k] = u8[r + PARTY.evs + j];
      ivs[k] = (ivWord >>> (5 * j)) & 31;
      stats[k] = dv.getUint16(r + PARTY.stats + 2 * j, true);
    });
    party.push({
      slot: i + 1,
      pid: dv.getUint32(r + PARTY.pid, true),
      otId: dv.getUint32(r + PARTY.otId, true),
      nickname: decodeText(u8, r + PARTY.nickname, PARTY.nicknameLen),
      otName: decodeText(u8, r + PARTY.otName, PARTY.otNameLen),
      speciesId: dv.getUint16(r + PARTY.species, true),
      itemId: dv.getUint16(r + PARTY.item, true),
      exp: dv.getUint32(r + PARTY.exp, true),
      friendship: u8[r + PARTY.friendship],
      ballId: u8[r + PARTY.ball],
      shiny: (u8[r + PARTY.flags] & PARTY.shinyFlag) !== 0,
      hp: dv.getUint16(r + PARTY.hp, true),
      moves: [0, 1, 2, 3].map(j => ({ id: dv.getUint16(r + PARTY.moves + 2 * j, true), pp: u8[r + PARTY.pp + j] })).filter(m => m.id),
      evs, ivs, stats,
      level: u8[r + PARTY.level],
      abilityNum: (dv.getUint32(r + PARTY.misc, true) >>> PARTY.abilityShift) & 3,
      misc: dv.getUint32(r + PARTY.misc, true),
      raw: hex(u8.subarray(r, r + PARTY.size)),
    });
  }

  // PC: setores 5..15 concatenados (0xFF4 bytes úteis de cada)
  const parts = [];
  for (let id = PC.firstSection; id <= PC.lastSection; id++) {
    if (S[id] === undefined) { warnings.push(t('Setor {id} do PC ausente.', { id })); continue; }
    parts.push(u8.subarray(S[id], S[id] + SECTOR_DATA));
  }
  const pc = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  { let o = 0; for (const p of parts) { pc.set(p, o); o += p.length; } }

  const boxNames = [];
  for (let b = 0; b < PC.boxNameSlots; b++) {
    boxNames.push(decodeText(pc, PC.boxNames + b * PC.boxNameLen, PC.boxNameLen) || `BOX${b + 1}`);
  }
  const capacity = Math.max(0, Math.floor((pc.length - PC.monStart) / PC.monSize));
  const readableBoxes = Math.min(PC.boxCount, Math.ceil(capacity / PC.perBox));
  if (capacity < PC.boxCount * PC.perBox) {
    warnings.push(t('Os setores do PC só comportam {n} Pokémon; o esperado eram {total}. As caixas que não couberam não são lidas.', { n: capacity, total: PC.boxCount * PC.perBox }));
  }

  const boxes = [];
  for (let b = 0; b < readableBoxes; b++) {
    const slotsOut = [];
    for (let s = 0; s < PC.perBox && b * PC.perBox + s < capacity; s++) {
      const o = PC.monStart + (b * PC.perBox + s) * PC.monSize;
      const e = pc.subarray(o, o + PC.monSize);
      if (!e.some(x => x)) continue;
      const bits = readBits(e, 24);
      const B = PC.bits;
      const speciesId = bitField(bits, ...B.species);
      if (!speciesId) continue;
      const evs = {}, ivs = {};
      STAT_ORDER.forEach((k, j) => {
        evs[k] = bitField(bits, B.evs + j * B.evWidth, B.evWidth) * 4;
        ivs[k] = bitField(bits, B.ivs + j * B.ivWidth, B.ivWidth);
      });
      slotsOut.push({
        slot: s + 1,
        speciesId,
        nickname: decodeText(e, PC.nickname, PC.nicknameLen),
        itemId: bitField(bits, ...B.item),
        exp: bitField(bits, ...B.exp10) * 10,
        ballId: bitField(bits, ...B.ball),
        shiny: bitField(bits, ...B.shiny) === 1,
        femaleBit: bitField(bits, ...B.female),
        natureId: bitField(bits, ...B.nature),
        abilityNum: bitField(bits, ...B.ability),
        evs, ivs,
        moves: B.moves.map((bit, j) => ({ id: bitField(bits, bit, B.moveWidth), pp: e[PC.pp + j] })).filter(m => m.id),
        raw: hex(e),
      });
    }
    boxes.push({ index: b, name: boxNames[b], slots: slotsOut, partial: (b + 1) * PC.perBox > capacity });
  }

  // Tempo de jogo 2 bytes depois da posição da Gen 3 oficial; dinheiro com XOR da chave, como no Emerald,
  // mas em outras posições. Conferidos no jogo: save com 59h20m49s (a tela, aberta logo depois, mostrava
  // 59:21:18) e ₽ 1 247 386; nos 3 saves antigos a chave muda e o dinheiro decodificado é sempre ₽ 1 315 986.
  const key = dv.getUint32(s0 + SUMMARY.key, true);
  const info = summary({
    playTime: playTime(dv.getUint16(s0 + SUMMARY.hours, true), u8[s0 + SUMMARY.minutes], u8[s0 + SUMMARY.seconds], 'confirmado'),
    money: { value: (dv.getUint32(s1 + SUMMARY.money, true) ^ key) >>> 0, confidence: 'confirmado' },
  });

  return {
    slot: { index: active.slot, saveIndex: active.saveIndex },
    warnings,
    trainer,
    summary: info,
    party,
    pc: { currentBox: pc[PC.currentBox], boxCount: PC.boxCount, capacity, boxes },
  };
}

/** Lê os primeiros `n` bytes como inteiro little-endian (BigInt). */
export function readBits(bytes, n) {
  let v = 0n;
  for (let k = n - 1; k >= 0; k--) v = (v << 8n) | BigInt(bytes[k]);
  return v;
}

export function bitField(bits, offset, width) {
  return Number((bits >> BigInt(offset)) & ((1n << BigInt(width)) - 1n));
}

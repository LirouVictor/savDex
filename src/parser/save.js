// Leitura "crua" do save do Pokémon Quetzal: devolve apenas números e textos lidos
// diretamente dos bytes. Nomes de espécie/golpe/item são resolvidos em describe.js.
// O formato está documentado em CLAUDE.md.

import { t } from '../i18n.js';
import { decodeText } from './charset.js';
import { countBits, dexBits, dexSummary, playTime, summary, bitList, badgeSummary } from './summary.js';

export const SAVE_SIZE = 0x20000;
export const SECTOR_SIZE = 0x1000;
export const SECTOR_DATA = 0xFF4;
export const SECTORS_PER_SLOT = 16;
export const SIGNATURE = 0x08012025;

export const FOOTER = { id: 0xFF4, checksum: 0xFF6, signature: 0xFF8, saveIndex: 0xFFC };

export const TRAINER = { name: 0x00, nameLen: 7, tid: 0x0A, sid: 0x0C };

/**
 * Resumo: tempo de jogo (seção 0), dinheiro (seção 1, XOR com a chave da seção 0), insígnias (8 flags na
 * seção 1 a partir do bit `badgeBit`) e Pokédex (capturados pela Dex Nacional na seção 4, logo depois do
 * bloco marcado "ROP"). O Quetzal tem também campanhas em **Johto** e **Kanto**, com Pokédex e insígnias próprias na
 * seção 4; o jogo mostra as da região do mapa atual (grupo do mapa em `0x474` da seção 1, com o bloco "REG" na
 * seção 4): Johto 34–35, Kanto 36–39, Hoenn os outros. Conferido no jogo (ROM PT-BR no emulador): o save de Kanto
 * mostra Pokédex 702, 8 insígnias e ₽ 29 785 679; em cópias, trocar o grupo do mapa muda a região mostrada, e
 * zerar/preencher os bytes de cada região muda os números na tela (Johto: 0xFF em 0xE2 dá 6 insígnias, em 0xE3
 * dá 2; Pokédex de 0x1CC a 0x24D).
 * O jogo conta 1034 bits da Pokédex: os 1025 da Dex Nacional e 9 espécies próprias do Quetzal.
 * Insígnias de Hoenn: bit 7 de 0x14F e bits 0–6 de 0x150 (como no Emerald, que também começa num bit 7). Conferido
 * no jogo: apagar cada bit numa cópia tira uma insígnia da tela; o bit 1 de 0x14F é o da Pokédex. A posição antiga
 * (bit 6 de 0x151) só batia por coincidência e dava 7 num save com 6.
 */
export const SUMMARY = {
  hours: 0x10, minutes: 0x14, seconds: 0x15, key: 0x2C, money: 0x918,
  badgeBit: 0x14F * 8 + 7, dexTag: 0x9B4, dex: 0x9D0, dexTotal: 1025, dexBits: 1034,
  mapGroup: 0x474, regTag: 0xA8,
  regions: [
    { id: 'johto', groups: [34, 35], dex: 0x1CC, badgeBit: 0xE2 * 8 + 2 },
    { id: 'kanto', groups: [36, 37, 38, 39], dex: 0x3D4, badgeBit: 0x2CC * 8 },
  ],
};

export const PARTY = {
  count: 0x6A4,
  start: 0x6A8,
  size: 0x68,
  max: 6,
  pid: 0x00, otId: 0x04, nickname: 0x08, nicknameLen: 10, otName: 0x14, otNameLen: 7,
  /** Byte de flags: bit 3 (0x08) = shiny. */
  flags: 0x13, shinyFlag: 0x08,
  /** u16 desalinhado: HP atual (Haunter ferido com 33 de 66, Pelipper com 243 de 324; os outros cheios). */
  hp: 0x23,
  species: 0x28, item: 0x2A, exp: 0x2C, friendship: 0x31, ball: 0x32,
  moves: 0x34, pp: 0x3C, evs: 0x40, ivs: 0x50, misc: 0x54, level: 0x58, stats: 0x5A,
  /** Bits 28–29 do u32 em 0x54: número da habilidade (0 = 1ª, 1 = 2ª, 2 = oculta). */
  abilityShift: 28,
};

export const PC = {
  firstSection: 5,
  lastSection: 15,
  /**
   * Bytes do PC em cada seção: 0xF80, como no pokeemerald (o resto até 0xFF4 fica vazio). Conferido com
   * um save em inglês com 397 Pokémon no PC: com 0xFF4, os registros saem deslocados a partir da 2ª seção.
   */
  sectionData: 0xF80,
  currentBox: 0x00,
  boxNames: 0x01,
  boxNameLen: 9,
  /** Nomes de caixa guardados no save (o jogo só usa as primeiras `boxCount`). */
  boxNameSlots: 67,
  wallpapers: 0x25C,
  monStart: 0x461,
  perBox: 30,
  // Posições em bits (little-endian a partir do byte 0 do registro): [início, largura]; iguais nos dois formatos
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
    hp: [168, 16], // HP atual (só no registro de 38 bytes)
  },
  nicknameLen: 10,
  /**
   * Formatos do registro do PC (o jogo troca dados por caixas). 38 bytes (saves PT-BR): 24 bytes de dados
   * (com o HP atual), PP e apelido; 37 caixas, conferidas no jogo pelo autor. 31 bytes (um save em inglês): os
   * mesmos 168 primeiros bits, sem HP nem PP, e o apelido; 45 caixas (a 45ª tem Pokémon e uma 46ª não cabe nas
   * seções). 21 bytes (outro save em inglês): só os 168 bits, sem apelido; 67 caixas (o número de nomes de
   * caixa guardados; uma 68ª não cabe).
   */
  formats: [
    { monSize: 38, dataBytes: 24, pp: 24, nickname: 28, hp: true, boxCount: 37 },
    { monSize: 31, dataBytes: 21, pp: null, nickname: 21, hp: false, boxCount: 45 },
    { monSize: 21, dataBytes: 21, pp: null, nickname: null, hp: false, boxCount: 67 },
  ],
  /** Limites do Quetzal (ROM): espécies até 1528, golpes até 848, exp até o máximo da curva Medium Slow. */
  maxSpecies: 1528,
  maxMove: 848,
  maxExp: 1059860,
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

  // PC: setores 5..15 concatenados (0xF80 bytes úteis de cada)
  const parts = [];
  for (let id = PC.firstSection; id <= PC.lastSection; id++) {
    if (S[id] === undefined) { warnings.push(t('Setor {id} do PC ausente.', { id })); continue; }
    parts.push(u8.subarray(S[id], S[id] + PC.sectionData));
  }
  const pc = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  { let o = 0; for (const p of parts) { pc.set(p, o); o += p.length; } }

  const boxNames = [];
  for (let b = 0; b < PC.boxNameSlots; b++) {
    boxNames.push(decodeText(pc, PC.boxNames + b * PC.boxNameLen, PC.boxNameLen) || `BOX${b + 1}`);
  }
  const F = pcFormat(pc);
  const capacity = Math.max(0, Math.floor((pc.length - PC.monStart) / F.monSize));
  const readableBoxes = Math.min(F.boxCount, Math.ceil(capacity / PC.perBox));
  if (capacity < F.boxCount * PC.perBox) {
    warnings.push(t('Os setores do PC só comportam {n} Pokémon; o esperado eram {total}. As caixas que não couberam não são lidas.', { n: capacity, total: F.boxCount * PC.perBox }));
  }

  const boxes = [];
  for (let b = 0; b < readableBoxes; b++) {
    const slotsOut = [];
    for (let s = 0; s < PC.perBox && b * PC.perBox + s < capacity; s++) {
      const e = pcRecord(pc, F, b * PC.perBox + s);
      if (!e.some(x => x)) continue;
      const bits = readBits(e, F.dataBytes);
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
        nickname: F.nickname === null ? '' : decodeText(e, F.nickname, PC.nicknameLen),
        itemId: bitField(bits, ...B.item),
        exp: bitField(bits, ...B.exp10) * 10,
        ballId: bitField(bits, ...B.ball),
        shiny: bitField(bits, ...B.shiny) === 1,
        femaleBit: bitField(bits, ...B.female),
        natureId: bitField(bits, ...B.nature),
        abilityNum: bitField(bits, ...B.ability),
        hp: F.hp ? bitField(bits, ...B.hp) : null,
        evs, ivs,
        // O registro de 31 bytes não guarda PP
        moves: B.moves.map((bit, j) => ({ id: bitField(bits, bit, B.moveWidth), pp: F.pp === null ? null : e[F.pp + j] })).filter(m => m.id),
        raw: hex(e),
      });
    }
    boxes.push({ index: b, name: boxNames[b], slots: slotsOut, partial: (b + 1) * PC.perBox > capacity });
  }

  // Tempo de jogo 2 bytes depois da posição da Gen 3 oficial; dinheiro com XOR da chave, como no Emerald,
  // mas em outras posições. Conferidos no jogo: save com 59h20m49s (a tela, aberta logo depois, mostrava
  // 59:21:18) e ₽ 1 247 386; nos 3 saves antigos a chave muda e o dinheiro decodificado é sempre ₽ 1 315 986.
  // Insígnias e Pokédex: entre os saves de 52h e de 59h, as insígnias vão de 5 a 6 e os capturados de 63 a 65,
  // com exatamente Feebas (349) e Froakie (656) a mais; no save de 60h, 67 (+ Haunter 93 e Doublade 680).
  // Conferido com a tela do jogo: 6 insígnias e Pokédex 67. Total = Dex Nacional do expansion (1025).
  const key = dv.getUint32(s0 + SUMMARY.key, true);
  const s4 = S[4];
  const tag = (o, s) => String.fromCharCode(u8[s4 + o], u8[s4 + o + 1], u8[s4 + o + 2]) === s;
  // Jogador em Johto ou Kanto: Pokédex e insígnias da região (seção 4); senão, as de Hoenn (ver SUMMARY)
  const region = tag(SUMMARY.regTag, 'REG') ? SUMMARY.regions.find(r => r.groups.includes(u8[s1 + SUMMARY.mapGroup])) : null;
  const dexAt = region ? s4 + region.dex : tag(SUMMARY.dexTag, 'ROP') ? s4 + SUMMARY.dex : null;
  const info = summary({
    playTime: playTime(dv.getUint16(s0 + SUMMARY.hours, true), u8[s0 + SUMMARY.minutes], u8[s0 + SUMMARY.seconds], 'confirmado'),
    money: { value: (dv.getUint32(s1 + SUMMARY.money, true) ^ key) >>> 0, confidence: 'confirmado' },
    badges: region ? badgeSummary(bitList(u8, s4, 8, region.badgeBit), [region.id]) : badgeSummary(bitList(u8, s1, 8, SUMMARY.badgeBit), ['hoenn']),
    dex: dexAt === null ? null : dexSummary(dexBits(u8, dexAt, SUMMARY.dexTotal), SUMMARY.dexTotal,
      { owned: countBits(u8, dexAt, SUMMARY.dexBits) }),
  });

  return {
    slot: { index: active.slot, saveIndex: active.saveIndex },
    warnings,
    trainer,
    summary: info,
    party,
    pc: { currentBox: pc[PC.currentBox], boxCount: F.boxCount, capacity, boxes, recordSize: F.monSize },
  };
}

const pcRecord = (pc, F, i) => pc.subarray(PC.monStart + i * F.monSize, PC.monStart + (i + 1) * F.monSize);

/**
 * Formato do registro do PC (38 ou 31 bytes). O save não diz qual é: lê todos os registros nos dois formatos
 * e fica com o que der mais Pokémon coerentes (espécie, golpes, exp, natureza e habilidade dentro dos limites
 * do Quetzal). Num formato errado, quase todos os registros saem incoerentes. Empate (PC vazio): 38 bytes.
 */
export function pcFormat(pc) {
  const B = PC.bits;
  let best = PC.formats[0], bestScore = -Infinity;
  for (const F of PC.formats) {
    let score = 0;
    const n = Math.min(F.boxCount * PC.perBox, Math.floor((pc.length - PC.monStart) / F.monSize));
    for (let i = 0; i < n; i++) {
      const e = pcRecord(pc, F, i);
      if (!e.some(x => x)) continue;
      const bits = readBits(e, F.dataBytes);
      const sp = bitField(bits, ...B.species);
      if (!sp) continue;
      const ok = sp <= PC.maxSpecies
        && bitField(bits, ...B.exp10) * 10 <= PC.maxExp
        && bitField(bits, ...B.nature) <= 24
        && bitField(bits, ...B.ability) <= 2
        && B.moves.every(bit => bitField(bits, bit, B.moveWidth) <= PC.maxMove);
      score += ok ? 1 : -1;
    }
    if (score > bestScore) { best = F; bestScore = score; }
  }
  return best;
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

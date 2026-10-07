// Monta um save sintético do Pokémon SoulGold (formato em src/parser/soulgold.js), para testes que não dependem
// de um save real: Pokémon sem criptografia, SaveBlock2 de 0xB30 bytes, 15 caixas de Pokémon de 76 bytes.
import { encodeText } from '../../src/parser/charset.js';

const SIZES = [0xB30, 0xF80, 0xF80, 0xF80, 0xDD4, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80, 0xF80];

/**
 * Pokémon de 76 bytes (PC) ou 100 (equipe).
 * @param {{pid:number, otId:number, species:number, item?:number, ball?:number, exp?:number, friendship?:number,
 *   moves?:Array<[number,number]>, evs?:number[], ivs?:number[], egg?:boolean, nickname?:string, otName?:string,
 *   level?:number, hp?:number, stats?:number[]}} m
 */
export function encodeMon(m, party = false) {
  const out = new Uint8Array(party ? 100 : 76);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, m.pid >>> 0, true);
  dv.setUint32(4, m.otId >>> 0, true);
  out.set(encodeText(m.nickname ?? '', 12), 0x08);
  out[0x14] = 2;
  out[0x15] = 2;
  out.set(encodeText(m.otName ?? 'ASH', 7), 0x16);
  const maxHp = m.stats ? m.stats[0] : 0;
  dv.setUint16(0x1E, party ? Math.max(0, maxHp - (m.hp ?? maxHp)) : 0, true);
  dv.setUint16(0x20, m.species, true);
  dv.setUint16(0x22, (m.item ?? 0) | ((m.ball ?? 1) << 10), true);
  dv.setUint32(0x24, m.exp ?? 0, true);
  out[0x2B] = m.friendship ?? 70;
  (m.moves || []).forEach(([id, pp], j) => { dv.setUint16(0x2C + 2 * j, id, true); out[0x34 + j] = pp; });
  (m.evs || [0, 0, 0, 0, 0, 0]).forEach((v, j) => { out[0x38 + j] = v; });
  const ivs = m.ivs || [0, 0, 0, 0, 0, 0];
  dv.setUint32(0x48, (ivs.reduce((w, v, j) => w | (v << (5 * j)), 0) | (m.egg ? 1 << 30 : 0)) >>> 0, true);
  if (party) {
    out[0x50] = m.level ?? 1;
    out[0x51] = 0xFF;
    dv.setUint16(0x52, m.hp ?? maxHp, true);
    (m.stats || [1, 1, 1, 1, 1, 1]).forEach((v, j) => dv.setUint16(0x54 + 2 * j, v, true));
  }
  return out;
}

/** Save do SoulGold. summary: { hours, minutes, seconds, money, badges, caught: [nº nacional…] } */
export function makeSoulGoldSave(o) {
  const u8 = new Uint8Array(0x20000);
  const dv = new DataView(u8.buffer);
  const sections = Array.from({ length: 14 }, () => new Uint8Array(0x1000));
  const s0 = new DataView(sections[0].buffer);
  sections[0].set(encodeText(o.trainer.name, 7), 0);
  s0.setUint16(0x0A, o.trainer.tid, true);
  s0.setUint16(0x0C, o.trainer.sid, true);
  const key = 0x12345678;
  s0.setUint32(0xB4, key, true);
  const sb1 = (off, fn) => fn(sections[1 + Math.floor(off / 0xF80)], off % 0xF80);
  const party = o.party || [];
  new DataView(sections[1].buffer).setUint32(0x234, party.length, true);
  party.forEach((m, i) => sections[1].set(encodeMon(m, true), 0x238 + i * 100));
  const S = o.summary || { hours: 1, minutes: 2, seconds: 3, money: 3000, badges: 0, caught: [] };
  s0.setUint16(0x0E, S.hours, true);
  sections[0][0x10] = S.minutes;
  sections[0][0x11] = S.seconds;
  sb1(0x478, (sec, k) => new DataView(sec.buffer).setUint32(k, (S.money ^ key) >>> 0, true));
  for (let i = 0; i < S.badges; i++) { const f = 0x993 + i; sb1(0x1898 + (f >> 3), (sec, k) => { sec[k] |= 1 << (f & 7); }); }
  for (const n of S.caught || []) sb1(0x3279 + ((n - 1) >> 3), (sec, k) => { sec[k] |= 1 << ((n - 1) & 7); });
  // PC: área contínua das seções 5–13
  const pc = new Uint8Array(0xF80 * 9);
  for (const [i, m] of Object.entries(o.pc || {})) pc.set(encodeMon(m), 4 + Number(i) * 76);
  for (let b = 0; b < 15; b++) pc.set(encodeText(o.boxNames?.[b] ?? `Box${b + 1}`, 9), 0x859C + b * 9);
  for (let id = 5; id <= 13; id++) sections[id].set(pc.subarray((id - 5) * 0xF80, (id - 4) * 0xF80));
  sections.forEach((sec, id) => {
    const o2 = id * 0x1000;
    u8.set(sec, o2);
    let sum = 0;
    for (let k = 0; k < SIZES[id]; k += 4) sum = (sum + dv.getUint32(o2 + k, true)) >>> 0;
    dv.setUint16(o2 + 0xFF4, id, true);
    dv.setUint16(o2 + 0xFF6, ((sum >>> 16) + (sum & 0xFFFF)) & 0xFFFF, true);
    dv.setUint32(o2 + 0xFF8, 0x08012025, true);
    dv.setUint32(o2 + 0xFFC, 3, true);
  });
  // Seção 0 com dados depois do SaveBlock2 (como no jogo): o checksum só bate no tamanho 0xB30
  u8[0xFE0] = 0x42;
  return u8;
}

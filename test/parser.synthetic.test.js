import { describe as suite, it, expect } from 'vitest';
import { parseSave, SaveError, describe, natureFromPid, levelFromExp, mediumSlow } from '../src/parser/index.js';
import { sectorChecksum, SECTOR_SIZE, FOOTER, SUMMARY } from '../src/parser/save.js';
import T from '../src/data/tables.js';
import { makeSave } from './helpers/make-save.js';

const base = {
  trainer: { name: 'Ash', tid: 12345, sid: 54321 },
  party: [
    {
      pid: 15, nickname: 'Sparky', species: 25, item: 479, exp: 1000, friendship: 70, level: 22,
      moves: [[85, 24], [98, 48]], evs: [1, 2, 3, 4, 5, 6], ivs: [31, 0, 15, 30, 1, 2], stats: [50, 40, 30, 60, 45, 35],
    },
    { pid: 3, nickname: 'Annihilape', species: 1308, item: 865, level: 50, moves: [[889, 16]], abilityNum: 2 },
  ],
  pc: {
    0: { species: 66, nickname: 'SQSR', moves: [[43, 48], [249, 24], [116, 48]], exp: 150, nature: 19, ivs: [28, 14, 19, 5, 18, 29], evs: [0, 8, 0, 0, 0, 0] },
    31: { species: 951, nickname: 'Raichu', moves: [[521, 32], [94, 16]], item: 389, exp: 199100, nature: 15, abilityNum: 2, ball: 25, shiny: true,
      ivs: [31, 31, 31, 31, 31, 31], evs: [4, 0, 0, 252, 252, 0] },
    45: { species: 1469, nickname: 'Pikachu', moves: [[394, 32]], female: true },
    46: { species: 622, nickname: 'Golett', female: true },
    47: { species: 128, nickname: 'Tauros', female: true },
    1109: { species: 4, nickname: '', exp: 1059860, abilityNum: 1, nature: 24 },
  },
  olderSlot: { trainer: { name: 'Old', tid: 1, sid: 2 } },
};

suite('parseSave (save sintético)', () => {
  const raw = parseSave(makeSave(base));

  it('escolhe o slot com maior save index', () => {
    expect(raw.slot.saveIndex).toBe(10);
    expect(raw.trainer).toEqual({ name: 'Ash', tid: 12345, sid: 54321 });
  });

  it('lê a equipe sem criptografia', () => {
    expect(raw.party).toHaveLength(2);
    const p = raw.party[0];
    expect(p).toMatchObject({ slot: 1, pid: 15, nickname: 'Sparky', otName: 'Ash', speciesId: 25, itemId: 479, exp: 1000, friendship: 70, level: 22 });
    expect(p.moves).toEqual([{ id: 85, pp: 24 }, { id: 98, pp: 48 }]);
    expect(p.evs).toEqual({ hp: 1, atk: 2, def: 3, spe: 4, spa: 5, spd: 6 });
    expect(p.ivs).toEqual({ hp: 31, atk: 0, def: 15, spe: 30, spa: 1, spd: 2 });
    expect(p.stats).toEqual({ hp: 50, atk: 40, def: 30, spe: 60, spa: 45, spd: 35 });
    expect(p.otId).toBe((12345 | (54321 << 16)) >>> 0);
  });

  it('lê o PC compactado em bits nas 37 caixas', () => {
    const box1 = raw.pc.boxes[0];
    expect(box1.name).toBe('BOX1');
    expect(box1.slots[0]).toMatchObject({ slot: 1, speciesId: 66, nickname: 'SQSR', itemId: 0, exp: 150, natureId: 19, abilityNum: 0 });
    expect(box1.slots[0].moves).toEqual([{ id: 43, pp: 48 }, { id: 249, pp: 24 }, { id: 116, pp: 48 }]);
    expect(box1.slots[0].ivs).toEqual({ hp: 28, atk: 14, def: 19, spe: 5, spa: 18, spd: 29 });
    expect(box1.slots[0].evs).toEqual({ hp: 0, atk: 8, def: 0, spe: 0, spa: 0, spd: 0 });
    expect(raw.pc.boxes[1].slots.map(s => [s.slot, s.speciesId])).toEqual([[2, 951], [16, 1469], [17, 622], [18, 128]]);
    expect(raw.pc.boxes[1].slots[0]).toMatchObject({ itemId: 389, exp: 199100, natureId: 15, abilityNum: 2, ballId: 25, shiny: true });
    expect(box1.slots[0]).toMatchObject({ ballId: 1, shiny: false });
    expect(raw.pc.boxes[1].slots[0].evs).toEqual({ hp: 4, atk: 0, def: 0, spe: 252, spa: 252, spd: 0 });
    expect(raw.pc.capacity).toBe(1119); // 11 seções × 0xF80 bytes
    expect(raw.pc.recordSize).toBe(38);
    expect(raw.pc.boxes).toHaveLength(37);
    expect(raw.pc.boxes[36].slots).toEqual([expect.objectContaining({ slot: 30, speciesId: 4, nickname: '', exp: 1059860, abilityNum: 1, natureId: 24 })]);
    expect(raw.warnings).toEqual([]);
  });

  it('PC: registro que atravessa o fim de uma seção (0xF80 bytes por seção)', () => {
    // Registro 74 = bytes 0xF5D–0xF82: começa na seção 5 e termina na 6
    const r = parseSave(makeSave({ trainer: base.trainer, pc: { 74: { species: 448, nickname: 'Lucario', exp: 500000, nature: 15, moves: [[396, 16]] }, 400: { species: 1, nickname: 'Bulbasaur' } } }));
    expect(r.pc.boxes[2].slots).toEqual([expect.objectContaining({ slot: 15, speciesId: 448, nickname: 'Lucario', exp: 500000, natureId: 15 })]);
    expect(r.pc.boxes[13].slots).toEqual([expect.objectContaining({ slot: 11, speciesId: 1, nickname: 'Bulbasaur' })]);
  });

  it('PC com registros de 31 bytes (save em inglês): sem HP nem PP, 45 caixas', () => {
    const pc = {};
    ['Bulbasaur', 'Ivysaur', 'Venusaur', 'Charmander'].forEach((n, i) => { pc[i * 97] = { species: i + 1, nickname: n, exp: 1000 * (i + 1), nature: i, abilityNum: i % 3, moves: [[33, 35], [45, 40]], evs: [4, 252, 0, 252, 0, 0], ivs: [31, 30, 29, 28, 27, 26], female: i % 2 === 1 }; });
    pc[1349] = { species: 1528, nickname: '', exp: 1059860 };
    const r = parseSave(makeSave({ trainer: base.trainer, pc, pcRecord: 31 }));
    expect(r.pc.recordSize).toBe(31);
    expect(r.pc.boxCount).toBe(45);
    expect(r.pc.boxes).toHaveLength(45);
    const all = r.pc.boxes.flatMap(b => b.slots.map(s => ({ box: b.index + 1, ...s })));
    expect(all.map(s => [s.box, s.slot, s.speciesId, s.nickname])).toEqual([
      [1, 1, 1, 'Bulbasaur'], [4, 8, 2, 'Ivysaur'], [7, 15, 3, 'Venusaur'], [10, 22, 4, 'Charmander'], [45, 30, 1528, ''],
    ]);
    expect(all[1]).toMatchObject({ exp: 2000, natureId: 1, abilityNum: 1, femaleBit: 1, hp: null });
    expect(all[1].moves).toEqual([{ id: 33, pp: null }, { id: 45, pp: null }]);
    expect(all[1].evs).toEqual({ hp: 4, atk: 252, def: 0, spe: 252, spa: 0, spd: 0 });
    expect(all[1].ivs).toEqual({ hp: 31, atk: 30, def: 29, spe: 28, spa: 27, spd: 26 });
    expect(r.warnings).toEqual([]);
  });

  it('PC com registros de 21 bytes (outro save em inglês): sem apelido, HP nem PP, 67 caixas', () => {
    const pc = {};
    ['Bulbasaur', 'Ivysaur', 'Venusaur'].forEach((n, i) => { pc[i * 400] = { species: i + 1, exp: 5000 * (i + 1), nature: i + 3, abilityNum: i % 3, moves: [[33, 35]], ivs: [1, 2, 3, 4, 5, 6] }; });
    pc[2009] = { species: 1528, exp: 1059860 };
    const r = parseSave(makeSave({ trainer: base.trainer, pc, pcRecord: 21 }));
    expect([r.pc.recordSize, r.pc.boxCount, r.pc.boxes.length]).toEqual([21, 67, 67]);
    const all = r.pc.boxes.flatMap(b => b.slots.map(s => ({ box: b.index + 1, ...s })));
    expect(all.map(s => [s.box, s.slot, s.speciesId, s.nickname])).toEqual([[1, 1, 1, ''], [14, 11, 2, ''], [27, 21, 3, ''], [67, 30, 1528, '']]);
    expect(all[2]).toMatchObject({ exp: 15000, natureId: 5, abilityNum: 2, hp: null, ivs: { hp: 1, atk: 2, def: 3, spe: 4, spa: 5, spd: 6 } });
    expect(all[2].moves).toEqual([{ id: 33, pp: null }]);
    expect(r.warnings).toEqual([]);
  });

  it('resumo de Johto e de Kanto pela região do mapa atual (seção 1, 0x474) e o bloco REG', () => {
    // Monta um save e grava, no slot ativo, o bloco REG, o grupo do mapa e os dados de cada região na seção 4
    const withRegion = group => {
      const u8 = new Uint8Array(makeSave({ trainer: base.trainer, saveIndex: 10 }));
      const dv = new DataView(u8.buffer);
      for (let i = 0; i < 32; i++) {
        const o = i * 0x1000;
        if (dv.getUint32(o + 0xFFC, true) !== 10) continue;
        const id = dv.getUint16(o + 0xFF4, true);
        if (id === 1) u8[o + SUMMARY.mapGroup] = group;
        if (id === 4) {
          u8.set([0x52, 0x45, 0x47, 0x01], o + SUMMARY.regTag);
          u8[o + 0xE2] = 0xFC; u8[o + 0xE3] = 0x03; // Johto: 8 insígnias a partir do bit 2 de 0xE2
          u8[o + 0x2CC] = 0x0F; // Kanto: 4 insígnias
          u8[o + 0x1CC] = 0x07; u8[o + 0x24D] = 0x02; // Johto: Bulbasaur–Venusaur e 1 espécie própria (bit 1033)
          u8[o + 0x3D4] = 0x01; // Kanto: Bulbasaur
        }
        if (id === 1 || id === 4) dv.setUint16(o + 0xFF6, sectorChecksum(dv, o), true);
      }
      return parseSave(u8).summary;
    };
    const johto = withRegion(34);
    expect([johto.badges.count, johto.dex.owned, johto.dex.caught]).toEqual([8, 4, [1, 2, 3]]);
    const kanto = withRegion(37);
    expect([kanto.badges.count, kanto.dex.owned, kanto.dex.caught]).toEqual([4, 1, [1]]);
    const hoenn = withRegion(26);
    expect([hoenn.badges.count, hoenn.dex.owned]).toEqual([0, 0]);
  });

  it('HP atual: equipe em 0x23, PC nos bits 168–183', () => {
    const r = parseSave(makeSave({ trainer: base.trainer,
      party: [{ pid: 1, species: 94, level: 29, hp: 33, stats: [66, 40, 40, 60, 70, 40] }],
      pc: { 0: { species: 93, exp: 20000, hp: 41 } } }));
    expect(r.party[0].hp).toBe(33);
    expect(r.pc.boxes[0].slots[0].hp).toBe(41);
    expect(describe(r, T).party[0].hp).toBe(33);
  });

  it('lê o número da habilidade da equipe (bits 28–29 de 0x54)', () => {
    expect(raw.party.map(p => p.abilityNum)).toEqual([0, 2]);
  });

  it('cai para o slot anterior se o mais recente tiver checksum inválido', () => {
    const u8 = makeSave({ ...base, rotate: 0 });
    u8[SECTOR_SIZE * 0 + 0x20] ^= 0xFF; // corrompe a seção 0 do slot novo
    const r = parseSave(u8);
    expect(r.trainer.name).toBe('Old');
    expect(r.slot.saveIndex).toBe(9);
  });

  it('rejeita arquivos pequenos ou sem assinatura', () => {
    expect(() => parseSave(new Uint8Array(1000))).toThrow(SaveError);
    expect(() => parseSave(new Uint8Array(0x20000))).toThrow(/assinatura/);
  });

  it('checksum confere com o que foi gravado', () => {
    const u8 = makeSave(base);
    const dv = new DataView(u8.buffer);
    for (let i = 0; i < 32; i++) {
      const o = i * SECTOR_SIZE;
      expect(sectorChecksum(dv, o)).toBe(dv.getUint16(o + FOOTER.checksum, true));
    }
  });
});

suite('describe', () => {
  const d = describe(parseSave(makeSave(base)), T);

  it('resolve nomes, tipos, natureza e item', () => {
    const p = d.party[0];
    expect(p.species).toMatchObject({ name: 'Pikachu', confidence: 'confirmado', spriteId: 25, hasIcon: true, types: ['electric'] });
    expect(p.hasNickname).toBe(true);
    expect(p.nature).toEqual({ id: 15, name: 'Modest', plus: 'spa', minus: 'atk' });
    expect(p.item).toMatchObject({ id: 479, name: 'Life Orb', confidence: 'confirmado' });
    expect(p.moves.map(m => [m.name, m.type])).toEqual([['Thunderbolt', 'electric'], ['Quick Attack', 'normal']]);
    expect(p.ot).toEqual({ name: 'Ash', tid: 12345, sid: 54321 });
    expect(p.ability).toMatchObject({ num: 0, name: 'Static', hidden: false, confidence: 'confirmado' });
  });

  it('usa a tabela manual para IDs do Quetzal e item 865', () => {
    const a = d.party[1];
    expect(a.species).toMatchObject({ name: 'Annihilape', confidence: 'confirmado', spriteId: 979 });
    expect(a.hasNickname).toBe(false);
    expect(a.item).toMatchObject({ name: 'Lucarionite Z', confidence: 'confirmado' });
    expect(a.ability).toMatchObject({ num: 2, name: 'Defiant', hidden: true, confidence: 'confirmado' });
    const raichu = d.pc.boxes[1].slots[0];
    expect(raichu.species).toMatchObject({ name: 'Raichu', form: 'Alola', showdown: 'Raichu-Alola', spriteId: 10100 });
    expect(raichu.species.types).toEqual(['electric', 'psychic']);
    expect(raichu).toMatchObject({ level: 58, levelFromExp: true, exp: 199100 });
    expect(raichu.nature.name).toBe('Modest');
    expect(raichu.item.name).toBe('Aloraichium Z');
    expect(raichu.ability).toMatchObject({ name: 'Surge Surfer', hidden: true }); // sem oculta: vale a 1ª
    expect(raichu.shiny).toBe(true);
    expect(raichu.ball).toMatchObject({ id: 25, name: 'Radiant Ball', confidence: 'confirmado' });
    expect(raichu.gender).toMatchObject({ symbol: '♂', name: 'macho' });
    // Gênero da equipe pelo byte baixo do PID (15 < 127 → fêmea no Pikachu, taxa 4/8)
    expect(d.party[0].gender).toMatchObject({ symbol: '♀', name: 'fêmea' });
    expect(d.party[0].ball).toMatchObject({ id: 1, name: 'Poké Ball', confidence: 'confirmado' });
    expect(d.party[0].shiny).toBe(false);
    const pika = d.pc.boxes[1].slots[1];
    expect(pika.species.spriteId).toBeNull();
    // Forma própria sem dados na PokeAPI: tipos e habilidades da espécie base, como "provável"
    expect(pika.species.types).toEqual(['electric']);
    expect(pika.ability).toMatchObject({ name: 'Static', confidence: 'provável' });
    expect(pika.gender).toMatchObject({ symbol: '♀', confidence: 'confirmado' });
    // Gênero fixo da espécie vence o bit: Golett sem gênero, Tauros só macho
    expect(d.pc.boxes[1].slots[2].gender).toMatchObject({ symbol: null, name: 'sem gênero' });
    expect(d.pc.boxes[1].slots[3].gender).toMatchObject({ symbol: '♂' });
  });

  it('PC sem apelido usa o nome da espécie; stats são calculados pelos stats base', () => {
    const c = d.pc.boxes[36].slots[0];
    expect(c.nickname).toBe('Charmander');
    expect(c).toMatchObject({ complete: false, level: 100, item: null, statsCalculated: true, friendship: null });
    // Charmander nv. 100, IVs/EVs 0, Quirky (neutra): base 39/52/43/60/50/65
    expect(c.stats).toEqual({ hp: 188, atk: 109, def: 91, spa: 125, spd: 105, spe: 135 });
    expect(c.nature.name).toBe('Quirky');
    expect(c.ability.name).toBe('Blaze'); // sem 2ª habilidade, vale a 1ª
  });

  it('confiança do item depende da faixa de ID', () => {
    const items = describe(parseSave(makeSave({ trainer: base.trainer, party: [
      { pid: 0, species: 25, item: 479 }, { pid: 0, species: 25, item: 600 }, { pid: 0, species: 25, item: 866 },
    ] })), T).party.map(m => [m.item.name, m.item.confidence]);
    expect(items).toEqual([['Life Orb', 'confirmado'], [T.items[600], 'provável'], ['Item 866', 'desconhecido']]);
  });

  it('IDs desconhecidos usam o apelido', () => {
    const raw = parseSave(makeSave({ trainer: base.trainer, party: [{ pid: 0, nickname: 'Mystery', species: 1999 }] }));
    const m = describe(raw, T).party[0];
    expect(m.species).toMatchObject({ name: 'Mystery', confidence: 'desconhecido', spriteId: null });
  });
});

suite('levelFromExp (Medium Slow)', () => {
  it('converte experiência em nível', () => {
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(135)).toBe(5);
    expect(levelFromExp(134)).toBe(4);
    expect(levelFromExp(1059860)).toBe(100);
    expect(levelFromExp(2_000_000)).toBe(100);
    expect(mediumSlow(100)).toBe(1059860);
  });
});

suite('natureFromPid', () => {
  it('segue (PID & 0xFF) % 25, como no Quetzal', () => {
    expect(natureFromPid(0).name).toBe('Hardy');
    expect(natureFromPid(0)).toMatchObject({ plus: null, minus: null });
    expect(natureFromPid(225 + 13)).toMatchObject({ name: 'Jolly', plus: 'spe', minus: 'spa' });
    // Serperior (macho) e Tyranitar (fêmea) do save real: PID % 25 daria Gentle; o jogo mostra Modest
    expect(natureFromPid(0x1F0).name).toBe('Modest');
    expect(natureFromPid(0x10F).name).toBe('Modest');
    expect(natureFromPid(0xFFFFFFFF).name).toBe('Bold'); // 255 % 25 = 5
  });
});

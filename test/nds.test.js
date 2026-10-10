import { describe as suite, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadSave, isNds } from '../src/parser/load.js';
import { calcStats } from '../src/parser/stats.js';
import { makeHgssSave, makeGen4Save, makeBwSave, wrapDuc } from './helpers/make-nds.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';
import N from '../src/data/nds.json';

const trainer = { name: 'Lyra', tid: 12345, sid: 54321 };
const otId = ((trainer.sid << 16) | trainer.tid) >>> 0;
const shinyPid = (((trainer.tid ^ trainer.sid) << 16) | 3) >>> 0;
const load = bytes => loadSave(bytes, T, G, null, N).data;
const sameStats = m => calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature);

suite('Jogos de DS: Diamond/Pearl, Platinum, HeartGold/SoulSilver, Black/White e Black 2/White 2', () => {
  it('Diamond/Pearl: blocos menores que os do Platinum, treinador e equipe nas posições do HG/SS; .dsv do DeSmuME', () => {
    const save = makeGen4Save({ game: 'dp', trainer, saveCount: 9, boxNames: ['BOX 1', 'FAVES'],
      party: [{ pid: 7, otId, species: 483, ability: 46, exp: 1250000, level: 100, stats: [341, 220, 236, 279, 438, 277] }],
      pc: { 30: { pid: 8, otId, species: 25, ability: 9, exp: 5000 } } });
    // .dsv = save + rodapé do DeSmuME
    const footer = new TextEncoder().encode('|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:' + '\0'.repeat(24) + '|-DESMUME SAVE-|');
    const dsv = new Uint8Array(save.length + footer.length);
    dsv.set(save);
    dsv.set(footer, save.length);
    const d = load(dsv);
    expect(d.game).toMatchObject({ id: 'dp', name: 'Pokémon Diamond/Pearl', gen: 4 });
    expect(d.trainer).toMatchObject({ name: 'Lyra', tid: 12345, sid: 54321, saveIndex: 9 });
    expect(d.party[0].species.name).toBe('Dialga');
    expect(d.pc.boxes[1]).toMatchObject({ name: 'FAVES' });
    expect(d.pc.boxes[1].slots[0].species.name).toBe('Pikachu');
  });

  it('resumo: tempo de jogo, dinheiro, insígnias (16 no HG/SS) e Pokédex', () => {
    const summary = { hours: 24, minutes: 49, seconds: 27, money: 3000, badges: 10, owned: [1, 25, 493] };
    for (const game of ['dp', 'pt', 'hgss']) {
      const d = load(makeGen4Save({ game, trainer, summary, party: [{ pid: 1, otId, species: 1, level: 5 }] }));
      expect(d.summary).toEqual({
        playTime: { h: 24, m: 49, s: 27, confidence: 'confirmado' },
        money: { value: 3000, confidence: 'confirmado' },
        badges: expect.objectContaining(game === 'hgss' ? { count: 10, total: 16, confidence: 'confirmado', icons: [...Array(8)].map((_, i) => 9 + i).concat([...Array(8)].map((_, i) => 1 + i)) } : { count: 8, total: 8, confidence: 'confirmado', icons: [25, 26, 27, 28, 29, 30, 31, 32] }),
        dex: expect.objectContaining({ owned: 3, total: 493, confidence: 'confirmado' }),
      });
    }
  });

  it('save state do DeSmuME (.dst): erro explicando que não é o save', () => {
    const dst = new Uint8Array(0x50000);
    dst.set(new TextEncoder().encode('DeSmuME SState'));
    expect(() => load(dst)).toThrow(/save state do DeSmuME/);
  });

  it('HG/SS (.duc): treinador, equipe com stats salvos, PC, forma, gênero, natureza pelo PID e golpes da Gen 4', () => {
    const save = wrapDuc(makeHgssSave({
      trainer, boxNames: ['FAVES'],
      party: [{ pid: shinyPid, otId, species: 35, ability: 56, item: 234, exp: 1000000, level: 100, moves: [[204, 32]], ivs: [31, 31, 31, 31, 31, 31], stats: [345, 189, 196, 166, 222, 228], female: true }],
      pc: { 0: { pid: 25, otId, species: 479, form: 2, ability: 26, exp: 1000, genderless: true, nickname: 'SPARKY' } },
    }));
    expect(isNds(save)).toBe(true);
    const d = load(save);
    expect(d.game).toMatchObject({ id: 'hgss', gen: 4 });
    expect(d.trainer).toMatchObject({ name: 'Lyra', tid: 12345, sid: 54321, saveIndex: 5 });
    const c = d.party[0];
    expect(c.species).toMatchObject({ name: 'Clefairy', types: ['normal'] }); // Normal até a Gen 5
    expect(c).toMatchObject({ level: 100, shiny: true });
    expect(c.gender.name).toBe('fêmea');
    expect(c.item.name).toBe('Leftovers');
    expect(c.ability.name).toBe('Cute Charm');
    expect(c.nature.id).toBe(shinyPid % 25);
    expect(c.moves.map(m => [m.name, m.type, m.pp])).toEqual([['Charm', 'normal', 32]]); // Charm era Normal
    expect(Object.values(c.stats)).toEqual([345, 189, 196, 166, 222, 228]);
    const rotom = d.pc.boxes[0].slots[0];
    expect(d.pc.boxes[0].name).toBe('FAVES');
    expect(rotom.species).toMatchObject({ name: 'Rotom', form: 'Wash', types: ['electric', 'ghost'] }); // Electric/Water só na Gen 5
    expect(rotom).toMatchObject({ nickname: 'SPARKY', hasNickname: true });
    expect(rotom.gender.name).toBe('sem gênero');
    expect(rotom.stats).toEqual(sameStats(rotom));
  });

  it('Platinum: rodapé de 20 bytes, treinador e equipe em outras posições, caixas seguidas', () => {
    const save = wrapDuc(makeGen4Save({
      game: 'pt', trainer, saveCount: 58, boxNames: ['HAVE FUN', 'TWO'],
      party: [{ pid: 25, otId, species: 235, ability: 20, item: 234, exp: 1000000, level: 100, stats: [313, 79, 105, 249, 76, 128] }],
      pc: { 0: { pid: 1, otId, species: 487, form: 1, ability: 46, exp: 1250000 }, 31: { pid: 2, otId, species: 201, form: 1, ability: 26, exp: 100 } },
    }));
    expect(isNds(save)).toBe(true);
    const d = load(save);
    expect(d.game).toMatchObject({ id: 'pt', name: 'Pokémon Platinum', gen: 4 });
    expect(d.trainer).toMatchObject({ name: 'Lyra', tid: 12345, sid: 54321, saveIndex: 58 });
    expect(d.party[0].species.name).toBe('Smeargle');
    expect(d.party[0].ability.name).toBe('Own Tempo');
    expect(Object.values(d.party[0].stats)).toEqual([313, 79, 105, 249, 76, 128]);
    expect(d.pc.boxes).toHaveLength(18);
    expect(d.pc.boxes.slice(0, 3).map(b => b.name)).toEqual(['HAVE FUN', 'TWO', 'BOX 3']);
    expect(d.pc.boxes[0].slots[0].species).toMatchObject({ name: 'Giratina', form: 'Origin' });
    expect(d.pc.boxes[1].slots[0]).toMatchObject({ slot: 2 });
    expect(d.pc.boxes[1].slots[0].species).toMatchObject({ name: 'Unown', form: 'B' });
    // HG/SS e Platinum não se confundem (tamanhos de bloco diferentes)
    expect(load(wrapDuc(makeHgssSave({ trainer, party: [{ pid: 1, otId, species: 1, level: 5 }] }))).game.id).toBe('hgss');
  });

  it('Black/White: natureza e habilidade oculta guardadas no Pokémon', () => {
    const save = makeBwSave({
      trainer,
      party: [{ pid: 7, otId, species: 643, ability: 163, item: 267, exp: 1250000, level: 100, nature: 15, moves: [[406, 16]], stats: [341, 220, 236, 279, 438, 277], genderless: true }],
      pc: { 31: { pid: 9, otId, species: 9, ability: 44, hidden: true, nature: 5, exp: 125000 } },
    });
    const d = load(save);
    expect(d.game.id).toBe('bw');
    expect(d.warnings).toEqual([]);
    const r = d.party[0];
    expect(r.species.name).toBe('Reshiram');
    expect(r.nature.name).toBe('Modest');
    expect([r.item.name, r.ability.name, r.moves[0].name]).toEqual(['Wise Glasses', 'Turboblaze', 'Dragon Pulse']);
    const b = d.pc.boxes[1].slots[0];
    expect(b).toMatchObject({ slot: 2 });
    expect(b.ability).toMatchObject({ name: 'Rain Dish', hidden: true });
    expect(b.nature.name).toBe('Bold');
  });

  it('Black 2 (.duc com o save no começo do arquivo): nomes das caixas apagados vêm da cópia de segurança', () => {
    const save = makeBwSave({ trainer, version: 23, boxNames: ['HAVE FUN', 'EVENTS+'],
      party: [{ pid: 1, otId, species: 646, form: 2, ability: 164, level: 100, exp: 1250000 }], pc: { 30: { pid: 5, otId, species: 1, exp: 100 } } });
    const d = load(wrapDuc(save, { overlay: true }));
    expect(d.game.id).toBe('b2w2');
    expect(d.warnings).toEqual([]);
    expect(d.party[0].species).toMatchObject({ name: 'Kyurem', form: 'Black' });
    expect(d.pc.boxes.slice(0, 3).map(b => b.name)).toEqual(['HAVE FUN', 'EVENTS+', 'BOX 3']);
    expect(d.pc.boxes[1].slots[0].species.name).toBe('Bulbasaur');
    // Sem a cópia de segurança igual, os nomes apagados viram BOX n
    const changed = wrapDuc(save, { overlay: true });
    changed[0x26400] ^= 1;
    expect(load(changed).pc.boxes[0].name).toBe('BOX 1');
  });
});

// Saves reais (exports do Action Replay DS): HeartGold/SoulSilver, Black, Platinum e Black 2
suite.skipIf(!existsSync('fixtures/hgss.duc') || !existsSync('fixtures/bw.duc'))('Jogos de DS com saves reais', () => {
  it('HG/SS: checksums, stats da equipe = fórmula, formas e 354 Pokémon no PC', () => {
    const d = load(readFileSync('fixtures/hgss.duc'));
    expect(d.game.id).toBe('hgss');
    expect(d.trainer).toMatchObject({ name: 'Memory', tid: 58613, sid: 35994 });
    expect(d.warnings).toEqual([]);
    for (const m of d.party) expect(sameStats(m)).toEqual(m.stats);
    const pc = d.pc.boxes.flatMap(b => b.slots);
    expect(pc).toHaveLength(354);
    expect(pc.filter(m => m.species.confidence !== 'confirmado' || m.ability.confidence !== 'confirmado')).toEqual([]);
    const forms = new Set(pc.filter(m => m.species.form).map(m => `${m.species.name}-${m.species.form}`));
    for (const f of ['Rotom-Wash', 'Giratina-Origin', 'Deoxys-Speed', 'Unown-B']) expect(forms.has(f)).toBe(true);
  });

  it('Black: checksums, stats da equipe = fórmula (Reshiram) e 457 Pokémon no PC', () => {
    const d = load(readFileSync('fixtures/bw.duc'));
    expect(d.game.id).toBe('bw');
    expect(d.party[0].species.name).toBe('Reshiram');
    for (const m of d.party) expect(sameStats(m)).toEqual(m.stats);
    expect(d.pc.boxes.flatMap(b => b.slots)).toHaveLength(457);
    expect(d.pc.boxes[0].name).toBe('HAVE FUN');
  });
});

suite.skipIf(!existsSync('fixtures/dp.duc'))('Diamond/Pearl com save real', () => {
  it('checksums, stats da equipe = fórmula (menos um Pokémon editado) e 43 Pokémon no PC', () => {
    const d = load(readFileSync('fixtures/dp.duc'));
    expect(d.game.id).toBe('dp');
    expect(d.trainer).toMatchObject({ name: 'Ash', tid: 49553, sid: 21680 });
    expect(d.warnings).toEqual([]);
    expect(d.party.map(m => m.species.name)).toEqual(['Squirtle', 'Vaporeon', 'Arceus', 'Empoleon', 'Pikachu', 'Dialga']);
    // O Vaporeon tem 255 EVs em todos os stats (1530, impossível no jogo): foi editado, e os stats salvos não seguem a natureza do PID
    expect(d.party.filter(m => { const c = sameStats(m); return Object.keys(c).some(k => c[k] !== m.stats[k]); }).map(m => m.species.name)).toEqual(['Vaporeon']);
    expect(Object.values(d.party[1].evs)).toEqual([255, 255, 255, 255, 255, 255]);
    // Pokédex: a marca 0xBEEFCAFE na posição certa; bits além do 493 (save editado) não contam
    expect(d.summary).toEqual({
      playTime: { h: 24, m: 49, s: 27, confidence: 'confirmado' },
      money: { value: 999999, confidence: 'confirmado' },
      badges: expect.objectContaining({ count: 8, total: 8, confidence: 'confirmado' }),
      dex: expect.objectContaining({ owned: 493, total: 493, confidence: 'confirmado' }),
    });
    const pc = d.pc.boxes.flatMap(b => b.slots);
    expect(pc).toHaveLength(43);
    expect(pc.filter(m => m.species.confidence !== 'confirmado' || m.ability.confidence !== 'confirmado')).toEqual([]);
  });
});

suite.skipIf(!existsSync('fixtures/dppt.duc') || !existsSync('fixtures/b2w2.duc'))('Platinum e Black 2 com saves reais', () => {
  it('Platinum: checksums, stats da equipe = fórmula, 354 Pokémon no PC', () => {
    const d = load(readFileSync('fixtures/dppt.duc'));
    expect(d.game.id).toBe('pt');
    expect(d.trainer).toMatchObject({ name: 'Memory', tid: 55032, sid: 23455 });
    expect(d.warnings).toEqual([]);
    expect(d.party).toHaveLength(3);
    for (const m of d.party) expect(sameStats(m)).toEqual(m.stats);
    const pc = d.pc.boxes.flatMap(b => b.slots);
    expect(pc).toHaveLength(354);
    expect(d.pc.boxes.map(b => b.name).slice(0, 2)).toEqual(['HAVE FUN', 'COLLECTN']);
    expect(d.summary).toMatchObject({ money: { value: 999999 }, badges: expect.objectContaining({ count: 8, total: 8 }), dex: expect.objectContaining({ owned: 493, total: 493 }) });
    expect(pc.filter(m => m.species.confidence !== 'confirmado' || m.ability.confidence !== 'confirmado')).toEqual([]);
  });

  it('Black 2 (save no começo do .duc): stats da equipe = fórmula, formas da Gen 5 e 458 Pokémon no PC', () => {
    const d = load(readFileSync('fixtures/b2w2.duc'));
    expect(d.game.id).toBe('b2w2');
    expect(d.trainer).toMatchObject({ name: 'Memory', tid: 39175, sid: 52713 });
    expect(d.warnings).toEqual([]);
    for (const m of d.party) expect(sameStats(m)).toEqual(m.stats);
    expect(d.party.map(m => m.species.form).filter(Boolean)).toEqual(['Black', 'Therian', 'Therian', 'Therian']);
    expect(d.pc.boxes.flatMap(b => b.slots)).toHaveLength(458);
    expect(d.pc.boxes.map(b => b.name).slice(0, 2)).toEqual(['HAVE FUN', 'EVENTS+']);
    expect(d.summary).toMatchObject({ playTime: { h: 999, m: 59, s: 59 }, money: { value: 9999999 }, badges: expect.objectContaining({ count: 8 }), dex: expect.objectContaining({ owned: 649, total: 649 }) });
  });
});

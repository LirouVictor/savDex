import { describe as suite, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { loadSave } from '../src/parser/load.js';
import { calcStats } from '../src/parser/stats.js';
import { natureFromId } from '../src/parser/natures.js';
import { expForLevel, levelForExp } from '../src/parser/gen3.js';
import { unwrap } from '../src/parser/container.js';
import { makeSave } from './helpers/make-save.js';
import { makeGen3Save, wrapSharkPort } from './helpers/make-gen3.js';
import T from '../src/data/tables.js';
import G from '../src/data/gen3.json';

const trainer = { name: 'MAY', tid: 12345, sid: 54321 };
const otId = ((trainer.sid << 16) | trainer.tid) >>> 0;
const SWAMPERT = 285, PIKACHU = 25, MUDKIP = 283; // numeração interna da Gen 3
const tackle = 33, surf = 57, charm = 204;
const base = id => G.species[id].slice(7);

// Swampert nível 50, Adamant (3), shiny (PID ^ OT ID dá 5), stats salvos = fórmula
const swPid = (((trainer.tid ^ trainer.sid) << 16) | 0x0005) >>> 0;
const swIvs = [31, 31, 31, 31, 31, 31], swEvs = [0, 252, 0, 0, 0, 4];
const swStats = (() => {
  const ord = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'];
  const o = (arr) => Object.fromEntries(ord.map((k, i) => [k, arr[i]]));
  const s = calcStats(base(SWAMPERT), o(swIvs), o(swEvs), 50, natureFromId(swPid % 25));
  return ord.map(k => s[k]);
})();
const party = [{ pid: swPid, otId, species: SWAMPERT, item: 13, exp: 117360, moves: [[surf, 15], [tackle, 35]], ivs: swIvs, evs: swEvs, level: 50, stats: swStats, ball: 4, nickname: 'TANK' }];
const pc = {
  0: { pid: 0x20, otId, species: PIKACHU, exp: 1000, moves: [[charm, 20]], ball: 3 }, // 0x20 = 32 < 127 → fêmea
  31: { pid: 0x99, otId, species: MUDKIP, exp: 0, egg: true },
};

suite('Gen 3 oficial: detecção e leitura', () => {
  it('Emerald: equipe descriptografada, nome, natureza, shiny, stats e item', () => {
    const { data, T: T3 } = loadSave(makeGen3Save({ game: 'emerald', trainer, party, pc }), T, G);
    expect(data.game.id).toBe('emerald');
    expect(data.trainer).toMatchObject({ name: 'MAY', tid: 12345, sid: 54321 });
    const s = data.party[0];
    expect(s.species).toMatchObject({ name: 'Swampert', dexId: 260, types: ['water', 'ground'] });
    expect(s).toMatchObject({ nickname: 'TANK', hasNickname: true, level: 50, shiny: true });
    expect(s.nature.name).toBe(natureFromId(swPid % 25).name);
    expect(s.ability.name).toBe('Torrent');
    expect(s.ball.name).toBe('Poké Ball');
    expect(s.item.name).toBe('Potion'); // item 13 na Gen 3
    expect(Object.values(s.stats)).toEqual(expect.arrayContaining(swStats));
    expect(s.moves.map(m => [m.name, m.type, m.power, m.category])).toEqual([['Surf', 'water', 95, 1], ['Tackle', 'normal', 35, 0]]);
    expect(T3.typechart).toBe(G.typechart);
  });

  it('PC: nível pela curva da espécie, gênero pelo PID, ovo e tipos da Gen 3', () => {
    const { data } = loadSave(makeGen3Save({ game: 'emerald', trainer, party, pc }), T, G);
    const [pika, egg] = [data.pc.boxes[0].slots[0], data.pc.boxes[1].slots[0]];
    expect(pika).toMatchObject({ level: 10, levelFromExp: true, statsCalculated: true });
    expect(pika.gender.name).toBe('fêmea');
    expect(pika.ball.name).toBe('Great Ball');
    expect(pika.moves[0]).toMatchObject({ name: 'Charm', type: 'normal' }); // Fairy só a partir da Gen 6
    expect(egg).toMatchObject({ egg: true, nickname: 'Ovo' });
    expect(egg.species.form).toBe('ovo');
  });

  it('Ruby/Sapphire (0 em 0xAC, ou recorde da Battle Tower sem os dados do Emerald) e FireRed/LeafGreen (equipe em outro lugar)', () => {
    expect(loadSave(makeGen3Save({ game: 'rs', trainer, party }), T, G).data.game.id).toBe('rs');
    // Recorde da Battle Tower em 0xAC: continua Ruby/Sapphire (antes virava Emerald e o dinheiro saía com a chave errada)
    const rs = loadSave(makeGen3Save({ game: 'rs', trainer, party, towerRecord: 0xC9C7BFC7, summary: { hours: 1, minutes: 2, seconds: 3, money: 999999, badges: 8, owned: [1] } }), T, G).data;
    expect(rs.game.id).toBe('rs');
    expect(rs.summary.money.value).toBe(999999);
    expect(loadSave(makeGen3Save({ game: 'emerald', trainer, party }), T, G).data.game.id).toBe('emerald');
    const fr = loadSave(makeGen3Save({ game: 'frlg', trainer, party, pc }), T, G).data;
    expect(fr.game.id).toBe('frlg');
    expect(fr.party[0].species.name).toBe('Swampert');
  });

  it('resumo: tempo de jogo, dinheiro (com a chave), insígnias e Pokédex nos 3 layouts', () => {
    const summary = { hours: 38, minutes: 12, seconds: 5, money: 124560, badges: 5, owned: [1, 25, 151, 386] };
    for (const game of ['emerald', 'frlg', 'rs']) {
      const { data } = loadSave(makeGen3Save({ game, trainer, party, summary }), T, G);
      const conf = 'confirmado';
      expect(data.summary).toEqual({
        playTime: { h: 38, m: 12, s: 5, confidence: conf },
        money: { value: 124560, confidence: conf },
        badges: expect.objectContaining({ count: 5, total: 8, confidence: conf }),
        dex: expect.objectContaining({ owned: 4, total: 386, confidence: conf }),
      });
    }
  });

  it('Pokémon do PC com checksum errado é ignorado, com aviso', () => {
    const u8 = makeGen3Save({ game: 'emerald', trainer, party, pc });
    // corrompe um byte criptografado do Pikachu (PC começa na seção 5, setor 5; +4 do cabeçalho; +32 até os dados)
    u8[5 * 0x1000 + 4 + 40] ^= 0xFF;
    const dv = new DataView(u8.buffer);
    let sum = 0; for (let k = 0; k < 0xF80; k += 4) sum = (sum + dv.getUint32(5 * 0x1000 + k, true)) >>> 0;
    dv.setUint16(5 * 0x1000 + 0xFF6, ((sum >>> 16) + (sum & 0xFFFF)) & 0xFFFF, true);
    const { data } = loadSave(u8, T, G);
    expect(data.pc.boxes[0].slots).toHaveLength(0);
    expect(data.warnings.join(' ')).toMatch(/checksum inválido/);
  });

  it('abre o export do GameShark/SharkPort (.sps)', () => {
    const raw = makeGen3Save({ game: 'emerald', trainer, party });
    const sps = wrapSharkPort(raw);
    expect(unwrap(sps)).toMatchObject({ container: 'SharkPort (.sps)', gameCode: 'BPEE' });
    expect(loadSave(sps, T, G).data.party[0].species.name).toBe('Swampert');
  });

  it('curvas de experiência da Gen 3', () => {
    expect(expForLevel(0, 10)).toBe(1000); // Medium Fast
    expect(expForLevel(3, 100)).toBe(1059860); // Medium Slow
    expect(expForLevel(1, 100)).toBe(600000); // Erratic
    expect(expForLevel(2, 100)).toBe(1640000); // Fluctuating
    expect(expForLevel(4, 100)).toBe(800000); // Fast
    expect(expForLevel(5, 100)).toBe(1250000); // Slow
    expect(levelForExp(0, 999)).toBe(9);
  });

  it('tabela de tipos da Gen 3: sem Fairy; Ghost e Dark não são super efetivos contra Steel', () => {
    const i = t => T.types.indexOf(t);
    expect(G.typechart[i('ghost')][i('steel')]).toBe(0.5);
    expect(G.typechart[i('dark')][i('steel')]).toBe(0.5);
    expect(G.typechart[i('dragon')][i('fairy')]).toBe(1);
  });
});

suite('saves não suportados', () => {
  it('arquivo sem estrutura de save: erro claro, sem dados', () => {
    expect(() => loadSave(new Uint8Array(0x20000), T, G)).toThrow(/não é de um jogo suportado/);
    expect(() => loadSave(new Uint8Array(100), T, G)).toThrow(/128 KB/);
  });
  it('layout do Quetzal com stats que não batem: recusado', () => {
    const bad = makeSave({ trainer: { name: 'X', tid: 1, sid: 2 }, party: [
      { pid: 225, species: 6, level: 50, exp: 117360, stats: [999, 1, 1, 1, 1, 1] },
      { pid: 225, species: 9, level: 50, exp: 117360, stats: [1, 999, 1, 1, 1, 1] },
    ] });
    expect(() => loadSave(bad, T, G)).toThrow(/não batem com o formato/);
  });
});

// Saves reais (não versionados): fixtures/emerald.sav e fixtures/firered.sav
for (const [file, id] of [['emerald.sav', 'emerald'], ['firered.sav', 'frlg']]) {
  const path = new URL(`../fixtures/${file}`, import.meta.url).pathname;
  suite.skipIf(!existsSync(path))(`save real (fixtures/${file})`, () => {
    it('identifica o jogo e os stats salvos da equipe batem com a fórmula (tabelas e criptografia certas)', () => {
      const { data } = loadSave(readFileSync(path), T, G);
      expect(data.game.id).toBe(id);
      expect(data.party.length).toBeGreaterThan(0);
      for (const m of data.party) {
        expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
      }
      expect(data.pc.boxes).toHaveLength(14);
      expect(data.warnings).toEqual([]);
      // Saves completos: os valores máximos do jogo (o dinheiro só dá 999999 com a chave certa)
      expect(data.summary).toMatchObject({ playTime: { h: 999, m: 59, s: 59 }, money: { value: 999999 }, badges: expect.objectContaining({ count: 8 }), dex: expect.objectContaining({ owned: 386, total: 386 }) });
    });
  });
}

// Saves reais de Ruby e Sapphire (exports do GameShark, coleções completas): o 0xAC tem recorde da Battle Tower e a
// seção 0 é zerada depois de 0x890. Dinheiro sem chave (₽ 999 999), 8 insígnias (flags 0x807–0x80E; a 0x803, sem uso
// no jogo, é a única desligada entre as de sistema), Pokédex 386, e os stats salvos da equipe batem com a fórmula.
for (const [f, name] of [['fixtures/rs-a.sps', 'Sapphire'], ['fixtures/rs-b.sps', 'Ruby']]) {
  suite.skipIf(!existsSync(f))(`Ruby/Sapphire: save real (${name})`, () => {
    it('identifica o jogo e lê o resumo', () => {
      const { data } = loadSave(readFileSync(f), T, G);
      expect(data.game.id).toBe('rs');
      expect(data.summary).toMatchObject({ playTime: { h: 999, m: 59, s: 59 }, money: { value: 999999, confidence: 'confirmado' }, badges: expect.objectContaining({ count: 8 }), dex: expect.objectContaining({ owned: 386 }) });
      expect(data.party.map(m => m.species.name)).toEqual(['Skarmory', 'Swampert', 'Smeargle', 'Smeargle']);
      for (const m of data.party) expect(calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature)).toEqual(m.stats);
      expect(data.pc.boxes.reduce((a, b) => a + b.slots.length, 0)).toBeGreaterThan(400);
    });
  });
}

// Testes contra o save real do autor. O arquivo não é versionado (ver .gitignore);
// coloque-o em fixtures/ (ou aponte QUETZAL_SAVE) para rodar estes testes.
import { describe as suite, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseSave, describe } from '../src/parser/index.js';
import { calcStats } from '../src/parser/stats.js';
import BASE from '../src/data/tables.js';
import Q from '../src/data/quetzal.json';

// Como no app: saves do Quetzal usam as tabelas tiradas da ROM (src/data/quetzal.json)
const T = { ...BASE, quetzal: Q };

const FILE = process.env.QUETZAL_SAVE || new URL('../fixtures/PokemonQuetzalPtBrAlpha9v0.sav', import.meta.url).pathname;
const has = existsSync(FILE);

suite.skipIf(!has)('save real (fixtures/PokemonQuetzalPtBrAlpha9v0.sav)', () => {
  const raw = has ? parseSave(readFileSync(FILE)) : null;
  const d = has ? describe(raw, T) : null;

  it('treinador e slot ativo', () => {
    expect(raw.trainer).toEqual({ name: 'Victor', tid: 9653, sid: 25806 });
    expect(raw.slot.saveIndex).toBe(80);
    expect(raw.warnings.filter(w => w.includes('Checksum'))).toEqual([]);
    // Tempo de jogo: cresce na ordem dos 3 saves (ver os testes dos outros dois)
    expect(raw.summary).toEqual({
      playTime: { h: 51, m: 55, s: 16, confidence: 'confirmado' }, money: { value: 1315986, confidence: 'confirmado' },
      badges: { count: 5, total: 8, confidence: 'confirmado' }, dex: expect.objectContaining({ owned: 63, total: 1025, confidence: 'confirmado' }),
    });
  });

  it('equipe', () => {
    const summary = d.party.map(m => [m.species.name, m.speciesId, m.level, m.nature.name, m.item?.name ?? null]);
    expect(summary).toEqual([
      ['Dragonite', 149, 100, 'Quiet', null],
      ['Staraptor', 398, 100, 'Mild', null],
      ['Serperior', 497, 100, 'Modest', null], // PID diz Gentle; o jogo mostra Modest
      ['Reuniclus', 579, 100, 'Naughty', null],
      ['Basculegion', 1210, 100, 'Jolly', 'Life Orb'],
      ['Lucario', 448, 100, 'Modest', 'Lucarionite Z'],
    ]);
    const drag = d.party[0];
    expect(drag.moves.map(m => `${m.name}/${m.pp}`)).toEqual(['Hyper Beam/8', 'Brutal Swing/32', 'Dragon Rush/16', 'Safeguard/40']);
    expect(drag.stats).toEqual({ hp: 295, atk: 289, def: 195, spe: 170, spa: 257, spd: 211 });
    expect(drag.ivs).toEqual({ hp: 3, atk: 16, def: 0, spe: 24, spa: 29, spd: 6 });
    expect(drag.exp).toBe(1059860);
    expect(drag.friendship).toBe(142);
    expect(drag.ot.name).toBe('Victor');

    const basc = d.party[4];
    expect(basc.moves.map(m => m.name)).toEqual(['Wave Crash', 'Agility', 'Aqua Jet', 'Last Respects']);
    expect(basc.ivs).toEqual({ hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 });
    expect(basc.evs).toEqual({ hp: 0, atk: 252, def: 4, spe: 252, spa: 0, spd: 0 });
    expect(basc.stats).toEqual({ hp: 381, atk: 323, def: 167, spe: 280, spa: 176, spd: 186 });

    const luc = d.party[5];
    expect(luc.evs).toEqual({ hp: 4, atk: 0, def: 0, spe: 252, spa: 252, spd: 0 });
    expect(luc.stats).toEqual({ hp: 282, atk: 230, def: 176, spe: 279, spa: 361, spd: 176 });
    expect(luc.item.id).toBe(865);
    // Serperior: PID 0x1F0; (PID & 0xFF) % 25 = Modest, como o jogo mostra (PID % 25 daria Gentle)
    expect(d.party[2].nature.name).toBe('Modest');
    expect(d.party.map(m => m.pidNature)).toEqual([null, null, null, null, null, null]);
    // Shiny: bit 3 do byte 0x13 (Serperior é shiny; confere com o bit do PC no save 3). Todos machos.
    expect(d.party.map(m => m.shiny)).toEqual([false, false, true, false, false, false]);
    expect(d.party.map(m => m.gender && m.gender.name)).toEqual(['macho', 'macho', 'macho', 'macho', 'macho', 'macho']);
    expect(raw.party.map(p => p.hp)).toEqual(raw.party.map(p => p.stats.hp)); // HP cheio em todos
    expect(d.party[5].hiddenPower).toBe('dark'); // Lucario, IVs 31 em tudo
    expect(raw.party.map(p => p.misc)).toEqual([0x40000000, 0x40000000, 0x40000000, 0x50000000, 0x50000000, 0x50000000]);
    // Habilidades conferidas pelo autor na tela de resumo do jogo
    expect(d.party.map(m => m.ability.name)).toEqual(['Inner Focus', 'Intimidate', 'Overgrow', 'Magic Guard', 'Adaptability', 'Inner Focus']);
  });

  it('PC', () => {
    const box = d.pc.boxes[0];
    expect(box.name).toBe('BOX1');
    expect(box.slots).toHaveLength(27);
    expect(d.pc.boxes.slice(1).every(b => b.slots.length === 0)).toBe(true);
    expect(box.slots.map(s => s.slot).filter(n => [21, 23, 26].includes(n))).toEqual([]);
    const bySlot = Object.fromEntries(box.slots.map(s => [s.slot, s]));
    expect(bySlot[1]).toMatchObject({ speciesId: 66, nickname: 'SQSR', hasNickname: true });
    expect(bySlot[1].species.name).toBe('Machop');
    expect(bySlot[1].moves.map(m => `${m.name}/${m.pp}`)).toEqual(['Leer/48', 'Rock Smash/24', 'Focus Energy/48']);
    expect(bySlot[2].moves.map(m => m.name)).toEqual(['Swords Dance', 'Bullet Punch', 'Dual Wingbeat', 'Bug Bite']);
    expect(bySlot[6].moves.map(m => `${m.name}/${m.pp}`)).toEqual(['Tackle/56', 'Growl/64', 'Ember/40']);
    expect(bySlot[29].moves.map(m => m.name)).toEqual(['Dragon Dance', 'Glaive Rush', 'Ice Shard', 'Icicle Crash']);
    expect(bySlot[30].moves.map(m => m.name)).toEqual(['Flare Blitz', 'Double-Edge', 'Head Smash', 'Extreme Speed']);
    const custom = box.slots.filter(s => s.speciesId > 905).map(s => [s.slot, s.speciesId, s.species.name]);
    expect(custom).toEqual([
      [5, 1308, 'Annihilape'], [8, 951, 'Raichu'], [22, 973, 'Weezing'],
      [25, 1469, 'Pikachu'], [29, 1327, 'Baxcalibur'], [30, 1224, 'Arcanine'],
    ]);
    expect(box.slots.filter(s => s.species.confidence === 'desconhecido')).toEqual([]);
  });

  it('PC: item, nível, natureza e habilidade', () => {
    const bySlot = Object.fromEntries(d.pc.boxes[0].slots.map(s => [s.slot, s]));
    const row = n => { const m = bySlot[n]; return [m.level, m.nature.name, m.item?.name ?? null, m.ability.name]; };
    expect(row(1)).toEqual([5, 'Rash', null, 'No Guard']);
    expect(row(2)).toEqual([59, 'Jolly', 'Scizorite', 'Technician']);
    expect(row(4)).toEqual([92, 'Adamant', 'Blazikenite', 'Speed Boost']);
    expect(row(8)).toEqual([58, 'Modest', 'Aloraichium Z', 'Surge Surfer']);
    expect(row(10)).toEqual([93, 'Modest', 'Charizardite Y', 'Solar Power']);
    expect(row(30)).toEqual([100, 'Jolly', 'Choice Band', 'Rock Head']);
    // Itens conferidos no jogo pelo autor
    expect(bySlot[11].item).toMatchObject({ name: 'Raichunite Y', confidence: 'confirmado' });
    expect(bySlot[16].item).toMatchObject({ name: 'Golisopite', confidence: 'confirmado' });
    expect(bySlot[29].item).toMatchObject({ name: 'Baxcalibrite', confidence: 'confirmado' });
    // Níveis calculados pela exp, conferidos no jogo pelo autor
    expect([bySlot[2].level, bySlot[4].level, bySlot[19].level, bySlot[10].level]).toEqual([59, 92, 26, 93]);
    // Bola e shiny conferidos no jogo pelo autor
    const shinies = d.pc.boxes[0].slots.filter(s => s.shiny).map(s => s.slot);
    expect(shinies).toEqual([9, 10, 12]); // Scorbunny, Charizard, Tyranitar
    const ball = n => bySlot[n].ball.name;
    expect([1, 28, 29].map(ball)).toEqual(['Poké Ball', 'Poké Ball', 'Poké Ball']);
    expect([9, 17, 18, 30].map(ball)).toEqual(['Great Ball', 'Great Ball', 'Great Ball', 'Great Ball']);
    expect([19, 22].map(ball)).toEqual(['Ultra Ball', 'Ultra Ball']);
    expect(ball(27)).toBe('Premier Ball');
    expect(bySlot[10].ball).toMatchObject({ id: 25, name: 'Radiant Ball', confidence: 'confirmado' });
    // Gênero conferido no jogo pelo autor (bit 160)
    const g = n => bySlot[n].gender.name;
    expect([1, 10, 27, 28, 29, 30].map(g)).toEqual(Array(6).fill('macho'));
    expect([12, 13, 17, 20, 22, 25].map(g)).toEqual(Array(6).fill('fêmea'));
    expect(g(15)).toBe('sem gênero'); // Golett
    expect(bySlot[1].evs).toEqual({ hp: 0, atk: 8, def: 0, spe: 0, spa: 0, spd: 0 });
  });
});

// Save do autor com Lucario e Basculegion movidos da equipe para a BOX1 (posições 21 e 23)
const FILE_PC = process.env.QUETZAL_SAVE_PC || new URL('../fixtures/PokemonQuetzalPtBrAlpha9v0-pc.sav', import.meta.url).pathname;
const hasPc = has && existsSync(FILE_PC);

suite.skipIf(!hasPc)('equipe → PC (fixtures/PokemonQuetzalPtBrAlpha9v0-pc.sav)', () => {
  const before = hasPc ? describe(parseSave(readFileSync(FILE)), T) : null;
  const after = hasPc ? describe(parseSave(readFileSync(FILE_PC)), T) : null;

  it('o mesmo Pokémon tem os mesmos dados na equipe e no PC', () => {
    expect(after.party).toHaveLength(4);
    for (const [partyIdx, slot] of [[5, 21], [4, 23]]) {
      const p = before.party[partyIdx];
      const c = after.pc.boxes[0].slots.find(s => s.slot === slot);
      expect(c.speciesId).toBe(p.speciesId);
      expect(c.exp).toBe(p.exp);
      expect(c.level).toBe(p.level);
      expect(c.nature).toEqual(p.nature);
      expect(c.item).toEqual(p.item);
      expect(c.ability).toEqual(p.ability);
      expect(c.ball).toEqual(p.ball); // byte 0x32 da equipe = bits 38–43 do PC
      expect(c.stats).toEqual(p.stats); // stats calculados no PC = stats salvos na equipe
      expect(c.ivs).toEqual(p.ivs);
      expect(c.evs).toEqual(p.evs);
      expect(c.moves).toEqual(p.moves);
    }
  });
});

// Save do autor com Tyranitar (shiny, fêmea) e Scorbunny (shiny) tirados do PC para a equipe e o Serperior
// levado da equipe para o PC; Tyranitar com Heavy-Duty Boots e Scorbunny com Assault Vest.
const FILE_3 = process.env.QUETZAL_SAVE_3 || new URL('../fixtures/PokemonQuetzalPtBrAlpha9v0-3.sav', import.meta.url).pathname;
const has3 = has && existsSync(FILE_3);

suite.skipIf(!has3)('PC → equipe: shiny, gênero e natureza (fixtures/PokemonQuetzalPtBrAlpha9v0-3.sav)', () => {
  const raw = has3 ? parseSave(readFileSync(FILE_3)) : null;
  const d = has3 ? describe(raw, T) : null;
  const before = has3 ? describe(parseSave(readFileSync(FILE_PC)), T) : null;

  it('tempo de jogo cresce de um save para o outro (51h55m16s → 52h04m00s → 52h26m41s)', () => {
    expect(before.summary.playTime).toMatchObject({ h: 52, m: 4, s: 0 });
    expect(d.summary.playTime).toMatchObject({ h: 52, m: 26, s: 41 });
    // Dinheiro: a chave muda a cada save, o valor decodificado não
    expect([before.summary.money.value, d.summary.money.value]).toEqual([1315986, 1315986]);
  });

  it('shiny (byte 0x13, bit 3) e gênero (byte baixo do PID) na equipe', () => {
    expect(d.party.map(m => m.species.name)).toEqual(['Tyranitar', 'Scorbunny', 'Corviknight', 'Basculegion', 'Arcanine']);
    expect(d.party.map(m => m.shiny)).toEqual([true, true, false, false, false]);
    expect(d.party.map(m => m.gender.name)).toEqual(['fêmea', 'macho', 'macho', 'macho', 'macho']);
  });

  it('natureza = (PID & 0xFF) % 25 e bate com a do PC', () => {
    expect(raw.party.map(p => p.pid)).toEqual([0x10F, 0x1EC, 0xE9, 0xEE, 0xEE]);
    expect(d.party.map(m => m.nature.name)).toEqual(['Modest', 'Hasty', 'Impish', 'Jolly', 'Jolly']);
    expect(d.party.map(m => m.pidNature)).toEqual([null, null, null, null, null]);
    const pcBefore = before.pc.boxes.flatMap(b => b.slots);
    for (const m of d.party.slice(0, 2)) {
      const c = pcBefore.find(x => x.speciesId === m.speciesId && x.exp === m.exp);
      expect(c.nature).toEqual(m.nature);
      expect(c.shiny).toBe(m.shiny);
      expect(c.gender).toEqual(m.gender);
    }
  });

  it('Serperior no PC: natureza Modest e shiny', () => {
    const s = d.pc.boxes[0].slots.find(m => m.speciesId === 497);
    expect(s.nature.name).toBe('Modest');
    expect(s.shiny).toBe(true);
  });

  it('itens 503 e 510 (faixa antes só "provável")', () => {
    expect(d.party[0].item).toMatchObject({ id: 510, name: 'Heavy-Duty Boots', confidence: 'confirmado' });
    expect(d.party[1].item).toMatchObject({ id: 503, name: 'Assault Vest', confidence: 'confirmado' });
  });
});

// Save com o tempo e o dinheiro conferidos na tela do jogo (59:21:18 logo depois de salvar; ₽ 1 247 386)
const FILE_59 = process.env.QUETZAL_SAVE_59H || new URL('../fixtures/quetzal-59h.sav', import.meta.url).pathname;
suite.skipIf(!existsSync(FILE_59))('resumo conferido no jogo (fixtures/quetzal-59h.sav)', () => {
  it('tempo de jogo, dinheiro, insígnias (5 → 6) e Pokédex (63 → 65: Feebas e Froakie)', () => {
    const raw = parseSave(readFileSync(FILE_59));
    expect(raw.summary).toEqual({
      playTime: { h: 59, m: 20, s: 49, confidence: 'confirmado' }, money: { value: 1247386, confidence: 'confirmado' },
      badges: { count: 6, total: 8, confidence: 'confirmado' }, dex: expect.objectContaining({ owned: 65, total: 1025, confidence: 'confirmado' }),
    });
    expect(raw.warnings.filter(w => w.includes('Checksum'))).toEqual([]);
  });
});

// Save seguinte: tela do jogo com 6 insígnias, Pokédex 67 e tempo 60:16 (Haunter e Doublade capturados)
const FILE_60 = process.env.QUETZAL_SAVE_60H || new URL('../fixtures/quetzal-60h.sav', import.meta.url).pathname;
suite.skipIf(!existsSync(FILE_60))('resumo conferido no jogo (fixtures/quetzal-60h.sav)', () => {
  it('insígnias 6, Pokédex 67 (+ Haunter e Doublade) e tempo 60:16', () => {
    const raw = parseSave(readFileSync(FILE_60));
    expect(raw.summary).toMatchObject({ playTime: { h: 60, m: 16 }, badges: { count: 6, total: 8 }, dex: expect.objectContaining({ owned: 67, total: 1025 }) });
    const pc = describe(raw, T).pc.boxes.flatMap(b => b.slots).map(m => m.species.name);
    expect(pc).toEqual(expect.arrayContaining(['Feebas', 'Froakie', 'Haunter', 'Doublade']));
  });
});

// Mesmo save com o Haunter (capturado com metade do HP) levado do PC para a equipe
const FILE_H = process.env.QUETZAL_SAVE_HAUNTER || new URL('../fixtures/quetzal-60h-haunter.sav', import.meta.url).pathname;
suite.skipIf(!existsSync(FILE_H) || !existsSync(FILE_60))('HP atual (fixtures/quetzal-60h-haunter.sav)', () => {
  it('Haunter com 33 de 66 no PC e na equipe; no PC, os outros têm o HP máximo calculado', () => {
    const before = describe(parseSave(readFileSync(FILE_60)), T), after = describe(parseSave(readFileSync(FILE_H)), T);
    const inPc = before.pc.boxes.flatMap(b => b.slots).find(m => m.species.name === 'Haunter');
    const inParty = after.party.find(m => m.species.name === 'Haunter');
    expect([inPc.hp, inParty.hp, inParty.stats.hp]).toEqual([33, 33, 66]);
    expect(after.party.find(m => m.species.name === 'Pelipper')).toMatchObject({ hp: 243, stats: { hp: 324 } });
    // Inclusive o Pikachu "estilo Red" (1469): pela ROM, tem os stats do Pikachu Partner (HP 68)
    const others = before.pc.boxes.flatMap(b => b.slots).filter(m => m !== inPc);
    expect(before.pc.boxes.flatMap(b => b.slots).find(m => m.speciesId === 1469).hp).toBe(68);
    expect(others.filter(m => m.hp !== m.stats.hp).map(m => m.species.name)).toEqual([]);
  });
});

// Save de outro jogador, do Quetzal em inglês (Alpha 9): o PC usa registros de 31 bytes (sem HP nem PP),
// tem 45 caixas e passa da primeira seção (0xF80 bytes por seção). Antes, saía com dados sem sentido.
const FILE_EN = process.env.QUETZAL_SAVE_EN || new URL('../fixtures/quetzal-en.sav', import.meta.url).pathname;
suite.skipIf(!existsSync(FILE_EN))('Quetzal em inglês: PC de 31 bytes (fixtures/quetzal-en.sav)', () => {
  const raw = existsSync(FILE_EN) ? parseSave(readFileSync(FILE_EN)) : null;
  const d = raw ? describe(raw, T) : null;

  it('treinador, resumo e equipe', () => {
    expect(raw.trainer).toEqual({ name: 'ABC', tid: 58883, sid: 36547 });
    expect(raw.warnings).toEqual([]);
    expect(raw.summary).toMatchObject({ playTime: { h: 338, m: 8 }, badges: { count: 8 }, dex: expect.objectContaining({ owned: 445 }) });
    expect(d.party.map(m => [m.species.name, m.level])).toEqual([
      ['Linoone', 70], ['Fraxure', 44], ['Ferroseed', 38], ['Corvisquire', 36], ['Frosmoth', 36], ['Finizen', 31]]);
  });

  it('PC: 397 Pokémon em 45 caixas, todos com o nome da espécie como apelido', () => {
    expect(raw.pc.recordSize).toBe(31);
    expect(d.pc.boxes).toHaveLength(45);
    expect(d.pc.boxes.map(b => b.slots.length)).toEqual([28, 30, 30, 30, 29, 30, 30, 30, 30, 30, 10,
      ...Array(29).fill(0), 6, 2, 22, 30, 30]);
    const all = d.pc.boxes.flatMap(b => b.slots);
    expect(all).toHaveLength(397);
    // O jogo grava o nome da espécie como apelido: bate com a espécie lida em todos os que têm nome
    expect(all.filter(m => m.nickname && m.hasNickname).map(m => m.nickname)).toEqual([]);
    expect(all.flatMap(m => m.moves).filter(mv => mv.pp !== null)).toEqual([]);
    expect(all.filter(m => m.hp !== null)).toEqual([]);
    const at = (box, slot) => d.pc.boxes[box - 1].slots.find(m => m.slot === slot);
    expect(at(1, 17)).toMatchObject({ species: { name: 'Arcanine', form: 'Hisui' }, exp: 420, nature: { name: 'Calm' } });
    expect(at(45, 30).species.name).toBe('Diglett');
    expect(at(41, 1)).toMatchObject({ species: { name: 'Roserade' }, ivs: { hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31 },
      evs: { hp: 4, atk: 0, def: 0, spe: 252, spa: 252, spd: 0 } });
    // Bit de fêmea na mesma posição do registro de 38 bytes: 0 no Nidoran♂ (32), 1 no Nidoran♀ (29)
    const rawAll = raw.pc.boxes.flatMap(b => b.slots);
    expect([32, 29].map(id => rawAll.filter(s => s.speciesId === id).map(s => s.femaleBit))).toEqual([[0], [1]]);
  });
});

// Outro save do Quetzal em inglês: PC de 21 bytes (sem apelido) em 67 caixas, e a Pokédex em outra posição da
// seção 4 (0x3D4; o bloco de sempre, em 0x9D0, está vazio). Pokédex, dinheiro e insígnias ainda não conferidos no jogo.
const FILE_EN2 = process.env.QUETZAL_SAVE_EN2 || new URL('../fixtures/quetzal-en2.sav', import.meta.url).pathname;
suite.skipIf(!existsSync(FILE_EN2))('Quetzal em inglês: PC de 21 bytes (fixtures/quetzal-en2.sav)', () => {
  const raw = existsSync(FILE_EN2) ? parseSave(readFileSync(FILE_EN2)) : null;
  const d = raw ? describe(raw, T) : null;

  it('PC: 708 Pokémon em 67 caixas, todos coerentes', () => {
    expect([raw.pc.recordSize, d.pc.boxes.length]).toEqual([21, 67]);
    const all = d.pc.boxes.flatMap(b => b.slots);
    expect(all).toHaveLength(708);
    expect(d.pc.boxes.map(b => b.slots.length).filter(Boolean)).toEqual([...Array(22).fill(30), 15, 3, 30]);
    expect(all.filter(m => m.species.confidence !== 'confirmado' || !m.nature || m.ability.num > 2)).toEqual([]);
    expect(d.pc.boxes[0].slots.slice(0, 3).map(m => [m.species.name, m.level])).toEqual([['Linoone', 21], ['Rhyhorn', 29], ['Skwovet', 5]]);
  });

  it('Pokédex na posição alternativa: inclui todas as espécies da equipe e do PC; resumo como "provável"', () => {
    const dex = raw.summary.dex;
    expect([dex.owned, dex.total, dex.confidence]).toEqual([698, 1025, 'provável']);
    const caught = new Set(dex.caught);
    const nat = id => (id <= 898 ? id : Q.species[id][5]);
    const missing = [...d.party, ...d.pc.boxes.flatMap(b => b.slots)].map(m => nat(m.speciesId)).filter(n => n && !caught.has(n)); // os próprios do Quetzal (Browt…) não têm nº nacional
    expect(missing).toEqual([]);
    expect([raw.summary.money.confidence, raw.summary.badges.confidence, raw.summary.playTime.confidence]).toEqual(['provável', 'provável', 'confirmado']);
  });
});

// Com as tabelas da ROM, nada dos saves reais fica como "provável" ou "não mapeado"
const ROM_CHECK = ['PokemonQuetzalPtBrAlpha9v0.sav', 'PokemonQuetzalPtBrAlpha9v0-pc.sav', 'PokemonQuetzalPtBrAlpha9v0-3.sav',
  'quetzal-59h.sav', 'quetzal-60h.sav', 'quetzal-60h-haunter.sav', 'quetzal-cmp-old.sav', 'quetzal-cmp-new.sav', 'quetzal-en.sav', 'quetzal-en2.sav']
  .map(f => new URL('../fixtures/' + f, import.meta.url).pathname).filter(f => existsSync(f));
suite.skipIf(!ROM_CHECK.length)('tabelas da ROM contra os saves reais', () => {
  it('espécies, itens e golpes confirmados; stats da equipe = fórmula com os stats base da ROM', () => {
    for (const f of ROM_CHECK) {
      const d = describe(parseSave(readFileSync(f)), T);
      const all = [...d.party, ...d.pc.boxes.flatMap(b => b.slots)];
      expect(all.filter(m => m.species.confidence !== 'confirmado').map(m => m.speciesId)).toEqual([]);
      expect(all.filter(m => m.item && m.item.confidence !== 'confirmado').map(m => m.item.id)).toEqual([]);
      expect(all.flatMap(m => m.moves).filter(mv => !mv.type).map(mv => mv.id)).toEqual([]);
      for (const m of d.party) {
        const calc = calcStats(m.species.baseStats, m.ivs, m.evs, m.level, m.nature);
        expect(Object.keys(calc).filter(k => calc[k] !== m.stats[k]), `${f} ${m.species.name}`).toEqual([]);
      }
    }
  });
});

// Converte os dados crus de parseSave() em objetos prontos para a UI e exportações,
// resolvendo nomes e tipos com as tabelas de src/data.

import { t } from '../i18n.js';
import { STAT_ORDER } from './save.js';

import { NATURES, natureFromPid, natureFromId } from './natures.js';
import { calcStats, naturesMatchingStats, hiddenPowerType } from './stats.js';

export { NATURES, natureFromPid, natureFromId };

export const CONFIRMED = 'confirmado';
export const PROBABLE = 'provável';
export const UNKNOWN = 'desconhecido';

const MAX_DEX = 905;
const LAST_GEN8_ICON = 898;
/** Com as tabelas da ROM (src/data/quetzal.json): até aqui a numeração do Quetzal é a Dex Nacional. */
const QUETZAL_NATIONAL = 898;

/** Curva Medium Slow: no Quetzal vale para todas as espécies (níveis do PC conferidos no jogo). */
export const mediumSlow = n => (n <= 1 ? 0 : Math.floor((6 * n ** 3) / 5) - 15 * n * n + 100 * n - 140);

export function levelFromExp(exp) {
  let level = 1;
  while (level < 100 && mediumSlow(level + 1) <= exp) level++;
  return level;
}

/**
 * @param {object} T tabelas: { species, moves, items, types, forms, overrides }
 */
export function makeResolver(T) {
  const typeName = i => T.types[i] || null;
  const abilityName = i => (i ? T.abilityNames[i] : null);
  const Q = T.quetzal || null;
  const maxDex = Q ? QUETZAL_NATIONAL : MAX_DEX;

  /**
   * Espécie com ID próprio do Quetzal (> 898), pela tabela da ROM: nome, tipos, stats, habilidades e gênero
   * do próprio jogo. A forma da PokeAPI (sprite, Showdown) foi achada pelo nome + tipos + stats; a tabela
   * manual (quetzal-overrides.json) ainda vale para nome, forma e sprite (ex.: Pikachu "estilo Red").
   */
  function romSpecies(id, row, ov) {
    const [name, types, stats, abilities, genderRate, national, pokeapi, spriteId, icon, form, showdown, cosmetic] = row;
    const ovForm = ov && ov.pokeapi ? T.forms[ov.pokeapi] : null;
    const noSprite = ov && 'pokeapi' in ov && !ov.pokeapi;
    const sprite = noSprite ? null : ovForm ? ovForm.id : spriteId || (cosmetic ? national : null);
    return {
      name: ov ? ov.name : name,
      form: ov ? ov.form || null : form,
      showdown: (ov && ov.showdown) || showdown || name,
      confidence: CONFIRMED,
      evidence: ov ? ov.evidence || null
        : cosmetic ? 'Forma de aparência (os dados são os da forma padrão); sprite da forma padrão.'
        : spriteId ? null : 'Sem sprite correspondente na PokeAPI.',
      spriteId: sprite,
      // ID da PokeAPI para evoluções e golpes por nível: a forma, se o app tiver os dados dela; senão, a espécie
      dexId: ovForm ? ovForm.id : national,
      hasIcon: noSprite ? false : ovForm ? ovForm.icon : spriteId ? !!icon : cosmetic && national <= LAST_GEN8_ICON,
      types: types.map(typeName).filter(Boolean),
      abilities,
      genderRate,
      baseStats: stats,
    };
  }

  function species(id, nickname) {
    const ov = T.overrides.species[id];
    if (Q && id > QUETZAL_NATIONAL && Q.species[id]) return romSpecies(id, Q.species[id], ov);
    if (ov) {
      const form = ov.pokeapi ? T.forms[ov.pokeapi] : null;
      // Forma sem correspondência: tipos e habilidades da espécie base, como "provável".
      const base = !form && ov.baseDex && T.species[ov.baseDex] ? ov.baseDex : null;
      return {
        name: ov.name,
        form: ov.form || null,
        showdown: ov.showdown || ov.name,
        confidence: ov.confidence,
        evidence: ov.evidence || null,
        spriteId: form ? form.id : null,
        // ID de Pokémon da PokeAPI para evoluções e golpes por nível (forma ou espécie base)
        dexId: form ? form.id : base,
        hasIcon: form ? form.icon : false,
        types: form ? form.types.map(typeName).filter(Boolean)
          : base ? T.species[base].slice(1).map(typeName).filter(Boolean) : [],
        abilities: form ? form.abilities
          : base ? (T.speciesAbilities[base] || [0, 0, 0]).map(abilityName) : [null, null, null],
        genderRate: form ? form.genderRate : base ? T.genderRates[base] : null,
        baseStats: form ? form.baseStats : base ? T.baseStats[base] : null,
        traitsFromBase: !!base,
      };
    }
    if (id >= 1 && id <= maxDex && T.species[id]) {
      const [name, ...types] = T.species[id];
      return {
        name, form: null, showdown: showdownSpecies(name), confidence: CONFIRMED, evidence: null,
        spriteId: id, dexId: id, hasIcon: id <= LAST_GEN8_ICON, types: types.map(typeName).filter(Boolean),
        abilities: (T.speciesAbilities[id] || [0, 0, 0]).map(abilityName),
        genderRate: T.genderRates[id] ?? null,
        baseStats: T.baseStats[id] || null,
      };
    }
    return {
      name: nickname || t('Espécie {id}', { id }),
      form: null,
      showdown: nickname || null,
      confidence: UNKNOWN,
      evidence: nickname ? 'ID próprio do Quetzal ainda não mapeado; nome tirado do apelido.' : 'ID próprio do Quetzal ainda não mapeado.',
      spriteId: null, dexId: null, hasIcon: false, types: [], abilities: [null, null, null], genderRate: null, baseStats: null,
    };
  }

  /** Habilidade pelo número guardado no save (0 = 1ª, 1 = 2ª, 2 = oculta). */
  function ability(sp, num) {
    if (num > 2) return { num, name: t('Habilidade nº {n}', { n: num }), hidden: false, confidence: UNKNOWN };
    // Como no expansion: se o slot estiver vazio, vale a primeira habilidade existente.
    const name = sp.abilities[num] || sp.abilities.find(Boolean) || null;
    if (!name) return { num, name: num === 2 ? t('Habilidade oculta') : t('Habilidade {n}', { n: num + 1 }), hidden: num === 2, confidence: UNKNOWN };
    return { num, name, hidden: num === 2, confidence: sp.confidence === CONFIRMED && !sp.traitsFromBase ? CONFIRMED : PROBABLE };
  }

  function move(m) {
    // Golpe com outro nome na ROM do Quetzal (ex.: 848 Nihil Light): só o nome é conhecido
    const own = Q && Q.moveNames[m.id];
    if (own) return { id: m.id, name: own, type: null, pp: m.pp, power: null, accuracy: null, category: null };
    const row = T.moves[m.id];
    const det = T.moveDetails[m.id];
    return {
      id: m.id, name: row ? row[0] : `Golpe ${m.id}`, type: row ? typeName(row[1]) : null, pp: m.pp,
      // Dados do expansion (geração mais nova): poder/precisão 0 = variável ou não se aplica
      power: det ? det[0] : null, accuracy: det ? det[1] : null, category: det ? det[3] : null,
    };
  }

  function item(id) {
    if (!id) return null;
    const ov = T.overrides.items[id];
    if (ov) return { id, name: ov.name, confidence: ov.confidence, evidence: ov.evidence || null };
    // Tabela da ROM do Quetzal: nome do próprio jogo para todos os IDs
    if (Q) {
      const name = Q.items[id];
      return name ? { id, name, confidence: CONFIRMED, evidence: null }
        : { id, name: `Item ${id}`, confidence: UNKNOWN, evidence: 'ID sem item na tabela do Quetzal.' };
    }
    if (id >= T.overrides.itemsDivergeFrom) {
      return { id, name: `Item ${id}`, confidence: UNKNOWN, evidence: 'Nesta faixa de IDs a tabela de itens do Quetzal diverge do pokeemerald-expansion.' };
    }
    const name = T.items[id];
    if (!name) return { id, name: `Item ${id}`, confidence: UNKNOWN, evidence: null };
    if (id > T.overrides.itemsVerifiedUpTo) {
      return { id, name, confidence: PROBABLE, evidence: 'Nome da tabela do pokeemerald-expansion; nesta faixa de IDs a numeração do Quetzal ainda não foi conferida.' };
    }
    return { id, name, confidence: CONFIRMED, evidence: null };
  }

  function ball(id) {
    const ov = T.overrides.balls[id];
    if (ov) return { id, name: ov.name, confidence: ov.confidence, evidence: ov.evidence || null };
    const name = T.balls[id];
    if (!name) return { id, name: `Bola ${id}`, confidence: UNKNOWN, evidence: null };
    return T.overrides.ballsVerified.includes(id)
      ? { id, name, confidence: CONFIRMED, evidence: null }
      : { id, name, confidence: PROBABLE, evidence: 'Nome da tabela do pokeemerald-expansion; ainda não conferido no jogo.' };
  }

  /**
   * Gênero na equipe: como na geração 3, fêmea se o byte baixo do PID for menor que o limite da espécie
   * (taxa de fêmeas em oitavos → 31, 63, 127, 191, 223). Conferido no jogo (Tyranitar fêmea, machos).
   */
  function genderFromPid(sp, pid) {
    const r = sp.genderRate;
    if (r === null || r === undefined || r <= 0 || r >= 8) return gender(sp, 0);
    const threshold = Math.min(254, Math.floor((r * 12.5 * 255) / 100));
    return gender(sp, (pid & 0xFF) < threshold ? 1 : 0);
  }

  /**
   * Gênero: espécies sem gênero ou de gênero fixo seguem a espécie; as demais, o bit do save.
   * @returns {{ symbol: '♂'|'♀'|null, name: string, confidence: string }|null}
   */
  function gender(sp, femaleBit) {
    if (femaleBit === null || femaleBit === undefined) return null;
    const r = sp.genderRate;
    const conf = r === null || r === undefined ? PROBABLE : CONFIRMED;
    if (r === -1) return { symbol: null, name: 'sem gênero', confidence: conf };
    const female = r === 8 ? true : r === 0 ? false : femaleBit === 1;
    return { symbol: female ? '♀' : '♂', name: female ? 'fêmea' : 'macho', confidence: conf };
  }

  return { species, move, item, ability, ball, gender, genderFromPid };
}

const SHOWDOWN_NAMES = { 'Nidoran♀': 'Nidoran-F', 'Nidoran♂': 'Nidoran-M' };
const showdownSpecies = name => SHOWDOWN_NAMES[name] || name;

const sameName = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

/**
 * @param {ReturnType<import('./save.js').parseSave>} raw
 * @param {object} T tabelas
 */
export function describe(raw, T) {
  const R = makeResolver(T);

  const party = raw.party.map(p => {
    const sp = R.species(p.speciesId, p.nickname);
    // Natureza: (PID & 0xFF) % 25 (ver natures.js). Por segurança, se os stats salvos só fecharem com
    // outra natureza, vale a que os reproduz; a do PID fica em pidNature.
    const pidNature = natureFromPid(p.pid);
    let nature = pidNature;
    if (sp.baseStats) {
      const ok = naturesMatchingStats(sp.baseStats, p.ivs, p.evs, p.level, p.stats);
      if (ok.length && !ok.includes(pidNature.id)) {
        const effect = natureFromId(ok[0]);
        // Naturezas neutras dão os mesmos stats; só troca se o efeito (+/−) for diferente
        if (!(pidNature.plus === effect.plus && pidNature.minus === effect.minus)) nature = effect;
      }
    }
    return {
      location: 'party',
      where: 'Equipe',
      boxIndex: null,
      slot: p.slot,
      speciesId: p.speciesId,
      species: sp,
      nickname: p.nickname || sp.name,
      hasNickname: !!p.nickname && !sameName(p.nickname, sp.name),
      complete: true,
      level: p.level,
      levelFromExp: false,
      exp: p.exp,
      nature,
      pidNature: nature === pidNature ? null : pidNature,
      item: R.item(p.itemId),
      ability: R.ability(sp, p.abilityNum),
      ball: R.ball(p.ballId),
      shiny: p.shiny,
      gender: R.genderFromPid(sp, p.pid),
      friendship: p.friendship,
      ot: { name: p.otName, tid: p.otId & 0xFFFF, sid: p.otId >>> 16 },
      pid: p.pid,
      moves: p.moves.map(R.move),
      stats: p.stats, statsCalculated: false, hp: p.hp ?? null, ivs: p.ivs, evs: p.evs,
      hiddenPower: hiddenPowerType(p.ivs),
      unknown: { misc54: '0x' + p.misc.toString(16).padStart(8, '0') },
      raw: p.raw,
    };
  });

  const boxes = raw.pc.boxes.map(b => ({
    index: b.index,
    name: b.name,
    partial: b.partial,
    slots: b.slots.map(s => {
      const sp = R.species(s.speciesId, s.nickname);
      const level = levelFromExp(s.exp);
      const nature = natureFromId(s.natureId);
      // O PC não guarda stats: calculados pelos stats base (fórmula conferida contra a equipe)
      const stats = sp.baseStats && nature ? calcStats(sp.baseStats, s.ivs, s.evs, level, nature) : null;
      return {
        location: 'pc',
        where: b.name,
        boxIndex: b.index,
        slot: s.slot,
        speciesId: s.speciesId,
        species: sp,
        nickname: s.nickname || sp.name,
        hasNickname: !!s.nickname && !sameName(s.nickname, sp.name),
        complete: false,
        level,
        levelFromExp: true,
        exp: s.exp,
        nature,
        pidNature: null,
        item: R.item(s.itemId),
        ability: R.ability(sp, s.abilityNum),
        ball: R.ball(s.ballId),
        shiny: s.shiny,
        gender: R.gender(sp, s.femaleBit),
        friendship: null, ot: null, pid: null,
        moves: s.moves.map(R.move),
        stats, statsCalculated: !!stats, hp: s.hp ?? null, ivs: s.ivs, evs: s.evs,
        hiddenPower: hiddenPowerType(s.ivs),
        raw: s.raw,
      };
    }),
  }));

  return {
    trainer: {
      name: raw.trainer.name,
      tid: raw.trainer.tid,
      sid: raw.trainer.sid,
      saveIndex: raw.slot.saveIndex,
    },
    warnings: raw.warnings,
    summary: raw.summary || {},
    party,
    pc: { currentBox: raw.pc.currentBox, boxCount: raw.pc.boxCount, capacity: raw.pc.capacity, boxes },
  };
}

export { STAT_ORDER };

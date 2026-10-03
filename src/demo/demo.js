// Save de demonstração: um save do Quetzal montado na hora com Pokémon fictícios (nenhum save real),
// para experimentar o app sem ter o jogo, um .sav ou uma chave de IA.
// Os stats da equipe saem da mesma fórmula do jogo, então o save passa pelas mesmas conferências de um real.

import { makeSave } from './quetzal-writer.js';
import { makeResolver, mediumSlow } from '../parser/describe.js';
import { NATURES, natureFromId } from '../parser/natures.js';
import { calcStats } from '../parser/stats.js';
import { STAT_ORDER } from '../parser/save.js';
import { t } from '../i18n.js';

// IDs próprios do Quetzal (conferidos no jogo; ver CLAUDE.md)
const FORMS = { 'Raichu-Alola': 951, 'Weezing-Galar': 973, Basculegion: 1210, 'Arcanine-Hisui': 1224, Annihilape: 1308, Baxcalibur: 1327 };
// Itens conferidos no jogo (até 510, e os próprios do Quetzal)
const ITEMS = {
  'Charizardite Y': 294, Scizorite: 309, Blazikenite: 314, 'Aloraichium Z': 389, 'Miracle Seed': 429, 'Choice Band': 442,
  Leftovers: 472, 'Life Orb': 479, 'Assault Vest': 503, 'Heavy-Duty Boots': 510, 'Lucarionite Z': 865, Baxcalibrite: 877,
};
const BALL = { poke: 1, great: 2, ultra: 3, radiant: 25 };
const MAX = [31, 31, 31, 31, 31, 31];
// EVs na ordem do save: HP, Atk, Def, Spe, SpA, SpD
const PHYS = [4, 252, 0, 252, 0, 0], SPEC = [4, 0, 0, 252, 252, 0], BULK = [252, 0, 128, 0, 0, 128];

const PARTY = [
  { sp: 'Charizard', lvl: 62, nature: 'Modest', item: 'Charizardite Y', ability: 0, moves: ['Flamethrower', 'Air Slash', 'Solar Beam', 'Roost'], evs: SPEC, shiny: true, ball: 'ultra' },
  { sp: 'Lucario', nick: 'AURA', lvl: 60, nature: 'Timid', item: 'Lucarionite Z', ability: 1, moves: ['Aura Sphere', 'Flash Cannon', 'Dark Pulse', 'Nasty Plot'], evs: SPEC },
  { sp: 'Garchomp', lvl: 61, nature: 'Jolly', item: 'Choice Band', ability: 2, moves: ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Fire Fang'], evs: PHYS, female: true, ball: 'great' },
  { sp: 'Gyarados', lvl: 59, nature: 'Adamant', item: 'Leftovers', ability: 0, moves: ['Waterfall', 'Dragon Dance', 'Ice Fang', 'Earthquake'], evs: PHYS },
  { sp: 'Raichu-Alola', lvl: 58, nature: 'Timid', item: 'Aloraichium Z', ability: 0, moves: ['Thunderbolt', 'Psychic', 'Focus Blast', 'Nasty Plot'], evs: SPEC, female: true },
  { sp: 'Serperior', lvl: 60, nature: 'Timid', item: 'Heavy-Duty Boots', ability: 2, moves: ['Leaf Storm', 'Dragon Pulse', 'Glare', 'Substitute'], evs: SPEC, ball: 'radiant' },
];

const BOX1 = [
  { sp: 'Arcanine-Hisui', lvl: 55, nature: 'Adamant', item: 'Life Orb', ability: 1, moves: ['Flare Blitz', 'Head Smash', 'Extreme Speed', 'Wild Charge'], evs: PHYS },
  { sp: 'Weezing-Galar', lvl: 48, nature: 'Bold', ability: 1, moves: ['Strange Steam', 'Will-O-Wisp', 'Defog', 'Pain Split'], evs: BULK, female: true },
  { sp: 'Annihilape', lvl: 57, nature: 'Jolly', ability: 1, moves: ['Rage Fist', 'Drain Punch', 'Bulk Up', 'U-turn'], evs: PHYS },
  { sp: 'Baxcalibur', lvl: 63, nature: 'Adamant', item: 'Baxcalibrite', ability: 0, moves: ['Glaive Rush', 'Icicle Crash', 'Earthquake', 'Dragon Dance'], evs: PHYS, female: true },
  { sp: 'Tyranitar', lvl: 55, nature: 'Careful', item: 'Assault Vest', ability: 0, moves: ['Stone Edge', 'Crunch', 'Earthquake', 'Ice Punch'], shiny: true, female: true },
  { sp: 'Scizor', lvl: 52, nature: 'Adamant', item: 'Scizorite', ability: 1, moves: ['Bullet Punch', 'U-turn', 'Swords Dance', 'Knock Off'], evs: PHYS },
  { sp: 'Blaziken', lvl: 54, nature: 'Jolly', item: 'Blazikenite', ability: 2, moves: ['Flare Blitz', 'Close Combat', 'Protect', 'Swords Dance'], evs: PHYS },
  { sp: 'Rillaboom', lvl: 50, nature: 'Adamant', item: 'Miracle Seed', ability: 2, moves: ['Grassy Glide', 'Wood Hammer', 'U-turn', 'Knock Off'], evs: PHYS },
  { sp: 'Basculegion', lvl: 49, nature: 'Jolly', ability: 1, moves: ['Wave Crash', 'Last Respects', 'Aqua Jet', 'Flip Turn'], evs: PHYS },
  { sp: 'Gengar', lvl: 47, nature: 'Timid', ability: 0, moves: ['Shadow Ball', 'Sludge Bomb', 'Focus Blast', 'Thunderbolt'], evs: SPEC, shiny: true },
  { sp: 'Snorlax', lvl: 45, nature: 'Careful', item: 'Leftovers', ability: 1, moves: ['Body Slam', 'Rest', 'Sleep Talk', 'Curse'], evs: BULK },
  { sp: 'Dragonite', lvl: 64, nature: 'Adamant', ability: 1, moves: ['Extreme Speed', 'Dragon Dance', 'Earthquake', 'Fire Punch'], evs: PHYS },
  { sp: 'Metagross', lvl: 53, nature: 'Jolly', ability: 0, moves: ['Meteor Mash', 'Zen Headbutt', 'Bullet Punch', 'Earthquake'], evs: PHYS },
  { sp: 'Togekiss', lvl: 46, nature: 'Timid', ability: 1, moves: ['Air Slash', 'Dazzling Gleam', 'Roost', 'Nasty Plot'], evs: SPEC, female: true },
  { sp: 'Corviknight', lvl: 51, nature: 'Impish', item: 'Leftovers', ability: 1, moves: ['Brave Bird', 'Body Press', 'Roost', 'Defog'], evs: BULK },
  { sp: 'Pikachu', nick: 'SPARKY', lvl: 22, nature: 'Hasty', ability: 0, moves: ['Thunderbolt', 'Quick Attack', 'Iron Tail', 'Thunder Wave'], female: true, ball: 'poke' },
  { sp: 'Eevee', lvl: 18, nature: 'Bold', ability: 2, moves: ['Quick Attack', 'Bite', 'Baby-Doll Eyes', 'Swift'], female: true },
  { sp: 'Machop', nick: 'BRAWLY', lvl: 9, nature: 'Rash', ability: 1, moves: ['Karate Chop', 'Leer'] },
];
const BOX2 = [
  { sp: 'Bulbasaur', lvl: 5, nature: 'Modest', ability: 0, moves: ['Tackle', 'Growl'] },
  { sp: 'Squirtle', lvl: 5, nature: 'Bold', ability: 0, moves: ['Tackle', 'Tail Whip'], female: true },
  { sp: 'Charmander', lvl: 7, nature: 'Docile', ability: 0, moves: ['Scratch', 'Growl', 'Ember'] },
  { sp: 'Ralts', lvl: 12, nature: 'Calm', ability: 1, moves: ['Confusion', 'Double Team'], female: true, shiny: true },
  { sp: 'Bagon', lvl: 20, nature: 'Lonely', ability: 0, moves: ['Bite', 'Dragon Breath', 'Headbutt'], female: true },
  { sp: 'Goomy', lvl: 25, nature: 'Quirky', ability: 1, moves: ['Water Gun', 'Dragon Breath', 'Protect'], female: true },
  { sp: 'Riolu', lvl: 15, nature: 'Adamant', ability: 2, moves: ['Quick Attack', 'Force Palm', 'Endure'] },
];

/** IVs fictícios variados (determinísticos) para os Pokémon do PC. */
const ivsFor = i => STAT_ORDER.map((_, j) => (i * 7 + j * 11) % 32);

export function buildDemoSave(T) {
  const R = makeResolver(T);
  const moveId = new Map(T.moves.map((row, id) => [row && row[0], id]).filter(([n]) => n));
  const nationalId = new Map(T.species.map((row, id) => [row && row[0], id]).filter(([n]) => n));
  const find = (map, name, what) => { const v = map.get(name); if (v === undefined) throw new Error(`Demo: ${what} desconhecido: ${name}`); return v; };

  const mon = (d, i, inParty) => {
    const species = FORMS[d.sp] ?? find(nationalId, d.sp, 'espécie');
    const natureIdx = NATURES.indexOf(d.nature);
    const nature = natureFromId(natureIdx);
    const ivs = d.ivs || (inParty ? MAX : ivsFor(i));
    const evs = d.evs || [0, 0, 0, 0, 0, 0];
    const moves = d.moves.map(n => { const id = find(moveId, n, 'golpe'); return [id, Math.floor((T.moveDetails[id][2] * 8) / 5)]; });
    const base = {
      species, nickname: d.nick ?? '', item: d.item ? ITEMS[d.item] : 0, exp: mediumSlow(d.lvl), moves, evs, ivs,
      abilityNum: d.ability ?? 0, ball: BALL[d.ball || 'poke'], shiny: !!d.shiny,
    };
    // Stats pela fórmula (o PC guarda só o HP atual: cheio)
    const sp = R.species(species, '');
    const obj = arr => Object.fromEntries(STAT_ORDER.map((k, j) => [k, arr[j]]));
    const s = calcStats(sp.baseStats, obj(ivs), obj(evs), d.lvl, nature);
    if (!inParty) return { ...base, nature: natureIdx, female: !!d.female, hp: s.hp };
    // Equipe: PID = 225 + natureza (macho) ou 256 + natureza (fêmea)
    return { ...base, pid: (d.female ? 256 : 225) + natureIdx, level: d.lvl, friendship: 120, stats: STAT_ORDER.map(k => s[k]) };
  };

  const pc = {};
  BOX1.forEach((d, i) => { pc[i] = mon(d, i, false); });
  BOX2.forEach((d, i) => { pc[30 + i] = mon(d, 30 + i, false); });
  return makeSave({
    trainer: { name: 'DEMO', tid: 12345, sid: 54321 },
    playTime: [38, 12, 5],
    money: 124560,
    badges: 5,
    // Capturados (Dex Nacional): as linhas evolutivas dos Pokémon do exemplo
    dex: [4, 5, 6, 25, 26, 56, 57, 58, 59, 109, 110, 123, 129, 130, 212, 246, 247, 248, 255, 256, 257, 443, 444, 445, 447, 448, 495, 496, 497, 979, 996, 997, 998],
    party: PARTY.map((d, i) => mon(d, i, true)),
    pc,
    boxNames: [t('FAVORITOS'), t('INICIAIS')],
    saveIndex: 42,
  });
}

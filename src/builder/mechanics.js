// Motor de interações entre mecânicas (Quetzal, com o item e a habilidade do competitivo): reconhece combinações de
// habilidade × item × golpes (Toxic Orb + Poison Heal, Unburden + item que se gasta, Focus Sash + Reversal…), as que
// dependem do campo (Electric Seed com Electric Terrain, Hydration + Rest na chuva, Room Service no Trick Room) e as
// da equipe (hazards + quem força a troca, quem se sacrifica + quem varre).
//
// Cada regra diz o que precisa (habilidade, item, golpes) e duas coisas separadas: se a combinação FUNCIONA nas regras
// do jogo (o item que nunca ativa, como a Electric Seed sem Electric Terrain ou a Flame Orb num Fire, não funciona) e
// se ela RENDE (`use`, de 0 a 1: Unburden num Pokémon que não ataca forte funciona e rende pouco). Só o que rende
// (`use` 0,5+) conta na nota; o resto aparece como "funciona, mas rende pouco". Uma regra nova é uma linha em RULES,
// sem mudar o resto do motor.

const has = (list, x) => list.includes(x);
const any = (c, names) => c.moves.some(m => names.has(m.name));
const anyName = (c, names) => c.moves.find(m => names.has(m.name));
const hasAb = (c, names) => c.abs.find(a => names.includes(a)) || null;
const damaging = m => (m.category === 0 || m.category === 1) && !!m.type;

// Força do ataque (Ataque ou Ataque Especial base): 70 → 0, 110 → 1. Quanto aguenta: HP + Defesa + Defesa Especial
// (stats base na ordem HP/Atk/Def/SpA/SpD/Spe)
const attacker = c => Math.max(0, Math.min(1, (Math.max(c.b[1], c.b[3]) - 70) / 40));
const bulk = c => c.b[0] + c.b[2] + c.b[4];
const bulky = c => Math.max(0, Math.min(1, (bulk(c) - 200) / 80)); // 200 → 0, 280 → 1
const frail = c => 1 - bulky(c);
const physical = c => c.b[1] >= c.b[3];

// Golpes
const LOW_HP = new Set(['Reversal', 'Flail', 'Endeavor']);
const COUNTER = new Set(['Counter', 'Mirror Coat', 'Metal Burst', 'Comeuppance']);
const PROTECT = new Set(['Protect', 'Detect', 'Spiky Shield', "King's Shield", 'Baneful Bunker', 'Silk Trap', 'Burning Bulwark', 'Obstruct']);
const PIVOT = new Set(['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport', 'Chilly Reception', 'Shed Tail']);
const SELF_DROP = new Set(['Close Combat', 'Leaf Storm', 'Draco Meteor', 'Overheat', 'Superpower', 'V-create', 'Psycho Boost', 'Fleur Cannon',
  'Make It Rain', 'Hammer Arm', 'Clanging Scales', 'Spin Out', 'Armor Cannon', 'Headlong Rush', 'Ice Hammer', 'Dragon Ascent', 'Shell Smash']);
const CHARGE = new Set(['Meteor Beam', 'Electro Shot', 'Solar Beam', 'Solar Blade', 'Skull Bash', 'Sky Attack', 'Razor Wind', 'Freeze Shock',
  'Ice Burn', 'Geomancy']);
const SETUP = new Set(['Swords Dance', 'Dragon Dance', 'Nasty Plot', 'Calm Mind', 'Quiver Dance', 'Shell Smash', 'Bulk Up', 'Coil', 'Shift Gear',
  'Victory Dance', 'Tail Glow', 'Belly Drum', 'Geomancy', 'No Retreat', 'Clangorous Soul', 'Tidy Up', 'Fillet Away', 'Agility', 'Rock Polish',
  'Curse', 'Take Heart', 'Growth', 'Work Up', 'Iron Defense', 'Cosmic Power', 'Amnesia', 'Acid Armor', 'Cotton Guard']);
const SCREENS = new Set(['Reflect', 'Light Screen', 'Aurora Veil']);
const SOUND = new Set(['Hyper Voice', 'Boomburst', 'Bug Buzz', 'Snarl', 'Overdrive', 'Clanging Scales', 'Sparkling Aria', 'Echoed Voice', 'Round',
  'Disarming Voice', 'Psychic Noise', 'Torch Song', 'Alluring Voice', 'Uproar', 'Relic Song', 'Clangorous Soul']);
const MULTI_HIT = new Set(['Bullet Seed', 'Icicle Spear', 'Rock Blast', 'Pin Missile', 'Tail Slap', 'Bone Rush', 'Scale Shot', 'Arm Thrust',
  'Water Shuriken', 'Fury Attack', 'Comet Punch', 'Double Slap', 'Spike Cannon', 'Barrage', 'Population Bomb', 'Triple Axel', 'Triple Kick']);
const DRAIN = new Set(['Drain Punch', 'Giga Drain', 'Draining Kiss', 'Horn Leech', 'Leech Life', 'Parabolic Charge', 'Bitter Blade', 'Matcha Gotcha',
  'Oblivion Wing', 'Dream Eater']);
const HIGH_CRIT = new Set(['Stone Edge', 'Night Slash', 'Psycho Cut', 'Leaf Blade', 'Cross Chop', 'Crabhammer', 'Slash', 'Karate Chop', 'Razor Leaf',
  'Shadow Claw', 'Drill Run', 'Attack Order', 'Air Cutter', 'Aeroblaster', 'Spacial Rend', 'Cross Poison', 'Poison Tail', 'Blaze Kick',
  'Razor Shell', 'Snipe Shot', 'Esper Wing', 'Aqua Cutter', 'Triple Arrows', 'Ivy Cudgel']);
// Golpes de dano com efeito extra (Sheer Force tira o efeito e o recuo da Life Orb e sobe o poder 1,3×)
const SECONDARY = new Set(['Flamethrower', 'Fire Blast', 'Fire Punch', 'Ice Punch', 'Thunder Punch', 'Ice Beam', 'Blizzard', 'Thunderbolt',
  'Thunder', 'Psychic', 'Shadow Ball', 'Sludge Bomb', 'Sludge Wave', 'Earth Power', 'Focus Blast', 'Energy Ball', 'Bug Buzz', 'Crunch', 'Iron Head',
  'Rock Slide', 'Air Slash', 'Dark Pulse', 'Flash Cannon', 'Moonblast', 'Play Rough', 'Scald', 'Lava Plume', 'Discharge', 'Poison Jab', 'Gunk Shot',
  'Zen Headbutt', 'Waterfall', 'Rock Tomb', 'Icy Wind', 'Snarl', 'Mud Shot', 'Bulldoze', 'Fire Fang', 'Ice Fang', 'Thunder Fang', 'Poison Fang',
  'Heat Wave', 'Hurricane', 'Flare Blitz', 'Liquidation', 'Throat Chop', 'Meteor Mash', 'Power-Up Punch', 'Trop Kick', 'Lunge', 'Fiery Dance',
  'Charge Beam', 'Mystical Fire', 'Struggle Bug', 'Acid Spray', 'Seed Flare', 'Fake Out', 'Scorching Sands', 'Bitter Malice', 'Esper Wing',
  'Spirit Break', 'Aqua Step', 'Triple Arrows', 'Bleakwind Storm', 'Wildbolt Storm', 'Sandsear Storm', 'Springtide Storm', 'Dire Claw',
  'Barb Barrage', 'Infernal Parade', 'Mountain Gale', 'Chilling Water', 'Matcha Gotcha', 'Upper Hand', 'Electroweb', 'Muddy Water', 'Mud Bomb',
  'Bubble Beam', 'Aurora Beam', 'Signal Beam', 'Steel Wing', 'Metal Claw', 'Crush Claw', 'Shadow Bone', 'Breaking Swipe', 'Body Slam', 'Headbutt',
  'Zing Zap', 'Freeze-Dry', 'Ancient Power', 'Extrasensory', 'Twister', 'Dragon Rush', 'Dragon Breath', 'Night Daze', 'Psybeam', 'Water Pulse',
  'Rock Climb', 'Low Sweep', 'Lumina Crash', 'Torch Song', 'Ice Spinner', 'Psychic Noise', 'Pounce', 'Nuzzle', 'Blaze Kick', 'Poison Tail',
  'Cross Poison', 'Sludge', 'Smog', 'Ominous Wind', 'Silver Wind', 'Needle Arm', 'Bite', 'Rolling Kick', 'Stomp', 'Spark', 'Octazooka',
  'Mirror Shot', 'Leaf Tornado', 'Psyshield Bash', 'Sacred Fire', 'Diamond Storm', 'Steam Eruption', 'Bolt Strike', 'Blue Flare', 'Fusion Bolt']);
// Golpes que fazem recuar (Serene Grace dobra a chance) ou paralisam com chance alta
const FLINCH = new Set(['Air Slash', 'Iron Head', 'Rock Slide', 'Headbutt', 'Zen Headbutt', 'Zing Zap', 'Body Slam', 'Waterfall', 'Dark Pulse',
  'Bite', 'Stomp', 'Extrasensory', 'Twister', 'Dragon Rush', 'Needle Arm', 'Fire Fang', 'Ice Fang', 'Thunder Fang', 'Discharge', 'Nuzzle']);
const PHAZE = new Set(['Roar', 'Whirlwind', 'Dragon Tail', 'Circle Throw']);
const HAZARD = new Set(['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Stone Axe', 'Ceaseless Edge']);
const SACRIFICE = new Set(['Healing Wish', 'Lunar Dance', 'Memento']);
const PRANKSTER_MOVES = new Set(['Thunder Wave', 'Will-O-Wisp', 'Taunt', 'Encore', 'Reflect', 'Light Screen', 'Tailwind', 'Substitute', 'Roost',
  'Recover', 'Parting Shot', 'Destiny Bond', 'Trick Room', 'Spore', 'Glare', 'Toxic', 'Leech Seed', 'Haze', 'Memento', 'Healing Wish',
  'Aurora Veil', 'Nasty Plot', 'Swords Dance', 'Calm Mind', 'Bulk Up', 'Moonlight', 'Morning Sun', 'Synthesis', 'Wish', 'Disable', 'Yawn',
  'Spikes', 'Stealth Rock', 'Toxic Spikes', 'Sticky Web', 'Copycat', 'Switcheroo', 'Trick', 'Fake Tears', 'Charm', 'Feather Dance', 'Nuzzle']);
const SLEEP = new Set(['Hypnosis', 'Sleep Powder', 'Sing', 'Grass Whistle', 'Lovely Kiss', 'Dark Void']);

// Itens
const PINCH = new Set(['Salac Berry', 'Petaya Berry', 'Liechi Berry', 'Apicot Berry', 'Ganlon Berry', 'Starf Berry', 'Lansat Berry', 'Custap Berry']);
const HEAL_BERRY = new Set(['Sitrus Berry', 'Figy Berry', 'Wiki Berry', 'Mago Berry', 'Aguav Berry', 'Iapapa Berry']);
const SEED = { 'Electric Seed': 'Electric Terrain', 'Grassy Seed': 'Grassy Terrain', 'Psychic Seed': 'Psychic Terrain', 'Misty Seed': 'Misty Terrain' };
const SURGE = { 'Electric Surge': 'Electric Terrain', 'Hadron Engine': 'Electric Terrain', 'Grassy Surge': 'Grassy Terrain', 'Seed Sower': 'Grassy Terrain',
  'Psychic Surge': 'Psychic Terrain', 'Misty Surge': 'Misty Terrain' };
const CHOICE = new Set(['Choice Scarf', 'Choice Band', 'Choice Specs']);
const gemType = item => (/ Gem$/.test(item || '') ? item.slice(0, -4).toLowerCase() : null);
// Quem não pode ser queimado ou envenenado (a orb não ativa)
const NO_BURN = ['Water Veil', 'Water Bubble', 'Thermal Exchange', 'Comatose', 'Purifying Salt'];
const NO_POISON = ['Immunity', 'Comatose', 'Purifying Salt', 'Pastel Veil'];
const canBurn = c => !c.types.includes('fire') && !hasAb(c, NO_BURN);
const canPoison = c => !c.types.includes('poison') && !c.types.includes('steel') && !hasAb(c, NO_POISON);
const STATUS_ABS = ['Poison Heal', 'Guts', 'Quick Feet', 'Marvel Scale', 'Toxic Boost', 'Flare Boost'];
const ORB_MOVES = new Set(['Facade', 'Psycho Shift', 'Fling', 'Trick', 'Switcheroo']);

/**
 * O quanto o item que se gasta ativa de verdade (para Unburden, Acrobatics…): 1 = sempre ativa no começo (White Herb
 * com golpe que baixa os próprios stats, Power Herb com golpe que carrega, a semente com o terreno, a gema com o golpe
 * do tipo); menos quando depende de levar um golpe ou de perder HP. 0 = não se gasta.
 */
function consumes(c) {
  const it = c.item;
  if (!it) return 0;
  if (it === 'White Herb') return any(c, SELF_DROP) ? 1 : 0;
  if (it === 'Power Herb') return chargeMove(c) ? 1 : 0;
  if (SEED[it]) return seedTerrain(c) ? 1 : 0;
  const g = gemType(it);
  if (g) return c.moves.some(m => damaging(m) && m.type === g) ? 1 : 0;
  if (it === 'Throat Spray') return c.moves.some(m => SOUND.has(m.name) && m.category === 1) ? 1 : 0;
  if (it === 'Focus Sash') return 0.6;
  if (PINCH.has(it) || HEAL_BERRY.has(it)) return c.moves.some(m => m.name === 'Substitute' || m.name === 'Belly Drum' || m.name === 'Endure') ? 1 : 0.5;
  if (it === 'Air Balloon' || it === 'Weakness Policy') return 0.4;
  return 0;
}
/** Item que se gasta na batalha (o que o Unburden e o Acrobatics aproveitam), ative ou não com este Pokémon. */
const consumable = it => !!it && (it === 'White Herb' || it === 'Power Herb' || !!SEED[it] || !!gemType(it) || it === 'Throat Spray' || it === 'Focus Sash'
  || PINCH.has(it) || HEAL_BERRY.has(it) || it === 'Air Balloon' || it === 'Weakness Policy');
/** O golpe que carrega um turno (o Power Herb pula; Solar Beam no sol já não carrega). */
const chargeMove = c => c.moves.find(m => CHARGE.has(m.name) && !((m.name === 'Solar Beam' || m.name === 'Solar Blade') && c.field === 'sol')
  && !(m.name === 'Electro Shot' && c.field === 'chuva')) || null;
/** O terreno que ativa a semente: o que o próprio Pokémon põe (Electric Surge) ou o do plano. */
const seedTerrain = c => (SURGE[hasAb(c, Object.keys(SURGE))] === SEED[c.item] ? 'self' : c.field === SEED[c.item] ? c.field : null);

/**
 * O item funciona com o Pokémon, os golpes e o campo? (false = nunca ativa ou atrapalha: a semente sem o terreno, a
 * orb em quem não aproveita o status ou não pode recebê-lo, White Herb sem golpe que baixa os próprios stats…)
 */
export function itemWorks(item, c) {
  if (!item) return true;
  if (SEED[item]) return !!seedTerrain(c);
  if (item === 'Toxic Orb') return canPoison(c) && (!!hasAb(c, ['Poison Heal', 'Guts', 'Quick Feet', 'Marvel Scale', 'Toxic Boost']) || any(c, ORB_MOVES));
  if (item === 'Flame Orb') return canBurn(c) && (!!hasAb(c, ['Guts', 'Quick Feet', 'Marvel Scale', 'Flare Boost']) || any(c, ORB_MOVES));
  if (item === 'White Herb' || item === 'Power Herb' || item === 'Throat Spray' || gemType(item)) return consumes({ ...c, item }) > 0;
  if (item === 'Room Service') return c.field === 'Trick Room';
  if (item === 'Light Clay') return any(c, SCREENS);
  if (item === 'Terrain Extender') return !!hasAb(c, Object.keys(SURGE));
  if (item === 'Booster Energy') return !!hasAb(c, ['Protosynthesis', 'Quark Drive']);
  if (item === 'Loaded Dice') return any(c, MULTI_HIT) && !hasAb(c, ['Skill Link']);
  if (item === 'Eviolite') return !!c.nfe;
  if (item === 'Black Sludge') return c.types.includes('poison');
  if (item === 'Iron Ball' || item === 'Lagging Tail' || item === 'Sticky Barb') return any(c, new Set(['Trick', 'Switcheroo', 'Fling']));
  // Acrobatics como golpe Flying principal: o item tem que se gastar (com item, o golpe perde metade do poder)
  if (acroMain(c) && !consumes({ ...c, item })) return false;
  return true;
}
const acroMain = c => c.types.includes('flying') && c.moves.some(m => m.name === 'Acrobatics')
  && !c.moves.some(m => damaging(m) && m.type === 'flying' && m.name !== 'Acrobatics');

/**
 * As regras: `ability` (alguma delas), `item` (algum deles, ou uma função), `moves` (algum deles) e a condição de campo
 * (`field`: só conta no plano com aquele campo). `use(c, parts)` = o quanto rende (0–1); `v` = o valor na nota quando
 * rende tudo. `how`: o que acontece na batalha (a tela traduz).
 */
const RULES = [
  { id: 'poison-heal', ability: ['Poison Heal'], item: ['Toxic Orb'], v: 7, use: c => 0.5 + 0.5 * bulky(c) + (any(c, PROTECT) || any(c, new Set(['Substitute'])) ? 0.2 : 0),
    how: 'a Toxic Orb envenena e o Poison Heal cura 1/8 do HP por turno em vez de perder' },
  { id: 'guts-orb', ability: ['Guts'], item: c => (canBurn(c) ? 'Flame Orb' : canPoison(c) ? 'Toxic Orb' : null), v: 6,
    use: c => (physical(c) ? attacker(c) : 0.2) + (c.moves.some(m => m.name === 'Facade') ? 0.2 : 0), how: 'a orb dá o status no 1º turno e o Guts sobe o Ataque 1,5× (sem a queda da queimadura)' },
  { id: 'toxic-boost', ability: ['Toxic Boost'], item: ['Toxic Orb'], v: 6, use: c => (physical(c) ? attacker(c) : 0.2), how: 'envenenado, o Ataque sobe 1,5×' },
  { id: 'flare-boost', ability: ['Flare Boost'], item: ['Flame Orb'], v: 6, use: c => (!physical(c) ? attacker(c) : 0.3), how: 'queimado, o Ataque Especial sobe 1,5×' },
  { id: 'quick-feet', ability: ['Quick Feet'], item: c => (canBurn(c) ? 'Flame Orb' : canPoison(c) ? 'Toxic Orb' : null), v: 4, use: c => attacker(c) * 0.8,
    how: 'com status, a Velocidade sobe 1,5×' },
  { id: 'marvel-scale', ability: ['Marvel Scale'], item: c => (canPoison(c) ? 'Toxic Orb' : canBurn(c) ? 'Flame Orb' : null), v: 3, use: c => 0.3 + 0.5 * bulky(c),
    how: 'com status, a Defesa sobe 1,5×' },
  { id: 'magic-guard', ability: ['Magic Guard'], item: ['Life Orb'], v: 6, use: attacker, how: 'Life Orb sobe o dano 1,3× e o Magic Guard tira o recuo' },
  { id: 'sheer-force', ability: ['Sheer Force'], item: ['Life Orb'], v: 6, use: c => Math.min(1, c.moves.filter(m => SECONDARY.has(m.name)).length / 2) * (0.4 + 0.6 * attacker(c)),
    how: 'golpes com efeito extra sobem 1,3× e a Life Orb não tira HP' },
  { id: 'unburden', ability: ['Unburden'], item: c => (consumable(c.item) ? c.item : null), v: 7, use: c => consumes(c) * (0.3 + 0.7 * attacker(c)),
    field: c => (SEED[c.item] && seedTerrain(c) !== 'self' ? SEED[c.item] : null), how: 'quando o item se gasta, a Velocidade dobra' },
  { id: 'sash-lowhp', item: ['Focus Sash'], moves: new Set([...LOW_HP, ...COUNTER]), v: 4, use: c => 0.3 + 0.7 * frail(c),
    how: 'a Focus Sash segura um golpe com 1 HP e o golpe aproveita o HP baixo (ou devolve o dano)' },
  { id: 'sturdy-lowhp', ability: ['Sturdy'], moves: new Set([...LOW_HP, ...COUNTER]), v: 3, use: c => 0.4 + 0.4 * frail(c),
    how: 'Sturdy segura um golpe com 1 HP com o HP cheio e o golpe aproveita' },
  { id: 'endure-lowhp', moves: new Set(['Endure']), also: LOW_HP, v: 3, use: c => (PINCH.has(c.item) ? 1 : 0.6), how: 'Endure deixa com 1 HP para o golpe de HP baixo' },
  { id: 'sub-pinch', item: c => (PINCH.has(c.item) && c.item !== 'Custap Berry' ? c.item : null), moves: new Set(['Substitute']), v: 4, use: attacker,
    how: 'três Substitutes levam o HP até a fruta, que sobe o stat' },
  { id: 'belly-berry', item: c => (c.item === 'Sitrus Berry' || PINCH.has(c.item) ? c.item : null), moves: new Set(['Belly Drum']), v: 6,
    use: c => (physical(c) ? attacker(c) : 0), how: 'Belly Drum leva a metade do HP e a fruta devolve na hora' },
  { id: 'shell-smash-herb', item: ['White Herb'], moves: new Set(['Shell Smash']), v: 5, use: attacker, how: 'White Herb desfaz a queda das defesas do Shell Smash' },
  { id: 'power-herb', item: ['Power Herb'], moves: CHARGE, v: 5, use: c => (chargeMove(c) ? attacker(c) : 0), how: 'Power Herb tira o turno de carga do golpe' },
  { id: 'booster', ability: ['Protosynthesis', 'Quark Drive'], item: ['Booster Energy'], v: 4, use: () => 1, how: 'Booster Energy ativa a habilidade sem precisar do sol ou do terreno' },
  { id: 'speed-boost', ability: ['Speed Boost'], moves: PROTECT, v: 6, use: c => 0.4 + 0.6 * attacker(c), how: 'Protect no 1º turno ganha Velocidade sem risco' },
  { id: 'moody', ability: ['Moody'], moves: new Set([...PROTECT, 'Substitute']), v: 4, use: () => 0.8, how: 'cada turno de Protect ou Substitute sobe um stat' },
  { id: 'regenerator', ability: ['Regenerator'], moves: PIVOT, v: 5, use: () => 1, how: 'troca com o pivô e recupera 1/3 do HP ao sair' },
  { id: 'prankster', ability: ['Prankster'], moves: PRANKSTER_MOVES, v: 5, use: c => Math.min(1, c.moves.filter(m => PRANKSTER_MOVES.has(m.name)).length / 2),
    how: 'golpes de efeito saem antes de todo mundo' },
  { id: 'simple', ability: ['Simple'], moves: SETUP, v: 6, use: c => 0.5 + 0.5 * attacker(c), how: 'Simple dobra cada subida de stat' },
  { id: 'rest-talk', moves: new Set(['Rest']), also: new Set(['Sleep Talk']), v: 4, use: bulky, how: 'Rest cura tudo e o Sleep Talk ataca dormindo' },
  { id: 'rest-berry', item: ['Chesto Berry', 'Lum Berry'], moves: new Set(['Rest']), v: 3, use: c => 0.3 + 0.7 * bulky(c), how: 'a fruta acorda logo depois do Rest' },
  { id: 'rest-ability', ability: ['Shed Skin', 'Early Bird', 'Natural Cure'], moves: new Set(['Rest']), v: 3, use: c => 0.3 + 0.7 * bulky(c),
    how: 'a habilidade encurta o sono do Rest' },
  { id: 'hydration', ability: ['Hydration'], moves: new Set(['Rest']), v: 5, field: () => 'chuva', use: c => 0.4 + 0.6 * bulky(c),
    how: 'na chuva, o Hydration acorda no fim do turno do Rest' },
  { id: 'harvest', ability: ['Harvest'], item: c => (HEAL_BERRY.has(c.item) || c.item === 'Lum Berry' ? c.item : null), v: 3, use: c => 0.4 + 0.6 * bulky(c),
    how: 'o Harvest recupera a fruta (sempre no sol)' },
  { id: 'gluttony', ability: ['Gluttony', 'Cheek Pouch', 'Ripen', 'Cud Chew'], item: c => (HEAL_BERRY.has(c.item) || PINCH.has(c.item) ? c.item : null), v: 2,
    use: () => 0.6, how: 'a habilidade tira mais da fruta' },
  { id: 'light-clay', item: ['Light Clay'], moves: SCREENS, v: 4, use: c => Math.min(1, 0.5 * c.moves.filter(m => SCREENS.has(m.name)).length + (c.moves.some(m => m.name === 'Aurora Veil') ? 0.5 : 0)),
    how: 'as telas duram 8 turnos em vez de 5' },
  { id: 'terrain-extender', ability: Object.keys(SURGE), item: ['Terrain Extender'], v: 3, use: () => 0.8, how: 'o terreno dura 8 turnos em vez de 5' },
  { id: 'eviolite', item: ['Eviolite'], v: 5, use: c => (c.nfe ? 0.3 + 0.7 * bulky(c) : 0), how: 'sem evoluir, Eviolite sobe as defesas 1,5×' },
  { id: 'imposter', ability: ['Imposter'], item: ['Choice Scarf'], v: 4, use: () => 1, how: 'copia o adversário e passa na frente com a Choice Scarf' },
  { id: 'trick-choice', item: c => (CHOICE.has(c.item) ? c.item : null), moves: new Set(['Trick', 'Switcheroo']), v: 3, use: c => 0.4 + 0.4 * bulky(c),
    how: 'Trick passa o Choice para quem não quer ficar preso num golpe' },
  { id: 'acrobatics', moves: new Set(['Acrobatics']), item: c => (consumable(c.item) ? c.item : null), v: 3, use: c => consumes(c),
    how: 'sem item, Acrobatics dobra de poder' },
  { id: 'rocky-helmet', ability: ['Rough Skin', 'Iron Barbs'], item: ['Rocky Helmet'], v: 2, use: bulky, how: 'quem bate com contato perde 1/8 + 1/6 do HP' },
  { id: 'loaded-dice', item: ['Loaded Dice'], moves: MULTI_HIT, v: 4, use: attacker, how: 'golpes de vários acertos acertam 4–5 vezes' },
  { id: 'skill-link', ability: ['Skill Link'], moves: MULTI_HIT, v: 2, use: attacker, how: 'golpes de vários acertos acertam 5 vezes' },
  { id: 'throat-spray', item: ['Throat Spray'], moves: SOUND, v: 3, use: c => (c.moves.some(m => SOUND.has(m.name) && m.category === 1) ? attacker(c) : 0),
    how: 'o 1º golpe de som sobe o Ataque Especial' },
  { id: 'super-luck', ability: ['Super Luck', 'Sniper'], item: ['Scope Lens', 'Razor Claw'], moves: HIGH_CRIT, v: 3, use: attacker,
    how: 'crítico garantido nos golpes de crítico alto' },
  { id: 'serene-grace', ability: ['Serene Grace'], moves: FLINCH, v: 5, use: c => Math.min(1, 0.6 * c.moves.filter(m => FLINCH.has(m.name)).length),
    how: 'o efeito extra dobra de chance (recuo em 60%)' },
  { id: 'no-guard', ability: ['No Guard'], moves: null, v: 3, use: c => Math.min(1, c.moves.filter(m => damaging(m) && m.accuracy && m.accuracy <= 80).length * 0.6),
    how: 'golpes fortes e imprecisos não erram' },
  { id: 'compound-eyes', ability: ['Compound Eyes'], moves: SLEEP, v: 3, use: () => 0.8, how: 'o golpe de sono passa a acertar quase sempre' },
  { id: 'triage', ability: ['Triage'], moves: DRAIN, v: 3, use: () => 0.8, how: 'golpes que drenam HP saem antes de todo mundo' },
  { id: 'big-root', item: ['Big Root'], moves: DRAIN, v: 2, use: bulky, how: 'golpes que drenam curam 1,3× mais' },
  { id: 'baton-pass', moves: new Set(['Baton Pass']), also: new Set([...SETUP, 'Substitute']), v: 3, use: () => 0.7, how: 'sobe os stats e passa para quem varre' },
  { id: 'room-service', item: ['Room Service'], v: 3, field: () => 'Trick Room', use: () => 0.8, how: 'no Trick Room, a Velocidade cai e ele passa na frente' },
  { id: 'weakness-policy', item: ['Weakness Policy'], v: 3, use: c => bulky(c) * attacker(c), how: 'golpe super efetivo sobe Ataque e Ataque Especial 2 níveis' },
];
const RULE_BY_ID = new Map(RULES.map(r => [r.id, r]));

/**
 * As combinações do Pokémon. `c` = { abs, item, moves, types, b, nfe?, field? } (o campo do plano, se houver).
 * @returns {Array<{ id, label, how, v, use, field, works, ok }>} `works`: funciona nas regras; `ok`: rende (use 0,5+)
 */
export function combosOf(c) {
  const out = [];
  const names = new Set(c.moves.map(m => m.name));
  for (const r of RULES) {
    const ab = r.ability ? hasAb(c, r.ability) : null;
    if (r.ability && !ab) continue;
    let item = null;
    if (r.item) {
      item = typeof r.item === 'function' ? r.item(c) : r.item.includes(c.item) ? c.item : null;
      if (!item || item !== c.item) continue;
    }
    let mv = null;
    if (r.moves) { mv = anyName(c, r.moves); if (!mv) continue; }
    if (r.also && !c.moves.some(m => r.also.has(m.name) && m.name !== (mv && mv.name))) continue;
    // Funciona: o item ativa (itemWorks) e, com condição de campo, o campo do plano é o pedido
    const field = r.field ? r.field(c) : null;
    const works = (!item || itemWorks(item, c)) && (!field || c.field === field);
    const use = Math.max(0, Math.min(1, r.use(c)));
    const parts = [item, ab, mv && mv.name, r.also ? c.moves.find(m => r.also.has(m.name) && m.name !== (mv && mv.name)).name : null].filter(Boolean);
    out.push({ id: r.id, label: [...new Set(parts)].join(' + '), how: r.how, v: r.v, use, field, works, ok: works && use >= 0.5 });
  }
  return out.sort((a, b) => b.v * b.use - a.v * a.use);
}
/** O valor das combinações que rendem: a melhor inteira, as outras pela metade, até COMBO_CAP por Pokémon. */
export const COMBO_CAP = 9;
export function comboValue(list) {
  let s = 0, k = 0;
  for (const x of list) if (x.ok) { s += x.v * x.use * (k++ ? 0.5 : 1); }
  return Math.min(COMBO_CAP, s);
}

/** Itens que o motor testa para quem não tem item do competitivo (sem dados no Smogon). */
const KIT_ITEMS = ['Toxic Orb', 'Flame Orb', 'Life Orb', 'Focus Sash', 'White Herb', 'Power Herb', 'Sitrus Berry', 'Salac Berry', 'Petaya Berry',
  'Liechi Berry', 'Chesto Berry', 'Light Clay', 'Eviolite', 'Choice Scarf', 'Loaded Dice', 'Throat Spray', 'Scope Lens', 'Rocky Helmet',
  'Booster Energy', 'Terrain Extender', 'Flying Gem', 'Big Root'];
/**
 * O item que forma a melhor combinação que rende com a habilidade e os golpes (sem os dados do competitivo). `ok(nome)`
 * filtra os itens do jogo. null se nenhum rende.
 */
export function kitItem(c, ok) {
  let best = null, bv = 0;
  for (const item of KIT_ITEMS) {
    if (!ok(item)) continue;
    const v = comboValue(combosOf({ ...c, item }).filter(x => x.label.includes(item)));
    if (v > bv) { bv = v; best = item; }
  }
  return best;
}

// Na equipe: hazards + quem força a troca (o adversário entra de novo nos hazards); quem se sacrifica (Healing Wish,
// Memento) + quem varre com setup; telas + quem varre (fora da Hiperofensiva, que já conta isso no plano)
export const TEAM = { hazard: 1, phaze: 2, sacrifice: 4, sweeper: 8, screens: 16 };
const TEAM_V = { hazards: 4, sacrifice: 4, screens: 3 };
/** Os bits da equipe que o Pokémon dá. */
export function teamBits(c) {
  let x = 0;
  if (any(c, HAZARD)) x |= TEAM.hazard;
  if (any(c, PHAZE)) x |= TEAM.phaze;
  if (any(c, SACRIFICE)) x |= TEAM.sacrifice;
  if (any(c, SCREENS)) x |= TEAM.screens;
  const sweep = c.moves.some(m => SETUP.has(m.name) && !['Iron Defense', 'Cosmic Power', 'Amnesia', 'Acid Armor', 'Cotton Guard', 'Growth', 'Work Up'].includes(m.name));
  if (sweep && Math.max(c.b[1], c.b[3]) >= 100 && c.moves.filter(damaging).length >= 2) x |= TEAM.sweeper;
  return x;
}
/** As combinações da equipe a partir dos bits de cada membro (cbits). */
export function teamCombos(bits, plan) {
  let all = 0;
  for (const b of bits) all |= b;
  const out = [];
  if ((all & TEAM.hazard) && (all & TEAM.phaze)) out.push({ id: 'hazard-phaze', v: TEAM_V.hazards, how: 'quem força a troca faz o adversário entrar de novo nos hazards' });
  // Quem se sacrifica não é quem varre: precisa de outro membro com setup
  if (bits.some(b => b & TEAM.sacrifice) && bits.some(b => (b & TEAM.sweeper) && !(b & TEAM.sacrifice))) {
    out.push({ id: 'sacrifice-sweeper', v: TEAM_V.sacrifice, how: 'quem se sacrifica (Healing Wish, Memento) abre a entrada de quem varre' });
  }
  if (plan.kind !== 'offense' && bits.some(b => b & TEAM.screens) && bits.some(b => (b & TEAM.sweeper) && !(b & TEAM.screens))) {
    out.push({ id: 'screens-sweeper', v: TEAM_V.screens, how: 'as telas dão turnos para quem sobe os stats' });
  }
  return out;
}
/** A soma das combinações da equipe (a conta da nota: sem criar listas). */
export function teamComboValue(team, plan) {
  let all = 0, sac = false, sweepOther = false, scr = false, sweepScr = false;
  for (const e of team) {
    const b = e.cbits;
    all |= b;
    if (b & TEAM.sacrifice) sac = true; else if (b & TEAM.sweeper) sweepOther = true;
    if (b & TEAM.screens) scr = true; else if (b & TEAM.sweeper) sweepScr = true;
  }
  let v = 0;
  if ((all & TEAM.hazard) && (all & TEAM.phaze)) v += TEAM_V.hazards;
  if (sac && sweepOther) v += TEAM_V.sacrifice;
  if (plan.kind !== 'offense' && scr && sweepScr) v += TEAM_V.screens;
  return v;
}

export { RULES, RULE_BY_ID };

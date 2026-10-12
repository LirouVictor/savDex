// Montador de equipes do app, sem IA. Para cada plano que o save comporta (clima, terreno, Trick Room, Hiperofensiva ou
// equilibrado), procura no PC inteiro a melhor equipe de 6 por uma nota feita só de contas: fraquezas em comum
// (descontando o que o clima da equipe corta), cobertura ofensiva, papéis (pivô, prioridade, recuperação…),
// atacantes físicos × especiais, stats base, quem põe/aproveita o plano e quanto as duplas da equipe jogam juntas nos
// times do competitivo (Smogon; smogon.js). A busca é em feixe (beam search):
// começa do núcleo do plano e vai completando uma vaga de cada vez, guardando as melhores equipes parciais.
// O nível não conta (o jogador pode treinar depois); quem ainda não evoluiu conta pela forma evoluída final e quem
// segura a própria megapedra conta com os tipos, stats e habilidade da mega. Nos jogos com golpes por nível da ROM,
// os golpes que o Pokémon aprende e ainda não sabe também contam (para pôr o plano, aproveitá-lo e para os papéis),
// com peso menor, e a tela diz o que ensinar.

import { strategyOf, rolesOf, weatherConflict, PRIORITY_MOVES, WEATHER, FIELD, MEGA_FIELD, ABUSERS, MOVE_ABUSERS, MEGA_ABUSERS, FIELD_MOVES } from '../ai/strategy.js';
import { isMegaStone, speciesKey, MAX_MEGAS } from '../ai/prompt.js';
import { evolvedVersions, megaForm, megaStonesFor } from '../ai/evolve.js';
import { threatList, typeMult, variantOf, threatBits } from './threats.js';
import { moveInfo } from '../parser/describe.js';
import { pickMoveset, effTable, planSensitive, SRC } from './moveset.js';
import { itemWorks, kitItem, combosOf, comboValue, teamBits, teamComboValue } from './mechanics.js';
import { roleBits, strategyValue } from './strategies.js';
export { teamCombos } from './mechanics.js';
import speciesData from '../data/species.json';

// Lendários e míticos (PokeAPI), pelo nome sem pontuação: o mesmo em todos os jogos (Ho-Oh → hooh)
const LEGENDARY = new Set(speciesData.legendary);
/** Lendário ou mítico (as formas e megas contam pela espécie: Mewtwo Mega X, Calyrex Shadow…). */
export const isLegendary = m => LEGENDARY.has(String(m.species.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''));

export const WEATHERS = ['sol', 'chuva', 'tempestade de areia', 'neve/granizo'];
const TERRAINS = ['Electric Terrain', 'Psychic Terrain', 'Grassy Terrain', 'Misty Terrain'];
const SPE = 5; // stats base na ordem HP/Atk/Def/SpA/SpD/Spe
const SLOW = 50, FAST = 90;
const BEAM = 24; // equipes parciais guardadas a cada vaga
// Candidatos por plano (os melhores sozinhos para ele): 110, ou 220 nos PCs grandes (mais de BIG_PC na busca). Com 110,
// nos PCs de 700+ Pokémon ficavam de fora membros que deixam a equipe mais forte (os lendários levam as vagas pelo valor
// sozinho): em batalhas simuladas (test/builder-sim.test.js), a equipe com 220 venceu a de 110 do mesmo plano nos 6 planos
// em que mudou (68% frente a frente), o mesmo que sem corte nenhum. Nos PCs de 230 a 380, 220 não mudava nenhuma equipe
// e dobrava o tempo
const CANDS = 110, CANDS_BIG = 220, BIG_PC = 500;
const ALTS = 3; // equipes por plano: a melhor e até 2 alternativas
const ALT_SHARED = 3; // uma alternativa divide no máximo 3 membros com cada equipe anterior do mesmo plano
const ALT_MIN = 0.9; // e só aparece com 90% ou mais da nota da melhor
const ALT_BEAM = 12; // busca das alternativas com menos equipes parciais (metade do tempo)

// Peso de cada papel (o primeiro membro com o papel conta; repetir não soma)
const ROLE_W = { pivô: 5, prioridade: 5, recuperação: 4, 'controle de velocidade': 4, setup: 4, tanque: 3, intimidação: 3, hazards: 3, 'tira hazards': 3, status: 2, telas: 2 };
const ROLES = Object.keys(ROLE_W);
const KEY_ROLES = ['prioridade', 'recuperação', 'controle de velocidade', 'pivô'];

// Habilidades que anulam um tipo de ataque (o Pokémon entra no golpe e não sofre nada; Lightning Rod numa equipe
// de chuva, que tem muitos fracos a Electric) e as que o cortam pela metade
export const ABILITY_IMMUNE = {
  Levitate: ['ground'], 'Earth Eater': ['ground'], 'Lightning Rod': ['electric'], 'Volt Absorb': ['electric'], 'Motor Drive': ['electric'],
  'Storm Drain': ['water'], 'Water Absorb': ['water'], 'Dry Skin': ['water'], 'Flash Fire': ['fire'], 'Well-Baked Body': ['fire'], 'Sap Sipper': ['grass'],
};
export const ABILITY_HALVE = { 'Thick Fat': ['fire', 'ice'], Heatproof: ['fire'], 'Water Bubble': ['fire'], 'Purifying Salt': ['ghost'] };
// Item que faz o clima durar 8 turnos em vez de 5 (vale em quem põe o clima do plano)
const WEATHER_ROCK = { 'Heat Rock': 'sol', 'Damp Rock': 'chuva', 'Smooth Rock': 'tempestade de areia', 'Icy Rock': 'neve/granizo' };

// Habilidades que dobram a velocidade no clima/terreno: são elas que definem o arquétipo (Swift Swim na chuva…)
const SPEED_ABILITIES = new Set(['Swift Swim', 'Chlorophyll', 'Sand Rush', 'Slush Rush', 'Surge Surfer']);

// Quem aproveita pouco o clima: cura ou esquiva (Rain Dish, Sand Veil…) e recuperação mais forte no sol. Conta, mas
// não sustenta um plano sozinho
const WEAK_ABUSE = new Set(['Rain Dish', 'Hydration', 'Dry Skin', 'Sand Veil', 'Snow Cloak', 'Ice Body', 'Grass Pelt']);
const WEAK_MOVES = new Set(['Moonlight', 'Morning Sun', 'Synthesis', 'Shore Up']);

// Habilidades que atrapalham o próprio Pokémon (ataca um turno sim, outro não; metade do Ataque por 5 turnos…)
const BAD_ABILITIES = { Truant: 20, 'Slow Start': 20, Defeatist: 6, Klutz: 4, Stall: 4 };

// Papéis que vale a pena ganhar ensinando um golpe, e golpes fracos demais para sugerir
const TEACH_ROLES = ['pivô', 'prioridade', 'recuperação', 'controle de velocidade', 'setup', 'hazards', 'tira hazards'];
const TEACH_SKIP = new Set(['String Shot', 'Scary Face', 'Cotton Spore', 'Low Sweep', 'Bulldoze', 'Rock Tomb', 'Nuzzle', 'Growth', 'Work Up',
  'Hone Claws', 'Flame Charge', 'Power-Up Punch', 'Trailblaze', 'Quick Attack', 'Feint', 'Teleport', 'Baton Pass', 'Rest', 'Autotomize']);

// Golpe de dano que ainda precisa ensinar: pena pequena (o Pokémon pronto vale um pouco mais)
const TEACH_ATK = 3;
// Golpe do moveset que o menu do Pokémon ensina na hora (Quetzal: tutor ou nível já alcançado): pena menor ainda
const TEACH_NOW = 0.5;
// Modo "Prontos para usar": o trabalho que falta pesa mais (evoluir, ensinar golpes de dano, dar a megapedra do modo
// sem restrição, níveis abaixo dos Pokémon mais fortes do save). Não zera ninguém: um Pokémon bom que precisa
// de preparo ainda entra se compensar
const READY = { evolve: 6, teach: 5, now: 1, stone: 3, perLevels: 5, maxLevels: 10 };

// Valor dos stats base na parte "Pokémon" da nota. 'bst' (padrão): o total. Os outros só existem para o teste de
// comparação (test/builder-bench.test.js), que mede o efeito de cada um nos saves reais antes de qualquer troca:
// 'half500': metade do valor acima de 500; 'useful': sem o stat de ataque que os golpes dele não usam;
// 'bulk': como 'useful', com HP × defesas combinados (defesa alta com HP baixo vale menos)
export const STAT_MODELS = ['bst', 'half500', 'useful', 'bulk', 'role'];
const SUPPORT_ROLES = ['recuperação', 'status', 'hazards', 'telas', 'tanque'];
function statValue(e, model) {
  const [hp, atk, def, spa, spd, spe] = e.bf.species.baseStats;
  if (model === 'half500') return (Math.min(e.bst, 500) - 350) / 12 + Math.max(0, e.bst - 500) / 24;
  if (model === 'useful' || model === 'bulk' || model === 'role') {
    // O ataque que os golpes de dano usam (os dois, na proporção dos golpes); sem golpe de dano, o maior
    const n = e.nPhys + e.nSpec;
    const used = n ? (e.nPhys * atk + e.nSpec * spa) / n : Math.max(atk, spa);
    if (model === 'useful') return (hp + def + spd + spe + used - 290) / 10;
    const bulk = Math.sqrt(hp * (def + spd) / 2);
    const attacker = (used + spe + 3 * bulk - 290) / 10;
    if (model === 'bulk') return attacker;
    // 'role': quem tem papel de apoio (recuperação, status, hazards, telas, tanque) também vale pela resistência
    if (!e.roles.some(r => SUPPORT_ROLES.includes(r))) return attacker;
    return Math.max(attacker, (4 * bulk + 0.5 * used + 0.5 * spe - 290) / 10);
  }
  return (e.bst - 350) / 12; // 300 → −4, 450 → +8, 600 → +21
}

/** Quanto falta para o Pokémon estar pronto, em pontos da nota (parte "Preparo"). */
function readyCost(e, ready, refLevel) {
  // Golpes do moveset a ensinar: na hora (tutor, nível já alcançado) ou treinando até o nível
  let now = 0, train = 0;
  for (const x of e.setTeach) { if (x.src === SRC.level) train++; else now++; }
  // Habilidade a trocar (Ability Capsule/Patch): como um golpe a ensinar na hora
  if (e.m.gear && e.m.gear.ability) now++;
  if (!ready) return TEACH_ATK * (e.teachAtk.length + train) + TEACH_NOW * now;
  const gap = Math.max(0, refLevel - (e.real.level || 0));
  return READY.evolve * (e.m.evolvedFrom ? 1 : 0) + READY.teach * (e.teachAtk.length + train) + READY.now * now + (e.given ? READY.stone : 0)
    + Math.min(READY.maxLevels, gap / READY.perLevels);
}

// Papel que só vem de golpe a ensinar vale menos que o de golpe que o Pokémon já sabe (ocupa um espaço de golpe)
const LEARN_ROLE = 0.6;

// Golpes de dano que contam: os fracos do começo do jogo (Tackle, Ember, Water Pulse…) não seguram uma batalha.
// Contam poder 70+, poder variável, os que batem mais do que o número diz (vários acertos, poder que cresce…)
// e os de prioridade com STAB (Aqua Jet no Basculegion conta; Quick Attack no Dreepy, não).
const STRONG_LOW = new Set(['Acrobatics', 'Weather Ball', 'Last Respects', 'Rage Fist', 'Dual Wingbeat', 'Triple Axel', 'Bonemerang',
  'Double Iron Bash', 'Tachyon Cutter', 'Surging Strikes', 'Population Bomb', 'Icicle Spear', 'Bullet Seed', 'Rock Blast', 'Scale Shot',
  'Pin Missile', 'Tail Slap', 'Bone Rush', 'Dragon Darts', 'Twin Beam', 'Gear Grind', 'Dual Chop', 'Triple Dive', 'Water Shuriken',
  'Knock Off', 'Facade', 'Hex', 'Venoshock', 'Storm Throw', 'Grassy Glide', 'Stored Power', 'Power Trip', 'Brine', 'Payback',
  'Avalanche', 'Revenge', 'Stomping Tantrum', 'Lash Out', 'Rising Voltage', 'Expanding Force', 'Terrain Pulse']);

// Habilidades que fortalecem golpes: Technician (poder 60 ou menos), Iron Fist (socos), Strong Jaw (mordidas)…
// O golpe conta com o poder que tem com a habilidade (Bullet Punch no Scizor com Technician; Quick Attack com
// Aerilate vira Flying). Os tipos de golpe vêm das listas abaixo.
const PUNCH = new Set(['Bullet Punch', 'Mach Punch', 'Drain Punch', 'Ice Punch', 'Fire Punch', 'Thunder Punch', 'Shadow Punch', 'Mega Punch',
  'Dynamic Punch', 'Focus Punch', 'Hammer Arm', 'Meteor Mash', 'Power-Up Punch', 'Sky Uppercut', 'Comet Punch', 'Dizzy Punch', 'Plasma Fists',
  'Double Iron Bash', 'Jet Punch', 'Rage Fist', 'Surging Strikes', 'Wicked Blow', 'Headlong Rush', 'Ice Hammer']);
const BITE = new Set(['Bite', 'Crunch', 'Fire Fang', 'Ice Fang', 'Thunder Fang', 'Poison Fang', 'Psychic Fangs', 'Hyper Fang', 'Jaw Lock', 'Fishious Rend']);
const PULSE = new Set(['Water Pulse', 'Dark Pulse', 'Dragon Pulse', 'Aura Sphere', 'Origin Pulse', 'Terrain Pulse']);
const SLICE = new Set(['Aerial Ace', 'Air Cutter', 'Air Slash', 'Aqua Cutter', 'Behemoth Blade', 'Bitter Blade', 'Ceaseless Edge', 'Cross Poison',
  'Cut', 'Fury Cutter', 'Kowtow Cleave', 'Leaf Blade', 'Night Slash', 'Psycho Cut', 'Razor Leaf', 'Razor Shell', 'Sacred Sword', 'Secret Sword',
  'Slash', 'Solar Blade', 'Stone Axe', 'X-Scissor', 'Population Bomb', 'Tachyon Cutter', 'Mighty Cleave', 'Psyblade']);
const RECOIL = new Set(['Brave Bird', 'Double-Edge', 'Flare Blitz', 'Head Smash', 'Wood Hammer', 'Wild Charge', 'Take Down', 'Volt Tackle',
  'Head Charge', 'Wave Crash', 'Submission', 'High Jump Kick', 'Jump Kick', 'Light of Ruin']);
const SOUND = new Set(['Hyper Voice', 'Boomburst', 'Bug Buzz', 'Snarl', 'Overdrive', 'Clanging Scales', 'Sparkling Aria', 'Echoed Voice', 'Round',
  'Disarming Voice', 'Psychic Noise', 'Torch Song', 'Alluring Voice']);
const ATE = { Aerilate: 'flying', Pixilate: 'fairy', Refrigerate: 'ice', Galvanize: 'electric' };
const TYPE_BOOST = { 'Water Bubble': ['water', 2], Steelworker: ['steel', 1.5], 'Steely Spirit': ['steel', 1.5], Transistor: ['electric', 1.3],
  "Dragon's Maw": ['dragon', 1.5], 'Rocky Payload': ['rock', 1.5] };
const MOVE_BOOST = { 'Iron Fist': [PUNCH, 1.2], 'Strong Jaw': [BITE, 1.5], 'Mega Launcher': [PULSE, 1.5], Sharpness: [SLICE, 1.5], Reckless: [RECOIL, 1.2],
  'Punk Rock': [SOUND, 1.3] };
// Com Contrary, golpes que baixam os próprios stats passam a subir: viram setup (Leaf Storm no Serperior)
const DROP_MOVES = new Set(['Close Combat', 'Leaf Storm', 'Draco Meteor', 'Overheat', 'Superpower', 'V-create', 'Psycho Boost', 'Fleur Cannon',
  'Make It Rain', 'Hammer Arm', 'Clanging Scales', 'Spin Out', 'Armor Cannon', 'Headlong Rush', 'Ice Hammer', 'Dragon Ascent']);
// Papéis que vêm da habilidade
const ABILITY_ROLES = { Intimidate: 'intimidação' };

// Hiperofensiva (o arquétipo mais comum no competitivo de singles): quem abre o caminho com hazards ou telas e 3+
// atacantes que sobem os stats e varrem. Só os golpes de setup de verdade (Growth, Work Up, Flame Charge… não)
const SWEEP_MOVES = new Set(['Swords Dance', 'Dragon Dance', 'Nasty Plot', 'Calm Mind', 'Quiver Dance', 'Shell Smash', 'Bulk Up', 'Coil',
  'Shift Gear', 'Victory Dance', 'Tail Glow', 'Belly Drum', 'Geomancy', 'No Retreat', 'Clangorous Soul', 'Tidy Up', 'Fillet Away',
  'Agility', 'Rock Polish']);
const SUPPORT_MOVES = new Set(['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web', 'Stone Axe', 'Ceaseless Edge', 'Reflect', 'Light Screen', 'Aurora Veil']);
// Na nota: cada um dos 4 melhores atacantes com setup e quem abre o caminho (golpe a ensinar vale LEARN_ROLE)
const HO_SWEEP = 9, HO_SUPPORT = 12;

/** O golpe com a habilidade: tipo (Aerilate…) e poder (Technician…). `by` = a habilidade que mudou algo. */
function withAbility(mv, ab, types) {
  if (!damaging(mv) || !ab) return mv;
  const p = mv.power || 0;
  if (ATE[ab] && mv.type === 'normal') return { ...mv, type: ATE[ab], power: p * 1.2, by: ab };
  let k = 1;
  if (ab === 'Technician' && p > 0 && p <= 60) k = 1.5;
  else if (MOVE_BOOST[ab] && MOVE_BOOST[ab][0].has(mv.name)) k = MOVE_BOOST[ab][1];
  else if (TYPE_BOOST[ab] && TYPE_BOOST[ab][0] === mv.type) k = TYPE_BOOST[ab][1];
  else if (ab === 'Adaptability' && types.includes(mv.type)) k = 4 / 3; // STAB 2× em vez de 1,5×
  else if ((ab === 'Huge Power' || ab === 'Pure Power') && mv.category === 0) k = 2;
  else if (ab === 'Hustle' && mv.category === 0) k = 1.5;
  return k > 1 && p > 0 ? { ...mv, power: p * k, by: ab } : mv;
}
/** O melhor que o golpe fica com as habilidades do Pokémon (a da forma comum e a da mega). */
function boostMove(mv, abs, types) {
  let best = mv;
  for (const ab of abs) {
    const x = withAbility(mv, ab, types);
    if (x !== mv && (x.power > (best.power || 0) || x.type !== best.type)) best = x;
  }
  return best;
}

const realMove = (mv, types) => damaging(mv) && (PRIORITY_MOVES.has(mv.name)
  ? types.includes(mv.type) || mv.power >= 70
  : !mv.power || mv.power >= 70 || STRONG_LOW.has(mv.name));

const popcount = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
const damaging = mv => (mv.category === 0 || mv.category === 1) && !!mv.type;

/** Tipos de ataque considerados (os da tabela do jogo; sem Stellar). */
export function attackTypes(T) {
  return T.types.filter(ty => ty && ty !== 'stellar');
}

/**
 * Golpes por nível do Pokémon (tabela da ROM: `dex.learn[ID do jogo] = [versão, nível, golpe, nível, golpe…]`),
 * com o nível em que aprende (0 = ao evoluir). [] sem a tabela.
 */
export function levelMoves(m, dex, T) {
  const raw = dex && dex.rom ? dex.learn[m.speciesId] : null;
  if (!raw) return [];
  const out = [];
  for (let i = 2; i < raw.length; i += 2) {
    const info = typeof raw[i] === 'number' ? cachedMove(raw[i], T) : null;
    const name = info ? (info.known ? info.name : null) : String(raw[i]);
    if (name && !out.some(x => x.name === name)) out.push({ name, level: raw[i - 1], type: info && info.type, power: info && info.power, category: info && info.category, accuracy: info && info.accuracy });
  }
  return out;
}

/** O "nível" de um golpe que o Pokémon aprende pelo tutor (sem nível: qualquer um, a qualquer momento). */
export const TUTOR = -1;

/**
 * Moveset (Quetzal, com a lista do tutor): o menu do Pokémon (NOVO MOV.) ensina na hora qualquer golpe do tutor e os
 * por nível até o nível atual, então o montador escolhe os 4 golpes de cada um (moveset.js) em vez de ficar com os do
 * save. Os testes de comparação desligam com `useTutor: false`.
 */
export const movesetMode = dex => !!(dex && dex.rom && dex.tutor && dex.useTutor !== false);

// Do tutor, o que fica para o plano (fora do moveset, com peso menor, como os golpes por nível a ensinar): golpes que
// aproveitam o clima/terreno (Thunder na chuva…), o Trick Room e os da Hiperofensiva (setup, hazards, telas). Pôr clima
// ou terreno pelo golpe do tutor (Rain Dance…) não conta: quase todo Pokémon aprende, e o plano passava a girar em torno
// de quem põe pelo golpe em vez de quem aproveita
const planTutor = name => !!MOVE_ABUSERS[name] || name === 'Trick Room' || SWEEP_MOVES.has(name) || SUPPORT_MOVES.has(name);

/**
 * Os 4 golpes do Pokémon (moveset.js), entre os que sabe, os por nível (na hora até o nível atual; acima, treinando) e
 * os do tutor, e o que sobra para o plano (golpes por nível e os do tutor de planTutor).
 * @returns {{ set: object[], learn: object[] }}
 */
// moveInfo dos golpes do tutor, uma vez por jogo (cada Pokémon tem ~90; o PC, centenas de Pokémon)
const moveCache = new WeakMap();
function cachedMove(id, T) {
  let c = moveCache.get(T);
  if (!c) moveCache.set(T, (c = new Map()));
  let x = c.get(id);
  if (x === undefined) c.set(id, (x = moveInfo(id, T)));
  return x;
}

function movesetOf(m, bf, dex, T, ctx) {
  const ty = bf.species.types;
  const abs = [...new Set([m.ability && m.ability.name, bf.ability && bf.ability.name].filter(Boolean))];
  const lvl = m.level || 0;
  const cands = [], have = new Set();
  const add = (x, src, level) => {
    if (!x.name || have.has(x.name)) return;
    have.add(x.name);
    cands.push({ name: x.name, type: x.type, power: x.power, category: x.category, accuracy: x.accuracy, src, level, boosted: boostMove(x, abs, ty) });
  };
  for (const mv of m.moves) add(mv, SRC.known, null);
  const lv = levelMoves(m, dex, T);
  for (const x of lv) if (x.level <= lvl) add(x, SRC.now, x.level);
  for (const id of dex.tutor[m.speciesId] || []) {
    const info = cachedMove(id, T);
    if (info && info.known) add(info, SRC.tutor, TUTOR);
  }
  for (const x of lv) add(x, SRC.level, x.level);
  // Referência competitiva: os golpes que os sets do Smogon da espécie levam (a forma de batalha: a mega, se tem dados)
  const usage = ctx.comp ? ctx.comp.moves(ctx.comp.find(bf.species)) : null;
  const mctx = { b: bf.species.baseStats, types: ty, abs, eff: ctx.eff, N: ctx.N, usage };
  if (ctx.plan) mctx.plan = ctx.plan;
  const set = pickMoveset(cands, mctx);
  return { set, learn: learnOf(cands, set), cands, mctx };
}

/** O Pokémon do save por trás de uma cópia do montador (forma evoluída, megapedra a dar, habilidade e item sugeridos). */
export const realOf = m => m.evolvedFrom || m.stoneFrom || m.planFrom || m;

// Itens do jogo pelo ID do Showdown (Quetzal: tabela da ROM), para filtrar os do Smogon
const itemCache = new WeakMap();
function gameItems(T) {
  if (itemCache.has(T)) return itemCache.get(T);
  const out = new Map();
  for (const it of (T.quetzal && T.quetzal.items) || []) { const n = Array.isArray(it) ? it[0] : it; if (typeof n === 'string') out.set(toId(n), n); }
  itemCache.set(T, out);
  return out;
}
const toId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Troca a habilidade: só se a do competitivo for bem mais usada que a atual (25 pontos percentuais ou mais)
const ABILITY_GAP = 0.25;

/**
 * A habilidade do competitivo: entre as da espécie (1ª, 2ª, oculta), a que os sets do Smogon mais usam. Uma cópia do
 * Pokémon com ela (gear.ability, e por onde trocar: Ability Capsule entre a 1ª e a 2ª, Ability Patch para a oculta), ou
 * o mesmo Pokémon. Quem segura megapedra fica como está (a mega tem a habilidade dela).
 */
function gearAbility(m, comp) {
  if (isMegaStone(m.item) || !m.ability) return m;
  const use = comp.abilities(comp.find(m.species));
  if (!use || !use.size) return m;
  const abs = m.species.abilities || [];
  const share = n => (n ? use.get(toId(n)) || 0 : 0);
  let best = -1;
  abs.forEach((n, i) => { if (n && (best < 0 || share(n) > share(abs[best]))) best = i; });
  const cur = m.ability.name;
  if (best < 0 || abs[best] === cur || share(abs[best]) < share(cur) + ABILITY_GAP) return m;
  return { ...m, ability: { ...m.ability, name: abs[best], num: best }, planFrom: realOf(m), gear: { ...(m.gear || {}), ability: abs[best], from: cur, patch: best === 2 } };
}

// Itens que não servem num moveset com golpe de efeito (só atacam) e os que não fazem sentido sugerir
const ATTACK_ONLY = new Set(['choiceband', 'choicespecs', 'choicescarf', 'assaultvest']);
const SKIP_ITEM = id => /iumz$|ite[xyz]?$/.test(id) && !['eviolite', 'meteorite'].includes(id);

/**
 * O que o motor de interações (mechanics.js) precisa do Pokémon: habilidades (a da forma comum e a da forma de batalha),
 * item, golpes, tipos, stats base, se ainda evolui (Eviolite) e o campo do plano.
 */
function mechOf(m, bf, set, item, field = null) {
  const abs = [...new Set([m.ability && m.ability.name, bf.ability && bf.ability.name].filter(Boolean))];
  return { abs, item, moves: set, types: bf.species.types, b: bf.species.baseStats, nfe: !!m.nfe, field };
}
// Golpes de efeito que não atrapalham um Choice (Trick passa o item para o adversário)
const CHOICE_OK = new Set(['Trick', 'Switcheroo']);

/**
 * O item do competitivo para o moveset (ou, sem dados, pelo moveset e pelos stats). Uma cópia do Pokémon com ele. O
 * motor de interações tira o que não funciona com a habilidade, os golpes e o campo (`field`, o do plano): a semente sem
 * o terreno, a orb em quem não aproveita o status, White Herb sem golpe que baixa os próprios stats… e, sem dados do
 * Smogon, escolhe o item que forma a melhor combinação (Flame Orb com Guts, Focus Sash com Reversal…).
 */
function gearItem(m, bf, set, gear, field = null) {
  if (isMegaStone(m.item)) return m;
  const status = set.some(x => x.category === 2 && !CHOICE_OK.has(x.name));
  const c = gear.mech ? mechOf(m, bf, set, null, field) : null;
  const ok = id => gear.items.has(id) && !SKIP_ITEM(id) && !(status && ATTACK_ONLY.has(id)) && (!c || itemWorks(gear.items.get(id), c));
  const use = gear.comp.items(gear.comp.find(bf.species));
  let id = null;
  if (use) for (const [k] of use) if (ok(k)) { id = k; break; }
  if (!id && c && !(use && use.size)) id = toId(kitItem(c, name => ok(toId(name))));
  if (!id) id = fallbackItem(bf, set, ok);
  const name = id && gear.items.get(id);
  const base = m.gear && m.gear.item ? { ...m, gear: { ...m.gear, item: undefined } } : m;
  if (!name || (m.item && m.item.name === name)) return base;
  return { ...m, item: { id: null, name, confidence: 'confirmado' }, planFrom: realOf(m), gear: { ...(m.gear || {}), item: name } };
}
/**
 * O item para o moveset que a tela mostra (com os golpes que o plano pede): o do competitivo, escolhido de novo se o
 * moveset mudou e o item não serve mais (Choice ou Assault Vest com golpe de efeito, ou o que o motor de interações diz
 * que não funciona com os golpes e o campo do plano). null sem a referência.
 */
export function itemFor(e, set, field = null) {
  const gear = e.mctx && e.mctx.gen && e.mctx.gen.gear;
  if (!gear || isMegaStone(e.m.item)) return e.m.item ? e.m.item.name : null;
  const cur = e.m.item ? e.m.item.name : null;
  const status = set.some(x => x.category === 2 && !CHOICE_OK.has(x.name));
  if (cur && !(ATTACK_ONLY.has(toId(cur)) && status) && (!gear.mech || itemWorks(cur, mechOf(e.m, e.bf, set, null, field)))) return cur;
  const real = realOf(e.m);
  const x = gearItem({ ...e.m, item: real.item }, e.bf, set, gear, field);
  return x.item ? x.item.name : null;
}

/** Sem dados do Smogon: pedra do clima para quem o põe pela habilidade; Choice para quem só ataca; Life Orb com setup; Leftovers. */
function fallbackItem(bf, set, ok) {
  const b = bf.species.baseStats;
  const ab = bf.ability && bf.ability.name;
  const rock = { chuva: 'damprock', sol: 'heatrock', 'tempestade de areia': 'smoothrock', 'neve/granizo': 'icyrock' }[FIELD[ab]];
  const status = set.some(x => x.category === 2);
  const phys = b[1] >= b[3];
  const picks = [rock, !status ? (b[5] >= 80 && b[5] < 110 ? 'choicescarf' : phys ? 'choiceband' : 'choicespecs') : null,
    set.some(x => SWEEP_MOVES.has(x.name)) ? 'lifeorb' : null, 'leftovers'];
  return picks.find(x => x && ok(x)) || null;
}

/**
 * O que a biblioteca de estratégias (strategies.js) precisa de um membro: o que ele tem com o moveset e o item que o card
 * mostra, os golpes que pode aprender e se um item existe no jogo. null sem o item do competitivo (fora do Quetzal).
 */
const TEACH_SHARE = 0.1;
export function strategyInput(e, set, item) {
  const gear = e.mctx && e.mctx.gen && e.mctx.gen.gear;
  if (!gear) return null;
  const c = mechOf(e.m, e.bf, set || e.set || e.moves, item && !isMegaStone({ name: item }) ? item : null);
  // Golpe a ensinar para uma estratégia: só o que os sets do competitivo da espécie usam (10%+); sem dados, qualquer um
  const usage = e.mctx.usage;
  const teachOk = name => !usage || !usage.size || (usage.get(toId(name)) || 0) >= TEACH_SHARE;
  return { c, cands: e.mcands || [], itemOk: name => gear.items.has(toId(name)), teachOk };
}
/**
 * As combinações que a tela mostra (com o moveset, o item e o campo do plano que o card mostra) e os bits da equipe.
 * null sem o motor (fora do Quetzal, ou desligado nos testes de comparação).
 */
export function shownCombos(e, set, item, field) {
  const gear = e.mctx && e.mctx.gen && e.mctx.gen.gear;
  if (!gear || !gear.mech) return null;
  const c = mechOf(e.m, e.bf, set || e.set || e.moves, item && !isMegaStone({ name: item }) ? item : null, field);
  return { list: combosOf(c), bits: teamBits(c) };
}
/** As combinações de mecânicas do Pokémon (mechanics.js): o valor que rende sem campo e o que muda em cada campo. */
const MECH_FIELDS = ['chuva', 'sol', 'Trick Room', 'Electric Terrain', 'Grassy Terrain', 'Psychic Terrain', 'Misty Terrain'];
const FIELD_ITEMS = new Set(['Electric Seed', 'Grassy Seed', 'Psychic Seed', 'Misty Seed', 'Room Service', 'Power Herb']);
// Peso da parte "Interações": 0 (medido no simulador, no mesmo plano, contra a montagem sem o motor: 0 → 51%, 0,25 → 50%,
// 0,5 → 54% com resultados de 24% a 100%, 1 → 52% em 12 de 28 planos; o peso trocava Pokémon fortes por quem tem
// combinação, sem ganho medido). As combinações aparecem na tela e na IA; os testes de comparação trocam com `dex.mechW`
const COMBO_W = 0;
// Peso da parte "Estratégias" (biblioteca de strategies.js; os testes de comparação trocam com `dex.stratW`): 0. Medido
// no simulador, no mesmo plano, contra a montagem sem a parte: 0,5 → 49% frente a frente (14 de 28) e −1 ponto contra
// os aleatórios, 1 → 54% (16 de 29) e −2, 2 → 44% (11 de 27) e −5, com planos de 0% a 100%; sem ganho, fica na tela
const STRAT_W = 0;
function setCombos(e, w, sw = 0) {
  const item = e.m.item && !isMegaStone(e.m.item) ? e.m.item.name : null;
  const c = mechOf(e.m, e.bf, e.set || e.moves, item);
  e.combos = combosOf(c);
  e.comboV = w * comboValue(e.combos);
  e.comboW = w;
  e.cbits = teamBits(c);
  e.sbits = roleBits(c);
  e.stratW = sw;
  if (FIELD_ITEMS.has(item) || c.abs.includes('Hydration')) {
    e.comboF = {};
    for (const f of MECH_FIELDS) e.comboF[f] = w * comboValue(combosOf({ ...c, field: f })) - e.comboV;
  }
}

/** O que sobra para o plano, fora do moveset: os golpes por nível e, do tutor, os de planTutor. */
const learnOf = (cands, set) => {
  const inSet = new Set(set.map(x => x.name));
  return cands.filter(x => x.src !== SRC.known && !inSet.has(x.name) && (x.src !== SRC.tutor || planTutor(x.name)));
};

/**
 * Moveset do plano: a mesma entrada, com os 4 golpes escolhidos para o plano (Blizzard na neve, Thunder na chuva, Solar
 * Beam no sol, sem Agility no Trick Room…) e as contas refeitas com eles. A mesma entrada se o moveset não muda.
 */
function tuned(e, plan) {
  if (!e.mcands || !e.mctx.gen) return e;
  const g = e.mctx.gen;
  const sens = planSensitive(e.mcands, plan);
  const mctx = sens ? { ...e.mctx, plan: { kind: plan.kind, field: plan.field } } : e.mctx;
  const set = sens ? pickMoveset(e.mcands, mctx) : e.set;
  // O item com os golpes e o campo do plano (a semente no terreno dela, Power Herb que o sol tornou inútil…)
  const field = plan.field || null;
  const m = g.gear && g.gear.mech ? regear(e, set, field) : e.m;
  if (m === e.m && set.length === e.set.length && set.every((x, i) => x === e.set[i])) return e;
  const learn = learnOf(e.mcands, set);
  const x = Object.assign(entry(m, e.bf === e.m ? m : e.bf, g.T, g.types, g.mult, learn, set), { id: e.id });
  x.mcands = e.mcands; x.mctx = mctx;
  if (g.gear && g.gear.mech) setCombos(x, g.gear.w, g.gear.sw);
  x.cost = readyCost(x, g.ready, g.refLevel);
  x.statVal = statValue(x, g.statModel);
  blankCaches(x);
  copyCtx(x, e, set, g.T);
  if (e.base) {
    x.base = Object.assign(entry(m, m, g.T, g.types, g.mult, learn, set), { id: e.id, real: x.real, key: x.key, given: x.given, mega: false, megaKnown: false, megaGain: 0, isBase: true, cost: x.cost });
    if (g.gear && g.gear.mech) setCombos(x.base, g.gear.w, g.gear.sw);
    x.base.statVal = statValue(x.base, g.statModel);
    blankCaches(x.base);
    copyCtx(x.base, e.base, set, g.T);
  }
  return x;
}
/** O Pokémon com o item do plano: o mesmo objeto se o item não muda. */
function regear(e, set, field) {
  const gear = e.mctx.gen.gear;
  if (isMegaStone(e.m.item)) return e.m;
  const cur = e.m.item ? e.m.item.name : null;
  const name = itemFor(e, set, field);
  // A semente do terreno do plano (e o Room Service no Trick Room) entram mesmo quando o item atual ainda funciona
  const want = gearItem({ ...e.m, item: realOf(e.m).item }, e.bf, set, gear, field);
  const pick = want.item && FIELD_ITEMS.has(want.item.name) ? want.item.name : name;
  if (pick === cur) return e.m;
  if (!pick) return { ...e.m, item: realOf(e.m).item, gear: { ...(e.m.gear || {}), item: undefined } };
  return { ...e.m, item: { id: null, name: pick, confidence: 'confirmado' }, planFrom: realOf(e.m), gear: { ...(e.m.gear || {}), item: pick } };
}
// O que buildTeams pôs na entrada (ameaças, referência competitiva) e quem atrapalha cada clima, com os golpes novos
function copyCtx(x, e, set, T) {
  x.tctx = e.tctx; x.sctx = e.sctx; x.sx = e.sx;
  x.conflictBy = {};
  for (const f of WEATHERS) x.conflictBy[f] = weatherConflict({ ...x.bf, moves: set }, f, T);
}

/**
 * Os Pokémon do plano: os que podem entrar na busca (os melhores sozinhos para o plano, quem põe o plano e quem o jogador
 * pediu) com o moveset do plano (tuned); os outros, como estão. Só com o moveset (Quetzal) e num plano que não é o
 * equilibrado. `map(e)` dá a versão do plano de uma entrada.
 * @returns {{ pool: object[], plan: object, map: (e: object) => object }}
 */
// Candidatos de cada plano que ganham o moveset do plano (os melhores sozinhos para ele): refazer a escolha custa ~0,15 ms
// por Pokémon, e nos PCs grandes eram ~2000 por montagem. Os de fora entram na busca com o moveset de sempre
const TUNE = 80;
export function planPool(pool, plan, forced = [], candLimit = TUNE) {
  const same = { pool, plan, map: e => e };
  if (plan.kind === 'balance' || !pool.some(e => e.mcands)) return same;
  setPlanFlags(pool, plan);
  const pick = new Set([...forced, ...plan.setters]);
  pool.filter(e => !e.conflict || forced.includes(e)).map(e => [e, solo(e, plan)]).sort((a, b) => b[1] - a[1])
    .slice(0, candLimit).forEach(([e]) => pick.add(e));
  const by = new Map();
  const out = pool.map(e => { const x = pick.has(e) ? tuned(e, plan) : e; by.set(e, x); return x; });
  const map = e => by.get(e) || e;
  return { pool: out, plan: { ...plan, setters: plan.setters.map(map) }, map };
}

/**
 * O moveset que a tela mostra: o escolhido, com os golpes que o plano pede (`names`: Trick Room, Thunder na chuva, o
 * setup da Hiperofensiva…) no lugar dos que menos fazem falta.
 */
export function finalMoveset(e, names) {
  if (!e.set || !e.mcands || !names.length || names.every(n => e.set.some(x => x.name === n))) return e.set;
  return pickMoveset(e.mcands, { ...e.mctx, force: new Set(names) });
}

/**
 * Os Pokémon que o montador pode usar: um por espécie (o de nível mais alto, depois o de mais IVs), sem ovos,
 * mais a forma evoluída final de quem ainda não evoluiu (Quetzal, Unbound e SoulGold). Cada entrada já leva as
 * contas que a nota usa, na forma de batalha (a mega, se segura a própria megapedra).
 * @param {object|null} [dex] golpes por nível da ROM (os que o Pokémon aprende também contam)
 */
export function prepare(all, T, dex = null, { anyItem = false, statModel = 'bst', comp = null } = {}) {
  const types = attackTypes(T);
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const mult = (atk, def) => def.reduce((x, d) => x * (idx.has(d) ? T.typechart[idx.get(atk)][idx.get(d)] : 1), 1);
  const ivSum = m => (m.ivs ? Object.values(m.ivs).reduce((a, b) => a + (b || 0), 0) : 0);
  const best = new Map();
  const better = (a, b) => (a.level || 0) - (b.level || 0) || ivSum(a) - ivSum(b);
  const add = m => {
    if (!m.species.types.length || !m.species.baseStats) return;
    const k = speciesKey(m);
    const cur = best.get(k);
    if (!cur || better(m, cur) > 0) best.set(k, m);
  };
  for (const m of all) {
    if (m.egg || m.species.form === 'ovo') continue;
    add(m);
    for (const e of evolvedVersions(m, T)) add(e);
  }
  const chosen = [...best.values()];
  const mset = movesetMode(dex);
  const mctx = mset ? { eff: effTable(types, mult), N: types.length, comp } : null;
  // O que o moveset do plano (tuned) precisa para refazer as contas; buildTeams acerta o modo de preparo
  const gen = mset ? { T, types, mult, statModel, ready: false, refLevel: 0 } : null;
  // Sem restrição de item: quem tem mega no jogo entra também segurando a megapedra (uma entrada por pedra)
  if (anyItem) {
    for (const m of [...chosen]) {
      for (const stone of megaStonesFor(m, T)) if (stone !== (m.item && m.item.name)) chosen.push({ ...m, item: { id: null, name: stone, confidence: 'confirmado' }, stoneFrom: m });
    }
  }
  // Motor de interações (mechanics.js): o item tem que funcionar com a habilidade e os golpes, e as combinações contam
  // na nota (parte "Interações"); os testes de comparação desligam com `dex.mech = false`
  const gear = mset && comp && dex.gear !== false ? { comp, items: gameItems(T), mech: dex.mech !== false, w: dex.mechW ?? COMBO_W, sw: dex.stratW ?? STRAT_W } : null;
  if (gen) gen.gear = gear;
  return chosen.map((m, id) => {
    // Habilidade do competitivo (Quetzal, com a referência): a que os sets do Smogon mais usam, se a espécie a tem
    if (gear) m = gearAbility(m, gear.comp);
    // Ainda evolui (Eviolite): só a forma do save que não é a final
    if (gear && gear.mech && !m.evolvedFrom && evolvedVersions(m, T).length) m = { ...m, nfe: true, planFrom: realOf(m) };
    const mf = megaForm(m, T);
    let learn, set = null, ms = null;
    if (mset) ({ set, learn } = (ms = movesetOf(m, mf || m, dex, T, mctx)));
    // Item: o que o Smogon mais usa e existe no jogo, coerente com o moveset (o jogador dá um jeito de conseguir)
    if (gear && set) m = gearItem(m, mf || m, set, gear);
    else { const known = new Set(m.moves.map(mv => mv.name)); learn = levelMoves(m, dex, T).filter(x => !known.has(x.name)); }
    const e = Object.assign(entry(m, mf || m, T, types, mult, learn, set), { id });
    if (ms) { e.mcands = ms.cands; e.mctx = ms.mctx; e.mctx.gen = gen; }
    if (gear && gear.mech) setCombos(e, gear.w, gear.sw);
    e.cost = readyCost(e, false, 0);
    e.statVal = statValue(e, statModel);
    blankCaches(e);
    // A forma comum de quem segura a megapedra: com duas megas na equipe, só uma megaevolui por batalha, e a outra
    // luta assim (habilidade, tipos e stats da forma comum)
    if (mf) e.base = Object.assign(entry(m, m, T, types, mult, learn, set), { id, real: e.real, key: e.key, given: e.given, mega: false, megaKnown: false, megaGain: 0, isBase: true, cost: e.cost });
    if (mf) { e.base.statVal = statValue(e.base, statModel); blankCaches(e.base); if (gear && gear.mech) setCombos(e.base, gear.w, gear.sw); }
    return e;
  });
}

// Os campos que a busca preenche depois (ameaças, clima do plano) já nascem em todas as entradas, na mesma ordem: um
// campo acrescentado só em algumas muda o formato do objeto no motor do JavaScript e deixa a conta da nota mais lenta
function blankCaches(e) {
  e.tctx = null; e.thr = null; e.thrV = null; e.thrM = null; e._dmg = null; e._side = null;
  e.conflictBy = null; e.conflict = false; e.risk = false;
  e.sx = -1; e.sctx = null;
}

/**
 * Contas de um Pokémon. `m` é o que a tela mostra (o do save, ou a forma evoluída); `bf`, a forma de batalha
 * (a mega, se segura a própria megapedra): tipos, stats base e habilidade vêm dela. `learn`: golpes por nível
 * que ele ainda não sabe. `set`: o moveset escolhido (moveset.js), no lugar dos golpes do save.
 */
function entry(m, bf, T, types, mult, learn = [], set = null) {
  const own = set || m.moves;
  const b = bf.species.baseStats;
  // Habilidades: a da forma de batalha (a mega) e, antes de megaevoluir, a da forma comum (Lightning Rod no Raichu,
  // Intimidate no Staraptor): as duas contam
  const ab = bf.ability && bf.ability.name;
  const abBase = m.ability && m.ability.name;
  const abs = [...new Set([abBase, ab].filter(Boolean))];
  const pairs = own.map(mv => [mv, boostMove(mv, abs, bf.species.types)]);
  const real = pairs.filter(([, x]) => realMove(x, bf.species.types));
  const moves = real.map(([, x]) => x);
  const boosted = real.filter(([o, x]) => x !== o).map(([, x]) => x);
  const realSet = new Set(real.map(([o]) => o));
  // Os golpes fracos ficam de fora das contas (cobertura, clima); os de efeito (Icy Wind, Nuzzle…) continuam
  const useful = own.filter(mv => !damaging(mv) || realSet.has(mv) || (!PRIORITY_MOVES.has(mv.name) && rolesOf({ species: {}, moves: [mv] }).length) || mv.name === 'Fake Out');
  // Com menos de 2 golpes de dano e espaço no moveset (golpes fracos ou sem papel), os que ele aprende por nível
  // completam: os do próprio tipo primeiro, depois os mais fortes, no lado (físico/especial) em que ele ataca melhor.
  // Contam como os outros, com uma pena pequena por ter que ensinar (teachAtk)
  const slots = 4 - own.filter(mv => realSet.has(mv) || (!damaging(mv) && useful.includes(mv) && rolesOf({ species: {}, moves: [mv] }).length) || mv.name === 'Fake Out').length;
  const need = Math.min(Math.max(0, 2 - moves.length), slots);
  const teachAtk = [];
  if (need > 0) {
    const physical = b[1] >= b[3];
    const known = new Set(own.map(mv => mv.name));
    const score = x => (bf.species.types.includes(x.type) ? 1.5 : 1) * (x.power || 60) * ((x.category === 0) === physical ? 1 : 0.7);
    const cands = learn.filter(x => !known.has(x.name)).map(x => boostMove(x, abs, bf.species.types))
      .filter(x => realMove(x, bf.species.types)).sort((x, y) => score(y) - score(x));
    for (const x of cands) {
      if (teachAtk.length >= need) break;
      if (teachAtk.some(y => y.type === x.type)) continue; // dois do mesmo tipo não somam cobertura
      teachAtk.push(x);
    }
    moves.push(...teachAtk);
  }
  // Defesa: 2 = 4×, 1 = 2×, 0 neutro, -1 resiste ou imune pelo tipo, -2 anula pela habilidade (Lightning Rod…)
  const preImmune = abBase !== ab ? ABILITY_IMMUNE[abBase] || [] : [];
  const def = types.map(a => {
    if ((ABILITY_IMMUNE[ab] || []).includes(a)) return -2; // anula pela habilidade: entra no golpe no lugar dos outros
    const x = mult(a, bf.species.types) * ((ABILITY_HALVE[ab] || []).includes(a) ? 0.5 : 1);
    const d = x >= 4 ? 2 : x > 1 ? 1 : x < 1 ? -1 : 0;
    // Antes de megaevoluir, a habilidade da forma comum ainda anula o tipo: conta como resistência
    return preImmune.includes(a) ? Math.min(d, -1) : d;
  });
  // Cobertura: tipos (puros) que algum golpe de dano acerta em cheio
  let cov = 0;
  types.forEach((d, i) => { if (moves.some(mv => mult(mv.type, [d]) > 1)) cov |= 1 << i; });
  const roles = rolesOf({ ...m, moves: useful });
  for (const a of abs) if (ABILITY_ROLES[a] && !roles.includes(ABILITY_ROLES[a])) roles.push(ABILITY_ROLES[a]);
  const contrary = abs.includes('Contrary') ? own.filter(mv => DROP_MOVES.has(mv.name)).map(mv => mv.name) : [];
  // Hiperofensiva: varre com setup (quem ataca forte: Ataque ou Ataque Especial base 100+, 2+ golpes de dano) e abre o
  // caminho (hazards ou telas); o que já sabe vale 1, o que aprende por nível vale LEARN_ROLE
  const strongAtk = Math.max(b[1], b[3]) >= 100 && moves.length >= 2;
  const sweepKnown = strongAtk ? own.find(mv => SWEEP_MOVES.has(mv.name)) || (contrary.length ? { name: contrary[0] } : null) : null;
  const sweepTeach = strongAtk && !sweepKnown ? learn.find(x => SWEEP_MOVES.has(x.name)) || null : null;
  const supKnown = own.find(mv => SUPPORT_MOVES.has(mv.name)) || null;
  const supTeach = supKnown ? null : learn.find(x => SUPPORT_MOVES.has(x.name)) || null;
  if (contrary.length && !roles.includes('setup')) roles.push('setup');
  let roleMask = 0;
  ROLES.forEach((r, i) => { if (roles.includes(r)) roleMask |= 1 << i; });
  const phys = moves.filter(mv => mv.category === 0).length, spec = moves.length - phys;
  // Põe o campo sozinho, sem gastar turno (habilidade ou megapedra), ou só pelo golpe (Sunny Day…)
  const auto = new Set([...abs.map(a => FIELD[a]), MEGA_FIELD[m.item && m.item.name]].filter(Boolean));
  // Aproveita de verdade: habilidade (Swift Swim, Chlorophyll…), megapedra ou golpe próprio do clima (Thunder,
  // Solar Beam…). Weather Ball e os golpes Fire/Water só ficam mais fortes: contam menos (e mais com STAB).
  const strong = new Set([...abs.map(a => ABUSERS[a]), MEGA_ABUSERS[m.item && m.item.name]].filter(Boolean));
  for (const mv of useful) if (mv.name !== 'Weather Ball') for (const f of MOVE_ABUSERS[mv.name] || []) strong.add(f);
  // O que sustenta um plano: habilidade forte (Swift Swim, Solar Power…), megapedra ou golpe próprio do campo
  // (Thunder, Solar Beam, Grassy Glide…); Weather Ball à parte (só conta com quem põe o clima sem gastar turno)
  const core = new Set([...abs.filter(a => !WEAK_ABUSE.has(a)).map(a => ABUSERS[a]), MEGA_ABUSERS[m.item && m.item.name]].filter(Boolean));
  for (const mv of useful) if (mv.name !== 'Weather Ball' && !WEAK_MOVES.has(mv.name)) for (const f of MOVE_ABUSERS[mv.name] || []) core.add(f);
  const wball = new Set(useful.some(mv => mv.name === 'Weather Ball') ? WEATHERS : []);
  const stab = new Set();
  for (const [f, w] of Object.entries(WEATHER)) if (bf.species.types.includes(w.boosts) && moves.some(mv => mv.type === w.boosts)) stab.add(f);
  // Quanto aproveita cada campo: habilidade de velocidade 16, outra habilidade ou megapedra 11, golpe do próprio
  // clima ou golpe com STAB fortalecido 6, outro golpe fortalecido (ou Weather Ball) 3
  const strat = strategyOf({ ...bf, moves: useful });
  if (abBase !== ab) {
    const pre = strategyOf({ ...m, moves: useful });
    for (const k of ['set', 'use', 'boost']) for (const f of pre[k]) strat[k].add(f);
  }
  // Golpes a ensinar: põem o campo (Trick Room, Rain Dance…), aproveitam (Thunder, Solar Beam…) ou dão um papel
  const teach = new Map(); // golpe → nível em que aprende
  // learnCore: o que aproveita por golpe a ensinar e sustenta o plano. Do tutor, só o golpe do próprio tipo (Blizzard num
  // Ice, Rising Voltage num Electric): quase todo Pokémon aprende Grassy Glide, Rising Voltage… e os planos de terreno
  // apareciam em todo PC grande
  const learnSet = new Set(), learnUse = new Set(), learnCore = new Set();
  for (const x of learn) {
    const f = FIELD_MOVES[x.name] || (x.name === 'Trick Room' ? 'Trick Room' : null);
    if (f && !strat.set.has(f)) { learnSet.add(f); teach.set(x.name, x.level); }
    if (x.name !== 'Weather Ball') for (const g of MOVE_ABUSERS[x.name] || []) if (!strong.has(g)) { learnUse.add(g); if (x.level !== TUTOR || bf.species.types.includes(x.type)) learnCore.add(g); teach.set(x.name, x.level); }
  }
  // Prioridade só de golpe que bate de verdade; setup só em quem ataca forte (Agility no Pelipper não ajuda)
  const teachable = learn.filter(x => !TEACH_SKIP.has(x.name) && (!PRIORITY_MOVES.has(x.name) || realMove(x, bf.species.types))
    && (Math.max(b[1], b[3]) >= 100 || !rolesOf({ species: {}, moves: [x] }).includes('setup')));
  const learnRoles = rolesOf({ ...bf, moves: teachable.map(x => ({ name: x.name })) }).filter(r => TEACH_ROLES.includes(r) && !roles.includes(r));
  let learnRoleMask = 0;
  ROLES.forEach((r, i) => { if (learnRoles.includes(r)) learnRoleMask |= 1 << i; });
  const roleMoves = new Map(); // papel → golpe a ensinar que o dá
  for (const r of learnRoles) {
    const x = teachable.find(l => rolesOf({ ...bf, moves: [{ name: l.name }] }).includes(r));
    if (x) roleMoves.set(r, x);
  }
  const value = {};
  for (const f of [...WEATHERS, ...TERRAINS]) {
    const sig = useful.some(mv => mv.name !== 'Weather Ball' && !WEAK_MOVES.has(mv.name) && (MOVE_ABUSERS[mv.name] || []).includes(f));
    value[f] = Math.max(...abs.map(a => (ABUSERS[a] === f ? (WEAK_ABUSE.has(a) ? 4 : SPEED_ABILITIES.has(a) ? 16 : 11) : 0)), MEGA_ABUSERS[m.item && m.item.name] === f ? 11 : 0,
      sig || stab.has(f) ? 6 : 0, learnUse.has(f) ? 5 : 0, strat.use.has(f) || strat.boost.has(f) ? 3 : 0);
  }
  const typeIdx = bf.species.types.map(ty => types.indexOf(ty)).filter(i => i >= 0);
  const baseBst = m.species.baseStats.reduce((x, y) => x + y, 0);
  return {
    m, bf, real: realOf(m), key: speciesKey(m), types: bf.species.types, typeIdx, def, cov, roles, roleMask, atk: moves,
    moves: own, set, setTeach: set ? set.filter(x => x.src !== SRC.known) : [], mcands: null, mctx: null,
    combos: null, comboV: 0, comboF: null, cbits: 0, comboW: 0, sbits: 0, stratW: 0, nfe: !!m.nfe,
    given: m.stoneFrom ? m.item.name : null, abBase, preImmune, boosted, contrary, teachAtk,
    learnSet, learnUse, learnCore, learnRoles, learnRoleMask, roleMoves, teach,
    megaGain: bf !== m ? (b.reduce((x, y) => x + y, 0) - baseBst) / 12 : 0,
    bad: BAD_ABILITIES[ab] || 0, rock: WEATHER_ROCK[m.item && m.item.name] || null,
    strat, auto, strong, core, wball, stab, value, bst: b.reduce((x, y) => x + y, 0), spe: b[SPE], dmg: moves.length,
    lean: b[1] >= b[3] ? (phys ? 'phys' : spec ? 'spec' : '') : (spec ? 'spec' : phys ? 'phys' : ''), nPhys: phys, nSpec: spec,
    mega: isMegaStone(m.item), megaKnown: bf !== m,
    sweep: sweepKnown ? 1 : sweepTeach ? LEARN_ROLE : 0, sweepMove: sweepKnown || sweepTeach,
    hoSup: supKnown ? 1 : supTeach ? LEARN_ROLE : 0, supMove: supKnown || supTeach,
  };
}

/** Põe o campo: pela habilidade/megapedra/golpe que já sabe, ou por um golpe que aprende. */
export const sets = (e, f) => e.strat.set.has(f) || e.learnSet.has(f);

// Habilidades que seguram o que costuma ameaçar o clima (Electric/Grass na chuva, Water/Fire no sol)
const ANSWERS = { chuva: ['Lightning Rod', 'Volt Absorb', 'Motor Drive', 'Sap Sipper'], sol: ['Storm Drain', 'Water Absorb', 'Flash Fire', 'Dry Skin'] };

/**
 * Planos que o save comporta: clima ou terreno com quem ponha e 2 ou mais que aproveitem; Trick Room com quem
 * ponha e 3 ou mais lentos que atacam; e o equilibrado, sempre.
 */
export function plans(pool) {
  const out = [];
  for (const f of [...WEATHERS, ...TERRAINS]) {
    if (coreHolds(pool, f)) out.push({ kind: WEATHERS.includes(f) ? 'weather' : 'terrain', field: f, setters: pool.filter(e => sets(e, f)) });
  }
  const room = pool.filter(e => sets(e, 'Trick Room'));
  if (room.length && roomHolds(pool)) out.push({ kind: 'room', field: 'Trick Room', setters: room });
  if (offenseHolds(pool)) out.push({ kind: 'offense', field: null, setters: pool.filter(e => e.hoSup) });
  out.push({ kind: 'balance', field: null, setters: [] });
  return out;
}

/**
 * Aproveita o campo de verdade: habilidade forte, megapedra ou golpe próprio (ou um golpe próprio a ensinar por nível,
 * ou pelo tutor se for do tipo dele: learnCore). Golpe do
 * tipo com STAB (Water na chuva, Fire no sol) e Weather Ball só contam quando alguém põe o campo sem gastar turno
 * (Drizzle, Drought, Charizardite Y…): pôr chuva com Rain Dance para ganhar 1,5× em golpes Water não sustenta um plano.
 */
const realUse = (e, f, auto) => e.core.has(f) || e.learnCore.has(f) || (auto && (e.stab.has(f) || e.wball.has(f)));

/** O plano tem núcleo: quem põe e 2 ou mais que aproveitam de verdade, não só quem põe. */
function coreHolds(list, f) {
  const setters = list.filter(e => sets(e, f));
  if (!setters.length) return false;
  const auto = setters.some(e => e.auto.has(f));
  const users = list.filter(e => realUse(e, f, auto));
  return users.length >= 2 && users.some(e => !setters.includes(e) || setters.length > 1);
}

/** Hiperofensiva de verdade: quem abre o caminho (hazards ou telas) e, além dele, 3 ou mais atacantes com setup. */
function offenseHolds(list) {
  const sweepers = list.filter(e => e.sweep);
  return list.some(s => s.hoSup && sweepers.filter(e => e !== s).length >= 3);
}

/** Trick Room de verdade: quem põe e, além dele, 3 ou mais lentos que atacam (quem põe não conta como um deles). */
function roomHolds(list) {
  return list.some(e => sets(e, 'Trick Room')) && list.filter(e => e.spe <= SLOW && e.dmg >= 2 && !sets(e, 'Trick Room')).length >= 3;
}

/** Tipo de ataque que o clima do plano corta pela metade (Water no sol, Fire na chuva): não conta como fraqueza. */
function halvedIndex(plan, types) {
  return plan.kind === 'weather' && WEATHER[plan.field] ? types.indexOf(WEATHER[plan.field].weakens) : -1;
}

/** Nota da equipe (também das parciais, durante a busca). Maior é melhor. */
export const score = (team, plan, types, inc = null) => scoreParts(team, plan, types, inc).total;

/**
 * A nota por partes (a tela mostra de onde ela vem): defesa (fraquezas em comum), ataque (cobertura), papéis,
 * Pokémon (stats base, megapedra, golpes de dano, habilidade ruim), equilíbrio (físicos × especiais, tipos
 * repetidos, velocidade) e plano (quem põe e quem aproveita).
 */
export function scoreParts(team, plan, types, inc = null) {
  let k = 0;
  for (const e of team) if (e.mega && e.base) k++;
  if (k < 2) return partsOf(team, plan, types, false, inc);
  const megas = team.filter(e => e.mega && e.base);
  // Duas megas: só uma megaevolui por batalha. Um cenário para cada uma (a outra luta na forma comum, com a habilidade
  // dela: Lightning Rod no Raichu se quem megaevolui é o Golisopod). O jogador escolhe qual megaevoluir conforme o
  // adversário: na defesa vale, tipo a tipo, o cenário que segura melhor; o plano vale o cenário que o sustenta
  // (Charizard Y megaevolvendo no sol); os stats e o equilíbrio, a média dos cenários
  const scen = megas.map(mg => partsOf(team.map(e => (e.base && e !== mg ? e.base : e)), plan, types, true));
  const avg = key => { let x = 0; for (const q of scen) x += q[key]; return x / scen.length; };
  const max = key => { let x = -Infinity; for (const q of scen) if (q[key] > x) x = q[key]; return x; };
  const p = { defense: 0, offense: max('offense'), roles: max('roles'), members: avg('members'), balance: avg('balance'), plan: max('plan'), ready: avg('ready'), threats: 0, comp: compPart(team), combo: max('combo'), strat: max('strat'), total: 0 };
  for (let a = 0; a < types.length; a++) { let x = -Infinity; for (const q of scen) if (q.defByType[a] > x) x = q.defByType[a]; p.defense += x; }
  // Ameaças: cada uma vale o cenário que a responde (as duas formas de quem segura a megapedra, em threatPart)
  p.threats = inc ? threatPartInc(inc, team, plan) : threatPart(team, plan);
  p.total = p.defense + p.offense + p.roles + p.members + p.balance + p.plan + p.ready + p.threats + p.comp + p.combo + p.strat;
  return p;
}

/**
 * As partes da nota de uma equipe numa forma fixa (cada mega já decidida: megaevolui ou não). Com `byType`, também a
 * defesa tipo a tipo (para comparar os cenários das duas megas). É a conta mais repetida da busca (dezenas de milhares
 * de vezes por plano): sem criar listas à toa.
 */
function partsOf(team, plan, types, byType, inc = null) {
  const n = team.length;
  const halved = halvedIndex(plan, types);
  const p = { defense: 0, offense: 0, roles: 0, members: 0, balance: 0, plan: 0, ready: 0, threats: 0, comp: 0, combo: 0, strat: 0, total: 0 };
  if (byType) p.defByType = new Array(types.length).fill(0);
  // Fraquezas em comum: 3 ou mais fracos ao mesmo tipo pesa muito; mais fracos que resistentes, um pouco
  for (let a = 0; a < types.length; a++) {
    if (a === halved) continue;
    let w = 0, r = 0, q = 0, absorb = false;
    for (const e of team) { const v = e.def[a]; if (v > 0) { w++; if (v > 1) q++; } else if (v < 0) { r++; if (v < -1) absorb = true; } }
    // Com quem anula o tipo pela habilidade (Lightning Rod num time fraco a Electric), a fraqueza em comum pesa metade
    const v = -((absorb ? 6 : 12) * Math.max(0, w - 2) + 4 * Math.max(0, w - r - 1) + 2 * q);
    if (byType) p.defByType[a] = v;
    p.defense += v;
  }
  // Cobertura ofensiva e papéis (cada um conta uma vez)
  let cov = 0, roles = 0, learnRoles = 0;
  for (const e of team) { cov |= e.cov; roles |= e.roleMask; learnRoles |= e.learnRoleMask; }
  p.offense = 2.5 * popcount(cov);
  // Papel que ninguém tem mas alguém aprende vale menos (é preciso ensinar o golpe)
  for (let i = 0; i < ROLES.length; i++) { if (roles & (1 << i)) p.roles += ROLE_W[ROLES[i]]; else if (learnRoles & (1 << i)) p.roles += ROLE_W[ROLES[i]] * LEARN_ROLE; }
  // Cada membro: stats base; quem tem menos de 2 golpes de dano rende pouco
  let phys = 0, spec = 0, fast = 0, slow = 0, megas = 0, gains = null, cbits = 0;
  const typeCount = new Int8Array(types.length);
  for (const e of team) {
    p.members += e.statVal - e.bad; // stats base (statValue): 300 → −4, 450 → +8, 600 → +21
    // A megaevolução sobe os stats (já contados na forma mega, quando o app a conhece); só uma por batalha
    if (e.mega) { if (e.megaKnown) (gains || (gains = [])).push(e.megaGain); else p.members += megas ? 3 : 8; megas++; }
    if (e.dmg < 2) p.members -= 6 * (2 - e.dmg); // sem golpes de dano que contam, ele não segura uma batalha
    p.ready -= e.cost; // o que falta para ele estar pronto (evoluir, ensinar…), conforme o modo
    if (e.lean === 'phys') phys++; else if (e.lean === 'spec') spec++;
    if (e.spe >= FAST) fast++;
    if (e.spe <= SLOW && e.dmg >= 2) slow++;
    for (const i of e.typeIdx) typeCount[i]++;
    // Interações (mechanics.js): as combinações que rendem, com as que dependem do campo do plano
    p.combo += e.comboV;
    if (e.comboF && plan.field) p.combo += e.comboF[plan.field] || 0;
    cbits |= e.cbits;
  }
  if (cbits && team[0].comboW) p.combo += team[0].comboW * teamComboValue(team, plan);
  // Estratégias da biblioteca (strategies.js) que a equipe executa com o moveset e o item de cada um
  if (n && team[0].stratW) p.strat = team[0].stratW * strategyValue(team, plan);
  // Com 2 megas da forma conhecida, só uma megaevolui por batalha: metade do ganho da menor não conta
  if (gains && gains.length > 1) p.members -= Math.min(...gains) / 2;
  // Físicos × especiais (só faz sentido com a equipe quase pronta), tipos repetidos, velocidade
  if (n >= 4) p.balance -= 4 * Math.max(0, 2 - phys) + 4 * Math.max(0, 2 - spec);
  for (const c of typeCount) if (c > 1) p.balance -= 6 * Math.max(0, c - 2) + 1.5 * (c - 1);
  if (plan.kind === 'room') p.plan += 5 * Math.min(slow, 4) - 4 * fast;
  else p.balance += 2 * Math.min(fast, 3);
  if (plan.kind === 'offense') {
    // Os 4 melhores atacantes com setup (o que já sabe vale mais) e o melhor que abre o caminho
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, sup = 0;
    for (const e of team) {
      const v = e.sweep;
      if (v > s1) { s4 = s3; s3 = s2; s2 = s1; s1 = v; } else if (v > s2) { s4 = s3; s3 = s2; s2 = v; } else if (v > s3) { s4 = s3; s3 = v; } else if (v > s4) s4 = v;
      if (e.hoSup > sup) sup = e.hoSup;
    }
    p.plan += HO_SWEEP * (s1 + s2 + s3 + s4) + HO_SUPPORT * sup;
  }
  if (plan.kind === 'weather' || plan.kind === 'terrain') {
    const f = plan.field;
    // Quem aproveita pela habilidade, golpe próprio ou megapedra vale mais que quem só tem golpe Fire/Water
    let auto = false, conflicts = 0, risks = 0, answer = false;
    const vals = [];
    for (const e of team) {
      if (e.value[f]) vals.push(e.value[f]);
      if (e.auto.has(f)) auto = true;
      if (e.rock === f && sets(e, f)) p.plan += 4;
      if (e.conflict) conflicts++;
      if (e.risk) risks++;
      if ((ANSWERS[f] || []).includes(e.m.ability && e.m.ability.name)) answer = true;
    }
    if (answer) p.plan += 5;
    // O núcleo do plano: os 4 que mais aproveitam
    p.plan += vals.sort((a, b) => b - a).slice(0, 4).reduce((x, y) => x + y, 0);
    // Quem põe sem gastar turno (Drought, Charizardite Y…) é mais confiável que o golpe (Sunny Day)
    if (auto) p.plan += 16;
    if (plan.kind === 'weather') p.plan -= 10 * conflicts + 4 * risks;
  }
  if (!byType) { p.threats = inc ? threatPartInc(inc, team, plan) : threatPart(team, plan); p.comp = compPart(team); }
  p.total = p.defense + p.offense + p.roles + p.members + p.balance + p.plan + p.ready + p.threats + p.comp + p.combo + p.strat;
  return p;
}

// Referência competitiva (smogon.js): cada dupla da equipe soma o log2 do lift dela nos times do Smogon (Pelipper +
// Basculegion 3,2: juntos ≈9× mais que o acaso; Landorus-T + Gliscor −4,5: dois Ground que se substituem), vezes COMP_W.
// Espécie sem dados no formato (Pokémon sem evoluir, próprios do hack, pouco usados) conta como acaso (0)
const COMP_W = 1;

/** A parte "Competitivo" da nota (0 sem a referência do jogo). */
function compPart(team) {
  const c = team.length ? team[0].sctx : null;
  if (!c) return 0;
  let s = 0;
  for (let i = 1; i < team.length; i++) {
    const a = team[i].sx;
    if (a < 0) continue;
    const row = a * c.K;
    for (let j = 0; j < i; j++) { const b = team[j].sx; if (b >= 0) s += c.M[row + b]; }
  }
  return c.w * s;
}

/** As duplas da equipe com dados no competitivo (fora do acaso), da mais forte para a que mais se evita; null sem a referência. */
export function compPairs(team) {
  const c = team.length ? team[0].sctx : null;
  if (!c) return null;
  const out = [];
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      const a = team[i].sx, b = team[j].sx;
      const v = a >= 0 && b >= 0 ? c.M[a * c.K + b] : 0;
      if (v) out.push({ a: team[i], b: team[j], v });
    }
  }
  return out.sort((x, y) => y.v - x.v);
}

/** Liga a referência competitiva nas entradas: o número de cada espécie na matriz de duplas (-1 sem dados). */
function setComp(pool, comp, w) {
  if (!comp || !w) return null;
  const ids = [], at = new Map();
  for (const x of pool) {
    const id = comp.find(x.bf.species);
    if (id && !at.has(id)) { at.set(id, ids.length); ids.push(id); }
    x.sx = id ? at.get(id) : -1;
    if (x.base) x.base.sx = x.sx;
  }
  const ctx = { M: comp.matrix(ids), K: ids.length, w, label: comp.label, ids, index: comp };
  for (const x of pool) { x.sctx = ctx; if (x.base) x.base.sctx = ctx; }
  return ctx;
}

// Ameaças (threats.js): cada ponto percentual das ameaças do jogo que ninguém da equipe vence vale TH_NONE; das que
// alguém só vence vindo de graça (ninguém entra no golpe dela com segurança), TH_ONLY
const TH_NONE = 2, TH_ONLY = 0.2;
const pop32 = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return Math.imul((x + (x >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24; };

/** Quais ameaças o Pokémon vence (wins) e quais ele também segura na troca (safe), em bits; calculado uma vez por plano. */
function threatMasks(e, variant) {
  if (e.thrV === variant) return e.thrM;
  const cache = e.thr || (e.thr = {});
  e.thrV = variant;
  return (e.thrM = cache[variant] || (cache[variant] = threatBits(e, e.tctx, variant)));
}

/**
 * A parte "Ameaças" da nota (0 sem a lista de ameaças do jogo). Quem segura a megapedra conta nas duas formas: contra
 * cada ameaça o jogador escolhe megaevoluir ou não (e, com duas megas, qual delas)
 */
function threatPart(team, plan) {
  const c = team.length && team[0].tctx;
  if (!c || !c.threats.length || plan.noThreats) return 0;
  const v = variantOf(plan);
  const forms = team.flatMap(e => (e.mega && e.base ? [e, e.base] : [e]));
  for (const e of forms) threatMasks(e, v);
  let none = 0, only = 0;
  for (let w = 0; w < c.words; w++) {
    let s = 0, wn = 0;
    for (const e of forms) { s |= e.thrM.safe[w]; wn |= e.thrM.wins[w]; }
    none += pop32(~wn & c.valid[w]);
    only += pop32(wn & ~s);
  }
  return -(c.w[0] * none + c.w[1] * only) * 100 / c.threats.length;
}

/**
 * O "ou" das ameaças que a equipe parcial vence e segura (e as das formas comuns de quem segura a megapedra), para a
 * busca somar só o candidato a cada equipe nova, em vez de juntar os 6 membros de novo (mesma conta de threatPart).
 */
function threatAcc(team, plan) {
  const c = team.length ? team[0].tctx : null;
  if (!c || plan.noThreats) return null;
  const v = variantOf(plan), W = c.words;
  const a = { w: new Uint32Array(W), s: new Uint32Array(W), bw: new Uint32Array(W), bs: new Uint32Array(W), nmb: 0, c };
  for (const e of team) {
    const M = threatMasks(e, v);
    for (let i = 0; i < W; i++) { a.w[i] |= M.wins[i]; a.s[i] |= M.safe[i]; }
    if (e.mega && e.base) {
      a.nmb++;
      const B = threatMasks(e.base, v);
      for (let i = 0; i < W; i++) { a.bw[i] |= B.wins[i]; a.bs[i] |= B.safe[i]; }
    }
  }
  return a;
}

/** threatPart da equipe parcial (`a`, de threatAcc) mais o candidato (o último da equipe). */
function threatPartInc(a, team, plan) {
  const c = a.c;
  if (!c.threats.length || plan.noThreats) return 0;
  const v = variantOf(plan), e = team[team.length - 1], M = threatMasks(e, v);
  const B = e.mega && e.base ? threatMasks(e.base, v) : null;
  // Quem segura a megapedra conta nas duas formas (como em threatPart)
  let none = 0, only = 0;
  for (let w = 0; w < c.words; w++) {
    let s = a.s[w] | M.safe[w] | a.bs[w], wn = a.w[w] | M.wins[w] | a.bw[w];
    if (B) { s |= B.safe[w]; wn |= B.wins[w]; }
    none += pop32(~wn & c.valid[w]);
    only += pop32(wn & ~s);
  }
  return -(c.w[0] * none + c.w[1] * only) * 100 / c.threats.length;
}

/** Pode entrar: não repete Pokémon nem espécie, até 2 megapedras e, num plano de clima, nenhum outro clima. */
export function allowed(team, e, plan) {
  let megas = 0;
  for (const x of team) { if (x.real === e.real || x.key === e.key) return false; if (x.mega) megas++; }
  if (e.mega && megas >= MAX_MEGAS) return false;
  if (plan.kind === 'weather') for (const f of e.strat.set) if (f !== plan.field && WEATHERS.includes(f)) return false;
  return true;
}

/** Valor de um Pokémon sozinho para o plano (para escolher os candidatos da busca). */
export function solo(e, plan) {
  let v = e.statVal - e.bad + popcount(e.cov) * 0.8 + e.roles.filter(r => ROLE_W[r]).length * 1.5 - 6 * Math.max(0, 2 - e.dmg) - e.cost;
  if (plan.field && plan.kind !== 'room') {
    if (sets(e, plan.field)) v += e.auto.has(plan.field) ? 40 : e.strat.set.has(plan.field) ? 30 : 24;
    v += (e.value[plan.field] || 0) * 1.2;
  }
  if (plan.kind === 'offense') v += 20 * e.sweep + 24 * e.hoSup + (e.sweep && e.spe >= FAST ? 4 : 0);
  if (plan.kind === 'room') v += sets(e, 'Trick Room') ? (e.strat.set.has('Trick Room') ? 30 : 24) : e.spe <= SLOW && e.dmg >= 2 ? 12 : e.spe >= FAST ? -8 : 0;
  return v;
}

/**
 * A melhor equipe para um plano.
 * @param {object[]} pool resultado de prepare
 * @param {object} plan um item de plans()
 * @param {object[]} forced entradas que o jogador quer na equipe
 * @param {Set[]} [prev] equipes já escolhidas para o plano (os Pokémon reais de cada uma): a nova divide no máximo
 *   ALT_SHARED membros com cada uma (ou os que o jogador pediu, se forem mais)
 * @param {number} [beamSize] equipes parciais guardadas a cada vaga
 * @param {number} [candLimit] candidatos (os melhores sozinhos para o plano; CANDS ou CANDS_BIG); os testes de comparação mudam os dois
 * @returns {{ plan, team: object[], score: number } | null}
 */
export function bestTeam(pool, plan, types, forced = [], prev = [], beamSize = BEAM, candLimit = pool.length > BIG_PC ? CANDS_BIG : CANDS) {
  const maxShared = Math.max(ALT_SHARED, forced.length);
  const tooClose = team => prev.some(p => team.filter(e => p.has(e.real)).length > maxShared);
  // Num plano de clima: fora quem tem a fraqueza que o clima fortalece ou depende de golpes que ele enfraquece
  // (e.conflict, marcado em buildTeams); quem o jogador pediu entra mesmo assim
  const usable = pool.filter(e => forced.includes(e) || !e.conflict);
  const cands = usable.filter(e => !forced.includes(e))
    .map(e => [e, solo(e, plan)]).sort((a, b) => b[1] - a[1]).slice(0, candLimit).map(([e]) => e);
  // Sementes: o que o jogador pediu, mais quem põe o plano (até 2 opções de quem põe, uma busca para cada)
  const seeds = [];
  if (plan.setters.length) {
    const setters = plan.setters.filter(e => usable.includes(e))
      .sort((a, b) => solo(b, plan) - solo(a, plan)).slice(0, 2);
    for (const st of setters) {
      if (forced.includes(st)) seeds.push([...forced]);
      else if (allowed(forced, st, plan)) seeds.push([...forced, st]);
    }
  } else seeds.push([...forced]);
  let best = null;
  for (const seed of seeds) {
    if (seed.length > 6) continue;
    let beam = [{ team: seed, ids: seed.map(e => e.id).sort((a, b) => a - b), s: score(seed, plan, types) }];
    while (beam[0].team.length < 6) {
      const next = new Map();
      for (const st of beam) {
        const acc = threatAcc(st.team, plan);
        for (const c of cands) {
          if (!allowed(st.team, c, plan)) continue;
          const team = [...st.team, c];
          if (prev.length && tooClose(team)) continue;
          // A mesma equipe em outra ordem é a mesma: chave = números em ordem (os da parcial já estão ordenados)
          const ids = st.ids.slice();
          let j = ids.length;
          while (j > 0 && ids[j - 1] > c.id) { ids[j] = ids[j - 1]; j--; }
          ids[j] = c.id;
          const key = ids.join(',');
          if (next.has(key)) continue;
          next.set(key, { team, ids, s: score(team, plan, types, acc) });
        }
      }
      if (!next.size) break;
      beam = [...next.values()].sort((a, b) => b.s - a.s).slice(0, beamSize);
    }
    // A melhor das equipes guardadas que sustenta o plano (a de nota mais alta pode ter deixado de fora quem
    // aproveita o clima, e aí o plano não vale)
    const top = beam.find(st => st.team.length === 6 && planHolds(st.team, plan)) || beam[0];
    if (top && (!best || top.s > best.score)) best = { plan, team: top.team, score: top.s };
  }
  return best;
}

/**
 * O plano vale na equipe final: quem põe e, além dele, 2 ou mais que aproveitam (clima/terreno) ou 3 lentos
 * que atacam (Trick Room). Senão a equipe é só "equilibrada" com um golpe de clima, e não aparece como plano.
 */
export function planHolds(team, plan) {
  if (plan.kind === 'balance') return true;
  if (plan.kind === 'room') return roomHolds(team);
  if (plan.kind === 'offense') return offenseHolds(team);
  return coreHolds(team, plan.field);
}

/**
 * Equipes para todos os planos do save, da melhor nota para a pior, sem repetir a mesma equipe.
 * @param {object[]} all Pokémon do save (equipe + PC)
 * @param {object} T tabelas do jogo
 * @param {{ want?: object[], dex?: object|null, noLegends?: boolean, anyItem?: boolean, ready?: boolean, comp?: object|null }} [opts]
 *   Pokémon que o jogador quer na equipe (do save), os golpes por nível da ROM (os que aprendem também contam), se deixa
 *   de fora lendários e míticos (menos os que o jogador pediu), se conta com megapedras que o Pokémon ainda não segura, o
 *   modo "Prontos para usar" (o trabalho que falta pesa mais; senão, "Posso treinar") e a referência competitiva do jogo
 *   (loadSmogon; sem ela, a nota não tem a parte "Competitivo")
 */
export function buildTeams(all, T, { want = [], dex = null, noLegends = false, anyItem = false, ready = false, statModel = 'bst', game = null, threats = null, threatWeights = [TH_NONE, TH_ONLY], comp = null, compWeight = COMP_W } = {}) {
  const types = attackTypes(T);
  if (noLegends) {
    const asked = new Set(want.map(speciesKey));
    all = all.filter(m => !isLegendary(m) || asked.has(speciesKey(m)));
  }
  const pool = prepare(all, T, dex, { anyItem, statModel, comp });
  // Modo "Prontos para usar": nível de referência = o do 6º Pokémon mais forte do save (a equipe que ele já tem)
  if (ready) {
    const refLevel = all.map(m => m.level || 0).sort((a, b) => b - a)[Math.min(5, all.length - 1)] || 0;
    for (const e of pool) { e.cost = readyCost(e, true, refLevel); if (e.base) e.base.cost = e.cost; }
    const g = pool.find(e => e.mctx && e.mctx.gen);
    if (g) Object.assign(g.mctx.gen, { ready: true, refLevel });
  }
  // Referência competitiva (o índice de smogon.js do jogo do save): a parte "Competitivo" da nota
  const sctx = setComp(pool, comp, compWeight);
  // Ameaças do jogo (com o jogo do save, ou a lista dada nos testes): a parte "Ameaças" da nota
  const list = threats || (game ? threatList(T, game, dex) : null);
  const tctx = list && list.length ? { threats: list, mult: typeMult(T), words: (list.length + 31) >>> 5, valid: null, w: threatWeights,
    learned: list.some(x => x.learned), modernAbilities: !!T.nds } : null;
  if (tctx) {
    tctx.valid = new Uint32Array(tctx.words).fill(0xFFFFFFFF);
    if (list.length & 31) tctx.valid[tctx.words - 1] = (2 ** (list.length & 31)) - 1;
  }
  for (const x of pool) {
    for (const e of x.base ? [x, x.base] : [x]) {
      e.tctx = tctx;
      e.conflictBy = {};
      for (const f of WEATHERS) e.conflictBy[f] = weatherConflict({ ...e.bf, moves: e.moves }, f, T);
    }
  }
  // Quem o jogador pediu: todas as versões dele (com cada megapedra, no modo sem restrição de item); em cada plano
  // entra a que rende mais, sem passar de 2 megapedras
  const groups = [];
  for (const m of want) {
    let g = pool.filter(e => e.real === m || e.m === m);
    if (!g.length) { const k = pool.find(e => e.key === speciesKey(m)); g = k ? pool.filter(e => e.real === k.real) : []; }
    if (g.length && !groups.some(x => x[0].real === g[0].real)) groups.push(g);
  }
  const forcedFor = plan => {
    const out = [];
    for (const g of groups.slice(0, 6)) {
      const ok = g.filter(e => !e.mega || out.filter(x => x.mega).length < MAX_MEGAS);
      out.push((ok.length ? ok : g).reduce((a, b) => (solo(b, plan) > solo(a, plan) ? b : a)));
    }
    return out;
  };
  const out = [];
  for (const plan0 of plans(pool)) {
    // Moveset do plano (Quetzal): os candidatos com os golpes escolhidos para ele
    // (os testes de comparação desligam com dex.planMoves = false)
    const pp = dex && dex.planMoves === false ? { pool, plan: plan0, map: e => e } : planPool(pool, plan0, forcedFor(plan0));
    const plan = pp.plan, ppool = pp.pool, forced = forcedFor(plan0).map(pp.map);
    setPlanFlags(ppool, plan);
    let r = bestTeam(ppool, plan, types, forced);
    // Salvaguarda do plano: se a busca com as ameaças não guardou nenhuma equipe que sustente o plano (as que
    // respondem mais ameaças podem não ter os lentos do Trick Room), vale a busca sem elas; a nota conta as ameaças
    if (tctx && !(r && r.team.length === 6 && planHolds(r.team, plan))) {
      const r0 = bestTeam(ppool, { ...plan, noThreats: true }, types, forced);
      if (r0 && r0.team.length === 6 && planHolds(r0.team, plan)) r = { plan, team: r0.team, score: score(r0.team, plan, types) };
    }
    // A equipe guarda os Pokémon do plano (para as alternativas, a tela e o ideal do competitivo)
    if (r && r.team.length === 6 && planHolds(r.team, plan)) out.push(Object.defineProperty(r, 'pp', { value: pp }));
  }
  // Os planos da melhor nota para a pior, sem repetir a mesma equipe
  out.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const result = out.filter(r => !seen.has(teamKey(r.team)) && seen.add(teamKey(r.team)));
  // O que altTeams precisa para buscar as alternativas de um plano depois, só se o jogador pedir
  Object.defineProperty(result, 'pool', { value: pool }); // também para conferências (busca local nos testes de comparação)
  Object.defineProperty(result, 'ctx', { value: { types, forcedFor, threats: tctx, comp: sctx, noLegends, dex } });
  return result;
}

/**
 * Alternativas de um plano (sob demanda: a busca custa quase o mesmo que a da melhor, e no celular só vale pagar
 * por ela quando o jogador pede): outras equipes do mesmo plano, cada uma com no máximo ALT_SHARED membros iguais
 * a cada equipe anterior do plano e nota de pelo menos ALT_MIN da melhor.
 * @param {object[]} results o que buildTeams devolveu
 * @param {object} main a equipe principal do plano (um item de results)
 * @returns {Array<{ plan, team: object[], score: number, alt: number }>} na ordem (alt 1, 2…), sem repetir equipes de results
 */
export function altTeams(results, main) {
  const { types, forcedFor } = results.ctx, { plan } = main;
  // Os Pokémon do plano (com o moveset dele), os mesmos da equipe principal
  const pp = main.pp || { pool: results.pool, map: e => e };
  const pool = pp.pool;
  setPlanFlags(pool, plan);
  const forced = forcedFor(plan).map(pp.map);
  const seen = new Set(results.map(r => teamKey(r.team)));
  const prev = [new Set(main.team.map(e => e.real))];
  const out = [];
  for (let k = 1; k < ALTS; k++) {
    const a = bestTeam(pool, plan, types, forced, prev, ALT_BEAM);
    if (!a || a.team.length < 6 || !planHolds(a.team, plan) || a.score < main.score - (1 - ALT_MIN) * Math.abs(main.score)) break;
    prev.push(new Set(a.team.map(e => e.real)));
    if (!seen.has(teamKey(a.team)) && seen.add(teamKey(a.team))) out.push(Object.defineProperty({ ...a, alt: out.length + 1 }, 'pp', { value: pp }));
  }
  return out;
}

const teamKey = team => team.map(e => e.id).sort((a, b) => a - b).join(',');

/**
 * Marca, para o plano, quem atrapalha o clima (fica de fora) e quem aproveita de verdade (Chlorophyll, Swift Swim…)
 * mas é fraco ao tipo que o clima fortalece (Venusaur no sol: entra, com uma pena menor).
 */
export function setPlanFlags(pool, plan) {
  for (const x of pool) for (const e of x.base ? [x, x.base] : [x]) planFlags(e, plan);
}

/** As marcas de setPlanFlags numa entrada. */
export function planFlags(e, plan) {
  const c = plan.kind === 'weather' ? e.conflictBy[plan.field] : null;
  e.conflict = !!c && !(c === 'weak' && e.strong.has(plan.field));
  e.risk = c === 'weak' && e.strong.has(plan.field);
}

/**
 * Um Pokémon que o jogador não tem (o ideal do competitivo, ideal.js), no formato das entradas da busca, para a nota
 * estimar a equipe com ele: a espécie do jogo (gameSpecies em threats.js) com a habilidade que mais serve ao plano, sem
 * item, e os golpes de dano que aprende por nível (tabela da ROM; sem ela, um golpe de 90 de poder de cada tipo dele).
 * Sem custo de preparo; fica fora da matriz competitiva (sx = -1: quem chama soma as duplas dele).
 * @param {object} like uma entrada do save, de onde vêm as referências das ameaças e da tabela competitiva
 */
export function outsiderEntry(spec, T, dex, like, plan) {
  const types = attackTypes(T);
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const mult = (atk, def) => def.reduce((x, d) => x * (idx.has(d) ? T.typechart[idx.get(atk)][idx.get(d)] : 1), 1);
  const f = plan.field;
  const ab = spec.abilities.find(a => f && (ABUSERS[a] === f || FIELD[a] === f)) || spec.abilities[0] || null;
  const species = { name: spec.name, form: spec.form, showdown: spec.showdown, types: spec.types, baseStats: spec.stats, abilities: spec.abilities };
  const m = { species, speciesId: spec.id, ability: ab ? { name: ab, num: Math.max(0, spec.abilities.indexOf(ab)) } : null, item: null, moves: [], level: 100, outsider: true };
  // Com o moveset (Quetzal), os 4 golpes que ele usaria; senão, os golpes por nível completam os de dano
  let learn, set = null;
  let ms = null;
  if (movesetMode(dex)) ({ set, learn } = (ms = movesetOf(m, m, dex, T, { eff: effTable(types, mult), N: types.length, comp: like.sctx ? like.sctx.index : null, plan: { kind: plan.kind, field: plan.field } })));
  else learn = levelMoves(m, dex, T);
  if (!learn.length && !(set && set.length)) {
    const physical = spec.stats[1] >= spec.stats[3];
    m.moves = spec.types.map(ty => ({ name: null, type: ty, power: 90, category: T.gen3 ? (SPECIAL_G3.has(ty) ? 1 : 0) : physical ? 0 : 1 }));
  }
  const e = Object.assign(entry(m, m, T, types, mult, learn, set && set.length ? set : null), { id: -1 - spec.id });
  if (ms && e.set) { e.mcands = ms.cands; e.mctx = ms.mctx; }
  e.cost = 0;
  e.statVal = statValue(e, 'bst');
  blankCaches(e);
  e.tctx = like.tctx;
  e.sctx = like.sctx;
  e.conflictBy = {};
  for (const w of WEATHERS) e.conflictBy[w] = weatherConflict({ ...e.bf, moves: e.moves }, w, T);
  planFlags(e, plan);
  return e;
}
// Gen 3: a categoria vem do tipo do golpe
const SPECIAL_G3 = new Set(['fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon', 'dark']);


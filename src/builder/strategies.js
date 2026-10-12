// Biblioteca de estratégias (Quetzal, com o moveset e o item do competitivo): estratégias conhecidas dos times
// competitivos de singles, guardadas como dados (o que cada uma exige, como joga, o que ela dá e como é quebrada; textos
// próprios). Para cada equipe, o app confere quem executa cada estratégia com o moveset, o item e a habilidade que o card
// mostra, e o que falta: golpe que o menu do Pokémon ensina na hora (tutor ou nível já alcançado), golpe que precisa de
// treino ou item a dar. Os planos (clima, terreno, Trick Room, Hiperofensiva) também ganham a explicação daqui.
//
// Cada estratégia é uma linha de STRATEGIES: `need` = papéis que a equipe precisa ter, cada um em Pokémon diferentes
// (`n` deles), e `same` = papéis que precisam estar no mesmo Pokémon (Belly Drum e prioridade). Os papéis vêm de
// ROLE_TESTS (golpes, habilidade, item, tipos, stats). Estratégia nova = linha nova; papel novo = um teste novo.

const names = (...xs) => new Set(xs);
// Teleport fica de fora: troca sem bater (só serve em quem é lento e aguenta)
const PIVOT = names('U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Chilly Reception', 'Shed Tail');
const HAZARD = names('Stealth Rock', 'Spikes', 'Toxic Spikes', 'Stone Axe', 'Ceaseless Edge');
const REMOVAL = names('Defog', 'Rapid Spin', 'Mortal Spin', 'Tidy Up', 'Court Change');
const PHAZE = names('Roar', 'Whirlwind', 'Dragon Tail', 'Circle Throw');
const SCREENS = names('Reflect', 'Light Screen', 'Aurora Veil');
const SETUP = names('Swords Dance', 'Dragon Dance', 'Nasty Plot', 'Calm Mind', 'Quiver Dance', 'Shell Smash', 'Bulk Up', 'Coil', 'Shift Gear',
  'Victory Dance', 'Tail Glow', 'Belly Drum', 'Geomancy', 'No Retreat', 'Clangorous Soul', 'Tidy Up', 'Fillet Away', 'Agility', 'Rock Polish',
  'Take Heart');
const PRIORITY = names('Extreme Speed', 'Aqua Jet', 'Mach Punch', 'Bullet Punch', 'Ice Shard', 'Shadow Sneak', 'Sucker Punch', 'Jet Punch',
  'Grassy Glide', 'Vacuum Wave', 'Accelerock', 'First Impression', 'Quick Attack', 'Upper Hand');
const SACRIFICE = names('Healing Wish', 'Lunar Dance', 'Memento');
const damaging = m => (m.category === 0 || m.category === 1) && !!m.type;

/**
 * Os papéis: `test(c)` diz se o Pokémon cumpre o papel com o que tem (c = { abs, item, moves, types, b }); `moves`, os
 * golpes que dão o papel (para achar o que ensinar); `items`, os itens que dão o papel (o que dar). O que depende da
 * espécie fica à parte: `stat(b)` (stats base) e `type` (tipo). As equipes de referência (reference.js) guardam só os
 * papéis que o set cumpre (golpes, item, habilidade) e conferem stats e tipos com as tabelas do jogo do save.
 */
const twoHits = c => c.moves.filter(damaging).length >= 2;
const ROLE_TESTS = {
  pivot: { moves: PIVOT },
  regen: { test: c => c.abs.includes('Regenerator') },
  hazard: { moves: HAZARD },
  removal: { moves: REMOVAL },
  phaze: { moves: PHAZE },
  screens: { moves: SCREENS },
  web: { moves: names('Sticky Web') },
  // Quem varre: ataca forte (Ataque ou Ataque Especial base 100+), sobe os stats e tem 2+ golpes de dano
  sweeper: { moves: SETUP, test: twoHits, stat: b => Math.max(b[1], b[3]) >= 100 },
  // Atacante de velocidade média (a Sticky Web deixa o adversário mais lento que ele)
  midAttacker: { test: twoHits, stat: b => Math.max(b[1], b[3]) >= 95 && b[5] >= 60 && b[5] < 100 },
  drum: { moves: names('Belly Drum') },
  priority: { moves: PRIORITY, stat: b => b[1] >= 90 },
  smash: { moves: names('Shell Smash') },
  smashItem: { items: ['White Herb', 'Focus Sash'] },
  pass: { moves: names('Baton Pass') },
  passable: { moves: names(...SETUP, 'Substitute') },
  sacrifice: { moves: SACRIFICE },
  clay: { items: ['Light Clay'] },
  fire: { type: 'fire' },
  water: { type: 'water' },
  grass: { type: 'grass' },
  dragon: { type: 'dragon' },
  steel: { type: 'steel' },
  fairy: { type: 'fairy' },
};
/** O set cumpre o papel (golpe da lista e/ou teste; item da lista), sem olhar stats nem tipos da espécie. */
function setHas(c, r) {
  const t = ROLE_TESTS[r];
  if (t.type) return false;
  if (t.items) return t.items.includes(c.item);
  if (t.moves && !c.moves.some(m => t.moves.has(m.name))) return false;
  return t.test ? t.test(c) : true;
}
/** A espécie permite o papel (stats base e tipos). */
const speciesHas = (r, types, b) => { const t = ROLE_TESTS[r]; return t.type ? types.includes(t.type) : !t.stat || t.stat(b); };
/** O Pokémon cumpre o papel com o que tem? */
const hasRole = (c, r) => (ROLE_TESTS[r].type ? speciesHas(r, c.types, c.b) : setHas(c, r) && speciesHas(r, c.types, c.b));

/** Os papéis que um set cumpre pelos golpes, item e habilidade (sem stats nem tipos): o que o importador guarda. */
export const setRoleKeys = c => Object.keys(ROLE_TESTS).filter(r => setHas(c, r));

/**
 * As estratégias conhecidas. `v` = o quanto ela vale quando a equipe a executa (para a nota, se um dia entrar; ver
 * build.js). Textos próprios: como joga, o que ela dá e como é quebrada.
 */
export const STRATEGIES = [
  { id: 'volt-turn', name: 'Pivôs (U-turn, Volt Switch, Flip Turn)', need: [['pivot', 2]], v: 5,
    how: 'troque atacando para pôr o Pokémon certo em cada confronto sem dar turno de graça',
    gives: 'mantém a vantagem de tipo e desgasta quem entra', breaks: 'Ground anula o Volt Switch; Rocky Helmet, Iron Barbs e hazards desgastam quem troca muito' },
  { id: 'regen-core', name: 'Núcleo Regenerator', need: [['regen', 2], ['pivot', 1]], v: 4,
    how: 'quem tem Regenerator recupera 1/3 do HP a cada troca; o pivô decide quem entra',
    gives: 'aguenta trocas longas sem gastar turno curando', breaks: 'hazards, Toxic e quem bate forte o bastante para derrubar antes da troca' },
  { id: 'hazards', name: 'Hazards com remoção', need: [['hazard', 1], ['removal', 1]], v: 5,
    how: 'ponha Stealth Rock ou Spikes cedo; cada troca do adversário custa HP. Tire os hazards dele com Defog ou Rapid Spin',
    gives: 'cada troca do adversário custa HP e os golpes fortes passam a derrubar', breaks: 'Magic Bounce devolve; Defog ou Rapid Spin do adversário; Heavy-Duty Boots' },
  { id: 'hazard-phaze', name: 'Hazards e troca forçada', need: [['hazard', 1], ['phaze', 1]], v: 3,
    how: 'com os hazards no campo, Roar, Whirlwind ou Dragon Tail obrigam o adversário a trocar e levar o dano de novo',
    gives: 'desgaste contínuo e fim do setup do adversário', breaks: 'Magic Bounce, Suction Cups, Substitute e quem bate antes' },
  { id: 'screens', name: 'Telas e setup', need: [['screens', 1], ['sweeper', 2]], v: 6, offense: false,
    how: 'ponha Reflect e Light Screen (ou Aurora Veil); com metade do dano, quem varre sobe os stats com calma',
    gives: 'turnos seguros para o setup', breaks: 'Brick Break, Psychic Fangs, Infiltrator e Taunt em quem põe as telas' },
  { id: 'sticky-web', name: 'Sticky Web', need: [['web', 1], ['midAttacker', 2]], v: 4,
    how: 'ponha a Sticky Web no começo; quem entra depois fica mais lento e seus atacantes passam na frente',
    gives: 'atacantes de velocidade média passam a agir primeiro', breaks: 'Defog, Rapid Spin, Magic Bounce, Flying e Levitate' },
  { id: 'belly-drum', name: 'Belly Drum com prioridade', same: ['drum', 'priority'], v: 5,
    how: 'Belly Drum leva o Ataque ao máximo e o golpe de prioridade varre antes de o adversário agir (Sitrus Berry devolve o HP)',
    gives: 'varre o time inteiro se tiver uma entrada segura', breaks: 'prioridade do adversário, Intimidate, Unaware, Ghost contra Extreme Speed, Psychic Terrain' },
  { id: 'shell-smash', name: 'Shell Smash', same: ['smash', 'smashItem'], v: 4,
    how: 'Shell Smash dobra Ataque, Ataque Especial e Velocidade; White Herb desfaz a queda das defesas (ou Focus Sash garante o turno)',
    gives: 'vira um atacante rápido e forte em um turno', breaks: 'prioridade, Unaware, Haze, Roar e quem é mais rápido com Choice Scarf' },
  { id: 'baton-pass', name: 'Baton Pass', same: ['pass', 'passable'], need: [['sweeper', 1]], v: 3,
    how: 'suba os stats (ou ponha um Substitute) e passe tudo para quem varre com Baton Pass',
    gives: 'quem recebe entra já fortalecido', breaks: 'Taunt, Haze, Roar e Whirlwind, golpes de status que passam junto' },
  { id: 'sacrifice', name: 'Sacrifício para quem varre', need: [['sacrifice', 1], ['sweeper', 1]], v: 4,
    how: 'quem tem Healing Wish, Lunar Dance ou Memento sai de campo de propósito e quem varre entra curado (ou contra um adversário enfraquecido)',
    gives: 'uma entrada segura para o atacante principal', breaks: 'quem bate antes de o sacrifício acontecer e prioridade em quem entra' },
  { id: 'fwg', name: 'Núcleo Fire, Water e Grass', need: [['fire', 1], ['water', 1], ['grass', 1]], v: 3,
    how: 'cada um resiste ao tipo que ameaça o outro: troque para quem resiste',
    gives: 'trocas seguras contra os três tipos', breaks: 'Dragon, Flying e Poison passam pelos três' },
  { id: 'dsf', name: 'Núcleo Dragon, Steel e Fairy', need: [['dragon', 1], ['steel', 1], ['fairy', 1]], v: 3,
    how: 'Steel segura Fairy e Dragon, Fairy segura Dragon e Fighting, Dragon segura Fire e Water: troque para quem resiste',
    gives: 'resistências que cobrem quase todos os tipos', breaks: 'Ground e Fire contra o Steel e o Fairy; Poison contra o Fairy' },
];

// Os planos do montador (build.js) também são estratégias conhecidas: a explicação de cada um
const PLAN_TEXT = {
  chuva: { how: 'abra com quem põe a chuva; Swift Swim dobra a velocidade e os golpes Water ficam 1,5× mais fortes. A chuva dura 5 turnos (8 com Damp Rock): troque para renovar',
    breaks: 'outro clima, Lightning Rod, Storm Drain, Water Absorb e atacantes Grass ou Electric' },
  sol: { how: 'abra com quem põe o sol; Chlorophyll dobra a velocidade, os golpes Fire ficam 1,5× mais fortes e Solar Beam não carrega. Dura 5 turnos (8 com Heat Rock)',
    breaks: 'outro clima, Flash Fire, atacantes Water e Rock' },
  'tempestade de areia': { how: 'quem põe a areia abre; Sand Rush dobra a velocidade, Rock ganha 1,5× de Defesa Especial e a areia desgasta quem não é Rock, Ground ou Steel',
    breaks: 'outro clima, Water, Grass e Fighting' },
  'neve/granizo': { how: 'quem põe a neve abre; Slush Rush dobra a velocidade, Ice ganha 1,5× de Defesa, Blizzard não erra e Aurora Veil corta o dano pela metade',
    breaks: 'outro clima, Fire, Fighting, Rock e Steel' },
  'Electric Terrain': { how: 'o terreno fortalece golpes Electric de quem está no chão e impede o sono; Rising Voltage dobra',
    breaks: 'outro terreno, Ground e quem não está no chão' },
  'Grassy Terrain': { how: 'o terreno cura todo turno quem está no chão e fortalece golpes Grass; Grassy Glide ganha prioridade',
    breaks: 'outro terreno, Fire, Flying e Poison' },
  'Psychic Terrain': { how: 'o terreno fortalece golpes Psychic e bloqueia a prioridade contra quem está no chão; Expanding Force acerta mais forte',
    breaks: 'outro terreno, Dark, Ghost e quem não está no chão' },
  'Misty Terrain': { how: 'o terreno corta golpes Dragon pela metade e impede status em quem está no chão',
    breaks: 'outro terreno e atacantes Steel ou Poison' },
  'Trick Room': { how: 'quem põe o Trick Room entra primeiro; por 5 turnos o mais lento age antes. Guarde os turnos para os atacantes lentos',
    breaks: 'Taunt em quem põe, Trick Room do adversário (desfaz) e quem é lento e forte do outro lado' },
  offense: { how: 'quem abre o caminho põe hazards ou telas; depois cada atacante sobe os stats e varre o que puder',
    breaks: 'prioridade, Unaware, Haze e quem segura um atacante com setup' },
};
export const planText = plan => PLAN_TEXT[plan.field] || (plan.kind === 'offense' ? PLAN_TEXT.offense : null);

/**
 * O que o Pokémon precisa para cada papel: os que ele já cumpre (`has`) e, dos que não, como conseguir (`teach`:
 * { kind: 'move'|'item', name, src } com src = known/now/tutor/level do moveset.js; a troca de golpe fica nos golpes
 * que o menu ensina na hora ou no treino; item: dar).
 * @param {object} c { abs, item, moves, types, b }; @param {object[]} cands golpes que ele pode ter (moveset.js)
 * @param {(name: string) => boolean} itemOk o item existe no jogo
 * @param {(name: string) => boolean} teachOk o golpe vale a vaga no moveset (os sets do competitivo da espécie o usam)
 */
export function rolesOfMon(c, cands = [], itemOk = () => true, teachOk = () => true) {
  const has = new Set(), teach = new Map();
  for (const r of Object.keys(ROLE_TESTS)) {
    if (hasRole(c, r)) { has.add(r); continue; }
    const t = ROLE_TESTS[r];
    if (t.items) {
      const it = t.items.find(itemOk);
      if (it) teach.set(r, { kind: 'item', name: it });
      continue;
    }
    const best = teachMove(c, r, cands, teachOk);
    if (best) teach.set(r, { kind: 'move', name: best.name, src: best.src, level: best.level, tm: best.tm });
  }
  return { has, teach };
}
/**
 * O golpe que ele pode aprender e que cumpre o papel com ele (o menu ensina na hora primeiro; depois o treino), ou null.
 * `rank(x)` (menor primeiro) troca a ordem: as equipes de referência preferem o golpe que os sets da espécie mais usam.
 */
export function teachMove(c, r, cands, teachOk = () => true, rank = x => SRC_RANK[x.src]) {
  const t = ROLE_TESTS[r];
  if (!t || !t.moves) return null;
  return cands.filter(x => t.moves.has(x.name) && teachOk(x.name) && hasRole({ ...c, moves: [...c.moves, x] }, r))
    .sort((a, b) => rank(a) - rank(b))[0] || null;
}
const SRC_RANK = { known: 0, now: 1, tutor: 1, tm: 2, level: 2 };

/**
 * As estratégias que a equipe executa (`ready`) ou quase executa (`near`: falta até `maxPrep` passos: golpe a ensinar ou
 * item a dar), com quem faz cada papel e o preparo. `members` = [{ ref, roles: rolesOfMon(...) }].
 * @returns {Array<{ s, ready, who: Array<[string, string]>, prep: Array<{ ref, kind, name, src, level }> }>}
 */
export function teamStrategies(members, plan = { kind: 'balance' }, maxPrep = 1) {
  const out = [];
  for (const s of STRATEGIES) {
    if (s.offense === false && plan.kind === 'offense') continue; // a Hiperofensiva já é isso
    const r = assign(s, members, maxPrep);
    if (r) out.push({ s, ...r, ready: !r.prep.length });
  }
  return out.sort((a, b) => a.prep.length - b.prep.length || b.s.v - a.s.v);
}

// Acha quem faz cada papel, cada um num Pokémon diferente (dos `need`), com o menor preparo. As equipes têm 6 membros e
// as estratégias até 3 papéis: a busca tenta todas as combinações (no máximo 6³)
function assign(s, members, maxPrep) {
  const slots = [];
  if (s.same) slots.push({ roles: s.same });
  for (const [r, n] of s.need || []) for (let i = 0; i < n; i++) slots.push({ roles: [r] });
  let best = null;
  const used = new Set(), pick = [];
  const cost = (m, roles) => {
    const prep = [];
    for (const r of roles) {
      if (m.roles.has.has(r)) continue;
      const tch = m.roles.teach.get(r);
      if (!tch) return null;
      prep.push({ ref: m.ref, ...tch });
    }
    return prep;
  };
  const walk = i => {
    if (i === slots.length) {
      const prep = pick.flatMap(p => p.prep);
      if (prep.length <= maxPrep && (!best || prep.length < best.prep.length)) best = { who: pick.map(p => [p.ref, p.roles.join('+')]), prep };
      return;
    }
    for (const m of members) {
      if (used.has(m)) continue;
      const prep = cost(m, slots[i].roles);
      if (!prep) continue;
      used.add(m); pick.push({ ref: m.ref, roles: slots[i].roles, prep });
      walk(i + 1);
      used.delete(m); pick.pop();
      if (best && !best.prep.length) return;
    }
  };
  walk(0);
  return best;
}

// Para a nota (build.js): os papéis de cada Pokémon em bits, e as estratégias que a equipe executa contadas pelos bits
// (sem a busca de quem faz o quê da tela: a nota roda dezenas de milhares de vezes por plano). Papel do mesmo Pokémon
// (`same`) vira um bit próprio da estratégia.
const ROLE_KEYS = Object.keys(ROLE_TESTS);
const SAME_BIT = new Map(STRATEGIES.filter(s => s.same).map((s, i) => [s.id, 1 << (ROLE_KEYS.length + i)]));
const roleBit = r => 1 << ROLE_KEYS.indexOf(r);
/** Os papéis que o Pokémon cumpre, em bits. */
export function roleBits(c) {
  let x = 0;
  for (const r of ROLE_KEYS) if (hasRole(c, r)) x |= roleBit(r);
  for (const s of STRATEGIES) if (s.same && s.same.every(r => x & roleBit(r))) x |= SAME_BIT.get(s.id);
  return x;
}
/**
 * Os bits de papéis de um membro de equipe de referência: os papéis do set (setRoleKeys) que a espécie permite no jogo
 * (stats e tipos das tabelas do jogo; sem a espécie no jogo, `b` null: valem os do set) e os de tipo.
 */
export function refRoleBits(keys, types = [], b = null) {
  let x = 0;
  for (const r of ROLE_KEYS) {
    const t = ROLE_TESTS[r];
    if (t.type ? types.includes(t.type) : keys.includes(r) && (!b || !t.stat || t.stat(b))) x |= roleBit(r);
  }
  for (const s of STRATEGIES) if (s.same && s.same.every(r => x & roleBit(r))) x |= SAME_BIT.get(s.id);
  return x;
}
/** Os nomes dos papéis de uma máscara de bits (sem os bits de `same`). */
export const roleKeysOf = bits => ROLE_KEYS.filter(r => bits & roleBit(r));
/** A máscara de bits de uma lista de papéis. */
export const roleMask = keys => { let x = 0; for (const r of keys) x |= roleBit(r); return x; };
// Cada papel (e cada `same`) com o número do bit; as estratégias guardam os números dos bits que pedem
const COMPILED = STRATEGIES.map(s => ({ id: s.id, v: s.v, offense: s.offense,
  need: [...(s.same ? [[SAME_BIT.get(s.id), 1]] : []), ...(s.need || []).map(([r, n]) => [roleBit(r), n])].map(([bit, n]) => [31 - Math.clz32(bit), n]) }));
const NBITS = ROLE_KEYS.length + SAME_BIT.size;
const popc = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
// Quem cumpre cada papel na equipe (um bit por membro), montado uma vez por equipe
const MASKS = new Int32Array(NBITS);
function teamMasks(team) {
  MASKS.fill(0);
  for (let i = 0; i < team.length; i++) {
    let x = team[i].sbits;
    while (x) { const b = 31 - Math.clz32(x & -x); MASKS[b] |= 1 << i; x &= x - 1; }
  }
  return MASKS;
}

/**
 * A equipe executa a estratégia: cada papel em Pokémon diferentes. Teorema de Hall com as quantidades: para cada
 * conjunto de papéis, os membros que cumprem algum deles são pelo menos a soma do que eles pedem (até 3 papéis: 7
 * conjuntos, sem montar listas). Um Water/Grass não faz dois papéis do núcleo Fire/Water/Grass.
 */
function executesMasks(s, masks) {
  const k = s.need.length;
  for (let sub = 1; sub < 1 << k; sub++) {
    let union = 0, want = 0;
    for (let j = 0; j < k; j++) if (sub & (1 << j)) { union |= masks[s.need[j][0]]; want += s.need[j][1]; }
    if (popc(union) < want) return false;
  }
  return true;
}
const executes = (s, team) => executesMasks(s, teamMasks(team));

/** As estratégias que a equipe executa (os ids; para o teste de comparação). */
export const strategiesOf = (team, plan) => COMPILED.filter(s => !(s.offense === false && plan.kind === 'offense') && executes(s, team)).map(s => s.id);

/** A soma do valor das estratégias que a equipe executa (completas: meia estratégia não vale). */
export function strategyValue(team, plan) {
  const masks = teamMasks(team);
  let v = 0;
  for (const s of COMPILED) {
    if (s.offense === false && plan.kind === 'offense') continue;
    if (executesMasks(s, masks)) v += s.v;
  }
  return v;
}

/**
 * Sementes da busca (build.js): para cada estratégia, quem a executa no PC, um Pokémon diferente por papel, os melhores
 * pela nota sozinho (`rank`). `ok(seed, e)` diz se o Pokémon pode entrar junto (sem repetir espécie, megapedras…).
 * Ficam as `max` estratégias de mais valor que dá para montar (só as de `only`, se vier: as da equipe de referência).
 */
export function strategySeeds(pool, plan, base, rank, ok, max = 2, only = null) {
  const out = [];
  for (const s of COMPILED) {
    if (s.offense === false && plan.kind === 'offense') continue;
    if (only && !only.has(s.id)) continue;
    if (executes(s, base)) continue; // as sementes de sempre já a têm
    const seed = [...base];
    let fail = false;
    for (const [b, n] of s.need) {
      const bit = 1 << b;
      let have = 0;
      for (const e of seed) if (e.sbits & bit) have++;
      for (let i = have; i < n && !fail; i++) {
        let best = null, bv = -Infinity;
        for (const e of pool) {
          if (!(e.sbits & bit) || seed.includes(e) || !ok(seed, e)) continue;
          const v = rank(e);
          if (v > bv) { bv = v; best = e; }
        }
        if (best) seed.push(best); else fail = true;
      }
      if (fail) break;
    }
    if (!fail && seed.length <= 6 && seed.length > base.length && executes(s, seed)) out.push({ id: s.id, v: s.v, seed });
  }
  return out.sort((a, b) => b.v - a.v).slice(0, max);
}

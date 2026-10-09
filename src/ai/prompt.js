// Monta o que é enviado à IA (só dados dos Pokémon, nunca o .sav) e confere a resposta:
// a IA só pode citar Pokémon que existem no save, pelas referências (E1 = equipe 1, C3-12 = caixa 3, posição 12).

import { STAT_LABEL, SHOWDOWN_ORDER } from '../export.js';
import { analyzeTeam } from '../analysis.js';
import { moveInfo } from '../parser/describe.js';
import { t } from '../i18n.js';

const CATEGORY = ['Físico', 'Especial', 'Status'];
/** Limite de candidatos enviados (ver buildPool e analysisPool para quem entra). */
export const MAX_CANDIDATES = 250;
/**
 * Na análise da equipe, só os candidatos do PC que mais ajudam (resistem às fraquezas da equipe, cobrem
 * os tipos sem golpe super efetivo, têm stats base altos): bem menos tokens que mandar o PC inteiro.
 */
export const ANALYSIS_PC = 50;
/** Golpes por nível enviados por membro da equipe (só os que ele ainda não tem). */
const LEARN_MAX = 20;
/** Cópias da mesma espécie enviadas na análise (as de melhores IVs); na montagem, só uma. */
const PER_SPECIES = 2;

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
const bst = m => (m.species.baseStats ? m.species.baseStats.reduce((a, b) => a + b, 0) : 0);

export const refOf = m => (m.location === 'party' ? `E${m.slot}` : `C${m.boxIndex + 1}-${m.slot}`);
export const REF_RE = /\b(E[1-6]|C\d{1,2}-\d{1,2})\b/g;
export const speciesKey = m => `${m.species.name}|${m.species.form || ''}`;

/** Uma linha compacta por Pokémon. Sem nível nem stats: o jogador pode upar, então não contam. */
export function monLine(m) {
  const sp = m.species;
  const name = sp.name + (sp.form ? ` (${sp.form})` : '') + (m.hasNickname ? ` "${m.nickname}"` : '');
  const parts = [refOf(m), name, sp.types.map(cap).join('/') || t('tipo desconhecido')];
  if (m.ability) parts.push(`${t('Hab')}: ${m.ability.name}${m.ability.hidden ? ` (${t('oculta')})` : ''}`);
  parts.push(`Item: ${m.item ? m.item.name + (isMegaStone(m.item) ? ` (${t('megapedra')})` : '') : '—'}`);
  if (m.nature) parts.push(`${t('Natureza')}: ${m.nature.name}${m.nature.plus ? ` (+${STAT_LABEL[m.nature.plus]} −${STAT_LABEL[m.nature.minus]})` : ''}`);
  if (sp.baseStats) parts.push(`Base ${sp.baseStats.join('/')} = ${bst(m)}`);
  if (m.ivs) parts.push(`IVs ${SHOWDOWN_ORDER.map(k => m.ivs[k]).join('/')}`);
  const moves = m.moves.map(mv => {
    const cat = mv.category !== null && mv.category !== undefined ? t(CATEGORY[mv.category]) : '?';
    return `${mv.name} [${cap(mv.type) || '?'}, ${cat}${mv.power ? ', ' + mv.power : ''}]`;
  });
  parts.push(`${t('Golpes')}: ${moves.join('; ') || '—'}`);
  return parts.join(' | ');
}

/** Candidatos para trocas e montagem: toda a equipe + os melhores do PC, sem repetir muito a mesma espécie. */
export function candidates(all, max = MAX_CANDIDATES, perSpecies = PER_SPECIES) {
  const party = all.filter(m => m.location === 'party');
  const pc = all.filter(m => m.location !== 'party')
    .sort((a, b) => bst(b) - bst(a) || sum(b.ivs) - sum(a.ivs));
  const seen = new Map(party.map(m => [speciesKey(m), 1]));
  const out = [...party];
  for (const m of pc) {
    if (out.length >= max) break;
    const k = speciesKey(m);
    const n = seen.get(k) || 0;
    if (n >= perSpecies) continue;
    seen.set(k, n + 1);
    out.push(m);
  }
  return out;
}

/** Contexto de cada jogo para a IA. */
const GAME_CONTEXT = {
  quetzal: [
    'Pokémon Quetzal, uma ROM hack de Pokémon Emerald com engine expandida',
    '(tipo Fairy, divisão físico/especial por golpe, megaevoluções, habilidades e golpes até a geração 9, formas regionais).',
    '- O Quetzal pode ter mudado algumas espécies e golpes; confie nos tipos e dados enviados, não na sua memória.',
    '- Só uma megaevolução pode ser usada por batalha.',
  ],
  soulgold: [
    'Pokémon SoulGold, uma ROM hack de Pokémon Emerald com engine expandida, ambientada em Johto',
    '(tipo Fairy, divisão físico/especial por golpe, megaevoluções, Pokémon até a geração 9 e formas regionais).',
    '- O SoulGold pode ter mudado espécies, habilidades e golpes; confie nos tipos e dados enviados, não na sua memória.',
    '- Só uma megaevolução pode ser usada por batalha.',
  ],
  unbound: [
    'Pokémon Unbound, uma ROM hack de Pokémon FireRed com o motor CFRU',
    '(tipo Fairy, divisão físico/especial por golpe, megaevoluções, Pokémon até a geração 8 e formas regionais).',
    '- O Unbound mudou stats e habilidades de algumas espécies e o poder/PP de vários golpes; confie nos dados enviados, não na sua memória.',
    '- Só uma megaevolução pode ser usada por batalha.',
  ],
  gen4: [
    'um jogo oficial da Geração 4',
    '(sem tipo Fairy, sem megaevoluções; a categoria física/especial é de cada golpe).',
    '- Use os dados da época enviados (tipos, golpes, poder), não os de jogos mais novos.',
    '- Não sugira itens, golpes ou mecânicas que não existem nesse jogo.',
  ],
  gen5: [
    'um jogo oficial da Geração 5',
    '(sem tipo Fairy, sem megaevoluções; a categoria física/especial é de cada golpe).',
    '- Use os dados da época enviados (tipos, golpes, poder), não os de jogos mais novos.',
    '- Não sugira itens, golpes ou mecânicas que não existem nesse jogo.',
  ],
  gen3: [
    'um jogo oficial da Geração 3',
    '(sem tipo Fairy, sem megaevoluções; na Gen 3 a categoria física/especial depende do TIPO do golpe: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost e Steel são físicos; os demais, especiais).',
    '- Use os dados de Gen 3 enviados (tipos, golpes, poder), não os de jogos mais novos.',
    '- Não sugira itens, golpes ou mecânicas que não existem na Gen 3.',
  ],
};

/** Instruções fixas para a IA, conforme o jogo do save. */
export function systemPrompt(game) {
  const key = game && GAME_CONTEXT[game.id] ? game.id : game && game.gen ? `gen${game.gen}` : 'gen3';
  const [what, details, ...rules] = GAME_CONTEXT[key].map(line => t(line));
  const name = /^gen\d$/.test(key) && game ? `${game.name}, ${what}` : what;
  return [
    t('Você é um especialista em Pokémon ajudando quem joga {game}', { game: name }),
    details,
    t('O jogador quer montar e avaliar equipes para jogar o jogo (batalhas em singles contra treinadores e líderes).'),
    t('Regras:'),
    t('- Use SOMENTE os dados enviados: espécies, tipos, habilidades, itens, naturezas, stats base, IVs e golpes. Não invente Pokémon, golpes ou habilidades que não estejam na lista.'),
    t('- Os cálculos do app (tipos, cobertura, contagens, velocidade) são a fonte de verdade: interprete-os, não recalcule nem contradiga.'),
    t('- Se uma conclusão depender de uma mecânica, habilidade, item ou interação que não esteja nos dados, diga que é uma limitação em vez de supor como funciona neste jogo.'),
    ...rules,
    t('- Cite Pokémon SEMPRE pela referência do começo de cada linha (ex.: E1, C3-12), também dentro dos textos, e SEM escrever o nome junto (o app troca a referência pelo nome). Certo: "C3-12 resiste a Ice". Errado: "Garchomp (C3-12) resiste a Ice".'),
    t('- Ignore o nível: o jogador pode treinar qualquer Pokémon.'),
    t('- A habilidade de cada Pokémon é a da linha dele ("Hab:"), não a que a espécie costuma ter (ex.: um Torkoal com White Smoke não põe sol).'),
    t('- Antes de sugerir trocar um item ou criticar um set, veja se a habilidade do Pokémon já anula a desvantagem (ex.: Magic Guard anula o recuo da Life Orb).'),
    t('- Golpe que o Pokémon ainda não tem: cite pelo nome só se estiver na lista "Aprende por nível" dele (quando enviada) e diga que ele precisa aprender. Fora dela, sugira só o tipo (ex.: "um golpe Electric, se ele aprender").'),
    t('- Escreva em português do Brasil, de forma direta e específica. Nomes de Pokémon, golpes, itens, habilidades e tipos ficam em inglês.'),
    t('- Frases curtas: cada item de lista com no máximo 2 frases.'),
  ].join('\n');
}

/** Cópia do schema com as descrições dos campos no idioma da interface. */
export function localizedSchema(schema) {
  const walk = v => (Array.isArray(v) ? v.map(walk)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'description' ? t(x) : walk(x)]))
    : v);
  return walk(schema);
}

const str = { type: 'STRING' };
const strList = { type: 'ARRAY', items: str };

export const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nota: { type: 'INTEGER', description: 'Nota da equipe de 0 a 10, pelos critérios pedidos' },
    resumo: { type: 'STRING', description: 'Resumo em até 3 frases' },
    pontos_fortes: strList,
    pontos_fracos: strList,
    sinergias: { ...strList, description: 'Combinações boas (ou que faltam) entre membros' },
    trocas: {
      type: 'ARRAY',
      description: 'Até 3 trocas, só as que resolvem um problema claro (pode ficar vazio): sai um membro da equipe, entra um Pokémon do PC',
      items: {
        type: 'OBJECT',
        properties: { sai: { type: 'STRING', description: 'referência E1..E6' }, entra: { type: 'STRING', description: 'referência C<caixa>-<posição>' }, motivo: { type: 'STRING', description: 'Que problema resolve e o que se perde' } },
        required: ['sai', 'entra', 'motivo'],
      },
    },
    dicas: {
      type: 'ARRAY',
      description: 'Só membros com um ajuste concreto (golpe, item, natureza ou EVs), dizendo o quê e por quê; omita quem já está bem montado',
      items: { type: 'OBJECT', properties: { ref: str, texto: str }, required: ['ref', 'texto'] },
    },
  },
  required: ['nota', 'resumo', 'pontos_fortes', 'pontos_fracos', 'sinergias', 'trocas', 'dicas'],
};

export const BUILD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nome: { type: 'STRING', description: 'Nome curto e criativo para a equipe' },
    resumo: { type: 'STRING', description: 'Estratégia em até 3 frases' },
    membros: {
      type: 'ARRAY',
      description: 'Exatamente 6 Pokémon diferentes',
      items: {
        type: 'OBJECT',
        properties: {
          ref: str,
          papel: { type: 'STRING', description: 'Papel em 1 a 3 palavras (ex.: atacante físico)' },
          motivo: { type: 'STRING', description: 'O que ele traz que os outros não têm (tipo, cobertura, velocidade, estratégia)' },
        },
        required: ['ref', 'papel', 'motivo'],
      },
    },
    pontos_fortes: strList,
    pontos_fracos: strList,
    dicas: { ...strList, description: 'Ajustes concretos (golpe, item, natureza, EVs), cada um com o motivo' },
  },
  required: ['nome', 'resumo', 'membros', 'pontos_fortes', 'pontos_fracos', 'dicas'],
};

/** Segunda etapa da montagem: pontos e dicas escritos já com as contas do app sobre a equipe escolhida. */
export const REFINE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    pontos_fortes: strList,
    pontos_fracos: { ...strList, description: 'Inclua os tipos que acertam muitos membros e os tipos sem golpe super efetivo, pelos cálculos do app' },
    dicas: { ...strList, description: 'Até 5 ajustes concretos (golpe, item, natureza, EVs) que atacam os pontos fracos, cada um com o motivo' },
  },
  required: ['pontos_fortes', 'pontos_fracos', 'dicas'],
};

/**
 * Formato da resposta em texto, para serviços sem "schema" nativo (ex.: Groq em modo JSON):
 * um exemplo do objeto e as observações de cada campo.
 */
export function schemaHint(schema) {
  const notes = [];
  const example = (s, path) => {
    if (s.description) notes.push(`- ${path}: ${s.description}`);
    if (s.type === 'OBJECT') return Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, example(v, path ? `${path}.${k}` : k)]));
    if (s.type === 'ARRAY') return [example(s.items, `${path}[]`)];
    return s.type === 'INTEGER' ? 0 : '...';
  };
  const ex = example(schema, '');
  return [
    t('Responda APENAS com um objeto JSON válido, sem texto antes ou depois, neste formato:'),
    JSON.stringify(ex),
    ...(notes.length ? [t('Observações sobre os campos:'), ...notes] : []),
  ].join('\n');
}

// Habilidades que montam uma estratégia (clima, terreno): a IA deve preservar quem sustenta o plano
const FIELD = {
  Drizzle: 'chuva', Drought: 'sol', 'Sand Stream': 'tempestade de areia', 'Snow Warning': 'neve/granizo',
  'Electric Surge': 'Electric Terrain', 'Psychic Surge': 'Psychic Terrain', 'Grassy Surge': 'Grassy Terrain', 'Misty Surge': 'Misty Terrain',
};
// Quem aproveita cada clima/terreno (habilidades) e os golpes que os põem
const ABUSERS = {
  'Swift Swim': 'chuva', 'Rain Dish': 'chuva', Hydration: 'chuva', 'Dry Skin': 'chuva',
  Chlorophyll: 'sol', 'Solar Power': 'sol', 'Flower Gift': 'sol', Protosynthesis: 'sol',
  'Sand Rush': 'tempestade de areia', 'Sand Force': 'tempestade de areia', 'Sand Veil': 'tempestade de areia',
  'Slush Rush': 'neve/granizo', 'Ice Body': 'neve/granizo', 'Snow Cloak': 'neve/granizo',
  'Surge Surfer': 'Electric Terrain', 'Quark Drive': 'Electric Terrain', 'Grass Pelt': 'Grassy Terrain',
};
// Golpes que ficam mais fortes (ou mais certeiros, ou ganham prioridade) com o clima/terreno
const MOVE_ABUSERS = {
  'Grassy Glide': ['Grassy Terrain'], 'Rising Voltage': ['Electric Terrain'], 'Expanding Force': ['Psychic Terrain'], 'Misty Explosion': ['Misty Terrain'],
  'Solar Beam': ['sol'], 'Solar Blade': ['sol'], Thunder: ['chuva'], Hurricane: ['chuva'], Blizzard: ['neve/granizo'],
  'Weather Ball': ['chuva', 'sol', 'tempestade de areia', 'neve/granizo'],
};
const FIELD_MOVES = {
  'Rain Dance': 'chuva', 'Sunny Day': 'sol', Sandstorm: 'tempestade de areia', Hail: 'neve/granizo', Snowscape: 'neve/granizo',
  'Electric Terrain': 'Electric Terrain', 'Psychic Terrain': 'Psychic Terrain', 'Grassy Terrain': 'Grassy Terrain', 'Misty Terrain': 'Misty Terrain',
};
const isMegaStone = item => !!item && /ite( [XYZ])?$/.test(item.name) && !/^(Eviolite|Meteorite)$/.test(item.name);
const SPE = 5; // stats base na ordem HP/Atk/Def/SpA/SpD/Spe

/** Fatos calculados pelo app sobre a equipe (a IA interpreta, não recalcula). */
export function teamFacts(party, T) {
  const a = analyzeTeam(party, { types: T.types, chart: T.typechart });
  const count = r => t('{weak} fracos, {resist} resistem/imunes', { weak: r.weak.length, resist: r.resist.length + r.immune.length });
  const alert = a.defense.filter(r => r.alert).map(r => `${cap(r.type)} (${count(r)})`);
  const uncovered = a.defense.filter(r => r.weak.length && !r.resist.length && !r.immune.length && !r.alert).map(r => `${cap(r.type)} (${count(r)})`);
  const dmg = party.flatMap(m => m.moves).filter(mv => mv.category === 0 || mv.category === 1);
  const status = party.flatMap(m => m.moves).filter(mv => mv.category === 2).length;
  const typeCount = new Map();
  for (const m of party) for (const ty of m.species.types) typeCount.set(ty, (typeCount.get(ty) || 0) + 1);
  const repeated = [...typeCount].filter(([, n]) => n > 1).map(([ty, n]) => `${cap(ty)} ×${n}`);
  const speed = party.filter(m => m.species.baseStats).sort((x, y) => y.species.baseStats[SPE] - x.species.baseStats[SPE])
    .map(m => `${refOf(m)} ${m.species.baseStats[SPE]}`);
  const megas = party.filter(m => isMegaStone(m.item)).map(m => `${refOf(m)} (${m.item.name})`);
  const field = party.filter(m => m.ability && FIELD[m.ability.name]).map(m => `${refOf(m)} ${m.ability.name} (${t(FIELD[m.ability.name])})`);
  const none = t('nenhum');
  return [
    t('Tipos que acertam muitos membros em cheio: {list}.', { list: alert.join(', ') || none }),
    t('Outros tipos sem nenhum membro que resista: {list}.', { list: uncovered.join(', ') || none }),
    t('Tipos sem nenhum golpe super efetivo da equipe: {list}.', { list: a.gaps.map(cap).join(', ') || none }),
    t('Golpes de dano: {phys} físicos, {spec} especiais; {status} de status.', { phys: dmg.filter(mv => mv.category === 0).length, spec: dmg.filter(mv => mv.category === 1).length, status }),
    t('Velocidade base (maior primeiro): {list}.', { list: speed.join(', ') || none }),
    t('Tipos repetidos: {list}.', { list: repeated.join(', ') || none }),
    t('Megapedras: {list} (só uma megaevolução por batalha).', { list: megas.join(', ') || none }),
    t('Clima/terreno: {list}.', { list: field.join(', ') || none }),
  ].join('\n');
}

/** Critérios fixos da montagem que a equipe sugerida não cumpre (conferidos pelo app, não pela IA). */
export function buildIssues(team, T) {
  const a = analyzeTeam(team, { types: T.types, chart: T.typechart });
  const out = a.defense.filter(r => r.weak.length >= 3)
    .map(r => t('{type} acerta {n} membros em cheio (o pedido era nenhum tipo acertando 3 ou mais).', { type: cap(r.type), n: r.weak.length }));
  const megas = team.filter(m => isMegaStone(m.item)).length;
  if (megas > 1) out.push(t('{n} Pokémon com megapedra (o pedido era no máximo um).', { n: megas }));
  return out;
}

/**
 * Candidatos do PC para a análise: os que resistem às fraquezas da equipe ou cobrem os tipos sem golpe
 * super efetivo valem mais; depois, os de maior total de stats base.
 */
export function analysisPool(all, T, limit) {
  const party = all.filter(m => m.location === 'party');
  const a = analyzeTeam(party, { types: T.types, chart: T.typechart });
  const idx = new Map(T.types.map((ty, i) => [ty, i]));
  const mult = (atk, def) => def.reduce((x, d) => x * (idx.has(atk) && idx.has(d) ? T.typechart[idx.get(atk)][idx.get(d)] : 1), 1);
  const threats = a.defense.filter(r => r.alert || (r.weak.length && !r.resist.length && !r.immune.length)).map(r => r.type);
  const score = m => {
    const def = threats.filter(ty => mult(ty, m.species.types) < 1).length;
    const hits = new Set(m.moves.filter(mv => mv.type && (mv.category === 0 || mv.category === 1)).map(mv => mv.type));
    const off = a.gaps.filter(g => [...hits].some(h => mult(h, [g]) > 1)).length;
    return bst(m) + 60 * def + 40 * off;
  };
  return candidates(all, Infinity).filter(m => m.location !== 'party')
    .map(m => [m, score(m)]).sort((x, y) => y[1] - x[1]).slice(0, Math.max(0, limit)).map(([m]) => m);
}

/** Nomes dos golpes por nível da espécie, sem repetir; null se não houver lista. */
export function levelMoveNames(m, dex, T) {
  // Quetzal/Unbound: tabela da ROM, pelo ID do save; demais jogos: dex.json (jogos oficiais), pelo ID da PokeAPI
  const pid = dex && dex.rom ? m.speciesId : m.species.dexId;
  const raw = pid && dex ? dex.learn[pid] : null;
  if (!raw) return null;
  const names = [];
  for (let i = 2; i < raw.length; i += 2) {
    const id = raw[i];
    const info = typeof id === 'number' ? moveInfo(id, T) : null;
    const name = info ? (info.known ? info.name : null) : String(id);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

// Golpes cujo nome também é o do efeito no campo: a IA cita "Grassy Terrain" ou "Trick Room" como estratégia,
// não como golpe a ensinar, então a conferência não os marca
const FIELD_CONCEPTS = new Set(['Grassy Terrain', 'Electric Terrain', 'Psychic Terrain', 'Misty Terrain', 'Trick Room',
  'Sandstorm', 'Hail', 'Snowscape', 'Gravity', 'Wonder Room', 'Magic Room']);

const moveRes = new WeakMap();
/** Uma expressão com os nomes de todos os golpes (os mais longos primeiro: "Thunder Punch" antes de "Thunder"). */
function moveRe(T) {
  if (!moveRes.has(T)) {
    const names = [...new Set(T.moves.map(r => r && r[0]).filter(n => n && n.length > 2))]
      .sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    moveRes.set(T, new RegExp(`(?<![\\p{L}\\p{N}-])(?:${names.join('|')})(?![\\p{L}\\p{N}-])`, 'gu'));
  }
  return moveRes.get(T);
}

/**
 * Golpes que a IA citou num texto e que o Pokémon ainda não tem, conferidos pelo app com a lista de golpes por
 * nível (dex.json). O Pokémon é o citado mais perto do golpe (ou `owner`, o dono da dica). Uma palavra no começo
 * de frase não conta como golpe se for uma palavra só (ex.: "Substitute", "Rest" em inglês).
 * @returns {{ ref: string, move: string, learns: boolean }[]}
 */
export function moveChecks(text, byRef, dex, T, owner = null) {
  if (!dex) return [];
  const src = String(text ?? '');
  const refs = [...src.matchAll(REF_RE)].filter(x => byRef.has(x[0])).map(x => ({ m: byRef.get(x[0]), at: x.index }));
  const out = [], seen = new Set();
  for (const x of src.matchAll(moveRe(T))) {
    const name = x[0];
    if (FIELD_CONCEPTS.has(name)) continue;
    if (!name.includes(' ') && /(^|[.!?:]\s*)$/.test(src.slice(0, x.index))) continue;
    const near = refs.length ? refs.reduce((a, b) => (Math.abs(b.at - x.index) < Math.abs(a.at - x.index) ? b : a)).m : owner;
    if (!near) continue;
    const key = `${refOf(near)}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (near.moves.some(mv => mv.name === name)) continue; // já tem (ex.: o golpe que sai)
    const list = levelMoveNames(near, dex, T);
    if (list) out.push({ ref: refOf(near), move: name, learns: list.includes(name) });
  }
  return out;
}

/** Nível bem abaixo do resto da equipe (o nível não vai para a IA; só o app mostra). */
export const LEVEL_GAP = 15;
export function levelGap(team) {
  const lv = team.filter(m => m.level);
  if (lv.length < 2) return null;
  const top = Math.max(...lv.map(m => m.level));
  const low = lv.filter(m => m.level <= top - LEVEL_GAP);
  if (!low.length) return null;
  const rest = lv.filter(m => !low.includes(m)).map(m => m.level);
  const min = Math.min(...rest);
  const list = low.sort((a, b) => a.level - b.level).map(m => `${refOf(m)} (${m.level})`).join(', ');
  return min === top
    ? t('Nível bem abaixo do resto: {list}; os outros estão no nível {max}. Vale treinar antes.', { list, max: top })
    : t('Nível bem abaixo do resto: {list}; os outros, do {min} ao {max}. Vale treinar antes.', { list, min, max: top });
}

/**
 * Golpes por nível dos membros da equipe que eles ainda não têm (lista dos jogos oficiais recentes, src/data/dex.json).
 * Só faz sentido em jogos com os golpes atuais (Quetzal, Unbound, SoulGold); nos oficiais antigos, nada.
 */
export function learnLines(party, dex, T, game) {
  if (!dex || !game || !['quetzal', 'unbound', 'soulgold'].includes(game.id)) return [];
  const out = [];
  for (const m of party) {
    const all = levelMoveNames(m, dex, T);
    if (!all) continue;
    const known = new Set(m.moves.map(mv => mv.name));
    const names = all.filter(n => !known.has(n));
    if (names.length) out.push(`${refOf(m)}: ${names.slice(-LEARN_MAX).join(', ')}`);
  }
  const head = dex.rom ? t('Aprende por nível (tabela do próprio jogo):') : t('Aprende por nível (lista dos jogos oficiais recentes; este jogo pode ser diferente):');
  return out.length ? ['', head, ...out] : [];
}

/**
 * Pistas de estratégia entre os disponíveis: quem põe clima/terreno (habilidade ou golpe), quem aproveita
 * (habilidade ou golpe) e quem usa Trick Room. Só os climas/terrenos que alguém consegue pôr.
 */
export function strategyLines(pool) {
  const fields = new Map(); // clima → { set: [], use: [] }
  const get = f => fields.get(f) || fields.set(f, { set: [], use: [] }).get(f);
  const room = [];
  for (const m of pool) {
    const ref = refOf(m), ab = m.ability && m.ability.name;
    if (ab && FIELD[ab]) get(FIELD[ab]).set.push(`${ref} (${ab})`);
    if (ab && ABUSERS[ab]) get(ABUSERS[ab]).use.push(`${ref} (${ab})`);
    for (const mv of m.moves) {
      for (const f of MOVE_ABUSERS[mv.name] || []) get(f).use.push(`${ref} (${mv.name})`);
      if (FIELD_MOVES[mv.name] && !(ab && FIELD[ab] === FIELD_MOVES[mv.name])) get(FIELD_MOVES[mv.name]).set.push(`${ref} (${mv.name})`);
      if (mv.name === 'Trick Room' && !room.includes(ref)) room.push(ref);
    }
  }
  const out = [...fields].filter(([, x]) => x.set.length).map(([f, x]) => `- ${t(f)}: ${t('põem {list}', { list: x.set.join(', ') })}; `
    + (x.use.length ? t('aproveitam {list}', { list: x.use.join(', ') }) : t('ninguém aproveita (habilidade ou golpe)')) + '.');
  if (room.length) out.push(`- Trick Room: ${room.join(', ')}.`);
  return out.length ? ['', t('Pistas de estratégia (habilidades e golpes dos disponíveis):'), ...out] : [];
}

const wish = text => (text && text.trim() ? `\n${t('Pedido do jogador:')} ${text.trim().slice(0, 300)}\n` : '');

/**
 * @param {object[]} all equipe + PC
 * @param {object} T tabelas
 * @param {string} [note] pedido do jogador
 * @param {number} [max] limite de candidatos do serviço (o Groq aceita menos)
 * @param {{ dex?: object, game?: object }} [extra] golpes por nível (dex.json) e o jogo
 */
export function analysisPrompt(all, T, note = '', max = MAX_CANDIDATES, { dex = null, game = null } = {}) {
  const party = all.filter(m => m.location === 'party');
  const pool = analysisPool(all, T, Math.min(ANALYSIS_PC, max - party.length));
  return [
    t('Avalie a EQUIPE ATUAL. Dê UMA nota de 0 a 10 pesando: defesa entre os membros (25%), cobertura ofensiva (25%), papéis e sinergia (20%), ameaças comuns do jogo (20%), itens e sets (10%).'),
    t('Trocas com o PC: até 3, só as que resolvem um problema claro (nenhuma, se não houver); para cada uma, diga o que resolve e o que se perde. Preserve quem sustenta a estratégia da equipe (clima, terreno, Trick Room…), mesmo que não seja o mais forte sozinho: melhore o conjunto, não peças isoladas.'),
    t('Dicas por membro: só quando mudam algo concreto (um golpe, o item, a natureza ou os EVs), dizendo o quê e por quê. Omita quem já está bem montado; não repita o que o Pokémon já faz.'),
    wish(note),
    t('EQUIPE ATUAL:'),
    ...party.map(monLine),
    '',
    t('Cálculos do app (só tipos e números, sem habilidades):'),
    teamFacts(party, T),
    ...learnLines(party, dex, T, game),
    '',
    t('PC ({n} candidatos que mais ajudam a equipe):', { n: pool.length }),
    ...pool.map(monLine),
  ].join('\n');
}

/** Usa (ou põe) clima, terreno ou Trick Room, pela habilidade ou por um golpe. */
function strategyOf(m) {
  const ab = m.ability && m.ability.name;
  const set = new Set(), use = new Set();
  if (ab && FIELD[ab]) set.add(FIELD[ab]);
  if (ab && ABUSERS[ab]) use.add(ABUSERS[ab]);
  for (const mv of m.moves) {
    if (FIELD_MOVES[mv.name]) set.add(FIELD_MOVES[mv.name]);
    if (mv.name === 'Trick Room') set.add('Trick Room');
    for (const f of MOVE_ABUSERS[mv.name] || []) use.add(f);
  }
  return { set, use };
}

/**
 * Disponíveis para a montagem: a equipe + o PC, uma cópia por espécie (a de melhores IVs). Com pouco espaço
 * (o Groq aceita menos), os stats base não decidem sozinhos: primeiro entram quem põe clima/terreno/Trick Room
 * e quem aproveita um clima/terreno que alguém consegue pôr (até 1/5 das vagas), depois os melhores de cada
 * tipo (para a IA ter como fugir de fraquezas em comum) e, por fim, os de maior total de stats base.
 */
export function buildPool(all, max = MAX_CANDIDATES) {
  const every = candidates(all, Infinity, 1);
  if (every.length <= max) return every;
  const out = every.filter(m => m.location === 'party').slice(0, max);
  const pc = every.filter(m => m.location !== 'party'); // já em ordem de stats base
  const taken = new Set(out);
  const take = m => { if (m && out.length < max && !taken.has(m)) { taken.add(m); out.push(m); } };

  const roles = new Map(every.map(m => [m, strategyOf(m)]));
  const settable = new Set(every.flatMap(m => [...roles.get(m).set]));
  const strategic = pc.filter(m => roles.get(m).set.size || [...roles.get(m).use].some(f => settable.has(f)));
  const room = out.length + Math.ceil((max - out.length) / 5);
  for (const m of strategic) if (out.length < room) take(m);

  const perType = Math.max(1, Math.floor(max / 60));
  const types = [...new Set(pc.flatMap(m => m.species.types))];
  for (let round = 0; round < perType; round++) {
    for (const ty of types) take(pc.filter(m => m.species.types.includes(ty) && !taken.has(m))[0]);
  }
  for (const m of pc) take(m);

  // A equipe primeiro; o PC em ordem de stats base, como antes
  const order = new Map(every.map((m, i) => [m, i]));
  return out.sort((a, b) => order.get(a) - order.get(b));
}

export function buildPrompt(all, T, note = '', max = MAX_CANDIDATES) {
  const pool = buildPool(all, max);
  const hints = strategyLines(pool);
  return [
    t('Monte a MELHOR EQUIPE de 6 Pokémon com os disponíveis abaixo (equipe atual + PC), sem repetir espécie.'),
    t('Monte o melhor CONJUNTO, não os 6 mais fortes sozinhos. Prioridades, nesta ordem:'),
    t('1. Uma estratégia que funcione junto (clima, terreno ou Trick Room), só se ela aparecer nas pistas de estratégia abaixo, com quem a ponha e quem a aproveite; não force uma estratégia fraca.'),
    t('2. Poucas fraquezas em comum: nenhum tipo que acerte em cheio 3 ou mais membros.'),
    t('3. Cobertura ofensiva variada (golpes de tipos diferentes).'),
    t('4. Equilíbrio entre atacantes físicos e especiais, velocidade (membros rápidos ou um plano de Trick Room) e papéis variados.'),
    t('5. Stats base altos: só para desempatar.'),
    t('Obrigatório: no máximo um Pokémon com megapedra. Se nenhuma equipe cumprir tudo, escolha a melhor possível e não diga que ela cumpre o que não cumpre.'),
    t('Nas dicas, só ajustes concretos (um golpe, o item, a natureza ou os EVs), dizendo por quê.'),
    t('Nas dicas, não sugira o que o Pokémon já tem (item ou golpe). Aqui não vai a lista de golpes por nível: golpe novo, só pelo tipo (ex.: "um golpe Flying, se ele aprender").'),
    t('Não afirme fraquezas, resistências nem contagens da equipe final (ex.: "sem fraquezas triplas"): o app calcula e mostra isso ao lado. Nos pontos fortes e fracos, fale de papéis, estratégia e sets.'),
    wish(note),
    ...hints,
    ...(hints.length ? [''] : ['', t('Nenhum disponível põe clima, terreno nem Trick Room (pela habilidade ou por um golpe): não monte a equipe em volta disso.'), '']),
    t('DISPONÍVEIS ({n}):', { n: pool.length }),
    ...pool.map(monLine),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Pedido da segunda etapa da montagem: só a equipe escolhida, as contas do app sobre ela e (Quetzal/Unbound)
 * os golpes por nível de cada membro, para os pontos fracos e as dicas saírem do que a equipe tem de verdade.
 */
export function refinePrompt(team, T, note = '', { dex = null, game = null } = {}) {
  const issues = buildIssues(team, T);
  const wishLine = wish(note);
  return [
    t('Esta é a equipe escolhida. Não troque membros: escreva pontos fortes, pontos fracos e dicas para ELA, usando os cálculos do app abaixo (fonte de verdade).'),
    t('Os pontos fracos devem falar dos tipos que acertam muitos membros e dos tipos sem golpe super efetivo. As dicas devem atacar esses pontos: golpe, item, natureza ou EVs, dizendo o quê e por quê. Não sugira o que o Pokémon já tem; não fale de nível nem de treino.'),
    t('Golpe novo: cite pelo nome só se estiver na lista "Aprende por nível" do Pokémon; fora dela, só o tipo (ex.: "um golpe Ground, se ele aprender").'),
    ...(wishLine ? [wishLine] : []),
    t('EQUIPE:'),
    ...team.map(monLine),
    '',
    t('Cálculos do app (só tipos e números, sem habilidades):'),
    teamFacts(team, T),
    ...(issues.length ? [t('Fora dos critérios pedidos:') + ' ' + issues.join(' ')] : []),
    ...learnLines(team, dex, T, game),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
}

const texts = (v, max = 6) => (Array.isArray(v) ? v : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, max);

/** Confere a análise: notas válidas, trocas e dicas só com referências que existem. */
export function checkAnalysis(data, byRef) {
  const dropped = [];
  const isParty = r => byRef.has(r) && byRef.get(r).location === 'party';
  const isPc = r => byRef.has(r) && byRef.get(r).location !== 'party';
  const trocas = (Array.isArray(data.trocas) ? data.trocas : []).filter(x => {
    const ok = x && isParty(String(x.sai).trim()) && isPc(String(x.entra).trim());
    if (!ok && x) dropped.push(`${x.sai} → ${x.entra}`);
    return ok;
  }).slice(0, 3).map(x => ({ sai: String(x.sai).trim(), entra: String(x.entra).trim(), motivo: String(x.motivo || '').trim() }));
  const dicas = (Array.isArray(data.dicas) ? data.dicas : []).filter(d => {
    const ok = d && byRef.has(String(d.ref).trim()) && String(d.texto || '').trim();
    if (!ok && d && d.ref) dropped.push(String(d.ref));
    return ok;
  }).slice(0, 6).map(d => ({ ref: String(d.ref).trim(), texto: String(d.texto).trim() }));
  const nota = Math.max(0, Math.min(10, Math.round(Number(data.nota) || 0)));
  return {
    nota,
    resumo: String(data.resumo || '').trim(),
    pontos_fortes: texts(data.pontos_fortes),
    pontos_fracos: texts(data.pontos_fracos),
    sinergias: texts(data.sinergias),
    trocas, dicas, dropped,
  };
}

/** Confere a segunda etapa (só textos); null se veio vazia, para ficar com os da primeira. */
export function checkRefine(data) {
  const r = { pontos_fortes: texts(data && data.pontos_fortes), pontos_fracos: texts(data && data.pontos_fracos), dicas: texts(data && data.dicas) };
  return r.pontos_fracos.length || r.dicas.length ? r : null;
}

/** Confere a equipe montada: só Pokémon que existem, sem repetir referência nem espécie, até 6. */
export function checkBuild(data, byRef) {
  const dropped = [];
  const refs = new Set(), species = new Set();
  const membros = [];
  for (const x of Array.isArray(data.membros) ? data.membros : []) {
    const ref = String((x && x.ref) || '').trim();
    const m = byRef.get(ref);
    if (!m) { dropped.push(ref || '?'); continue; }
    if (refs.has(ref) || species.has(speciesKey(m)) || membros.length >= 6) continue;
    refs.add(ref); species.add(speciesKey(m));
    membros.push({ ref, papel: String(x.papel || '').trim(), motivo: String(x.motivo || '').trim() });
  }
  return {
    nome: String(data.nome || '').trim() || t('Equipe sugerida'),
    resumo: String(data.resumo || '').trim(),
    membros,
    pontos_fortes: texts(data.pontos_fortes),
    pontos_fracos: texts(data.pontos_fracos),
    dicas: texts(data.dicas),
    dropped,
  };
}

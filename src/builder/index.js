// Montador de equipes (sem IA): pacote carregado só ao tocar em "Montar equipes". Busca as equipes (build.js)
// e escreve, pelas contas, a função de cada membro, os pontos fortes e fracos e de onde vem a nota. A tela usa
// o mesmo desenho da equipe montada pela IA (ai/view.js), com os Pokémon reais do save.

import { t } from '../i18n.js';
import { esc } from '../ui/render.js';
import { prepareBuild, freeTeams, altTeams, scoreParts, shownRoleBits, roleTeach, setPlanFlags, attackTypes, sets, compPairs, finalMoveset, realOf, itemFor, TUTOR, shownCombos, teamCombos, strategyInput } from './build.js';
import { rolesOfMon, teamStrategies, planText, STRATEGIES, strategiesOf, roleMask } from './strategies.js';
import { referenceTeams, adaptReference, missingMembers, FID_ROLES, MIN_KEEP, ADAPT_N } from './reference.js';
import { SRC } from './moveset.js';
import { teamThreats, variantOf } from './threats.js';
import { idealSwaps } from './ideal.js';
import { buildView } from '../ai/view.js';
import { refOf } from '../ai/prompt.js';
import { FIELD, MEGA_FIELD, FIELD_MOVES, ABUSERS, MOVE_ABUSERS, MEGA_ABUSERS, WEATHER } from '../ai/strategy.js';

// A referência competitiva do jogo (tabelas do Smogon em pacotes à parte) e as equipes de referência: app.js carrega
// antes de montar
export { loadSmogon } from './smogon.js';
export { loadReferences } from './reference.js';

const PLAN_NAME = {
  sol: 'Sol', chuva: 'Chuva', 'tempestade de areia': 'Areia', 'neve/granizo': 'Neve', 'Trick Room': 'Trick Room',
  'Electric Terrain': 'Electric Terrain', 'Psychic Terrain': 'Psychic Terrain', 'Grassy Terrain': 'Grassy Terrain', 'Misty Terrain': 'Misty Terrain',
};
const ROLE_ORDER = ['pivô', 'prioridade', 'recuperação', 'controle de velocidade', 'setup', 'intimidação', 'hazards', 'tira hazards', 'telas', 'status', 'tanque'];
const KEY_ROLES = ['prioridade', 'recuperação', 'controle de velocidade', 'pivô'];
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const list = a => a.join(', ');

export const planName = plan => {
  if (plan.field) return t(PLAN_NAME[plan.field] || plan.field);
  return plan.kind === 'offense' ? t('Hiperofensiva') : t('Equilibrada');
};

/** O golpe que já sabe, ou "ensine X (Nv. N)". */
const moveOrTeach = (mv, known) => (known ? mv.name : t('ensine {move} ({when})', { move: mv.name, when: learnAt(mv.level) }));

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Quem o jogador pediu no campo "Pedido" (o mesmo da IA): nomes separados por vírgula, comparados com a espécie e o
 * apelido (sem diferenciar maiúsculas; começo do nome vale com 5+ letras, ex.: "garch"), e os nomes citados no meio
 * de uma frase ("quero o Lucario e o Charizard; time de chuva"). Da equipe primeiro, depois do PC.
 */
export function wantedMons(all, text) {
  const low = String(text || '').toLowerCase();
  const names = low.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  const add = m => { if (m && !out.includes(m)) out.push(m); };
  for (const n of names) {
    add(all.find(m => m.species.name.toLowerCase() === n || (m.hasNickname && m.nickname.toLowerCase() === n))
      || (n.length >= 5 && !/\s/.test(n) ? all.find(m => m.species.name.toLowerCase().startsWith(n)) : null));
  }
  // Nomes no meio do texto, na ordem em que aparecem (cada nome uma vez: o primeiro Pokémon com ele)
  const byName = new Map();
  for (const m of all) {
    for (const name of [m.species.name, m.hasNickname ? m.nickname : null]) {
      const k = name && name.toLowerCase();
      if (k && k.length >= 3 && !byName.has(k)) byName.set(k, m);
    }
  }
  const found = [];
  for (const [k, m] of byName) {
    const at = low.search(new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(k)}(?![\\p{L}\\p{N}])`, 'u'));
    if (at >= 0) found.push([at, m]);
  }
  found.sort((a, b) => a[0] - b[0]).forEach(([, m]) => add(m));
  return out;
}

/** Como o Pokémon põe o campo: habilidade, megapedra ou golpe. */
function howSets(m, f) {
  if (FIELD[m.ability && m.ability.name] === f) return m.ability.name;
  if (MEGA_FIELD[m.item && m.item.name] === f) return m.item.name;
  const mv = m.moves.find(x => FIELD_MOVES[x.name] === f || (f === 'Trick Room' && x.name === 'Trick Room'));
  return mv ? mv.name : '';
}

/** Por que aproveita o campo: habilidade, megapedra ou golpes próprios do clima. */
function whyUses(m, f) {
  const why = [];
  if (ABUSERS[m.ability && m.ability.name] === f) why.push(m.ability.name);
  if (MEGA_ABUSERS[m.item && m.item.name] === f) why.push(m.item.name);
  for (const mv of m.moves) if ((MOVE_ABUSERS[mv.name] || []).includes(f) && mv.name !== 'Weather Ball') why.push(mv.name);
  return why;
}

/** "aprende no Nv. 41" / "aprende ao evoluir" */
const learnAt = level => (level === TUTOR ? t('pelo tutor') : level ? t('aprende no Nv. {n}', { n: level }) : t('aprende ao evoluir'));
/** Golpe a ensinar que põe ou aproveita o campo f. */
const teachFor = (e, f, kind) => [...e.teach].find(([name]) => (kind === 'set'
  ? FIELD_MOVES[name] === f || (f === 'Trick Room' && name === 'Trick Room')
  : (MOVE_ABUSERS[name] || []).includes(f)));

/**
 * Função de cada membro na equipe e até 3 motivos curtos, do mais importante para o menos (os nomes viram referências
 * E1/C3-12). O que é para fazer (ensinar, evoluir) fica nos próximos passos.
 */
function describeMember(e, team, plan, types, shownSet = null, item = undefined, combos = null) {
  const m = e.m, f = plan.field;
  // Com o moveset (Quetzal), os golpes que contam são os dele, não os do save
  const bf = shownSet ? { ...e.bf, moves: shownSet } : e.bf;
  const why = [];
  let role = '';
  if (e.given) why.push(t('dê {stone}', { stone: e.given }));
  // O plano: como põe, como aproveita
  if (f && e.strat.set.has(f)) {
    role = t('põe {field}', { field: t(f) });
    why.push(howSets(bf, f));
  } else if (f && e.learnSet.has(f)) {
    const [mv, lv] = teachFor(e, f, 'set') || [];
    role = t('pode pôr {field}', { field: t(f) });
    if (mv) why.push(t('ensine {move} ({when})', { move: mv, when: learnAt(lv) }));
  }
  if (plan.kind !== 'room' && f && e.strong.has(f)) {
    // Sob o selo "aproveita chuva", só o porquê (Swift Swim); sob outro selo, com o verbo
    const uses = whyUses(bf, f).filter(x => !why.includes(x)).slice(0, 2);
    if (!role) {
      role = t('aproveita {field}', { field: t(f) });
      if (uses.length) why.push(list(uses));
    } else if (uses.length) why.push(t('aproveita: {list}', { list: list(uses) }));
  } else if (plan.kind !== 'room' && f && e.learnUse.has(f) && !e.stab.has(f)) {
    const [mv, lv] = teachFor(e, f, 'use') || [];
    if (mv) {
      if (!role) role = t('aproveita {field}', { field: t(f) });
      why.push(t('ensine {move} ({when})', { move: mv, when: learnAt(lv) }));
    }
  } else if (plan.kind === 'weather' && WEATHER[f] && (e.stab.has(f) || e.strat.boost.has(f)) && !role) {
    role = t('golpes {type} mais fortes', { type: cap(WEATHER[f].boosts) });
  }
  if (plan.kind === 'room' && e.spe <= 50 && e.dmg >= 2 && !role) role = t('atacante lento');
  // Hiperofensiva: quem abre o caminho (hazards, telas) e quem varre com setup
  if (plan.kind === 'offense' && e.hoSup && !team.some(o => o !== e && o.hoSup > e.hoSup)) {
    role = t('abre o caminho');
    why.push(moveOrTeach(e.supMove, e.hoSup === 1));
  } else if (plan.kind === 'offense' && e.sweep) {
    role = t('varre com setup');
    why.push(moveOrTeach(e.sweepMove, e.sweep === 1));
  }
  // A melhor combinação de mecânicas que rende (Toxic Orb + Poison Heal…); o porquê fica em "Interações"
  const combo = combos && combos.list.find(x => x.ok);
  if (combo) why.push(combo.label);
  // A mega, se o plano não a citou (Dragonite: Multiscale)
  if (e.bf !== m && !e.given && !why.some(x => x.includes(m.item.name))) why.push(t('mega: {ability}', { ability: bf.ability.name }));
  // O que segura pela equipe: resiste ao que acerta 2+ colegas em cheio, anula pela habilidade
  const holds = types.filter((ty, a) => e.def[a] < 0 && team.filter(o => o !== e && o.def[a] > 0).length >= 2).map(cap);
  if (holds.length) {
    if (!role) role = t('segura {list}', { list: list(holds.slice(0, 2)) });
    else why.push(t('segura {list}', { list: list(holds.slice(0, 2)) }));
  }
  const absorbs = types.filter((ty, a) => e.def[a] === -2).map(cap);
  if (absorbs.length) why.push(t('{ability} anula {type}', { ability: bf.ability.name, type: list(absorbs) }));
  if (e.preImmune && e.preImmune.length) why.push(t('{ability} anula {type} antes da mega', { ability: e.abBase, type: list(e.preImmune.map(cap)) }));
  // Único da equipe que acerta um tipo em cheio
  const only = types.filter((ty, a) => (e.cov & (1 << a)) && !team.some(o => o !== e && (o.cov & (1 << a)))).map(cap);
  if (only.length) why.push(t('único que acerta {list}', { list: list(only.slice(0, 2)) }));
  if (e.contrary && e.contrary.length) why.push(t('Contrary + {move}', { move: e.contrary[0] }));
  // Sem repetir o selo (quem "varre com setup" não precisa do papel "setup" de novo)
  const roles = ROLE_ORDER.filter(r => e.roles.includes(r) && t(r) !== role && !(r === 'setup' && role === t('varre com setup'))).map(r => t(r));
  if (roles.length) why.push(list(roles.slice(0, 2)));
  const byAb = new Map();
  for (const mv of e.boosted || []) byAb.set(mv.by, [...(byAb.get(mv.by) || []), mv.name]);
  for (const [ab, mvs] of byAb) why.push(`${ab}: ${list(mvs.slice(0, 2))}`);
  if (!role) role = roles.length ? roles[0] : t('cobertura');
  if (!why.length) why.push(t('atacante {kind}, stats base {bst}', { kind: e.lean === 'phys' ? t('físico') : t('especial'), bst: e.bst }));
  const out = { ref: refOf(m), papel: role, motivo: cap(why.slice(0, 3).join(' · ')) };
  // O moveset: o que já sabe, o que o menu do Pokémon ensina na hora (tutor, nível já alcançado) e o que precisa de treino
  if (shownSet) out.golpes = shownSet.map(x => ({ name: x.name, type: x.type, src: x.src, level: x.level }));
  // Item e habilidade do competitivo (Quetzal): o que dar e o que trocar
  const real = realOf(m), g = m.gear || {};
  if (item !== undefined && item) out.item = { name: item, give: !(real.item && real.item.name === item) };
  if (g.ability) out.habilidade = { name: g.ability, from: g.from, patch: g.patch };
  return out;
}

const ROCK = { sol: 'Heat Rock', chuva: 'Damp Rock', 'tempestade de areia': 'Smooth Rock', 'neve/granizo': 'Icy Rock' };
/** O item que a tela mostra (com o item do competitivo): a pedra do clima para quem põe o clima do plano sem megapedra. */
function shownItem(e, plan, set) {
  if (plan.kind === 'weather' && ROCK[plan.field] && e.auto.has(plan.field) && !e.mega) return ROCK[plan.field];
  return itemFor(e, set || e.set, plan.field || null);
}

/**
 * Golpes que o plano pede além do moveset (o mesmo que os próximos passos mandam ensinar): quem põe o campo pelo golpe,
 * o golpe que aproveita o clima, quem abre o caminho e quem varre na Hiperofensiva, e os papéis que faltam na equipe
 * (até 3, sem repetir golpe nem Pokémon). Map entrada → [{ name, level, why }]
 */
function planMoves(team, plan) {
  const out = new Map();
  let n = 0;
  const taken = new Set();
  // `own`: o golpe é dele (o que aproveita o clima e o card já cita): fora do limite de 3 e pode repetir em outro membro
  const add = (e, mv, lv, why, own = false) => {
    if (!e || !mv) return;
    if (!own && (n >= 3 || taken.has(mv) || taken.has(e))) return;
    if ((e.set || e.m.moves).some(x => x.name === mv) || (out.get(e) || []).some(x => x.name === mv)) return; // já está no moveset
    if (!own) { taken.add(mv); taken.add(e); n++; }
    out.set(e, [...(out.get(e) || []), { name: mv, level: lv, why }]);
  };
  const f = plan.field;
  if (f && !team.some(e => e.strat.set.has(f))) {
    const e = team.find(x => x.learnSet.has(f));
    const [mv, lv] = (e && teachFor(e, f, 'set')) || [];
    add(e, mv, lv, t('põe {field}', { field: t(f) }));
  }
  if (plan.kind === 'offense') {
    if (!team.some(e => e.hoSup === 1)) {
      const e = team.find(x => x.hoSup);
      if (e) add(e, e.supMove.name, e.supMove.level, t('abre o caminho'));
    }
    for (const e of team) if (e.sweep && e.sweep < 1) add(e, e.sweepMove.name, e.sweepMove.level, t('setup'));
  }
  for (const r of ['prioridade', 'recuperação', 'controle de velocidade', 'pivô', 'setup', 'hazards', 'tira hazards']) {
    if (team.some(e => e.roles.includes(r))) continue;
    const e = team.find(x => x.roleMoves.has(r));
    if (e) add(e, e.roleMoves.get(r).name, e.roleMoves.get(r).level, t(r));
  }
  // Com o moveset, o golpe que aproveita o clima e que o card já cita (Thunder na chuva…) também entra nele
  if (f && plan.kind !== 'room') {
    for (const e of team) {
      if (!e.set || e.strong.has(f) || e.stab.has(f) || !e.learnUse.has(f)) continue;
      const [mv, lv] = teachFor(e, f, 'use') || [];
      add(e, mv, lv, t('aproveita {field}', { field: t(f) }), true);
    }
  }
  return out;
}

/** Pontos fortes e fracos da equipe, pelas contas: só o que pesa (até 3 de cada). */
function teamPoints(team, plan, types) {
  const ref = e => refOf(e.m);
  const good = [], bad = [];
  const f = plan.field;
  if (plan.kind === 'offense') {
    // Quem abre o caminho: os de maior valor (quem já tem o golpe ganha de quem só aprende; muitos aprendem Reflect)
    const top = Math.max(0, ...team.map(e => e.hoSup || 0));
    const sup = team.filter(e => e.hoSup && e.hoSup === top), sweepers = team.filter(e => e.sweep && !sup.includes(e));
    good.push(t('Hiperofensiva: {sup} abre o caminho; {list} varrem com setup.', { sup: list(sup.map(ref)), list: list(sweepers.map(ref)) }));
  }
  if (f) {
    const setters = team.filter(e => sets(e, f));
    const users = plan.kind === 'room' ? team.filter(e => e.spe <= 50 && e.dmg >= 2) : team.filter(e => e.strong.has(f) || e.stab.has(f) || e.strat.boost.has(f) || e.learnUse.has(f));
    good.push(t('{field}: posto por {setters}; aproveitam {users}.', { field: t(f), setters: list(setters.map(ref)), users: list(users.map(ref)) }));
  }
  let cov = 0;
  for (const e of team) cov |= e.cov;
  const covered = types.filter((ty, a) => cov & (1 << a));
  good.push(t('Golpes super efetivos contra {n} dos {total} tipos.', { n: covered.length, total: types.length }));
  const halved = plan.kind === 'weather' && WEATHER[f] ? WEATHER[f].weakens : null;
  const pairs = compPairs(team);
  const duo = x => `${ref(x.a)} + ${ref(x.b)} (${times(x.v)})`;
  if (pairs) {
    const strong = pairs.filter(x => x.v >= 1).slice(0, 2);
    if (strong.length) good.push(t('Duplas comuns no competitivo: {list}.', { list: list(strong.map(duo)) }));
  }
  types.forEach((ty, a) => {
    const weak = team.filter(e => e.def[a] > 0);
    if (weak.length < 3) return;
    if (ty === halved) { good.push(t('{type} acerta {n} membros, mas {field} corta pela metade.', { type: cap(ty), n: weak.length, field: t(f) })); return; }
    const absorber = team.find(e => e.def[a] === -2);
    bad.push(absorber
      ? t('{type} acerta {n} membros em cheio; {ref} anula com {ability}.', { type: cap(ty), n: weak.length, ref: ref(absorber), ability: absorber.m.ability.name })
      : t('{type} acerta {n} membros em cheio.', { type: cap(ty), n: weak.length }));
  });
  const roles = ROLE_ORDER.filter(r => team.some(e => e.roles.includes(r)));
  const missing = KEY_ROLES.filter(r => !roles.includes(r));
  if (missing.length) bad.push(t('Falta na equipe: {list}.', { list: list(missing.map(r => t(r))) }));
  const gaps = types.filter((ty, a) => !(cov & (1 << a)));
  if (gaps.length) bad.push(t('Nenhum golpe super efetivo contra: {list}.', { list: list(gaps.map(cap)) }));
  const few = team.filter(e => e.dmg < 2);
  if (few.length) bad.push(t('Poucos golpes de dano: {list}.', { list: list(few.map(ref)) }));
  if (pairs) {
    const avoid = pairs.filter(x => x.v <= -1).reverse().slice(0, 2);
    if (avoid.length) bad.push(t('Quase não jogam juntos no competitivo: {list}.', { list: list(avoid.map(duo)) }));
  }
  return { good: good.slice(0, 3), bad: bad.slice(0, 3) };
}

/**
 * Próximos passos: ensinar golpes (os que o plano pede, com o motivo; com o moveset, os outros dele numa linha só),
 * evoluir, escolher a megaevolução, usar o item do clima.
 * @param {Map} extra planMoves; @param {Map} shown o moveset mostrado de cada membro (só com o moveset)
 */
function teamTips(team, plan, extra = new Map(), shown = new Map(), items = new Map()) {
  const tips = [];
  // Golpes de dano que faltam (o app contou com eles): sempre aparecem
  for (const e of team) {
    if (e.teachAtk && e.teachAtk.length) tips.push(t('Ensine {moves} a {ref}: golpes de dano.', { moves: list(e.teachAtk.map(x => `${x.name} (${learnAt(x.level)})`)), ref: refOf(e.m) }));
  }
  // O que o plano pede (até 3 golpes, sem repetir golpe nem Pokémon)
  for (const [e, mvs] of extra) for (const x of mvs) tips.push(t('Ensine {move} a {ref} ({when}): {why}.', { move: x.name, ref: refOf(e.m), when: learnAt(x.level), why: x.why }));
  // Moveset: o resto dos golpes a ensinar, numa linha para o que o menu do Pokémon ensina na hora e outra para o treino
  if (shown.size) {
    const planned = e => new Set((extra.get(e) || []).map(x => x.name));
    const now = [], train = [];
    for (const e of team) {
      const set = shown.get(e);
      if (!set) continue;
      const skip = planned(e);
      const q = set.filter(x => (x.src === SRC.tutor || x.src === SRC.now) && !skip.has(x.name)).map(x => x.name);
      const l = set.filter(x => x.src === SRC.level && !skip.has(x.name)).map(x => t('{move} no Nv. {n}', { move: x.name, n: x.level }));
      if (q.length) now.push(`${refOf(e.m)}: ${list(q)}`);
      if (l.length) train.push(`${refOf(e.m)}: ${list(l)}`);
    }
    if (now.length) tips.push(t('Ensine pelo menu do Pokémon (NOVO MOV., na hora e de graça): {list}.', { list: now.join('; ') }));
    if (train.length) tips.push(t('Treine até o nível para aprender: {list}.', { list: train.join('; ') }));
  }
  // Itens e habilidades do competitivo: o que dar e o que trocar (o jogador dá um jeito de conseguir)
  const give = team.filter(e => items.get(e) && !(realOf(e.m).item && realOf(e.m).item.name === items.get(e)) && !e.given)
    .map(e => `${refOf(e.m)}: ${items.get(e)}`);
  if (give.length) tips.push(t('Itens: {list}.', { list: give.join('; ') }));
  const swap = team.filter(e => e.m.gear && e.m.gear.ability).map(e => t('{ref} de {from} para {to}', { ref: refOf(e.m), from: e.m.gear.from, to: e.m.gear.ability }));
  if (swap.length) tips.push(t('Troque a habilidade (Ability Capsule; para a oculta, Ability Patch): {list}.', { list: swap.join('; ') }));
  for (const e of team) if (e.given) tips.push(t('Dê {stone} a {ref} (o app contou com a mega).', { stone: e.given, ref: refOf(e.m) }));
  for (const e of team) if (e.m.evolvedFrom) tips.push(t('Evolua {ref} ({from} → {to}).', { ref: refOf(e.m), from: e.m.evolvedFrom.species.name, to: e.m.species.name }));
  const megas = team.filter(e => e.mega);
  if (megas.length > 1) {
    const setter = plan.field && megas.find(e => MEGA_FIELD[e.m.item.name] === plan.field);
    tips.push(setter
      ? t('Duas megapedras: só uma megaevolui por batalha. Para ter {field}, megaevolua {ref}.', { field: t(plan.field), ref: refOf(setter.m) })
      : t('Duas megapedras: só uma megaevolui por batalha; escolha a que rende mais contra cada adversário.'));
  }
  const rock = { sol: 'Heat Rock', chuva: 'Damp Rock', 'tempestade de areia': 'Smooth Rock', 'neve/granizo': 'Icy Rock' }[plan.field];
  const setter = rock && team.find(e => e.auto.has(plan.field) && !e.mega);
  if (setter && setter.rock !== plan.field && !items.size) tips.push(t('Dê {item} a {ref}: o clima dura 8 turnos em vez de 5.', { item: rock, ref: refOf(setter.m) }));
  return tips;
}

const PARTS = [['defense', 'Defesa'], ['offense', 'Ataque'], ['roles', 'Papéis'], ['members', 'Pokémon'], ['balance', 'Equilíbrio'], ['plan', 'Plano'], ['ready', 'Preparo'], ['threats', 'Ameaças'], ['comp', 'Competitivo'], ['combo', 'Interações'], ['strat', 'Estratégias']];

/**
 * Monta as equipes e prepara o que a tela precisa de cada uma. Com as equipes de referência do jogo (`refs`,
 * loadReferences), o fluxo principal são elas, adaptadas ao save (reference.js); a montagem livre (a melhor de cada
 * plano) só roda se nenhuma referência for compatível ou quando o jogador pede (freeOptions). Sem `refs` (undefined), só
 * a montagem livre, como antes.
 * @returns {Array<{ name: string, plan: object, score: number, parts: object, team: object[], r: object, byRef: Map, evolved: Map, kind: 'ref'|'free' }>}
 *   com as propriedades `refs` (o que a tela diz das referências: quantas, quantas ficaram de fora, se há mais) e `raw`
 *   (a montagem livre, para as alternativas)
 */
export function runBuilder(all, T, note = '', dex = null, { noLegends = false, anyItem = false, ready = false, game = null, comp = null, saveGame = null, refs = undefined } = {}) {
  const ctx = prepareBuild(all, T, { want: wantedMons(all, note), dex, noLegends, anyItem, ready, game, comp });
  // "Ideal × o que você tem" e as referências precisam das espécies do jogo do save (com ou sem as ameaças)
  Object.assign(ctx, { T, saveGame });
  const types = ctx.types;
  const results = [];
  let info = null;
  if (refs !== undefined) {
    info = { tables: refs, total: refs ? refs.reduce((a, tb) => a + tb.teams.length, 0) : 0, rejected: 0, candidates: null, free: false };
    if (refs && refs.length && saveGame) {
      const rt = referenceTeams(ctx, refs, T, saveGame);
      Object.assign(info, { rejected: rt.rejected, candidates: rt.candidates });
      results.push(...rt.map(x => describeRef(x, types, ctx)));
    }
  }
  Object.defineProperty(results, 'refs', { value: info });
  Object.defineProperty(results, 'ctx', { value: ctx });
  Object.defineProperty(results, 'raw', { value: null, writable: true });
  // Sem referência compatível (ou sem referências para o jogo): a montagem livre, com o aviso na tela
  if (!results.length) freeOptions(results);
  return results;
}

/** A montagem livre (sem referência), uma equipe por plano, no fim da lista. @returns {number} a posição da primeira */
export function freeOptions(results) {
  if (results.raw) return results.findIndex(x => x.kind === 'free');
  const raw = freeTeams(results.ctx);
  results.raw = raw;
  if (results.refs) results.refs.free = true;
  const at = results.length;
  results.push(...raw.map(res => describeTeam(res, raw.ctx.types, raw.pool, raw.ctx)));
  return raw.length ? at : -1;
}

/** Mais referências (as próximas pela estimativa), adaptadas agora. @returns {number} a posição da primeira nova, ou -1 */
export function moreReferences(results) {
  const info = results.refs;
  if (!info || !info.candidates) return -1;
  const c = info.candidates, ctx = results.ctx;
  const next = c.list.filter(w => w.result === undefined).slice(0, ADAPT_N);
  const added = next.map(w => adaptReference(ctx, w)).filter(Boolean).sort((a, b) => b.rank - a.rank).map(x => describeRef(x, ctx.types, ctx));
  if (!added.length) return -1;
  // Entram depois das referências que já estão na tela (antes da montagem livre)
  const at = results.filter(x => x.kind === 'ref').length;
  results.splice(at, 0, ...added);
  return at;
}
/** Quantas referências compatíveis ainda não foram adaptadas. */
export const moreRefsLeft = results => (results.refs && results.refs.candidates ? results.refs.candidates.list.filter(w => w.result === undefined).length : 0);

/**
 * Alternativas do plano da equipe results[i] (a busca roda agora). Entram logo depois das equipes do plano.
 * @returns {number} a posição da primeira alternativa nova, ou -1 se não há nenhuma com nota perto da melhor
 */
export function moreOptions(results, i, T) {
  const main = results[i];
  if (!main || main.alt || main.alts || main.kind === 'ref' || !results.raw) return -1;
  const types = attackTypes(T);
  const alts = altTeams(results.raw, main.src).map(res => describeTeam(res, types, results.raw.pool, results.raw.ctx));
  main.alts = { count: alts.length };
  if (!alts.length) return -1;
  results.splice(i + 1, 0, ...alts);
  return i + 1;
}

function describeTeam(res, types, pool, ctx, { ref = false } = {}) {
  const threats = ctx.threats;
  // Os Pokémon do plano (com o moveset dele, no Quetzal)
  if (res.pp) pool = res.pp.pool;
  const { plan, team } = res;
  // As partes com as marcas do plano desta equipe (quem atrapalha o clima ou é fraco ao tipo que ele fortalece), como
  // na busca: sem isso valiam as do último plano buscado, e as partes não somavam a nota
  setPlanFlags(pool, plan);
  // Moveset (Quetzal): o escolhido para cada membro, com os golpes que o plano pede no lugar dos que menos fazem falta
  const extra = planMoves(team, plan);
  // (com os golpes de papel da equipe de referência, que não podem sair para dar lugar aos do plano)
  const shownSets = new Map(team.filter(e => e.set).map(e => [e, finalMoveset(e, [...(extra.get(e) || []).map(x => x.name), ...(e.keepMoves || [])])]));
  // Item do competitivo (só com o moveset, no Quetzal): o escolhido, ou a pedra do clima de quem põe o clima do plano
  const items = new Map(team.filter(e => e.set).map(e => [e, shownItem(e, plan, shownSets.get(e))]));
  // Interações (Quetzal): as combinações de habilidade, item e golpes de cada um, com o campo do plano, e as da equipe
  const combos = new Map(team.filter(e => e.set).map(e => [e, shownCombos(e, shownSets.get(e), items.get(e), plan.field || null)]).filter(([, x]) => x));
  const membros = team.map(e => describeMember(e, team, plan, types, shownSets.get(e) || null, items.has(e) ? items.get(e) : undefined, combos.get(e) || null));
  const { good, bad } = teamPoints(team, plan, types);
  const r = {
    // Sem resumo: a aba e o título já dizem o plano
    nome: res.alt ? t('{plan} · opção {n}', { plan: planName(plan), n: res.alt + 1 }) : planName(plan), resumo: '',
    membros, pontos_fortes: good, pontos_fracos: bad, dicas: teamTips(team, plan, extra, shownSets, items), dropped: [],
    ameacas: threats ? threatsHtml(res, threats) : null,
    interacoes: combos.size ? comboLines(team, plan, combos) : null,
    estrategias: strategyCards(team, plan, shownSets, items),
  };
  // Nas referências, o que falta fica em "Para reproduzir a original" (o ideal do competitivo seria outra sugestão)
  const ideal = !ref && ctx.comp && ctx.saveGame ? idealLines(res, pool, ctx) : null;
  if (ideal) r.ideal = ideal;
  const mons = team.map(e => e.m);
  // Para conferir as estratégias que a IA propõe (Quetzal): o que cada membro pode ter (golpes que sabe ou aprende,
  // habilidades da espécie) e os itens do jogo
  const aiCheck = aiChecks(team, shownSets, items);
  return {
    aiCheck, shownSets, shownItems: items,
    name: r.nome, plan, score: res.score, parts: scoreParts(team, plan, types), team: mons, r, src: res, alt: res.alt || 0, comp: !!team[0].sctx, kind: ref ? 'ref' : 'free',
    // Copiar (Showdown) e Comentar com IA: com o moveset do app no lugar dos golpes do save
    showdown: team.map(e => (shownSets.has(e) ? { ...e.m, moves: shownSets.get(e), plannedMoves: true,
      item: items.get(e) ? { id: null, name: items.get(e), confidence: 'confirmado' } : e.m.item,
      combos: combos.get(e) ? combos.get(e).list.filter(x => x.ok).map(x => x.label) : [] } : e.m)),
    // Toque no card: o Pokémon real; nos textos e nas contas, a forma evoluída (quem o app contou evoluído)
    // (as alternativas do "ideal × o que você tem" também: os textos citam o Pokémon pela referência)
    byRef: new Map([...(ideal ? ideal.alts : []), ...mons].map(m => [refOf(m), realOf(m)])),
    shown: new Map([...(ideal ? ideal.alts.map(realOf) : []), ...mons].map(m => [refOf(m), m])),
    evolved: new Map(mons.filter(m => m.evolvedFrom).map(m => [refOf(m), m])),
  };
}

// Nome de cada papel da biblioteca de estratégias na tela
const ROLE_NAME = {
  pivot: 'pivô', regen: 'Regenerator', hazard: 'hazards', removal: 'tira hazards', phaze: 'força a troca', screens: 'telas',
  web: 'Sticky Web', sweeper: 'varre com setup', midAttacker: 'atacante', 'drum+priority': 'Belly Drum + prioridade',
  'smash+smashItem': 'Shell Smash', 'pass+passable': 'Baton Pass', sacrifice: 'sacrifício', fire: 'Fire', water: 'Water',
  grass: 'Grass', dragon: 'Dragon', steel: 'Steel', fairy: 'Fairy', priority: 'prioridade',
};
// Até quantas estratégias da biblioteca o painel mostra (além da do plano)
const MAX_STRATEGIES = 3;

/**
 * Estratégias da equipe (strategies.js, Quetzal): a do plano, com a explicação, e as conhecidas do competitivo que a
 * equipe executa com o moveset e o item dos cards (ou quase: falta um golpe a ensinar ou um item a dar). null sem a
 * biblioteca (fora do Quetzal).
 */
function strategyCards(team, plan, shownSets, items) {
  const members = [];
  for (const e of team) {
    const x = strategyInput(e, shownSets.get(e), items.get(e));
    if (!x) return null;
    members.push({ ref: refOf(e.m), roles: rolesOfMon(x.c, x.cands, x.itemOk, x.teachOk) });
  }
  const cards = [], ai = [];
  const pt = planText(plan);
  if (pt) cards.push({ title: planName(plan), tag: t('plano'), text: `${cap(t(pt.how))}. ${t('Cuidado com: {list}.', { list: t(pt.breaks) })}` });
  for (const x of teamStrategies(members, plan).slice(0, MAX_STRATEGIES)) {
    const who = x.who.map(([ref, r]) => `${ref} (${t(ROLE_NAME[r] || r)})`);
    const prep = x.prep.map(p => (p.kind === 'item'
      ? t('dê {item} a {ref}', { item: p.name, ref: p.ref })
      : t('ensine {move} a {ref} ({when})', { move: p.name, ref: p.ref, when: p.src === SRC.level ? t('Nv. {n}', { n: p.level }) : p.src === SRC.known ? t('já sabe') : t('na hora, pelo NOVO MOV.') })));
    const parts = [`${cap(t(x.s.how))}.`, t('Quem faz: {list}.', { list: list(who) })];
    if (prep.length) parts.push(t('Falta: {list}.', { list: list(prep) }));
    parts.push(t('Dá: {gives}. Cuidado com: {list}.', { gives: t(x.s.gives), list: t(x.s.breaks) }));
    cards.push({ title: t(x.s.name), tag: x.ready ? t('pronta') : t('falta preparo'), text: parts.join(' ') });
    // Para o Comentar com IA: o que o app conferiu (a IA não contradiz e pode propor outras)
    ai.push(`${t(x.s.name)}: ${x.ready ? t('pronta') : t('falta {list}', { list: list(prep) })}; ${t('quem faz: {list}', { list: list(who) })}`);
  }
  return cards.length ? { cards, ai, note: t('Estratégias conhecidas dos times competitivos de singles; o app confere quem as executa com os golpes e o item dos cards.') } : null;
}

/** O que a IA pode citar de cada membro (referência → golpes, habilidades) e os itens do jogo; null fora do Quetzal. */
function aiChecks(team, shownSets, items) {
  const refs = new Map();
  let itemOk = null;
  for (const e of team) {
    const x = strategyInput(e, shownSets.get(e), items.get(e));
    if (!x) return null;
    itemOk = x.itemOk;
    const moves = new Set([...x.cands.map(c => c.name), ...x.c.moves.map(m => m.name)]);
    const abilities = new Set([...(e.m.species.abilities || []), ...(e.bf.species.abilities || []), e.m.ability && e.m.ability.name].filter(Boolean));
    refs.set(refOf(e.m), { name: e.m.species.name, moves, abilities });
  }
  return { refs, itemOk, known: STRATEGIES.map(s => ({ id: s.id, name: t(s.name) })) };
}

/**
 * Interações (mechanics.js): o que cada combinação faz na batalha, as da equipe e as que funcionam mas rendem pouco (não
 * contam na nota).
 */
function comboLines(team, plan, combos) {
  const lines = [], weak = [];
  for (const e of team) {
    const c = combos.get(e);
    if (!c) continue;
    for (const x of c.list) {
      if (x.ok) lines.push(t('{ref}: {combo}: {how}.', { ref: refOf(e.m), combo: x.label, how: t(x.how) }));
      else if (x.works) weak.push(`${refOf(e.m)} (${x.label})`);
    }
  }
  const bits = team.map(e => (combos.get(e) ? combos.get(e).bits : 0));
  for (const x of teamCombos(bits, plan)) lines.push(t('Equipe: {how}.', { how: t(x.how) }));
  if (weak.length) lines.push(t('Funcionam, mas rendem pouco aqui: {list}.', { list: list(weak) }));
  if (!lines.length) return null;
  return { lines, note: t('Combinações de habilidade, item e golpes que o app reconhece; o item é o sugerido (o jogador dá um jeito de conseguir). Cada combinação que rende soma na parte “Interações” da nota.') };
}

/** "9×" para quem joga junto; "1/3" para quem se evita (log2 do lift). */
const times = v => (v > 0 ? `${Math.round(2 ** v)}×` : `1/${Math.round(2 ** -v)}`);

/**
 * Ideal do competitivo × o que você tem (ideal.js): no lugar de quem, o Pokémon que o competitivo usaria e o jogador não
 * tem, com quem ele joga, a nota estimada com ele e, no save, o mais parecido.
 */
function idealLines(res, pool, ctx) {
  const { plan } = res;
  const swaps = idealSwaps(res.team, plan, pool, ctx, ctx.T, ctx.saveGame);
  const name = sp => (sp.form ? `${sp.name} (${sp.form})` : sp.name);
  const lines = swaps.map(s => {
    const out = refOf(s.out.m);
    const head = t('{out} → {ideal} ({types}), que você não tem: joga com {list} no competitivo; nota {a} → {b}.', {
      out, ideal: name(s.spec), types: s.spec.types.map(cap).join('/'), a: Math.round(s.base), b: Math.round(s.score),
      list: list(s.pairs.slice(0, 2).map(p => `${refOf(p.m.m)} (${times(p.v)})`)),
    });
    if (!s.alt) return `${head} ${t('Ninguém do seu save faz esse papel.')}`;
    const y = s.alt.e, why = [];
    if (s.alt.sim.shared.length) why.push(s.alt.sim.shared.map(cap).join('/'));
    if (s.alt.sim.role) why.push(plan.kind === 'room' ? t('lento no Trick Room') : t('aproveita {field}', { field: t(plan.field) }));
    if (y.m.evolvedFrom) why.push(t('evolua para {name}', { name: y.m.species.name }));
    if (y.given) why.push(t('com {stone}', { stone: y.given }));
    return `${head} ${t('No seu save: {alt} ({why}), nota {c}.', { alt: refOf(y.m), why: why.join('; '), c: Math.round(s.alt.score) })}`;
  });
  if (!lines.length) lines.push(t('Nenhum Pokémon que falta no seu save melhora esta equipe pela referência do competitivo.'));
  const note = t('Estimativa pelas duplas do competitivo (Smogon), sem lendários; o app não sabe onde capturar o ideal.');
  return { lines, note, alts: swaps.filter(s => s.alt).map(s => s.alt.e.m) };
}

// ---- Equipes de referência (reference.js): a original, a adaptada e o que falta para reproduzir a original ----

const roleNames = keys => list(keys.map(k => t(ROLE_NAME[k] || k)));
const stratName = id => { const x = STRATEGIES.find(s => s.id === id); return x ? t(x.name) : id; };
// Nome da forma na tela: o do Showdown (inglês, como no jogo), com a mega
const refName = m => (m.x.mega ? `${m.x.s} (${m.x.mega})` : m.x.s);
// "Gen 9 National Dex" → "National Dex" (a aba é curta)
const formatShort = tb => tb.name.replace(/^Gen \d+ /, '');
const toId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Uma referência adaptada no formato da tela (o mesmo das equipes da montagem livre, com os painéis da referência). */
function describeRef(x, types, ctx) {
  const res = { plan: x.adapted.plan, team: x.adapted.team, score: x.adapted.score };
  Object.defineProperty(res, 'pp', { value: x.adapted.pp });
  const d = describeTeam(res, types, x.adapted.pp.pool, ctx, { ref: true });
  // Os papéis de cada membro com o moveset e o item que o card mostra (os painéis não podem dizer que um papel ficou se o
  // card não o cumpre)
  const bits = new Map(x.adapted.team.map(e => [e, shownRoleBits(e, d.shownSets.get(e) || null, d.shownItems.has(e) ? d.shownItems.get(e) : (e.m.item && e.m.item.name) || null)]));
  const kept = x.kept.length;
  d.name = `${planName(x.orig.plan)} · ${formatShort(x.format)} (${kept}/6)`;
  d.r.nome = x.ref.name ? t('Adaptada de “{name}”', { name: x.ref.name }) : t('Adaptada de uma equipe de {format}', { format: x.format.name });
  d.r.referencia = refPanels(x, ctx, bits, d.shownSets);
  // Quem o jogador tem em outra forma aparece nos textos: o toque abre o Pokémon do save
  for (const m of d.r.referencia.extra) { d.byRef.set(refOf(m), realOf(m)); d.shown.set(refOf(m), m); }
  d.ref = x;
  return d;
}

/** Os três painéis: equipe original (com a origem), sua equipe adaptada e o que falta para reproduzir a original. */
function refPanels(x, ctx, bits, shownSets) {
  const { ref, format: tb, orig, adapted } = x;
  const by = new Map(x.swaps.map(s => [s.orig, s]));
  // Tudo com os papéis do card (bits): o que a equipe mostrada cumpre de verdade
  const roleSet = b => new Set(FID_ROLES.filter(k => roleKeyIn(b, k)));
  const shownTeam = adapted.team.map(e => ({ sbits: bits.get(e) }));
  const keptSet = new Set(x.kept.map(e => e.real));
  const own = orig.members.map((m, i) => (x.keep[i] && keptSet.has(x.keep[i].real) ? x.keep[i] : null));
  // Equipe original
  const head = ref.name && ref.author ? t('“{name}”, por {author}.', { name: ref.name, author: ref.author })
    : ref.name ? t('“{name}” (sem autor na fonte).', { name: ref.name })
      : ref.author ? t('Por {author} (sem nome na fonte).', { author: ref.author }) : t('Sem nome nem autor na fonte.');
  const origin = [
    t('Equipe de exemplo do Smogon ({format}, Singles), reunida pelo projeto pkmn/smogon.', { format: tb.name }),
    ref.verification === 'partially_verified'
      ? t('O autor aparece no tópico de equipes de exemplo do formato (conferido em {date}); o time inteiro não foi conferido.', { date: tb.source.retrieved })
      : t('Nome e autor como a fonte dá; não conferidos no tópico do formato.'),
  ];
  // Resultados de torneio: só os registrados com fonte (equipes de exemplo não têm)
  const results = (tb.results || []).filter(r => r.team === ref.id && r.url);
  const resLines = results.length
    ? results.map(r => t('{placement} em {event} ({date}), {player}.', r))
    : [t('Resultado em torneio: nenhum registrado. É uma equipe de exemplo, não uma equipe campeã.')];
  const planLine = orig.plan.kind === 'balance' ? t('Plano: equilibrada.') : t('Plano: {plan}.', { plan: planName(orig.plan) });
  const stratLine = orig.strategies.length ? t('Estratégias: {list}.', { list: list(orig.strategies.map(stratName)) }) : '';
  const members = orig.members.map((m, i) => {
    const roles = [...FID_ROLES].filter(k => roleKeyIn(m.sbits, k));
    const what = roles.length ? roleNames(roles) : t('sem papel da biblioteca');
    const s = by.get(m);
    const status = own[i] ? t('você tem') : !m.spec ? t('não existe neste jogo') : s && s.sub ? t('no lugar: {sub}', { sub: refOf(s.sub.m) }) : t('você não tem');
    return { text: `${refName(m)}: ${what}`, status, ok: !!own[i] };
  });
  const original = { head, lines: [...origin, ...resLines, [planLine, stratLine].filter(Boolean).join(' ')], members,
    links: [{ label: t('Tópico das equipes de exemplo'), url: tb.source.thread }, { label: t('Dados (pkmn/smogon)'), url: tb.source.dataset }] };

  // Sua equipe adaptada
  const lines = [];
  lines.push(x.complete && kept6(x) ? t('Você tem a equipe inteira: nenhuma troca.')
    : t('Ficam {n} de 6 da original: {list}.', { n: x.kept.length, list: list(x.kept.map(e => refOf(e.m))) }));
  if (orig.plan.kind !== 'balance') {
    lines.push(adapted.planKept && adapted.holds ? t('Plano da original mantido: {plan}.', { plan: planName(orig.plan) })
      : t('Plano da original ({plan}) perdido: ninguém no seu save põe ou aproveita o campo o bastante.', { plan: planName(orig.plan) }));
  }
  if (orig.strategies.length) {
    const have = new Set(strategiesOf(shownTeam, adapted.plan));
    const ok = orig.strategies.filter(id => have.has(id)), miss = orig.strategies.filter(id => !have.has(id));
    lines.push(miss.length ? t('Estratégias da original: {k} de {n} ({ok}); falta: {miss}.', { k: ok.length, n: orig.strategies.length, ok: ok.length ? list(ok.map(stratName)) : '—', miss: list(miss.map(stratName)) })
      : t('Estratégias da original: todas ({list}).', { list: list(ok.map(stratName)) }));
  }
  // Quem ficou: os papéis da original que ele mantém (e com que golpe, quando o app ensinou um para isso) e os que perde
  orig.members.forEach((m, i) => {
    const e = own[i] && adapted.team.find(y => y.real === own[i].real);
    const want = e ? FID_ROLES.filter(k => roleKeyIn(m.sbits, k)) : [];
    if (!want.length) return;
    const has = want.filter(k => roleKeyIn(bits.get(e), k)), miss = want.filter(k => !roleKeyIn(bits.get(e), k));
    const fixed = (e.keepMoves || []).filter(n => (shownSets.get(e) || []).some(y => y.name === n));
    const parts = [];
    if (has.length) parts.push(fixed.length ? t('{ref} mantém o papel da original ({roles}), com {moves}.', { ref: refOf(e.m), roles: roleNames(has), moves: list(fixed) })
      : t('{ref} mantém o papel da original ({roles}).', { ref: refOf(e.m), roles: roleNames(has) }));
    if (miss.length) {
      const can = miss.filter(k => roleTeach(e, shownSets.get(e), null, k));
      // Aprende o golpe: ou a equipe inteira rendeu mais sem ele (a busca comparou as duas versões), ou não coube
      if (can.length) parts.push(x.reverted && x.reverted.has(e.real)
        ? t('{ref} perde {roles}: aprende o golpe, mas a equipe inteira rende mais sem ele.', { ref: refOf(e.m), roles: roleNames(can) })
        : t('{ref} perde {roles}: aprende o golpe, mas não coube no moveset (ver “Para reproduzir a original”).', { ref: refOf(e.m), roles: roleNames(can) }));
      const cannot = miss.filter(k => !can.includes(k));
      if (cannot.length) parts.push(t('{ref} perde {roles}: não aprende o golpe neste jogo.', { ref: refOf(e.m), roles: roleNames(cannot) }));
    }
    lines.push(parts.join(' '));
  });
  for (const s of x.swaps) {
    if (!s.sub) { lines.push(t('{orig}: sem substituto.', { orig: refName(s.orig) })); continue; }
    // O que o substituto cumpre com o moveset do card (e o que outro membro cobre)
    const a = roleSet(s.orig.sbits), b2 = roleSet(bits.get(s.sub));
    let others = 0;
    for (const e of adapted.team) if (e !== s.sub) others |= bits.get(e);
    const kept = [...a].filter(r => b2.has(r)), lost0 = [...a].filter(r => !b2.has(r));
    const covered = lost0.filter(r => roleKeyIn(others, r)), lostR = lost0.filter(r => !roleKeyIn(others, r));
    const added = [...b2].filter(r => !a.has(r));
    const why = [];
    if (s.wanted) why.push(t('pedido por você'));
    if (kept.length) why.push(t('faz o mesmo papel ({roles})', { roles: roleNames(kept) }));
    const shared = s.orig.types.filter(ty => s.sub.types.includes(ty));
    if (shared.length) why.push(t('mesmo tipo ({types})', { types: shared.map(cap).join('/') }));
    const f = adapted.plan.field;
    if (f && adapted.plan.kind !== 'room' && sets(s.sub, f)) why.push(t('põe {field}', { field: t(f) }));
    else if (f && adapted.plan.kind !== 'room' && (s.sub.value[f] || 0) >= 11) why.push(t('aproveita {field}', { field: t(f) }));
    if (!why.length) why.push(t('o que mais rende na equipe inteira pela nota'));
    const parts = [t('{orig} → {sub}: {why}.', { orig: refName(s.orig), sub: refOf(s.sub.m), why: why.join('; ') })];
    if (covered.length) parts.push(t('Outro membro cobre: {roles}.', { roles: roleNames(covered) }));
    if (lostR.length) parts.push(t('Perde: {roles}.', { roles: roleNames(lostR) }));
    if (added.length) parts.push(t('Acrescenta: {roles}.', { roles: roleNames(added) }));
    lines.push(parts.join(' '));
  }
  const adaptedPanel = { lines, note: t('A nota ({n}) é a do app para esta equipe: ela não herda resultado nem reputação da original. As trocas foram escolhidas juntas, pela equipe inteira; o par “sai → entra” é o mais parecido, só para explicar.', { n: Math.round(adapted.score) }) };

  // Para reproduzir a original
  const repro = [], extra = [];
  const comp = ctx.comp && ctx.comp.index;
  const T = ctx.T;
  for (const g of missingMembers(x, ctx)) {
    const name = refName(g.m);
    const head2 = g.status === 'game' ? t('{name}: não existe neste jogo.', { name })
      : g.status === 'form' ? t('{name}: você tem {other}, em outra forma.', { name, other: refOf(g.other.m) })
        : g.status === 'excluded' ? t('{name}: você tem, mas ficou de fora pela opção Sem lendários e míticos.', { name })
          : t('{name}: você não tem.', { name });
    const extra = [];
    if (g.roles.length) extra.push(t('Na original: {roles}.', { roles: roleNames(g.roles) }));
    const usage = comp && g.status !== 'game' ? usageLine(comp, g.m, T) : '';
    if (usage) extra.push(usage);
    repro.push([head2, ...extra].join(' '));
  }
  // Quem ficou, mas com o moveset do app não faz um papel que fazia na original: o que ensinar ou dar
  orig.members.forEach((m, i) => {
    const e = own[i] && adapted.team.find(y => y.real === own[i].real);
    if (!e) return;
    const lost = FID_ROLES.filter(k => roleKeyIn(m.sbits, k) && !roleKeyIn(bits.get(e), k));
    if (!lost.length) return;
    const fix = [];
    if (e.mcands) {
      for (const k of lost) {
        const tch = roleTeach(e, shownSets.get(e), null, k);
        if (tch) fix.push(t('{role}: ensine {move} ({when})', { role: t(ROLE_NAME[k] || k), move: tch.name, when: tch.src === SRC.level ? learnAt(tch.level) : t('o menu ensina na hora') }));
        else fix.push(t('{role}: não aprende neste jogo', { role: t(ROLE_NAME[k] || k) }));
      }
    } else fix.push(t('não faz {roles} com os golpes que tem', { roles: roleNames(lost) }));
    repro.push(t('{ref}: na original faz {roles}; {fix}.', { ref: refOf(e.m), roles: roleNames(lost), fix: fix.join('; ') }));
  });
  if (!repro.length) repro.push(t('Você já tem a original inteira.'));
  const reproduce = { lines: repro, note: t('O app não guarda os sets da original (golpes, item e EVs são do Smogon e dos autores): os golpes citados são os mais usados no formato pelas estatísticas de uso. O set exato está no tópico.') };
  return { original, adapted: adaptedPanel, reproduce, extra };
}
const kept6 = x => x.kept.length === 6;
const roleKeyIn = (bits, k) => !!(bits & roleMask([k]));

/** Os golpes e o item mais usados pela espécie no formato (estatísticas de uso do Smogon), com os nomes do jogo. */
function usageLine(index, m, T) {
  const id = index.find({ name: m.x.s, showdown: m.x.s }) || (m.spec && index.find(m.spec));
  if (!id) return '';
  const top = (map, n) => (map ? [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k) : []);
  const names = new Map();
  for (const row of T.moves || []) if (row) names.set(toId(row[0]), row[0]);
  const moves = top(index.moves(id), 4).map(k => names.get(k)).filter(Boolean);
  const item = top(index.items(id), 1)[0];
  const itemName = item ? itemNameOf(item, T) : null;
  if (!moves.length) return '';
  return itemName ? t('No competitivo costuma usar {moves}, com {item}.', { moves: list(moves), item: itemName }) : t('No competitivo costuma usar {moves}.', { moves: list(moves) });
}
function itemNameOf(id, T) {
  for (const it of (T.quetzal && T.quetzal.items) || T.items || []) {
    const n = Array.isArray(it) ? it[0] : it;
    if (typeof n === 'string' && toId(n) === id) return n;
  }
  return null;
}

const threatName = x => (x.form ? `${x.name} (${x.form})` : x.name);
const names = (xs, max) => list(xs.slice(0, max).map(threatName)) + (xs.length > max ? ' ' + t('e mais {n}', { n: xs.length - max }) : '');

/**
 * Ameaças do jogo: cobertura, dano e resposta separados (a resposta é entrar no campo e vencer o 1 contra 1, não só
 * ter golpe super efetivo), e o que a estimativa não sabe.
 */
function threatsHtml(res, c) {
  // Quem segura a megapedra conta nas duas formas (o jogador escolhe megaevoluir ou não), como na nota
  const team = res.team.flatMap(e => (e.mega && e.base ? [e, e.base] : [e]));
  const tt = teamThreats(team, c.threats, c.mult, variantOf(res.plan));
  const n = tt.n, only = tt.wins - tt.safe;
  const lines = [t('Resposta: alguém entra no golpe e vence {safe} de {n}; mais {only} só vindo de graça (depois que um aliado cai).', { safe: tt.safe, n, only })];
  if (tt.none.length) lines.push(t('Sem resposta: {list}.', { list: names(tt.none, 6) }));
  // Quem é a única resposta (sai e a equipe fica sem ela)
  const unique = new Map();
  for (const p of tt.per) {
    const who = [...new Set(p.wins.map(e => e.real))];
    if (who.length === 1) { const k = refOf(res.team.find(e => e.real === who[0]).m); unique.set(k, [...(unique.get(k) || []), p.x]); }
  }
  for (const [ref, xs] of [...unique].sort((a, b) => b[1].length - a[1].length).slice(0, 2)) lines.push(t('Só {ref} responde a {list}.', { ref, list: names(xs, 4) }));
  const note = t('Estimativa contra {n} Pokémon fortes do jogo (sem lendários): nível 50, sem itens nem EVs, com o clima e o Trick Room do plano. O app não sabe os times dos treinadores nem os golpes de TM.', { n });
  return { lines, note };
}

/**
 * As partes arredondadas para a tela, somando a nota mostrada (arredondar cada uma sozinha dava 1 a mais ou a menos:
 * 42,5 + 4,5 viravam 43 + 5): cada parte fica com o valor inteiro de baixo, e o que falta vai para as de maior fração.
 */
export function shownParts(parts, score) {
  const keys = PARTS.map(([k]) => k);
  const v = k => parts[k] || 0;
  const out = Object.fromEntries(keys.map(k => [k, Math.floor(v(k))]));
  let left = Math.round(score) - keys.reduce((a, k) => a + out[k], 0);
  const order = [...keys].sort((a, b) => (v(b) - out[b]) - (v(a) - out[a]));
  for (let i = 0; left !== 0 && i < 2 * keys.length; i++) {
    const k = left > 0 ? order[i % keys.length] : order[keys.length - 1 - (i % keys.length)];
    out[k] += left > 0 ? 1 : -1;
    left += left > 0 ? -1 : 1;
  }
  return out;
}

/**
 * O que a tela diz das equipes de referência: quantas são compatíveis, por que nenhuma é (o app não finge uma
 * correspondência) e os botões para ver mais referências ou a montagem livre.
 */
function refsHeader(results) {
  const info = results.refs;
  if (!info) return '';
  const nRefs = results.filter(x => x.kind === 'ref').length;
  const left = moreRefsLeft(results);
  const out = [];
  if (!info.tables) out.push(`<p class="hint">${t('Não deu para carregar as equipes de referência (sem conexão?). As equipes abaixo são da montagem livre, sem referência.')}</p>`);
  else if (!info.tables.length) out.push(`<p class="hint">${t('Ainda não há equipes de referência para este jogo. As equipes abaixo são da montagem livre, sem referência.')}</p>`);
  else if (!nRefs) out.push(`<p class="hint">${t('Nenhuma equipe de referência compatível: das {total} equipes de exemplo do competitivo, nenhuma tem {min} ou mais Pokémon que você tem. As equipes abaixo são da montagem livre e não são baseadas em equipe competitiva.', { total: info.total, min: MIN_KEEP })}</p>`);
  else out.push(`<p class="hint">${t('{n} de {total} equipes de exemplo do competitivo têm {min} ou mais Pokémon que você tem. Abaixo, as que melhor se adaptam ao seu save, com os que faltam trocados por Pokémon seus.', { n: info.total - info.rejected, total: info.total, min: MIN_KEEP })}</p>`);
  const btns = [];
  if (left) btns.push(`<button class="btn btn-ghost btn-small" type="button" data-more-refs>${t('Ver mais referências ({n})', { n: left })}</button>`);
  if (nRefs && !info.free) btns.push(`<button class="btn btn-ghost btn-small" type="button" data-free>${t('Montar do zero (sem referência)')}</button>`);
  if (btns.length) out.push(`<p class="builder-more">${btns.join(' ')}</p>`);
  return out.join('');
}

/** Abas (as referências e, na montagem livre, uma por plano) e a equipe escolhida. */
export function resultsHtml(results, i, T) {
  if (!results.length) return `${refsHeader(results)}<p class="hint">${t('Não deu para montar uma equipe de 6 com os Pokémon deste save.')}</p>`;
  const cur = results[i] || results[0];
  const tab = (x, k) => `<button class="btn btn-ghost btn-small" type="button" data-plan="${k}" aria-pressed="${k === i}">${esc(x.name)} <small>${Math.round(x.score)}</small></button>`;
  const group = (kind, label) => {
    const items = results.map((x, k) => [x, k]).filter(([x]) => x.kind === kind);
    if (!items.length) return '';
    const head = results.refs ? `<p class="builder-group">${esc(label)}</p>` : '';
    return `${head}<div class="dex-filters builder-tabs" role="group" aria-label="${esc(label)}">${items.map(([x, k]) => tab(x, k)).join('')}</div>`;
  };
  const tabs = group('ref', t('Equipes de referência (adaptadas)')) + group('free', t('Montagem livre (sem referência)'));
  const shown = shownParts(cur.parts, cur.score);
  // A parte "Ameaças" só aparece com a caixa marcada; a "Competitivo", com a referência do jogo carregada
  const parts = PARTS.filter(([k]) => shown[k] !== 0)
    .map(([k, label]) => `<span class="part${shown[k] > 0 ? ' up' : shown[k] < 0 ? ' down' : ''}">${esc(t(label))} <b>${shown[k] > 0 ? '+' : ''}${shown[k]}</b></span>`).join('');
  // Alternativas sob demanda (montagem livre): o botão fica na melhor equipe do plano até o jogador pedir
  const more = cur.alt || cur.kind === 'ref' ? '' : !cur.alts
    ? `<p class="builder-more"><button class="btn btn-ghost btn-small" type="button" data-more>${t('Ver outras opções deste plano')}</button></p>`
    : !cur.alts.count ? `<p class="hint builder-more">${t('Nenhuma outra opção deste plano com nota perto desta (90% ou mais).')}</p>` : '';
  // Os dois métodos juntos: a IA (com a chave do jogador) comenta a equipe que o app montou; o comentário entra aqui
  const ai = `<div class="builder-ai">
      <button class="btn" type="button" data-ai-review>${t('Comentar com IA')}</button>
      <p class="hint">${t('A IA comenta esta equipe: riscos, golpes e itens. A equipe e a nota continuam as do app.')}</p>
      <div class="builder-ai-out" aria-live="polite"></div>
    </div>`;
  return `${refsHeader(results)}${tabs}
    <div class="builder-score"><span class="score-badge">${t('Nota {n}', { n: `<b>${Math.round(cur.score)}</b>` })}</span>${parts}</div>${more}
    ${buildView(cur.r, cur.shown, '', T, { app: true, evolved: cur.evolved })}
    ${ai}`;
}


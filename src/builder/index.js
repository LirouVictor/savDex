// Montador de equipes (sem IA): pacote carregado só ao tocar em "Montar equipes". Busca as equipes (build.js)
// e escreve, pelas contas, a função de cada membro, os pontos fortes e fracos e de onde vem a nota. A tela usa
// o mesmo desenho da equipe montada pela IA (ai/view.js), com os Pokémon reais do save.

import { t } from '../i18n.js';
import { esc } from '../ui/render.js';
import { buildTeams, scoreParts, attackTypes, sets } from './build.js';
import { buildView } from '../ai/view.js';
import { refOf } from '../ai/prompt.js';
import { FIELD, MEGA_FIELD, FIELD_MOVES, ABUSERS, MOVE_ABUSERS, MEGA_ABUSERS, WEATHER } from '../ai/strategy.js';

const PLAN_NAME = {
  sol: 'Sol', chuva: 'Chuva', 'tempestade de areia': 'Areia', 'neve/granizo': 'Neve', 'Trick Room': 'Trick Room',
  'Electric Terrain': 'Electric Terrain', 'Psychic Terrain': 'Psychic Terrain', 'Grassy Terrain': 'Grassy Terrain', 'Misty Terrain': 'Misty Terrain',
};
const ROLE_ORDER = ['pivô', 'prioridade', 'recuperação', 'controle de velocidade', 'setup', 'intimidação', 'hazards', 'tira hazards', 'telas', 'status', 'tanque'];
const KEY_ROLES = ['prioridade', 'recuperação', 'controle de velocidade', 'pivô'];
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const list = a => a.join(', ');

export const planName = plan => t(plan.field ? PLAN_NAME[plan.field] || plan.field : 'Equilibrada');

/**
 * Quem o jogador pediu no campo "Quero na equipe": nomes separados por vírgula, comparados com a espécie e o
 * apelido (sem diferenciar maiúsculas). Da equipe primeiro, depois do PC.
 */
export function wantedMons(all, text) {
  const names = String(text || '').toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const n of names) {
    const hit = all.find(m => m.species.name.toLowerCase() === n || (m.hasNickname && m.nickname.toLowerCase() === n))
      || all.find(m => m.species.name.toLowerCase().startsWith(n));
    if (hit && !out.includes(hit)) out.push(hit);
  }
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
const learnAt = level => (level ? t('aprende no Nv. {n}', { n: level }) : t('aprende ao evoluir'));
/** Golpe a ensinar que põe ou aproveita o campo f. */
const teachFor = (e, f, kind) => [...e.teach].find(([name]) => (kind === 'set'
  ? FIELD_MOVES[name] === f || (f === 'Trick Room' && name === 'Trick Room')
  : (MOVE_ABUSERS[name] || []).includes(f)));

/** Função de cada membro na equipe e o porquê, pelas contas (em português; os nomes viram referências E1/C3-12). */
function describeMember(e, team, plan, types) {
  const m = e.m, bf = e.bf, f = plan.field;
  const reasons = [];
  let role = '';
  if (e.given) reasons.push(t('Sem restrição de item: o app contou com {stone} (dê a ele).', { stone: e.given }));
  if (bf !== m) {
    const mega = { name: `${bf.species.name} ${bf.species.form || 'Mega'}`, types: bf.species.types.map(cap).join('/'), ability: bf.ability.name };
    reasons.push(e.abBase && e.abBase !== bf.ability.name
      ? t('Com a megapedra vira {name} ({types}; {ability}); antes de megaevoluir, tem {base}: as duas contam.', { ...mega, base: e.abBase })
      : t('Com a megapedra vira {name} ({types}; {ability}): a conta é com a mega.', mega));
  }
  if (f && e.strat.set.has(f)) {
    role = t('põe {field}', { field: t(f) });
    reasons.push(t('Põe {field} com {how}.', { field: t(f), how: howSets(bf, f) }));
  } else if (f && e.learnSet.has(f)) {
    const [mv, lv] = teachFor(e, f, 'set') || [];
    role = t('pode pôr {field}', { field: t(f) });
    if (mv) reasons.push(t('Ensinando {move} ({when}), põe {field}.', { move: mv, when: learnAt(lv), field: t(f) }));
  }
  if (plan.kind !== 'room' && f && !e.strong.has(f) && e.learnUse.has(f) && !(e.stab.has(f))) {
    const [mv, lv] = teachFor(e, f, 'use') || [];
    if (mv) {
      if (!role) role = t('aproveita {field}', { field: t(f) });
      reasons.push(t('Ensinando {move} ({when}), aproveita {field}.', { move: mv, when: learnAt(lv), field: t(f) }));
    }
  }
  if (plan.kind !== 'room' && f && e.strong.has(f)) {
    if (!role) role = t('aproveita {field}', { field: t(f) });
    const why = whyUses(bf, f);
    if (why.length) reasons.push(t('Aproveita {field}: {list}.', { field: t(f), list: list(why) }));
  } else if (plan.kind === 'weather' && WEATHER[f] && (e.stab.has(f) || e.strat.boost.has(f))) {
    if (!role) role = t('golpes {type} mais fortes', { type: cap(WEATHER[f].boosts) });
    reasons.push(t('Os golpes {type} dele ficam 1,5× mais fortes com {field}.', { type: cap(WEATHER[f].boosts), field: t(f) }));
  }
  if (plan.kind === 'room' && e.spe <= 50 && e.dmg >= 2 && !role) {
    role = t('atacante lento');
    reasons.push(t('Lento: no Trick Room, ataca primeiro.'));
  }
  // Segura o que acerta os outros: tipos a que 2 ou mais colegas são fracos e ele resiste ou anula
  const holds = types.filter((ty, a) => e.def[a] < 0 && team.filter(o => o !== e && o.def[a] > 0).length >= 2);
  if (holds.length) {
    if (!role) role = t('segura {list}', { list: list(holds.slice(0, 2).map(cap)) });
    reasons.push(t('Resiste a {list}, que acerta(m) outros membros em cheio.', { list: list(holds.map(cap)) }));
  }
  const absorbs = types.filter((ty, a) => e.def[a] === -2);
  if (absorbs.length) reasons.push(t('{ability} anula golpes {type}.', { ability: bf.ability.name, type: list(absorbs.map(cap)) }));
  if (e.preImmune && e.preImmune.length) reasons.push(t('Antes de megaevoluir, {ability} anula golpes {type}.', { ability: e.abBase, type: list(e.preImmune.map(cap)) }));
  // Habilidade que fortalece os golpes (Technician, Iron Fist…) e Contrary com golpes que baixam stats
  const byAb = new Map();
  for (const mv of e.boosted || []) byAb.set(mv.by, [...(byAb.get(mv.by) || []), mv.name]);
  for (const [ab, mvs] of byAb) reasons.push(t('{ability} fortalece {moves}.', { ability: ab, moves: list(mvs) }));
  if (e.contrary && e.contrary.length) reasons.push(t('Contrary: com {moves}, os stats sobem em vez de baixar.', { moves: list(e.contrary) }));
  // Único que acerta um tipo em cheio
  const only = types.filter((ty, a) => (e.cov & (1 << a)) && !team.some(o => o !== e && (o.cov & (1 << a))));
  if (only.length) reasons.push(t('Único da equipe que acerta {list} em cheio.', { list: list(only.map(cap)) }));
  const roles = ROLE_ORDER.filter(r => e.roles.includes(r));
  if (roles.length) reasons.push(t('Papéis: {list}.', { list: list(roles.map(r => t(r))) }));
  // Papel que a equipe não tem e ele aprende
  const extra = ROLE_ORDER.filter(r => e.roleMoves.has(r) && !team.some(o => o.roles.includes(r)));
  if (extra.length) reasons.push(t('Pode ganhar: {list}.', { list: list(extra.map(r => `${t(r)} (${e.roleMoves.get(r).name}, ${learnAt(e.roleMoves.get(r).level)})`)) }));
  if (!role) role = roles.length ? t(roles[0]) : t('cobertura');
  // Sem outro motivo: entra pela força (stats base) e pelos golpes que acertam bem
  if (!reasons.length) {
    reasons.push(t('Atacante {kind} com stats base {bst}.', { kind: e.lean === 'phys' ? t('físico') : t('especial'), bst: e.bst }));
  }
  if (m.evolvedFrom) reasons.push(t('Evolua {from} para {to}: a conta é com a forma evoluída.', { from: m.evolvedFrom.species.name, to: m.species.name }));
  return { ref: refOf(m), papel: role, motivo: reasons.join(' ') };
}

/** Pontos fortes e fracos da equipe, pelas contas. */
function teamPoints(team, plan, types) {
  const ref = e => refOf(e.m);
  const good = [], bad = [];
  const f = plan.field;
  if (f) {
    const setters = team.filter(e => sets(e, f));
    const users = plan.kind === 'room' ? team.filter(e => e.spe <= 50 && e.dmg >= 2) : team.filter(e => e.strong.has(f) || e.stab.has(f) || e.strat.boost.has(f) || e.learnUse.has(f));
    good.push(t('{field}: posto por {setters}; aproveitam {users}.', { field: t(f), setters: list(setters.map(ref)), users: list(users.map(ref)) }));
  }
  let cov = 0;
  for (const e of team) cov |= e.cov;
  const covered = types.filter((ty, a) => cov & (1 << a));
  good.push(t('Golpes super efetivos contra {n} dos {total} tipos.', { n: covered.length, total: types.length }));
  const roles = ROLE_ORDER.filter(r => team.some(e => e.roles.includes(r)));
  if (roles.length) good.push(t('Papéis na equipe: {list}.', { list: list(roles.map(r => t(r))) }));
  const halved = plan.kind === 'weather' && WEATHER[f] ? WEATHER[f].weakens : null;
  types.forEach((ty, a) => {
    const weak = team.filter(e => e.def[a] > 0);
    if (weak.length < 3) return;
    if (ty === halved) { good.push(t('{type} acerta {n} membros, mas {field} corta pela metade.', { type: cap(ty), n: weak.length, field: t(f) })); return; }
    const absorber = team.find(e => e.def[a] === -2);
    bad.push(absorber
      ? t('{type} acerta {n} membros em cheio; {ref} anula com {ability}.', { type: cap(ty), n: weak.length, ref: ref(absorber), ability: absorber.m.ability.name })
      : t('{type} acerta {n} membros em cheio.', { type: cap(ty), n: weak.length }));
  });
  const missing = KEY_ROLES.filter(r => !roles.includes(r));
  if (missing.length) bad.push(t('Falta na equipe: {list}.', { list: list(missing.map(r => t(r))) }));
  const gaps = types.filter((ty, a) => !(cov & (1 << a)));
  if (gaps.length) bad.push(t('Nenhum golpe super efetivo contra: {list}.', { list: list(gaps.map(cap)) }));
  const few = team.filter(e => e.dmg < 2);
  if (few.length) bad.push(t('Poucos golpes de dano: {list}.', { list: list(few.map(ref)) }));
  return { good, bad };
}

/** Próximos passos: evoluir, ensinar golpes, escolher a megaevolução, usar o item do clima. */
function teamTips(team, plan) {
  const tips = [];
  // Até 3 golpes a ensinar, sem repetir golpe nem Pokémon
  const taught = new Set();
  const teach = (e, mv, lv, why) => {
    if (taught.size >= 3 || taught.has(mv) || taught.has(e)) return;
    taught.add(mv); taught.add(e);
    tips.push(t('Ensine {move} a {ref} ({when}): {why}.', { move: mv, ref: refOf(e.m), when: learnAt(lv), why }));
  };
  // O plano depende de golpe a ensinar quando ninguém o põe com o que já sabe
  const f = plan.field;
  if (f && !team.some(e => e.strat.set.has(f))) {
    const e = team.find(x => x.learnSet.has(f));
    const [mv, lv] = (e && teachFor(e, f, 'set')) || [];
    if (mv) teach(e, mv, lv, t('põe {field}', { field: t(f) }));
  }
  // Papéis que a equipe só tem ensinando um golpe (os mais importantes primeiro)
  for (const r of ['prioridade', 'recuperação', 'controle de velocidade', 'pivô', 'setup', 'hazards', 'tira hazards']) {
    if (team.some(e => e.roles.includes(r))) continue;
    const e = team.find(x => x.roleMoves.has(r));
    if (e) teach(e, e.roleMoves.get(r).name, e.roleMoves.get(r).level, t(r));
  }
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
  if (setter && setter.rock !== plan.field) tips.push(t('Dê {item} a {ref}: o clima dura 8 turnos em vez de 5.', { item: rock, ref: refOf(setter.m) }));
  return tips;
}

const PARTS = [['defense', 'Defesa'], ['offense', 'Ataque'], ['roles', 'Papéis'], ['members', 'Pokémon'], ['balance', 'Equilíbrio'], ['plan', 'Plano']];

/**
 * Monta as equipes e prepara o que a tela precisa de cada uma.
 * @returns {Array<{ name: string, plan: object, score: number, parts: object, team: object[], r: object, byRef: Map, evolved: Map }>}
 */
export function runBuilder(all, T, note = '', dex = null, { noLegends = false, anyItem = false } = {}) {
  const types = attackTypes(T);
  const results = buildTeams(all, T, { want: wantedMons(all, note), dex, noLegends, anyItem });
  return results.map(res => {
    const { plan, team } = res;
    const membros = team.map(e => describeMember(e, team, plan, types));
    const { good, bad } = teamPoints(team, plan, types);
    const r = {
      nome: planName(plan), resumo: plan.field
        ? t('Plano: {plan}. Montada pelo app com todos os seus Pokémon (equipe e PC), sem IA.', { plan: t(plan.field) })
        : t('Equilibrada: sem clima, terreno nem Trick Room. Montada pelo app com todos os seus Pokémon (equipe e PC), sem IA.'),
      membros, pontos_fortes: good, pontos_fracos: bad, dicas: teamTips(team, plan), dropped: [],
    };
    const mons = team.map(e => e.m);
    return {
      name: r.nome, plan, score: res.score, parts: scoreParts(team, plan, types), team: mons, r,
      // Toque no card: o Pokémon real; nos textos e nas contas, a forma evoluída (quem o app contou evoluído)
      byRef: new Map(mons.map(m => [refOf(m), m.evolvedFrom || m.stoneFrom || m])),
      shown: new Map(mons.map(m => [refOf(m), m])),
      evolved: new Map(mons.filter(m => m.evolvedFrom).map(m => [refOf(m), m])),
    };
  });
}

/** Abas (uma por plano) e a equipe escolhida. */
export function resultsHtml(results, i, T) {
  if (!results.length) return `<p class="hint">${t('Não deu para montar uma equipe de 6 com os Pokémon deste save.')}</p>`;
  const cur = results[i] || results[0];
  const tabs = results.map((x, k) => `<button class="btn btn-ghost btn-small" type="button" data-plan="${k}" aria-pressed="${k === i}">${esc(x.name)} <small>${Math.round(x.score)}</small></button>`).join('');
  const parts = PARTS.map(([k, label]) => `${t(label)} ${Math.round(cur.parts[k]) > 0 ? '+' : ''}${Math.round(cur.parts[k])}`).join(' · ');
  return `<div class="dex-filters builder-tabs" role="group" aria-label="${esc(t('Planos'))}">${tabs}</div>
    <p class="hint builder-score">${t('Nota {n}', { n: Math.round(cur.score) })}: ${esc(parts)}</p>
    ${buildView(cur.r, cur.shown, '', T, { app: true, evolved: cur.evolved })}`;
}


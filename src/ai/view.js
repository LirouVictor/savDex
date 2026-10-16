// Telas dos resultados da IA. Os Pokémon citados são desenhados com os dados do save (não com o texto da IA).

import { esc, typeChips, monShort, monTile, tipBtn } from '../ui/render.js';
import { spriteSrc } from '../ui/sprites.js';
import { REF_RE, teamFacts, buildIssues, moveChecks, levelGap } from './prompt.js';
import { t, num } from '../i18n.js';

const where = m => (m.hasNickname ? m.species.name + ' · ' : '')
  + (m.location === 'party' ? `${t('Equipe')} ${m.slot}` : `${m.where} · ${m.slot}`);

const VERDICT = n => t(n >= 10 ? 'Excelente' : n >= 8 ? 'Muito boa' : n >= 6 ? 'Boa' : n >= 4 ? 'Mediana' : 'Fraca');

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Escapa o texto e troca as referências (E1, C3-12) pelo nome do Pokémon, em negrito.
 * A IA às vezes escreve o nome junto da referência ("Corviknight (C1-2)", "C1-2 (Corviknight)",
 * "C1-2 Corviknight"): o nome repetido é absorvido para não aparecer duas vezes.
 */
export function rich(text, byRef) {
  const src = String(text ?? '');
  let out = '', last = 0;
  for (const match of src.matchAll(REF_RE)) {
    const m = byRef.get(match[0]);
    if (!m) continue;
    const names = [...new Set([m.nickname, m.species.name].filter(Boolean))].map(reEsc).join('|');
    let before = src.slice(last, match.index);
    let end = match.index + match[0].length;
    // Nome antes: "Nome (REF" / "Nome REF" / "Nome [REF"
    const left = before.match(new RegExp(`(?:^|[^\\p{L}\\p{N}])((?:${names})\\s*([(\\[]?)\\s*)$`, 'iu'));
    let opened = '';
    if (left) { before = before.slice(0, before.length - left[1].length); opened = left[2]; }
    else {
      const br = before.match(/([(\[])\s*$/);
      if (br) { before = before.slice(0, before.length - br[0].length); opened = br[1]; }
    }
    const rest = src.slice(end);
    let after;
    if (opened) after = rest.match(new RegExp(`^(?:\\s*[,/-]?\\s*(?:${names}))?\\s*[)\\]]`, 'iu'));
    else if (!left) after = rest.match(new RegExp(`^\\s*[(\\[]\\s*(?:${names})\\s*[)\\]]|^\\s+(?:${names})(?![\\p{L}\\p{N}])`, 'iu'));
    if (opened && !after) before += opened; // parêntese sem par: devolve
    if (after) end += after[0].length;
    out += esc(before) + `<b>${monShort(m)}</b>`;
    last = end;
  }
  return out + esc(src.slice(last));
}

function sprite(m, size) {
  const sp = m.species;
  const next = m.shiny && sp.spriteId ? ` data-next="${esc(spriteSrc(sp))}"` : '';
  return `<img data-sprite="1"${next} src="${esc(spriteSrc(sp, m.shiny))}" width="${size}" height="${size}" alt="" decoding="async" loading="lazy" crossorigin="anonymous">`;
}

const typeClass = m => (m.species.types[0] ? ` t-${esc(m.species.types[0])}` : '');

/** Pokémon pequeno e clicável (trocas e dicas). */
function mini(m, ref, tag = '') {
  return `<button class="ai-mon${typeClass(m)}" type="button" data-ref="${esc(ref)}" aria-label="${esc(t('Ver {name}', { name: monShort(m) }))}">
    <span class="ai-mon-art">${sprite(m, 56)}</span>
    <span class="ai-mon-text">${tag ? `<span class="ai-tag ${tag === 'Sai' ? 'out' : 'in'}">${t(tag)}</span>` : ''}<b>${monShort(m)}</b><small>${esc(where(m))}</small></span>
  </button>`;
}

function panel(title, kind, inner) {
  if (!inner) return '';
  return `<section class="ai-panel ${kind}"><h3><span class="ai-ico" aria-hidden="true"></span>${t(title)}</h3>${inner}</section>`;
}

/**
 * Equipe montada pelo app, depois dos blocos dos membros: as trocas (equipes de referência), a estratégia, o ideal do
 * competitivo e as ameaças. O que fazer com cada Pokémon (golpes a ensinar, item, evoluir) fica no card dele; os
 * próximos passos só aparecem quando o card não tem os golpes (jogos sem a lista do tutor).
 */
function appPanels(r, byRef, dicas, cardsHaveMoves) {
  const note = x => `<p class="hint ai-threat-note">${esc(x.note)}</p>`;
  const ref = r.referencia;
  return {
    swaps: `${ref ? panel('Trocas', 'swap', bullets(ref.adapted.lines, byRef) + `<p class="hint ai-threat-note">${esc(ref.adapted.note)}</p>`) : ''}
      ${r.ideal ? panel('Ideal do competitivo × o que você tem', 'swap', bullets(r.ideal.lines, byRef) + note(r.ideal)) : ''}`.trim(),
    plan: `${r.estrategias ? panel('Estratégia', 'info', `<ul class="ai-list ai-strats">${r.estrategias.cards.map(x => `<li><b>${esc(x.title)}</b> <small class="ai-strat-tag">${esc(x.tag)}</small><br>${rich(x.text, byRef)}</li>`).join('')}</ul><p class="hint ai-threat-note">${esc(r.estrategias.note)}</p>`) : ''}
      ${r.ameacas ? panel('Ameaças do jogo (estimativa)', 'info', bullets(r.ameacas.lines, byRef) + note(r.ameacas)) : ''}`.trim(),
    steps: cardsHaveMoves ? '' : panel('Próximos passos', 'swap', dicas),
  };
}

/**
 * Abas do resultado do montador (no celular ele passava de 7 telas): a equipe primeiro; trocas, estratégia e a
 * original a um toque. Abas vazias não aparecem; com uma só, sem barra.
 */
function builderTabs(panes) {
  const list = panes.filter(p => p.html);
  if (list.length < 2) return list.map(p => p.html).join('');
  const bar = `<div class="bt-tabs" role="tablist" aria-label="${t('Partes do resultado')}">${list.map((p, i) =>
    `<button type="button" role="tab" id="bt-tab-${p.id}" aria-controls="bt-pane-${p.id}" aria-selected="${i === 0}" data-bt="${p.id}">${t(p.label)}</button>`).join('')}</div>`;
  return bar + list.map((p, i) => `<div class="bt-pane" role="tabpanel" id="bt-pane-${p.id}" aria-labelledby="bt-tab-${p.id}"${i ? ' hidden' : ''}>${p.html}</div>`).join('');
}

/**
 * Equipe original de uma referência (builder/reference.js), antes da adaptada: os 6 em blocos como na seção Equipe (o
 * toque abre o card do membro: situação no save, papéis na original e o que o formato costuma usar), o plano e,
 * recolhidos, a origem, a conferência e os links da fonte.
 */
function originalHtml(o, byRef) {
  const tiles = o.members.map((x, i) => `<li class="ref-tile ${x.ok ? 'ok' : x.game ? 'miss' : 'none'}">${monTile(fakeMon(x), `data-sheet="o${i}"`)}<small class="ref-tile-status">${esc(x.ok ? t('você tem') : x.game ? t('trocado') : t('não existe'))}</small></li>`).join('');
  const sheets = o.members.map((x, i) => `<template data-sheet-id="o${i}">${originalSheet(x, o, byRef)}</template>`).join('');
  const links = o.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join(' · ');
  return `<section class="ref-block">
    <div class="ref-block-head"><h3>${t('Equipe original')}</h3><span class="builder-tag">${esc(o.tag)}</span></div>
    ${o.plan ? `<p class="ref-origin">${esc(o.plan)}</p>` : ''}
    <ul class="party-grid builder-grid">${tiles}</ul>${sheets}
    <details class="fold ref-source"><summary>${t('Origem e conferência')}</summary><p class="ref-origin"><b>${esc(o.head)}</b></p>${bullets(o.lines, new Map())}<p class="hint ref-links">${links}</p></details>
  </section>`;
}
// O membro da original no formato que monTile desenha (sem nível, sem gênero)
const fakeMon = x => ({ species: { name: x.name, types: x.types, spriteId: x.sprite }, hasNickname: false });

/** Card de um membro da original: o que se sabe dele na original e o que o formato costuma usar com a espécie. */
function originalSheet(x, o, byRef) {
  const m = fakeMon(x);
  const rows = [
    [t('No seu save'), rich(x.status, byRef)],
    [t('Na original'), esc(x.roles)],
    ...(x.field.length ? [[t('Campo'), esc(x.field.join(', '))]] : []),
    ...(x.attacks.length ? [[t('Golpes de dano'), `${esc(x.attacks.join(', '))}${x.cat ? ` (${esc(x.cat)})` : ''}`]] : []),
  ];
  const u = x.usage;
  const usage = u ? `<h3 class="sheet-h">${t('O que o formato costuma usar')}</h3>
    <span class="ai-moveset">${u.moves.map(mv => `<span class="ai-mv">${tipBtn('m', mv.name, esc(mv.name))}<small>${mv.pct}%</small></span>`).join('')}</span>
    ${u.item || u.ability ? `<p class="ai-gear">${[u.item && `@ ${esc(u.item.name)} <i>${u.item.pct}%</i>`, u.ability && `${tipBtn('a', u.ability.name, esc(u.ability.name))} <i>${u.ability.pct}%</i>`].filter(Boolean).join(' · ')}</p>` : ''}
    <p class="hint">${t('Estatísticas de uso do formato (Smogon): a fração dos sets da espécie que leva cada um. O app não guarda o set da original.')}</p>` : '';
  return `<div class="mon-hero${typeClass(m)}"><div class="sheet-mon">${sprite(m, 96)}<div><h2 id="detail-title">${esc(x.name)}</h2><p class="mon-sub">${esc(t('{tag} · equipe original', { tag: o.tag }))}</p>${typeChips(x.types)}</div></div></div>
    <dl class="sheet-facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>${usage}`;
}

/** Card de um membro da equipe montada pelo app: função, motivos, item, habilidade e os 4 golpes (com o que ensinar). */
function memberSheet(x, m, byRef) {
  const from = m && m.evolvedFrom;
  return `<div class="mon-hero${typeClass(m)}"><div class="sheet-mon">${sprite(m, 96)}<div><h2 id="detail-title">${monShort(m)}</h2><p class="mon-sub">${esc(where(m))}</p>${typeChips(m.species.types)}</div></div></div>
    <div class="ai-member-body sheet-body">
      ${x.papel ? `<span class="ai-role">${esc(x.papel)}</span>` : ''}
      ${from ? `<small class="ai-evolve">${esc(t('Evolua: hoje é {name}{lv}', { name: from.species.name, lv: from.level ? ` (${t('Nv.')} ${from.level})` : '' }))}</small>` : ''}
      ${gearHtml(x, true)}
      <span class="ai-why">${rich(x.motivo, byRef)}</span>
      ${x.golpes ? movesetHtml(x.golpes, true) : ''}
    </div>
    <p><button class="btn btn-ghost btn-small" type="button" data-ref="${esc(x.ref)}">${t('Ver o Pokémon do save')}</button></p>`;
}

const bullets = (items, byRef) => (items.length ? `<ul class="ai-list">${items.map(x => `<li>${rich(x, byRef)}</li>`).join('')}</ul>` : '');

/** Conferência do app dos golpes novos citados (Quetzal/Unbound: golpes por nível da ROM do jogo). */
function checksHtml(text, byRef, opts, owner = null) {
  const list = opts && opts.dex ? moveChecks(text, byRef, opts.dex, opts.T, owner) : [];
  const rom = !!(opts && opts.dex && opts.dex.rom);
  return list.map(c => `<small class="ai-movecheck ${c.learns ? 'ok' : 'no'}">${c.learns ? '✓' : '⚠'} ${rich(c.learns
    ? (rom ? t('{move}: {ref} aprende por nível (tabela do jogo).', c) : t('{move}: {ref} aprende por nível (lista dos jogos oficiais recentes).', c))
    : t('{move}: não está nos golpes por nível de {ref} (pode ser por TM ou tutor, ou não aprender).', c), byRef)}</small>`).join('');
}

function footer(model, dropped, opts = null) {
  if (opts && opts.app) return `<p class="hint ai-foot">${esc(t('Montada pelo app, sem IA (o nível não conta). Confira golpes e itens antes de usar.'))}</p>`;
  const lost = dropped.length
    ? `<p class="hint">${esc(t('A IA citou Pokémon que não existem no save ({list}); essas partes foram ignoradas.', { list: dropped.join(', ') }))}</p>`
    : '';
  const lite = opts && opts.lite && opts.lite.length
    ? `<p class="hint">${esc(opts.liteWhy === 'quota'
      ? t('A cota grátis de hoje do modelo escolhido acabou: a resposta veio de um modelo mais leve ({list}), que pode ser menos preciso. A cota volta no dia seguinte.', { list: opts.lite.join(', ') })
      : t('O modelo escolhido estava sobrecarregado: a resposta veio de um modelo mais leve ({list}), que pode ser menos preciso. Vale tentar de novo mais tarde.', { list: opts.lite.join(', ') }))}</p>`
    : '';
  const ref = opts && opts.refine;
  const second = ref
    ? (ref.ok ? '' : `<p class="hint">${t('A segunda etapa (pontos e dicas com as contas do app) não respondeu; os pontos e as dicas são os da escolha da equipe.')}</p>`)
      + `<details class="ai-raw fold"><summary>${t('Ver o texto do segundo envio ({n} caracteres)', { n: num(ref.prompt.length) })}</summary><pre>${esc(ref.prompt)}</pre></details>`
    : '';
  return `${lost}${lite}${second}<p class="hint ai-foot">${esc(t('Gerado pelo {model}. A IA pode errar: confira golpes e habilidades antes de seguir a sugestão.', { model }))}</p>`;
}

export function analysisView(r, byRef, model, opts = null) {
  const pips = Array.from({ length: 10 }, (_, i) => `<i class="${i < r.nota ? 'on' : ''}"></i>`).join('');
  const trocas = r.trocas.map(x => `<li class="ai-swap">
      <div class="ai-pair">${mini(byRef.get(x.sai), x.sai, 'Sai')}<span class="ai-arrow" aria-label="${t('troca por')}"></span>${mini(byRef.get(x.entra), x.entra, 'Entra')}</div>
      <p>${rich(x.motivo, byRef)}</p>
    </li>`).join('');
  const dicas = r.dicas.map(d => `<li class="ai-tip">${mini(byRef.get(d.ref), d.ref)}<p>${rich(d.texto, byRef)}</p>${checksHtml(d.texto, byRef, opts, byRef.get(d.ref))}</li>`).join('');
  return `<div class="ai-result">
    <div class="ai-hero">
      <div class="ai-medal" role="img" aria-label="${t('Nota {n} de 10', { n: r.nota })}"><b>${r.nota}</b><small>/10</small></div>
      <div class="ai-hero-text">
        <p class="ai-kicker">${t('Avaliação da equipe')}</p>
        <p class="ai-verdict">${VERDICT(r.nota)}</p>
        <div class="ai-pips" aria-hidden="true">${pips}</div>
      </div>
    </div>
    ${r.resumo ? `<p class="ai-summary">${rich(r.resumo, byRef)}</p>` : ''}
    <div class="ai-cols">
      ${panel('Pontos fortes', 'good', bullets(r.pontos_fortes, byRef))}
      ${panel('Pontos fracos', 'bad', bullets(r.pontos_fracos, byRef))}
    </div>
    ${panel('Sinergia', 'info', bullets(r.sinergias, byRef))}
    ${panel('Trocas sugeridas', 'swap', trocas && `<ul class="ai-swaps">${trocas}</ul>`)}
    ${panel('Dicas por membro', 'info', dicas && `<ul class="ai-tips">${dicas}</ul>`)}
    ${footer(model, r.dropped, opts)}
  </div>`;
}

/** Item e habilidade que o montador sugere (Quetzal): "@ Leftovers dar · Drizzle trocar". */
function gearHtml(x, tips = false) {
  if (!x.item && !x.habilidade) return '';
  const item = x.item ? `@ ${esc(x.item.name)}${x.item.give ? ` <i>${t('dar')}</i>` : ''}` : '';
  const ab = x.habilidade ? `${tips ? tipBtn('a', x.habilidade.name, esc(x.habilidade.name)) : esc(x.habilidade.name)} <i>${t('trocar')}</i>` : '';
  return `<small class="ai-gear">${[item, ab].filter(Boolean).join(' · ')}</small>`;
}

/** Os 4 golpes do moveset do montador, com a cor do tipo e de onde vêm (tutor, TM, nível já alcançado, nível a treinar). */
// tips = os nomes mostram a descrição ao tocar (no card do membro; o card da IA é um botão inteiro)
function movesetHtml(golpes, tips = false) {
  const tag = x => (x.src === 'tutor' ? t('tutor') : x.src === 'tm' ? x.tm || t('tutor') : x.src === 'now' ? t('nível') : x.src === 'level' ? `${t('Nv.')} ${x.level}` : '');
  return `<span class="ai-moveset">${golpes.map(x => {
    const k = tag(x);
    return `<span class="ai-mv t-${esc(x.type || 'none')}">${tips ? tipBtn('m', x.id || x.name, esc(x.name)) : `<span>${esc(x.name)}</span>`}${k ? `<small${x.src === 'level' || x.src === 'tm' ? ' class="train"' : ''}>${esc(k)}</small>` : ''}</span>`;
  }).join('')}</span>`;
}

export function buildView(r, byRef, model, T, opts = null) {
  // Quem o app contou já evoluído (conserto da equipe) aparece com a forma evoluída e o aviso "evolua"
  const evolved = (opts && opts.evolved) || new Map();
  const mons = r.membros.map(x => evolved.get(x.ref) || byRef.get(x.ref));
  const cards = r.membros.map((x, i) => {
    const m = mons[i];
    const from = m && m.evolvedFrom;
    return `<li><button class="ai-member${typeClass(m)}" type="button" data-ref="${esc(x.ref)}" aria-label="${esc(t('Ver {name}', { name: monShort(m) }))}">
      <span class="ai-member-art">${sprite(m, 80)}<span class="ai-num">${i + 1}</span></span>
      <span class="ai-member-body">
        ${x.papel ? `<span class="ai-role">${esc(x.papel)}</span>` : ''}
        <b class="ai-member-name">${monShort(m)}</b>
        <small>${esc(where(m))}</small>
        ${from ? `<small class="ai-evolve">${esc(t('Evolua: hoje é {name}{lv}', { name: from.species.name, lv: from.level ? ` (${t('Nv.')} ${from.level})` : '' }))}</small>` : ''}
        ${typeChips(m.species.types)}
        ${gearHtml(x)}
        <span class="ai-why">${rich(x.motivo, byRef)}</span>
        ${x.golpes ? movesetHtml(x.golpes) : ''}
      </span>
    </button></li>`;
  }).join('');
  const app = !!(opts && opts.app);
  // Equipe do app: os 6 em blocos (como na seção Equipe), com a função embaixo; o toque abre o card do membro
  const tiles = app ? r.membros.map((x, i) => `<li>${monTile(mons[i], `data-sheet="a${i}"`)}${x.papel ? `<small class="ref-tile-status">${esc(x.papel)}</small>` : ''}</li>`).join('') : '';
  const sheets = app ? r.membros.map((x, i) => `<template data-sheet-id="a${i}">${memberSheet(x, mons[i], byRef)}</template>`).join('') : '';
  // Conferência do próprio app (as mesmas contas da análise), para não depender só do texto da IA
  const issues = !app && mons.length ? buildIssues(mons, T) : [];
  const warn = issues.length ? `<p class="ai-warn"><b>${t('Fora dos critérios pedidos:')}</b> ${issues.map(esc).join(' ')}</p>` : '';
  const gap = levelGap(mons);
  const check = !app && mons.length ? warn + bullets([...teamFacts(mons, T).split('\n'), ...(gap ? [gap] : [])], byRef) : '';
  // Trocas feitas pelo app (critério que a IA furou): quem saiu, quem entrou e como ficaram os tipos
  const fixed = r.fix ? `<p class="ai-fix"><b>${t('Ajuste do app:')}</b> ${r.fix.swaps.map(s => t('{out} saiu, {in} entrou', { out: `<b>${monShort(s.out)}</b>`, in: `<b>${monShort(s.in)}</b>` })
      + (s.in.evolvedFrom ? ` (${esc(t('evolua {from} para {to}', { from: s.in.evolvedFrom.species.name, to: s.in.species.name }))})` : '')).join('; ')}.
    ${t('Membros fracos a cada tipo: {list}.', { list: r.fix.counts.map(c => `${esc(c.type[0].toUpperCase() + c.type.slice(1))} ${c.before} → ${c.after}`).join(', ') })}</p>` : '';
  const short = r.membros.length < 6 ? `<p class="hint">${t('A IA sugeriu só {n} Pokémon válidos.', { n: r.membros.length })}</p>` : '';
  const dicas = r.dicas.length ? `<ol class="ai-steps-list">${r.dicas.map(x => `<li>${rich(x, byRef)}${checksHtml(x, byRef, opts && { ...opts, T })}</li>`).join('')}</ol>` : '';
  const hero = `<div class="ai-hero build">
      <div class="ai-hero-text">
        <p class="ai-kicker">${app ? (r.referencia ? t('Sua equipe adaptada') : t('Equipe montada pelo app')) : t('Equipe sugerida')}</p>
        <p class="ai-team-name">${esc(r.nome)}</p>
      </div>
      <div class="export-btns">
        <button class="btn btn-ghost btn-small" type="button" data-ai-copy>${t('Copiar (Showdown)')}</button>
        ${mons.length ? `<button class="btn btn-ghost btn-small" type="button" data-ai-save>${t('Salvar equipe')}</button>` : ''}
      </div>
    </div>
    <p class="hint team-msg" role="status"></p>
    ${r.resumo ? `<p class="ai-summary">${rich(r.resumo, byRef)}</p>` : ''}`;
  const cols = `<div class="ai-cols">
      ${panel('Pontos fortes', 'good', bullets(r.pontos_fortes, byRef))}
      ${panel('Pontos fracos', 'bad', bullets(r.pontos_fracos, byRef))}
    </div>`;
  if (app) {
    const P = appPanels(r, byRef, dicas, r.membros.every(x => x.golpes));
    return `<div class="ai-result">
    ${hero}
    ${builderTabs([
      { id: 'team', label: 'Equipe', html: `<ul class="party-grid builder-grid">${tiles}</ul><p class="hint">${t('Toque num Pokémon para ver golpes, item e o que fazer.')}</p>${sheets}${fixed}${short}${P.steps}${cols}` },
      { id: 'swaps', label: 'Trocas', html: P.swaps },
      { id: 'plan', label: 'Estratégia', html: P.plan },
      { id: 'orig', label: 'Original', html: r.referencia ? originalHtml(r.referencia.original, byRef) : '' },
    ])}
    ${footer(model, r.dropped, opts)}
  </div>`;
  }
  return `<div class="ai-result">
    ${hero}
    <ul class="ai-members">${cards}</ul>
    ${fixed}
    ${short}
    ${cols}
    ${panel('Conferência do app', 'info', check)}
    ${panel('Próximos passos', 'swap', dicas)}
    ${footer(model, r.dropped, opts)}
  </div>`;
}

/** Janela "o que vai ser enviado à IA", com o texto exato do pedido. */
export function confirmView(prep) {
  const { P, counts, note, kind, system, prompt } = prep;
  const model = P.getModel() || t('escolhido automaticamente');
  const analyze = kind === 'analyze';
  const pc = counts.pc
    ? t('{n} do PC', { n: counts.pc }) + (counts.pc < counts.pcTotal ? ' ' + t(analyze
      ? '(de {total}: os que mais ajudam a equipe, resistindo às fraquezas dela ou cobrindo tipos sem golpe super efetivo, depois os de maior total de stats base)'
      : '(de {total}: um por espécie; quando não cabem todos, primeiro quem põe ou aproveita clima, terreno e Trick Room e os melhores de cada tipo, depois os de maior total de stats base)', { total: counts.pcTotal }) : '')
    : t('nenhum do PC');
  const text = `${system}\n\n${prompt}`;
  return `<h2 class="pixel" id="ai-confirm-title">${esc(t('Enviar ao {service}?', { service: P.service }))}</h2>
  <p class="hint">${t('Serviço:')} <b>${esc(P.label)}</b> · ${t('modelo')} ${esc(model)}</p>
  <div class="ai-cols">
    <section class="ai-panel good"><h3><span class="ai-ico" aria-hidden="true"></span>${t('Vai junto')}</h3>
      <ul class="ai-list">
        <li>${esc(t('{n} Pokémon da equipe e {pc}.', { n: counts.party, pc }))}</li>
        <li>${t('De cada um: espécie, apelido, tipos, habilidade, item, natureza, stats base, IVs e golpes (tipo, categoria e poder).')}</li>
        ${analyze ? `<li>${t('Os cálculos do app sobre a equipe: fraquezas, cobertura, golpes físicos/especiais, velocidade base, megapedras e clima.')}</li>` : ''}
        ${counts.hints ? `<li>${t('Pistas de estratégia: quem põe clima ou terreno, quem aproveita e quem usa Trick Room.')}</li>` : ''}
        ${counts.free ? `<li>${t('Modo livre: as outras habilidades que cada um pode ter, trocando por item.')}</li>` : ''}
        ${analyze ? '' : `<li>${counts.learn2
          ? t('Depois que a IA escolher os 6, um segundo envio, bem menor: só essa equipe, as contas do app sobre ela e os golpes que cada um aprende por nível, para os pontos fracos e as dicas.')
          : t('Depois que a IA escolher os 6, um segundo envio, bem menor: só essa equipe e as contas do app sobre ela, para os pontos fracos e as dicas.')}</li>`}
        ${counts.learn ? `<li>${prep.game && prep.game.id === 'quetzal'
          ? t('Os golpes que cada membro da equipe aprende por nível (tabela do próprio Quetzal).')
          : prep.game && prep.game.id === 'unbound'
            ? t('Os golpes que cada membro da equipe aprende por nível (tabela do próprio Unbound).')
            : prep.game && prep.game.id === 'soulgold'
              ? t('Os golpes que cada membro da equipe aprende por nível (tabela do próprio SoulGold).')
            : t('Os golpes que cada membro da equipe aprende por nível (lista pública dos jogos oficiais).')}</li>` : ''}
        ${note ? `<li>${t('Seu pedido:')} “${esc(note)}”.</li>` : ''}
        <li>${t('As instruções do savDex para a IA (como responder).')}</li>
      </ul>
    </section>
    <section class="ai-panel bad"><h3><span class="ai-ico" aria-hidden="true"></span>${t('Não vai')}</h3>
      <ul class="ai-list">
        <li>${t('O arquivo .sav.')}</li>
        <li>${t('Seu nome de treinador, ID e SID, e o nome do arquivo.')}</li>
        <li>${t('Nível, EVs, PID e os demais dados do save.')}</li>
      </ul>
    </section>
  </div>
  ${P.privacy ? `<p class="hint">${esc(t(P.privacy))}</p>` : ''}
  <details class="ai-raw fold"><summary>${t('Ver o texto exato ({n} caracteres)', { n: num(text.length) })}</summary><pre>${esc(text)}</pre></details>
  <label class="ai-skip"><input type="checkbox" data-skip><span class="chk-text"><b>${t('Não perguntar de novo neste aparelho')}</b></span></label>
  <div class="export-btns ai-confirm-btns">
    <button class="btn btn-ghost" type="button" data-cancel>${t('Cancelar')}</button>
    <button class="btn" type="button" data-send>${esc(t('Enviar ao {service}', { service: P.service }))}</button>
  </div>`;
}

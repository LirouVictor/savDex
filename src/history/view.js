// Telas do histórico: "O que mudou" (comparação com uma versão anterior) e a lista de versões guardadas.

import { esc, monShort } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import { t, locale } from '../i18n.js';

export const when = ts => new Date(ts).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });

/** Pokémon pequeno e clicável; `i` é o índice em `mons` (para abrir o detalhe). */
function chip(m, i, extra = '') {
  const sp = m.species;
  return `<li><button class="ch-mon" type="button" data-ch="${i}">
    <img data-sprite="1" src="${esc(iconSrc(sp))}"${sp.hasIcon ? ' class="ico"' : ''} alt="" decoding="async" loading="lazy" crossorigin="anonymous">
    <span><b>${monShort(m)}${m.shiny ? ' <span class="shiny">★</span>' : ''}</b>${extra ? `<small>${extra}</small>` : ''}</span>
  </button></li>`;
}

/**
 * @param {object} d resultado de diffSaves (sempre da versão mais antiga para a mais nova)
 * @param {{savedAt:number, saveIndex:number}} base versão comparada
 * @param {number} versions quantas versões estão guardadas
 * @param {{ swapped?: boolean }} [opts] swapped = o save aberto agora é o mais antigo dos dois
 * @returns {{ html: string, mons: object[] }}
 */
export function changesWin(d, base, versions, { swapped = false } = {}) {
  const mons = [];
  const add = m => mons.push(m) - 1;
  const sec = (title, items, note = '') => (items.length
    ? `<details class="fold"><summary>${title}</summary>${note ? `<p class="hint">${note}</p>` : ''}<ul class="ch-list">${items.join('')}</ul></details>` : '');
  const lv = n => `${t('Nv.')} ${n}`;
  const sum = [
    [d.added.length, t('novo'), t('novos'), 'up'], [d.evolved.length, t('evoluiu'), t('evoluíram'), 'up'],
    [d.leveled.length, t('subiu de nível'), t('subiram de nível'), 'up'], [d.learned.length, t('aprendeu golpes'), t('aprenderam golpes'), 'up'],
    [(d.trained || []).length, t('treinado'), t('treinados'), 'up'],
    [d.removed.length, t('saiu'), t('saíram'), 'down'],
  ].filter(([n]) => n).map(([n, one, many, cls]) => `<span class="ch-pill ${cls}"><b>${n}</b> ${n === 1 ? one : many}</span>`).join('');
  const body = !d.changed
    ? `<p class="hint">${t('Nenhuma mudança nos Pokémon desde essa versão.')}</p>`
    : `<div class="ch-sum">${sum}</div>
    ${sec(t('Novos'), d.added.map(m => chip(m, add(m), m.level ? lv(m.level) : '')))}
    ${sec(t('Evoluíram'), d.evolved.map(e => chip(e.to, add(e.to), esc(t('era {name}', { name: e.from.species.name })))))}
    ${sec(t('Subiram de nível'), d.leveled.map(e => chip(e.mon, add(e.mon), `${lv(e.from)} → ${e.to}`)))}
    ${sec(t('Golpes novos'), d.learned.map(e => chip(e.mon, add(e.mon), esc(e.moves.map(mv => mv.name).join(', ')))))}
    ${sec(t('Treinados'), (d.trained || []).map(e => chip(e.mon, add(e.mon), esc(e.what.map(w => t(w)).join(', ')))), t('Mesmo Pokémon com IVs, natureza ou habilidade diferentes (itens de treino do jogo).'))}
    ${sec(t('Saíram'), d.removed.map(m => chip(m, add(m), m.level ? lv(m.level) : '')), t('Estavam na versão mais antiga e não aparecem na mais nova: soltos, trocados ou usados no jogo. Se um deles ainda estiver com você, o app não conseguiu reconhecê-lo (mudou demais entre as versões).'))}`;
  const total = d.total.after - d.total.before;
  const html = `<section class="win changes" aria-labelledby="changes-h">
    <div class="win-title"><h2 id="changes-h">${t('O que mudou')}</h2><small>${t(swapped ? 'até a versão aberta em {when}' : 'desde {when}', { when: when(base.savedAt) })}</small></div>
    ${swapped ? `<p class="hint">${t('Este save é mais antigo que o comparado (menos tempo de jogo). A comparação vai sempre do mais antigo para o mais novo.')}</p>` : ''}
    <p class="k-line">${t('Pokémon: {before} → {after}', { before: d.total.before, after: d.total.after })}${total ? ` (${total > 0 ? '+' : ''}${total})` : ''}
      · ${t('shinies: {before} → {after}', { before: d.shinies.before, after: d.shinies.after })}</p>
    ${body}
    ${versions > 1 ? `<button class="btn btn-ghost btn-small" type="button" data-history>${t('Comparar com outra versão ({n})', { n: versions - 1 })}</button>` : ''}
  </section>`;
  return { html, mons };
}

/** Primeira vez que o save é aberto: o histórico começa agora. */
export function historyStartWin() {
  // Primeira versão guardada: ainda não há o que comparar, então só uma linha (o resto num toque)
  return `<details class="win win-fold changes changes-first">
    <summary class="win-title"><h2 id="changes-h">${t('O que mudou')}</h2><small>${t('versão guardada')}</small></summary>
    <p class="hint">${t('Esta versão do save ficou guardada neste aparelho. Da próxima vez que você abrir o save depois de jogar, o app mostra aqui quem chegou, evoluiu, subiu de nível ou aprendeu golpes.')}</p>
  </details>`;
}

/** Lista de versões guardadas (janela "Histórico"). */
export function historyList(list, currentSig, baseId) {
  const rows = list.map(e => {
    const current = e.signature === currentSig;
    const tag = current ? `<span class="badge">${t('atual')}</span>` : e.id === baseId ? `<span class="badge">${t('comparando')}</span>` : '';
    return `<li class="hist-row">
      <span><b>${when(e.savedAt)}</b> ${tag}<small>${esc(e.name)} · ${t('{n} Pokémon', { n: e.total })} · ${t('save nº {n}', { n: e.saveIndex })}</small></span>
      ${current ? '' : `<button class="btn btn-small${e.id === baseId ? '' : ' btn-ghost'}" type="button" data-compare="${e.id}">${t('Comparar')}</button>`}
    </li>`;
  }).join('');
  return `<button class="btn btn-ghost btn-icon close" type="button" data-close aria-label="${t('Fechar')}">✕</button>
    <h2 class="pixel" id="history-title">${t('Histórico')}</h2>
    <p class="hint">${t('Cada vez que você abre o save depois de jogar, uma versão fica guardada neste aparelho (até 30).')}</p>
    <ul class="hist">${rows}</ul>
    <button class="btn btn-ghost btn-small" type="button" data-clear>${t('Apagar o histórico deste save')}</button>`;
}

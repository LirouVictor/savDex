// Janela "Equipes salvas" (em Ferramentas). Pacote carregado só quando há equipe salva ou ao salvar uma.

import { esc, monShort, typeChips } from '../ui/render.js';
import { iconSrc } from '../ui/sprites.js';
import { analyzeTeam } from '../analysis.js';
import { t, locale } from '../i18n.js';
import { TEAM_MAX } from './teams.js';

export * from './teams.js';

const when = ts => new Date(ts).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });

/** Onde o membro está agora (ou que não foi achado). */
function placeText(x) {
  const m = x.now;
  if (!m) return t('não está mais no save');
  const place = m.location === 'party' ? t('na equipe, posição {n}', { n: m.slot }) : t('{box}, posição {n}', { box: m.where, n: m.slot });
  return m.speciesId !== x.saved.speciesId ? `${t('evoluiu de {name}', { name: x.saved.species.name })} · ${place}` : place;
}

const icon = (m, cls = '') => {
  const sp = m.species;
  return `<img data-sprite="1" src="${esc(iconSrc(sp))}" class="${[sp.hasIcon ? 'ico' : '', cls].filter(Boolean).join(' ')}" alt="" decoding="async" loading="lazy" crossorigin="anonymous">`;
};

function teamBody(team, located, ti, T) {
  const found = located.filter(x => x.now).map(x => x.now);
  const rows = located.map((x, mi) => {
    const m = x.now || x.saved;
    const inner = `${icon(m)}<span><b>${monShort(m)}${m.shiny ? ' <span class="shiny">★</span>' : ''}</b>
      <small>${m.level ? `${t('Nv.')} ${m.level} · ` : ''}${esc(placeText(x))}</small></span>`;
    return x.now
      ? `<li><button class="ch-mon" type="button" data-team-mon="${ti}:${mi}">${inner}</button></li>`
      : `<li><div class="ch-mon team-gone">${inner}</div></li>`;
  }).join('');
  let facts = '';
  if (found.length) {
    const a = analyzeTeam(found, { types: T.types, chart: T.typechart });
    const triple = a.defense.filter(r => r.weak.length >= 3).map(r => r.type);
    facts = `<p class="k-line">${t('Tipos que acertam 3 ou mais em cheio:')} ${triple.length ? typeChips(triple) : t('nenhum')}</p>
      <p class="k-line">${t('Nenhum golpe super efetivo contra:')} ${a.gaps.length ? typeChips(a.gaps) : t('nenhum')}</p>`;
  }
  return `<ul class="ch-list team-mons">${rows}</ul>
    ${facts}
    <div class="export-btns team-actions">
      <button class="btn btn-ghost btn-small" type="button" data-team-copy="${ti}">${t('Copiar (Showdown)')}</button>
      ${found.length ? `<button class="btn btn-ghost btn-small" type="button" data-team-img="${ti}">${t('Imagem da equipe')}</button>` : ''}
      <button class="btn btn-ghost btn-small" type="button" data-team-rename="${ti}">${t('Renomear')}</button>
      <button class="btn btn-ghost btn-small" type="button" data-team-del="${ti}">${t('Apagar')}</button>
    </div>`;
}

/**
 * @param {object[]} teams equipes salvas deste save (da mais nova para a mais antiga)
 * @param {Array<Array<{saved: object, now: object|null}>>} located resultado de locateTeam para cada uma
 * @param {object} T tabelas (tipos)
 * @param {number|null} [openId] equipe que fica aberta
 */
export function teamsWin(teams, located, T, openId = null) {
  const items = teams.map((team, ti) => {
    const gone = located[ti].filter(x => !x.now).length;
    const src = team.source === 'ai' ? t('montada pela IA') : t('equipe do save');
    return `<li><details class="fold team" data-team="${team.id}"${team.id === openId ? ' open' : ''}>
      <summary><span class="team-head"><b>${esc(team.name)}</b>
        <small>${esc(when(team.createdAt))} · ${src}${gone ? ` · ${t(gone === 1 ? '1 fora do save' : '{n} fora do save', { n: gone })}` : ''}</small></span>
        <span class="team-icons" aria-hidden="true">${located[ti].map(x => icon(x.now || x.saved, x.now ? '' : 'gone')).join('')}</span></summary>
      ${teamBody(team, located[ti], ti, T)}
    </details></li>`;
  }).join('');
  return `<section class="win" id="teams-win" aria-labelledby="teams-h">
    <div class="win-title"><h2 id="teams-h">${t('Equipes salvas')}</h2><small>${t('{n} de {max}', { n: teams.length, max: TEAM_MAX })}</small></div>
    <p class="hint">${t('Ficam só neste aparelho. Ao abrir uma versão mais nova do save, o app mostra onde cada membro está agora.')}</p>
    <ul class="teams">${items}</ul>
  </section>`;
}

// Telas dos resultados da IA. Os Pokémon citados são desenhados com os dados do save (não com o texto da IA).

import { esc, typeChips, monShort } from '../ui/render.js';
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
  const lost = dropped.length
    ? `<p class="hint">${esc(t('A IA citou Pokémon que não existem no save ({list}); essas partes foram ignoradas.', { list: dropped.join(', ') }))}</p>`
    : '';
  const lite = opts && opts.lite && opts.lite.length
    ? `<p class="hint">${esc(t('O modelo escolhido estava sobrecarregado: a resposta veio de um modelo mais leve ({list}), que pode ser menos preciso. Vale tentar de novo mais tarde.', { list: opts.lite.join(', ') }))}</p>`
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

export function buildView(r, byRef, model, T, opts = null) {
  const mons = r.membros.map(x => byRef.get(x.ref));
  const cards = r.membros.map((x, i) => {
    const m = mons[i];
    return `<li><button class="ai-member${typeClass(m)}" type="button" data-ref="${esc(x.ref)}" aria-label="${esc(t('Ver {name}', { name: monShort(m) }))}">
      <span class="ai-member-art">${sprite(m, 80)}<span class="ai-num">${i + 1}</span></span>
      <span class="ai-member-body">
        ${x.papel ? `<span class="ai-role">${esc(x.papel)}</span>` : ''}
        <b class="ai-member-name">${monShort(m)}</b>
        <small>${esc(where(m))}</small>
        ${typeChips(m.species.types)}
        <span class="ai-why">${rich(x.motivo, byRef)}</span>
      </span>
    </button></li>`;
  }).join('');
  // Conferência do próprio app (as mesmas contas da análise), para não depender só do texto da IA
  const issues = mons.length ? buildIssues(mons, T) : [];
  const warn = issues.length ? `<p class="ai-warn"><b>${t('Fora dos critérios pedidos:')}</b> ${issues.map(esc).join(' ')}</p>` : '';
  const gap = levelGap(mons);
  const check = mons.length ? warn + bullets([...teamFacts(mons, T).split('\n'), ...(gap ? [gap] : [])], byRef) : '';
  const short = r.membros.length < 6 ? `<p class="hint">${t('A IA sugeriu só {n} Pokémon válidos.', { n: r.membros.length })}</p>` : '';
  const dicas = r.dicas.length ? `<ol class="ai-steps-list">${r.dicas.map(x => `<li>${rich(x, byRef)}${checksHtml(x, byRef, opts && { ...opts, T })}</li>`).join('')}</ol>` : '';
  return `<div class="ai-result">
    <div class="ai-hero build">
      <div class="ai-hero-text">
        <p class="ai-kicker">${t('Equipe sugerida')}</p>
        <p class="ai-team-name">${esc(r.nome)}</p>
      </div>
      <button class="btn btn-ghost btn-small" type="button" data-ai-copy>${t('Copiar (Showdown)')}</button>
    </div>
    ${r.resumo ? `<p class="ai-summary">${rich(r.resumo, byRef)}</p>` : ''}
    <ul class="ai-members">${cards}</ul>
    ${short}
    <div class="ai-cols">
      ${panel('Pontos fortes', 'good', bullets(r.pontos_fortes, byRef))}
      ${panel('Pontos fracos', 'bad', bullets(r.pontos_fracos, byRef))}
    </div>
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
      : '(de {total}: os de maior total de stats base, um por espécie)', { total: counts.pcTotal }) : '')
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
  <label class="ai-skip"><input type="checkbox" data-skip> ${t('Não perguntar de novo neste aparelho')}</label>
  <div class="export-btns ai-confirm-btns">
    <button class="btn btn-ghost" type="button" data-cancel>${t('Cancelar')}</button>
    <button class="btn" type="button" data-send>${esc(t('Enviar ao {service}', { service: P.service }))}</button>
  </div>`;
}

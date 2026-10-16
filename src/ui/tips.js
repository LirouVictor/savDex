// Descrição de golpes e habilidades ao tocar no nome, em qualquer tela (detalhe, Pokédex, montador...).
// Os textos ficam em pacotes à parte, carregados só no primeiro toque:
//   - golpes: move-text.json (pokeemerald-expansion, pelo ID do app);
//   - habilidades: ability-text.json (expansion, pelo nome) e, no SoulGold, as da ROM (soulgold-ability-text.json);
//   - jogos oficiais: o texto da época (text-gen3/4/5.json, PokeAPI: Emerald, Platinum, Black 2/White 2).
// Um elemento vira gatilho com data-tip="m:<id ou nome do golpe>" ou data-tip="a:<nome da habilidade>".

import { t } from '../i18n.js';
import { moveInfo } from '../parser/describe.js';
import { typeChip } from './render.js';

const ERA = { emerald: 3, rs: 3, frlg: 3, dp: 4, pt: 4, hgss: 4, bw: 5, b2w2: 5 };
const ERA_NAME = { 3: 'Emerald', 4: 'Platinum', 5: 'Black 2/White 2' };
export const normName = s => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

const cache = new Map();
const load = (key, imp) => {
  if (!cache.has(key)) cache.set(key, imp().then(m => m.default).catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
};
const moveTexts = () => load('moves', () => import('../data/move-text.json'));
const abilityTexts = () => load('abilities', () => import('../data/ability-text.json'));
const soulgoldAbilities = () => load('sg', () => import('../data/soulgold-ability-text.json'));
const eraTexts = gen => load(`gen${gen}`, () => (gen === 3 ? import('../data/text-gen3.json') : gen === 4 ? import('../data/text-gen4.json') : import('../data/text-gen5.json')));

// Nome do golpe → ID do app (o montador e as estatísticas de uso só têm o nome)
let byName = null, byNameT = null;
function moveIdByName(name, T) {
  if (byNameT !== T) {
    byName = new Map();
    T.moves.forEach((row, id) => { if (row) byName.set(normName(row[0]), id); });
    if (T.quetzal) for (const [id, n] of Object.entries(T.quetzal.moveNames || {})) byName.set(normName(n), +id);
    byNameT = T;
  }
  return byName.get(normName(name)) ?? null;
}

/** Descrição de um golpe no jogo do save: { text, note } (text null = sem descrição). */
export async function moveText(id, { game, T }) {
  const gen = ERA[game];
  if (gen && id > 0) {
    const era = await eraTexts(gen);
    if (era.moves[id]) return { text: era.moves[id], note: t('Texto do {game}.', { game: ERA_NAME[gen] }) };
  }
  const text = id > 0 ? (await moveTexts())[id] || null : null;
  return { text, note: text && game === 'unbound' ? t('Texto do pokeemerald-expansion; o Unbound pode ter mudado o golpe.') : null };
}

/** Descrição de uma habilidade no jogo do save: { text, note }. */
export async function abilityText(name, { game }) {
  const k = normName(name);
  const gen = ERA[game];
  if (gen) {
    const era = await eraTexts(gen);
    if (era.abilities[k]) return { text: era.abilities[k], note: t('Texto do {game}.', { game: ERA_NAME[gen] }) };
  }
  if (game === 'soulgold') {
    const sg = await soulgoldAbilities();
    if (sg[k]) return { text: sg[k], note: null };
  }
  const text = (await abilityTexts())[k] || null;
  const unsure = game === 'unbound' || game === 'soulgold';
  return { text, note: text && unsure ? t('Texto do pokeemerald-expansion; este jogo pode ter mudado a habilidade.') : null };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CATEGORY = ['Físico', 'Especial', 'Status'];

let tip = null, anchor = null, closedOn = null;

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = 'tip';
  tip.className = 'tip';
  tip.setAttribute('popover', 'auto');
  tip.setAttribute('role', 'dialog');
  document.body.append(tip);
  tip.addEventListener('toggle', e => {
    if (e.newState === 'closed') { if (anchor) anchor.setAttribute('aria-expanded', 'false'); anchor = null; }
  });
  return tip;
}

// O balão fica embaixo do nome (ou em cima, sem espaço), dentro da tela
function place(el) {
  const r = el.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  tip.style.width = `${w}px`;
  tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  tip.style.top = '0px';
  const h = tip.offsetHeight;
  const below = r.bottom + 6, above = r.top - h - 6;
  tip.style.top = `${below + h <= window.innerHeight - 8 || above < 8 ? below : above}px`;
}

async function show(el, ctx) {
  ensureTip();
  const [kind, ...rest] = el.dataset.tip.split(':');
  const key = rest.join(':');
  let title = key, meta = '', type = null, res;
  if (kind === 'm') {
    const id = /^-?\d+$/.test(key) ? +key : moveIdByName(key, ctx.T);
    const info = id !== null && id !== 0 ? moveInfo(id, ctx.T) : null;
    if (info) {
      title = info.name;
      type = info.type;
      meta = [info.category !== null && info.category !== undefined ? t(CATEGORY[info.category]) : '',
        info.power ? `${t('Poder')} ${info.power}` : '', info.accuracy ? `${t('Precisão')} ${info.accuracy}%` : ''].filter(Boolean).join(' · ');
    }
    res = id !== null ? moveText(id, ctx) : Promise.resolve({ text: null });
  } else {
    res = abilityText(key, ctx);
  }
  anchor = el;
  el.setAttribute('aria-expanded', 'true');
  tip.innerHTML = `<p class="tip-h"><b>${esc(title)}</b>${type || meta ? `<small>${type ? typeChip(type) : ''}${meta ? ` ${esc(meta)}` : ''}</small>` : ''}</p><p class="tip-text">…</p>`;
  if (!tip.matches(':popover-open')) tip.showPopover();
  place(el);
  let r;
  try { r = await res; } catch { r = { text: null, offline: true }; }
  if (anchor !== el) return;
  const none = r.offline ? t('Não deu para carregar a descrição (sem conexão?).')
    : kind === 'm' ? t('Sem descrição para este golpe.') : t('Sem descrição para esta habilidade.');
  tip.querySelector('.tip-text').textContent = r.text || none;
  if (r.note) tip.insertAdjacentHTML('beforeend', `<p class="tip-note">${esc(r.note)}</p>`);
  place(el);
}

/** Liga os gatilhos da página inteira. `ctx()` devolve { game, T } do save aberto. */
export function installTips(ctx) {
  // O toque fora fecha o balão (popover "auto") antes do clique: tocar de novo no mesmo nome só fecha
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    closedOn = el && el === anchor ? el : null;
  }, true);
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (closedOn === el || (anchor === el && tip && tip.matches(':popover-open'))) {
      closedOn = null;
      if (tip.matches(':popover-open')) tip.hidePopover();
      return;
    }
    show(el, ctx()).catch(err => console.error(err));
  }, true);
  window.addEventListener('resize', () => { if (anchor && tip.matches(':popover-open')) place(anchor); });
  // Ao rolar, o balão acompanha o nome; some quando o nome sai da tela
  document.addEventListener('scroll', () => {
    if (!anchor || !tip || !tip.matches(':popover-open')) return;
    const r = anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) tip.hidePopover(); else place(anchor);
  }, true);
}

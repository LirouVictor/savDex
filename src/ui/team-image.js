// Imagem da equipe (PNG) para compartilhar: desenhada num canvas, no próprio aparelho.
// Carregada só quando o usuário toca em "Imagem da equipe". Sprites do PokeAPI/sprites (CORS liberado);
// sem internet, quem não estiver no cache vira silhueta.

import { spriteSrc, SILHOUETTE } from './sprites.js';
import { t } from '../i18n.js';

const W = 1080, PAD = 36, GAP = 24, HEAD = 168, STRIP = 64, CARD_H = 336, FOOT = 72;
const C = { red: '#ff7a6b', bg: '#e8e2cf', win: '#fbf8ee', win2: '#f1ecdb', edge: '#2b3350', ink: '#1c2034', muted: '#565d78', accent: '#23735f', gold: '#9a6a00', head: '#2b3350', headInk: '#fbf8ee', mint: '#8fe3c6', female: '#c0392b', male: '#2c62b8' };
const FONT = 'Silkscreen, ui-monospace, monospace';

/** Cor de fundo e do texto de cada tipo, lidas do CSS (mesma paleta da interface). */
function typeColors(type) {
  const el = document.createElement('span');
  el.className = `t-${type || 'none'}`;
  el.style.display = 'none';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = { bg: cs.getPropertyValue('--t').trim() || '#9a9781', ink: cs.getPropertyValue('--tf').trim() || '#fff' };
  el.remove();
  return out;
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Sprite shiny → normal → silhueta, como na interface. */
async function sprite(m) {
  const sp = m.species;
  for (const src of [spriteSrc(sp, m.shiny), spriteSrc(sp), SILHOUETTE]) {
    const img = await loadImage(src);
    if (img) return img;
  }
  return null;
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

/** Diminui a fonte até o texto caber (nomes longos como BASCULEGION); só corta se nem no menor tamanho couber. */
function fitSize(ctx, text, max, weight, size, min) {
  for (let px = size; px >= min; px -= 2) {
    ctx.font = `${weight} ${px}px ${FONT}`;
    if (ctx.measureText(text).width <= max) return text;
  }
  return fit(ctx, text, max);
}

function box(ctx, x, y, w, h, fill, border = C.edge, bw = 4) {
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + bw, y + bw, w - 2 * bw, h - 2 * bw);
}

/** Etiqueta colorida (tipo ou golpe); devolve a largura usada. */
function tag(ctx, text, x, y, colors, size = 18, maxW = 400) {
  ctx.font = `700 ${size}px ${FONT}`;
  const label = fit(ctx, text.toUpperCase(), maxW - 16);
  const w = Math.ceil(ctx.measureText(label).width) + 16;
  const h = size + 12;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.fillRect(x, y + h - 3, w, 3);
  ctx.fillStyle = colors.ink;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 8, y + h / 2);
  return w;
}

function card(ctx, m, img, x, y, w) {
  const sp = m.species;
  const tc = typeColors(sp.types[0]);
  box(ctx, x, y, w, CARD_H, C.win);
  // Sprite num quadro com a cor do tipo
  const S = 192;
  ctx.fillStyle = tc.bg;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(x + 16, y + 16, S, S);
  ctx.globalAlpha = 1;
  if (img) ctx.drawImage(img, x + 16, y + 16, S, S);
  const tx = x + 16 + S + 16, tw = w - (tx - x) - 16;
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.ink;
  const name = m.hasNickname ? m.nickname : sp.name;
  ctx.fillText(fitSize(ctx, name.toUpperCase(), tw, 700, 30, 20), tx, y + 20);
  ctx.font = `400 18px ${FONT}`;
  ctx.fillStyle = C.muted;
  let ly = y + 58;
  if (m.hasNickname) { ctx.fillText(fit(ctx, sp.name, tw), tx, ly); ly += 26; }
  // Nível, gênero e shiny
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = C.accent;
  const lv = m.level ? `${t('Nv.')} ${m.level}` : '';
  ctx.fillText(lv, tx, ly);
  let mx = tx + ctx.measureText(lv).width + 12;
  if (m.gender && m.gender.symbol) {
    ctx.fillStyle = m.gender.symbol === '♀' ? C.female : C.male;
    ctx.font = `700 24px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(m.gender.symbol, mx, ly - 2);
    mx += 26;
  }
  if (m.shiny) { ctx.fillStyle = C.gold; ctx.font = `700 24px ui-sans-serif, system-ui, sans-serif`; ctx.fillText('★', mx, ly - 2); }
  ly += 34;
  let tx2 = tx;
  for (const type of sp.types) tx2 += tag(ctx, type, tx2, ly, typeColors(type), 16) + 6;
  ly += 40;
  // Item, habilidade e natureza
  ctx.font = `400 17px ${FONT}`;
  const facts = [
    m.item ? m.item.name : null,
    m.ability ? m.ability.name : null,
    m.nature ? m.nature.name : null,
  ].filter(Boolean);
  for (const f of facts) {
    ctx.fillStyle = C.ink;
    ctx.fillText(fit(ctx, f, tw), tx, ly);
    ly += 24;
  }
  // Golpes, 2 por linha
  const mw = (w - 32 - 8) / 2;
  m.moves.slice(0, 4).forEach((mv, i) => {
    const cx = x + 16 + (i % 2) * (mw + 8), cy = y + 16 + S + 16 + Math.floor(i / 2) * 50;
    const col = typeColors(mv.type);
    ctx.fillStyle = col.bg;
    ctx.fillRect(cx, cy, mw, 42);
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.fillRect(cx, cy + 39, mw, 3);
    ctx.fillStyle = col.ink;
    ctx.font = `700 17px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, mv.name.toUpperCase(), mw - 20), cx + 10, cy + 20);
    ctx.textBaseline = 'top';
  });
}

/**
 * Faixa abaixo do cabeçalho com o tempo de jogo e as insígnias (pinos), só com o que foi lido do save.
 * Dado provável leva a marca "provável" também na imagem.
 */
function summaryStrip(ctx, s, y) {
  ctx.fillStyle = '#222a44';
  ctx.fillRect(0, y, W, STRIP);
  ctx.textBaseline = 'middle';
  const cy = y + STRIP / 2;
  let x = PAD;
  const label = text => {
    ctx.font = `400 18px ${FONT}`;
    ctx.fillStyle = C.mint;
    ctx.fillText(text.toUpperCase(), x, cy);
    x += ctx.measureText(text.toUpperCase()).width + 12;
  };
  const value = (text, f) => {
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = C.headInk;
    ctx.fillText(text, x, cy);
    x += ctx.measureText(text).width + 40;
    if (f.confidence === 'provável') {
      x -= 30;
      ctx.font = `400 15px ${FONT}`;
      ctx.fillStyle = '#e8c060';
      const p = `(${t('provável')})`;
      ctx.fillText(p, x, cy + 2);
      x += ctx.measureText(p).width + 40;
    }
  };
  if (s.playTime) {
    label(t('Tempo de jogo'));
    value(`${s.playTime.h}h ${String(s.playTime.m).padStart(2, '0')}m`, s.playTime);
  }
  if (s.badges) {
    label(t('Insígnias'));
    value(`${s.badges.count}/${s.badges.total}`, s.badges);
    x -= 28;
    // Pinos (losangos): cheios = insígnias ganhas
    const size = s.badges.total > 8 ? 7 : 10, step = 2 * size + (s.badges.total > 8 ? 4 : 6);
    for (let i = 0; i < s.badges.total && x + 2 * size < W - PAD; i++, x += step) {
      ctx.fillStyle = i < s.badges.count ? C.red : 'rgba(255,255,255,.25)';
      ctx.beginPath();
      ctx.moveTo(x + size, cy - size);
      ctx.lineTo(x + 2 * size, cy);
      ctx.lineTo(x + size, cy + size);
      ctx.lineTo(x, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Desenha a imagem da equipe.
 * @param {object} data dados do save (describe)
 * @param {{ mons?: object[], title?: string }} [opts] outra lista de Pokémon (ex.: equipe sugerida pela IA)
 * @returns {Promise<Blob>}
 */
export async function teamImage(data, opts = {}) {
  const mons = (opts.mons || data.party).slice(0, 6);
  const rows = Math.max(1, Math.ceil(mons.length / 2));
  const s = data.summary || {};
  const strip = s.playTime || s.badges ? STRIP : 0;
  const top = HEAD + strip;
  const H = top + PAD + rows * CARD_H + (rows - 1) * GAP + PAD + FOOT;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  await Promise.all([document.fonts.load(`400 20px Silkscreen`), document.fonts.load(`700 20px Silkscreen`)]).catch(() => {});
  const [logo, ...imgs] = await Promise.all([loadImage('./icons/icon-192.png'), ...mons.map(sprite)]);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // Cabeçalho: logo, treinador e jogo
  ctx.fillStyle = C.head;
  ctx.fillRect(0, 0, W, HEAD);
  if (strip) summaryStrip(ctx, s, HEAD);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, top - 8, W, 8);
  if (logo) ctx.drawImage(logo, PAD, 24, 112, 112);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.headInk;
  ctx.font = `700 46px ${FONT}`;
  const title = opts.title || data.trainer.name || '—';
  ctx.fillText(fit(ctx, title.toUpperCase(), W - PAD * 2 - 140), PAD + 136, 34);
  ctx.font = `400 22px ${FONT}`;
  ctx.fillStyle = C.mint;
  const sub = [data.game ? data.game.name : '', `ID ${String(data.trainer.tid).padStart(5, '0')}`].filter(Boolean).join(' · ');
  ctx.fillText(fit(ctx, sub, W - PAD * 2 - 140), PAD + 136, 98);

  const cw = (W - PAD * 2 - GAP) / 2;
  mons.forEach((m, i) => card(ctx, m, imgs[i], PAD + (i % 2) * (cw + GAP), top + PAD + Math.floor(i / 2) * (CARD_H + GAP), cw));

  // Rodapé
  ctx.fillStyle = C.muted;
  ctx.font = `400 20px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(t('Feito com savDex · savdex.pages.dev'), W / 2, H - FOOT / 2 - 6);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
}


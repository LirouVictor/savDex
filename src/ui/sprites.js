// URLs de sprites (repositório PokeAPI/sprites) e fallback para silhueta.

export const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

// Silhueta genérica original (pixel art 16×16), usada quando não há sprite correspondente.
export const SILHOUETTE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">' +
  '<path fill="#7d84a0" d="M6 2h4v1h1v1h1v3h1v4h-1v2h-1v1H5v-1H4v-2H3V7h1V4h1V3h1z"/>' +
  '<path fill="#fbf8ee" d="M7 5h2v1h1v2H9v1H8V8h1V6H7v1H6V6h1zM8 10h1v1H8z"/></svg>');

export const spriteUrl = id => `${SPRITE_BASE}/${id}.png`;
/** Imagem de uma insígnia (sprites/badges/N.png do mesmo repositório; números em parser/summary.js). */
export const badgeUrl = id => `${SPRITE_BASE.replace(/\/pokemon$/, '')}/badges/${id}.png`;
// Ícones de menu da Gen 8. O PokeAPI/sprites apagou a pasta generation-viii/icons em 2026-10-16 (commit 6e7928d,
// "remove stale sprites"; a nova sword-shield/icons não tem as espécies fora do Sword/Shield nem as megas): os ícones
// vêm do último commit que ainda tinha a pasta. Ícone que falhar cai no sprite grande (installImageFallback).
export const ICON_COMMIT = 'ba403973fdf9d0ac59175813861e6a1f8ed5020c';
export const iconUrl = id => `${SPRITE_BASE.replace('/master/', `/${ICON_COMMIT}/`)}/versions/generation-viii/icons/${id}.png`;
const ICON_RE = /\/versions\/generation-viii\/icons\/(\d+)\.png$/;

/** Sprite grande (96×96) para a espécie; silhueta se não houver correspondência. */
export function spriteSrc(sp, shiny = false) {
  if (!sp.spriteId) return SILHOUETTE;
  return shiny ? `${SPRITE_BASE}/shiny/${sp.spriteId}.png` : spriteUrl(sp.spriteId);
}

/** Ícone de menu para o PC: ícone da Gen 8 quando existe, senão o sprite reduzido. */
export function iconSrc(sp) {
  if (!sp.spriteId) return SILHOUETTE;
  return sp.hasIcon ? iconUrl(sp.spriteId) : spriteUrl(sp.spriteId);
}

/** Se uma imagem de sprite falhar (offline, 404), troca pela silhueta; a de uma insígnia, por um losango. */
export function installImageFallback(root = document) {
  root.addEventListener('error', e => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.classList.contains('bdg')) {
      const pin = document.createElement('i');
      pin.className = `bdg bdg-pin ${img.classList.contains('off') ? 'off' : 'got'}`;
      img.replaceWith(pin);
      return;
    }
    if (!(img instanceof HTMLImageElement) || !img.dataset.sprite) return;
    // Ícone que falta: tenta o sprite grande da mesma forma antes da silhueta (vale para todas as telas).
    const icon = !img.dataset.next && ICON_RE.exec(img.src);
    const next = img.dataset.next || (icon ? spriteUrl(icon[1]) : '');
    if (next && next !== img.src) { img.dataset.next = icon ? SILHOUETTE : ''; img.classList.remove('ico'); img.src = next; }
    else if (img.src !== SILHOUETTE) img.src = SILHOUETTE;
  }, true);
}

/**
 * Centraliza o Pokémon nas imagens marcadas com `data-fit` (lista da Pokédex, barra do detalhe): o ícone de menu e o
 * sprite grande deixam o desenho num canto, com muita sobra. Ao carregar, acha a área desenhada (pixels não
 * transparentes) e mostra só uma janela centrada nela (`object-view-box`), do mesmo tamanho para todos os ícones,
 * para o tamanho de cada Pokémon continuar comparável; o que não cabe na janela é reduzido inteiro.
 */
export function installIconFit(root = document) {
  let ctx = null;
  root.addEventListener('load', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-fit')) return;
    img.style.objectViewBox = '';
    if (img.src.startsWith('data:')) return;
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H || W > 128 || H > 128) return;
    try {
      ctx ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      ctx.canvas.width = W; ctx.canvas.height = H;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] < 16) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x1 < 0) return;
      // Janela com a proporção da imagem na tela: no ícone (68 × 56), 48 × 40 de base; no sprite grande, só o desenho
      const ratio = img.clientWidth && img.clientHeight ? img.clientWidth / img.clientHeight : 1.2;
      let w = x1 - x0 + 3, h = y1 - y0 + 3;
      if (img.classList.contains('ico')) { w = Math.max(w, 48); h = Math.max(h, 40); }
      if (w / h > ratio) h = w / ratio; else w = h * ratio;
      // Centrada no desenho mesmo que passe da borda da imagem (inset negativo = área transparente)
      const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
      const l = cx - w / 2, t = cy - h / 2;
      img.style.objectViewBox = `inset(${t.toFixed(1)}px ${(W - l - w).toFixed(1)}px ${(H - t - h).toFixed(1)}px ${l.toFixed(1)}px)`;
    } catch { /* sem CORS ou sem canvas: fica o recorte fixo do CSS */ }
  }, true);
}

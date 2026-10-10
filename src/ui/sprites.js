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
export const iconUrl = id => `${SPRITE_BASE}/versions/generation-viii/icons/${id}.png`;

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

/** Se uma imagem de sprite falhar (offline, 404), troca pela silhueta. */
export function installImageFallback(root = document) {
  root.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.sprite) return;
    const next = img.dataset.next;
    if (next) { img.dataset.next = ''; img.classList.remove('ico'); img.src = next; }
    else if (img.src !== SILHOUETTE) img.src = SILHOUETTE;
  }, true);
}

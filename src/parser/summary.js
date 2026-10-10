// Resumo do save (tempo de jogo, dinheiro, insígnias, Pokédex): peças comuns aos leitores de cada jogo.
// Cada campo leva a confiança ('confirmado' ou 'provável'); campo que não foi lido simplesmente não existe.

/** Quantos bits ligados entre os bits from e from + n (bit i = bit i % 8 do byte start + i / 8). */
export function countBits(u8, start, n, from = 0) {
  let c = 0;
  for (let i = from; i < from + n; i++) if ((u8[start + (i >> 3)] >> (i & 7)) & 1) c++;
  return c;
}

/** Os n bits a partir do bit `from` (bit i = bit i % 8 do byte start + i / 8), como true/false. */
export function bitList(u8, start, n, from = 0) {
  return Array.from({ length: n }, (_, k) => !!((u8[start + ((from + k) >> 3)] >> ((from + k) & 7)) & 1));
}

/**
 * Número da primeira insígnia de cada região nas imagens do PokeAPI/sprites (sprites/badges/N.png), na ordem dos
 * ginásios: Kanto 1–8, Johto 9–16, Hoenn 17–24, Sinnoh 25–32. A ordem dos bits no save é a mesma (conferido nas
 * telas do Quetzal e do SoulGold no emulador). Unova (a ordem das imagens não é a dos ginásios) e regiões próprias
 * (Borrius, do Unbound) ficam sem ícone.
 */
export const BADGE_ICONS = { kanto: 1, johto: 9, hoenn: 17, sinnoh: 25 };

/**
 * Insígnias do resumo: quantas, quais (`got`, na ordem dos ginásios) e, quando a região é conhecida, o número da
 * imagem de cada uma (`icons`).
 * @param {boolean[]} got
 * @param {string[]|null} [regions] regiões em ordem (ex.: ['johto', 'kanto'] no HG/SS), 8 insígnias cada
 */
export function badgeSummary(got, regions = null, confidence = 'confirmado') {
  const icons = regions ? regions.flatMap(r => Array.from({ length: 8 }, (_, i) => BADGE_ICONS[r] + i)) : null;
  return { count: got.filter(Boolean).length, total: got.length, confidence, got, ...(icons && icons.length === got.length ? { icons } : {}) };
}

/** Números das espécies com o bit ligado (bit n − 1 = espécie n), de 1 a total. */
export function dexBits(u8, start, total) {
  const out = [];
  for (let n = 1; n <= total; n++) if ((u8[start + ((n - 1) >> 3)] >> ((n - 1) & 7)) & 1) out.push(n);
  return out;
}

/**
 * Pokédex do resumo: capturados (números da Dex Nacional), vistos quando o jogo foi conferido, e a lista
 * de espécies da Pokédex do jogo quando não é 1..total (SoulGold: a de Johto).
 */
export function dexSummary(caught, total, { seen = null, list = null, owned = caught.length } = {}) {
  return { owned, total, confidence: 'confirmado', caught, ...(seen ? { seen } : {}), ...(list ? { list } : {}) };
}

/** Tempo de jogo, só se os minutos e segundos fizerem sentido. */
export function playTime(h, m, s, confidence) {
  return m < 60 && s < 60 ? { h, m, s, confidence } : null;
}

/** Tira os campos não lidos (null). */
export function summary(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
}

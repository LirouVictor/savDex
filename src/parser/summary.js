// Resumo do save (tempo de jogo, dinheiro, insígnias, Pokédex): peças comuns aos leitores de cada jogo.
// Cada campo leva a confiança ('confirmado' ou 'provável'); campo que não foi lido simplesmente não existe.

/** Quantos bits ligados entre os bits from e from + n (bit i = bit i % 8 do byte start + i / 8). */
export function countBits(u8, start, n, from = 0) {
  let c = 0;
  for (let i = from; i < from + n; i++) if ((u8[start + (i >> 3)] >> (i & 7)) & 1) c++;
  return c;
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
export function dexSummary(caught, total, { seen = null, list = null } = {}) {
  return { owned: caught.length, total, confidence: 'confirmado', caught, ...(seen ? { seen } : {}), ...(list ? { list } : {}) };
}

/** Tempo de jogo, só se os minutos e segundos fizerem sentido. */
export function playTime(h, m, s, confidence) {
  return m < 60 && s < 60 ? { h, m, s, confidence } : null;
}

/** Tira os campos não lidos (null). */
export function summary(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
}

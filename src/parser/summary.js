// Resumo do save (tempo de jogo, dinheiro, insígnias, Pokédex): peças comuns aos leitores de cada jogo.
// Cada campo leva a confiança ('confirmado' ou 'provável'); campo que não foi lido simplesmente não existe.

/** Quantos bits ligados entre os bits from e from + n (bit i = bit i % 8 do byte start + i / 8). */
export function countBits(u8, start, n, from = 0) {
  let c = 0;
  for (let i = from; i < from + n; i++) if ((u8[start + (i >> 3)] >> (i & 7)) & 1) c++;
  return c;
}

/** Tempo de jogo, só se os minutos e segundos fizerem sentido. */
export function playTime(h, m, s, confidence) {
  return m < 60 && s < 60 ? { h, m, s, confidence } : null;
}

/** Tira os campos não lidos (null). */
export function summary(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null));
}

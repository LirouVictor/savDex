// Referência competitiva do montador: as estatísticas de uso do Smogon (src/data/smogon/*.json, geradas por
// `npm run smogon`). Por enquanto só mede as equipes (teste de comparação); a nota do montador não usa.
//
// Sinergia de uma dupla = log2 do lift suavizado (quantas vezes as duas aparecem juntas nos times do competitivo além do
// acaso): 0 = acaso, 1 = o dobro, 2 = 4×, −1 = metade. Dupla que não está na tabela com as duas espécies conhecidas =
// acaso (0): a tabela só guarda as mais fortes e as que mais se evitam de cada espécie.

/** Formatos de referência de cada jogo (o primeiro que tiver a dupla vale). */
const FORMATS = {
  quetzal: ['gen9nationaldex', 'gen9nationaldexubers'], soulgold: ['gen9nationaldex', 'gen9nationaldexubers'],
  unbound: ['gen8nationaldex'],
  emerald: ['gen3ou'], rs: ['gen3ou'], frlg: ['gen3ou'],
  dp: ['gen4ou'], pt: ['gen4ou'], hgss: ['gen4ou'],
  bw: ['gen5ou'], b2w2: ['gen5ou'],
};

export const smogonFormats = game => (game && FORMATS[game.id]) || [];

/** ID do Showdown: minúsculas, sem pontuação ("Raichu-Alola" → "raichualola"). */
export const toId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** IDs a procurar para uma espécie: o nome no Showdown, nome + forma e, numa mega sem dados próprios, a espécie base. */
function candidates(sp) {
  const out = [];
  if (sp.showdown) out.push(toId(sp.showdown));
  if (sp.form) out.push(toId(`${sp.name}-${sp.form}`));
  // A forma regional é outro Pokémon (Raichu de Alola não é o Raichu); a mega é o mesmo, com outra pedra
  if (!sp.form || /^(mega|primal)/i.test(sp.form)) out.push(toId(sp.name));
  return out;
}

/**
 * Índice das tabelas de um jogo.
 * @param {object[]} tables conteúdo de src/data/smogon/<formato>.json, na ordem de smogonFormats
 * @returns {{ find: (sp: object) => string|null, pair: (a: string, b: string) => number }}
 */
export function smogonIndex(tables) {
  const known = new Set();
  const pairs = new Map();
  for (const t of tables) {
    for (const id of t.ids) known.add(id);
    for (const [i, j, v] of t.pairs) {
      const a = t.ids[i], b = t.ids[j];
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!pairs.has(k)) pairs.set(k, v);
    }
  }
  return {
    find: sp => candidates(sp).find(id => known.has(id)) || null,
    pair: (a, b) => pairs.get(a < b ? `${a}|${b}` : `${b}|${a}`) || 0,
  };
}

/**
 * Sinergia competitiva de uma equipe: as duplas com as duas espécies conhecidas, a média do log2 do lift e quantas
 * aparecem juntas pelo menos o dobro do acaso (fortes) ou no máximo a metade (se evitam).
 * @param {object[]} species espécies da equipe (a forma de batalha: a mega, quando segura a pedra)
 */
export function pairSynergy(species, index) {
  const ids = species.map(sp => index.find(sp));
  let withData = 0, sum = 0, strong = 0, avoid = 0;
  const list = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (!ids[i] || !ids[j]) continue;
      const v = index.pair(ids[i], ids[j]);
      withData++;
      sum += v;
      if (v >= 1) strong++;
      if (v <= -1) avoid++;
      if (v) list.push({ a: ids[i], b: ids[j], v });
    }
  }
  return { known: ids.filter(Boolean).length, withData, mean: withData ? sum / withData : null, sum, strong, avoid, list: list.sort((x, y) => y.v - x.v) };
}

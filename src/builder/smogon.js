// Referência competitiva do montador: as estatísticas de uso do Smogon (src/data/smogon/*.json, geradas por
// `npm run smogon`). A nota do montador ganha a parte "Competitivo" com a soma das duplas da equipe (build.js).
//
// Sinergia de uma dupla = log2 do lift suavizado (quantas vezes as duas aparecem juntas nos times do competitivo além do
// acaso): 0 = acaso, 1 = o dobro, 2 = 4×, −1 = metade. Dupla que não está na tabela com as duas espécies conhecidas =
// acaso (0): a tabela só guarda as mais fortes e as que mais se evitam de cada espécie.

/** Formatos de referência de cada jogo (vale o primeiro que conhece as duas espécies da dupla). */
const FORMATS = {
  quetzal: ['gen9nationaldex', 'gen9nationaldexubers'], soulgold: ['gen9nationaldex', 'gen9nationaldexubers'],
  unbound: ['gen8nationaldex'],
  emerald: ['gen3ou'], rs: ['gen3ou'], frlg: ['gen3ou'],
  dp: ['gen4ou'], pt: ['gen4ou'], hgss: ['gen4ou'],
  bw: ['gen5ou'], b2w2: ['gen5ou'],
};

export const smogonFormats = game => (game && FORMATS[game.id]) || [];

/** Nome de cada formato para a tela (nomes do Smogon, iguais nos dois idiomas). */
const FORMAT_NAME = {
  gen3ou: 'Gen 3 OU', gen4ou: 'Gen 4 OU', gen5ou: 'Gen 5 OU', gen8nationaldex: 'Gen 8 National Dex',
  gen9nationaldex: 'Gen 9 National Dex', gen9nationaldexubers: 'National Dex Ubers',
};

// As tabelas ficam em pacotes à parte, carregados só ao montar equipes (de 5 a 25 KB compactados cada)
const LOAD = {
  gen3ou: () => import('../data/smogon/gen3ou.json'),
  gen4ou: () => import('../data/smogon/gen4ou.json'),
  gen5ou: () => import('../data/smogon/gen5ou.json'),
  gen8nationaldex: () => import('../data/smogon/gen8nationaldex.json'),
  gen9nationaldex: () => import('../data/smogon/gen9nationaldex.json'),
  gen9nationaldexubers: () => import('../data/smogon/gen9nationaldexubers.json'),
};
const loaded = new Map();

/** O índice do jogo do save (null se o jogo não tem formato de referência ou o pacote não carregou, ex.: offline). */
export async function loadSmogon(game) {
  const fs = smogonFormats(game);
  if (!fs.length) return null;
  const k = fs.join('+');
  if (!loaded.has(k)) {
    try {
      loaded.set(k, smogonIndex(await Promise.all(fs.map(f => LOAD[f]().then(m => m.default)))));
    } catch (err) {
      console.warn('Referência competitiva indisponível', err);
      return null; // sem guardar: tenta de novo na próxima montagem
    }
  }
  return loaded.get(k);
}

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
 * @returns {{ find, pair, partners, moves, matrix, label: string }} `find(sp)`: o ID da espécie (ou null); `moves(id)`: os golpes
 *   que os sets dela levam (Map ID do golpe → fração dos sets; null sem dados); `pair(a, b)`: a
 *   sinergia da dupla na primeira tabela que conhece as duas (Ubers só vale para quem não está na National Dex);
 *   `partners(a)`: as duplas guardadas da espécie (Map ID → sinergia); `matrix(ids)`: as duplas de uma lista de IDs numa
 *   matriz (para a nota, que roda dezenas de milhares de vezes)
 */
export function smogonIndex(tables) {
  const parts = tables.map(t => {
    const pairs = new Map();
    for (const [i, j, v] of t.pairs) pairs.set(pairKey(t.ids[i], t.ids[j]), v);
    return { t, known: new Set(t.ids), pairs };
  });
  const knows = id => parts.some(p => p.known.has(id));
  // Duplas de cada espécie (as mesmas de pair: a de um formato só vale se nenhum anterior conhece as duas), montadas na
  // primeira consulta
  let adj = null;
  const partners = a => {
    if (!adj) {
      adj = new Map();
      const put = (x, y, v) => (adj.get(x) || adj.set(x, new Map()).get(x)).set(y, v);
      parts.forEach((p, k) => {
        for (const [i, j, v] of p.t.pairs) {
          const x = p.t.ids[i], y = p.t.ids[j];
          if (parts.slice(0, k).some(q => q.known.has(x) && q.known.has(y))) continue;
          put(x, y, v); put(y, x, v);
        }
      });
    }
    return adj.get(a) || new Map();
  };
  // Golpes de cada espécie (o primeiro formato que a conhece): Map ID do golpe → fração dos sets, montado na consulta
  const moveCache = new Map();
  const moves = id => {
    if (!id) return null;
    if (moveCache.has(id)) return moveCache.get(id);
    let out = null;
    for (const p of parts) {
      const i = p.t.ids.indexOf(id);
      if (i < 0) continue;
      const flat = (p.t.moves && p.t.moves[i]) || [];
      out = new Map();
      for (let k = 0; k < flat.length; k += 2) out.set(flat[k], flat[k + 1]);
      break;
    }
    moveCache.set(id, out);
    return out;
  };
  return {
    partners,
    moves,
    label: `Smogon, ${tables.map(t => FORMAT_NAME[t.format] || t.format).join(' + ')}`, // "Smogon, Gen 9 National Dex + National Dex Ubers"
    find: sp => candidates(sp).find(knows) || null,
    pair: (a, b) => {
      for (const p of parts) if (p.known.has(a) && p.known.has(b)) return p.pairs.get(pairKey(a, b)) || 0;
      return 0;
    },
    matrix: ids => pairMatrix(ids, tables),
  };
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** M[a * K + b] = pair(ids[a], ids[b]), direto das duplas guardadas (sem testar as K² combinações). */
function pairMatrix(ids, tables) {
  const K = ids.length, M = new Float32Array(K * K), done = new Uint8Array(K * K);
  const pos = new Map(ids.map((id, i) => [id, i]));
  for (const t of tables) {
    const local = t.ids.map(id => (pos.has(id) ? pos.get(id) : -1));
    for (const [i, j, v] of t.pairs) {
      const a = local[i], b = local[j];
      if (a >= 0 && b >= 0 && !done[a * K + b]) M[a * K + b] = M[b * K + a] = v;
    }
    // As duplas que esta tabela conhece (guardadas ou acaso) não mudam nas seguintes
    const here = [...new Set(local.filter(x => x >= 0))];
    for (const a of here) for (const b of here) done[a * K + b] = 1;
  }
  return M;
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

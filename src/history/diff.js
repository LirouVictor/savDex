// Comparação entre duas versões do mesmo save: quem chegou, quem saiu, quem evoluiu, subiu de nível
// ou aprendeu golpes. Funções puras sobre o resultado de describe()/describeGen3().
//
// Como achar o mesmo Pokémon nas duas versões:
// - Gen 3 oficial: PID + OT ID (únicos e guardados na equipe e no PC).
// - Quetzal: o registro do PC não tem PID, então vale a "assinatura" do Pokémon, que não muda ao
//   evoluir nem ao trocar de lugar: IVs, natureza, número da habilidade, Poké Ball, shiny e gênero.
//   Pokémon com a mesma assinatura são pareados pela mesma espécie e pela experiência mais próxima.
//   IVs, natureza e habilidade podem mudar no jogo (itens de treino): quem sobra é pareado de novo pela
//   espécie, Poké Ball, shiny e gênero (e, se a espécie mudou, pela mesma posição), com a experiência sem
//   diminuir; esses aparecem como "treinados". (Nos jogos com PID, PID diferente é sempre outro Pokémon.)

const allMons = d => [...d.party, ...d.pc.boxes.flatMap(b => b.slots)];

/** Identifica o save (mesmo treinador no mesmo jogo), para separar o histórico de cada um. */
export function saveKey(d) {
  const tr = d.trainer;
  return [d.game ? d.game.id : '?', tr.tid, tr.sid, tr.name].join(':');
}

function monKey(m, quetzal) {
  if (!quetzal && m.pid !== undefined && m.ot) return `p${m.pid}:${m.ot.tid}:${m.ot.sid}`;
  const ivs = m.ivs ? Object.values(m.ivs).join('.') : '';
  return [ivs, m.nature ? m.nature.name : '', m.ability ? m.ability.num : '', m.ball ? m.ball.id : '',
    m.shiny ? 1 : 0, m.gender && m.gender.symbol ? m.gender.symbol : ''].join('|');
}

const moveIds = m => m.moves.map(mv => mv.id);

/** Resumo estável do conteúdo (para não guardar duas versões iguais no histórico). */
export function signature(d) {
  return allMons(d).map(m => [m.location, m.boxIndex, m.slot, m.speciesId, m.exp, m.nickname, moveIds(m).join('.'), m.item ? m.item.id : 0].join(',')).join(';');
}

/** Progresso no jogo, para saber qual versão é a mais nova: tempo de jogo (s) ou o contador de saves. */
export function progress(d) {
  const p = d.summary && d.summary.playTime;
  if (p) return p.h * 3600 + p.m * 60 + p.s;
  return d.trainer && d.trainer.saveIndex != null ? d.trainer.saveIndex : null;
}

/** Ordena duas versões do mesmo save: { older, newer, swapped } (swapped = `a` é a mais nova). */
export function orderSaves(a, b) {
  const pa = progress(a), pb = progress(b);
  const swapped = pa != null && pb != null && pa > pb;
  return swapped ? { older: b, newer: a, swapped } : { older: a, newer: b, swapped };
}

const ivText = m => (m.ivs ? Object.values(m.ivs).join('.') : '');
const looseKey = m => [m.ball ? m.ball.id : '', m.shiny ? 1 : 0, m.gender && m.gender.symbol ? m.gender.symbol : ''].join('|');
const samePlace = (a, b) => a.location === b.location && a.boxIndex === b.boxIndex && a.slot === b.slot;

/**
 * Pareia os mesmos Pokémon entre duas listas (regras no começo do arquivo).
 * @returns {{ pairs: Array<[object, object]>, added: object[], removed: object[] }} added = só na nova; removed = só na antiga
 */
export function matchMons(oldList, newList, quetzal) {
  const group = list => {
    const g = new Map();
    for (const m of list) {
      const k = monKey(m, quetzal);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(m);
    }
    return g;
  };
  const oldG = group(oldList), newG = group(newList);
  const pairs = [], added = [], removed = [];
  for (const [k, news] of newG) {
    const olds = [...(oldG.get(k) || [])];
    const rest = [];
    // 1º a mesma espécie, com a experiência mais próxima; depois quem pode ter evoluído (exp não diminui)
    for (const n of news) {
      const same = olds.filter(o => o.speciesId === n.speciesId);
      if (!same.length) { rest.push(n); continue; }
      const o = same.reduce((a, b) => (Math.abs(b.exp - n.exp) < Math.abs(a.exp - n.exp) ? b : a));
      olds.splice(olds.indexOf(o), 1);
      pairs.push([o, n]);
    }
    for (const n of rest) {
      const cand = olds.filter(o => (o.exp ?? 0) <= (n.exp ?? 0));
      if (!cand.length) { added.push(n); continue; }
      const o = cand.reduce((a, b) => ((n.exp - b.exp) < (n.exp - a.exp) ? b : a));
      olds.splice(olds.indexOf(o), 1);
      pairs.push([o, n]);
    }
    oldG.set(k, olds);
  }
  for (const olds of oldG.values()) removed.push(...olds);

  // 2ª passada: o mesmo Pokémon com IVs, natureza ou habilidade mudados. Mesma espécie (ou, se mudou, a
  // mesma posição: evoluiu sem sair do lugar), mesma bola, shiny e gênero, experiência sem diminuir.
  // Não vale entre dois Pokémon reconhecidos pelo PID (PID diferente = outro Pokémon).
  const byPid = m => !quetzal && m.pid !== undefined && !!m.ot;
  const rematch = (fits, rank) => {
    for (const n of [...added]) {
      const cand = removed.filter(o => !(byPid(o) && byPid(n)) && looseKey(o) === looseKey(n) && (o.exp ?? 0) <= (n.exp ?? 0) && fits(o, n));
      if (!cand.length) continue;
      const o = cand.reduce((a, b) => (rank(b, n) < rank(a, n) ? b : a));
      removed.splice(removed.indexOf(o), 1);
      added.splice(added.indexOf(n), 1);
      pairs.push([o, n]);
    }
  };
  rematch((o, n) => o.speciesId === n.speciesId, (o, n) => (samePlace(o, n) ? -1 : n.exp - o.exp));
  rematch((o, n) => samePlace(o, n), (o, n) => n.exp - o.exp);
  return { pairs, added, removed };
}

/**
 * @param {object} before dados da versão antiga
 * @param {object} after dados da versão nova
 */
export function diffSaves(before, after) {
  const quetzal = !!(after.game && after.game.id === 'quetzal');
  const { pairs, added, removed } = matchMons(allMons(before), allMons(after), quetzal);

  const evolved = [], leveled = [], learned = [], trained = [];
  for (const [o, n] of pairs) {
    if (o.speciesId !== n.speciesId) evolved.push({ from: o, to: n });
    const what = [];
    if (ivText(o) !== ivText(n)) what.push('IVs');
    if (o.nature && n.nature && o.nature.name !== n.nature.name) what.push('natureza');
    if (o.ability && n.ability && o.ability.num !== n.ability.num) what.push('habilidade');
    if (what.length) trained.push({ mon: n, from: o, what });
    if (o.level && n.level && n.level > o.level) leveled.push({ mon: n, from: o.level, to: n.level });
    const had = new Set(moveIds(o));
    const moves = n.moves.filter(mv => mv.id && !had.has(mv.id));
    if (moves.length) learned.push({ mon: n, moves });
  }
  const shinies = d => allMons(d).filter(m => m.shiny).length;
  return {
    added, removed, evolved, leveled, learned, trained,
    total: { before: allMons(before).length, after: allMons(after).length },
    shinies: { before: shinies(before), after: shinies(after) },
    changed: !!(added.length || removed.length || evolved.length || leveled.length || learned.length || trained.length),
  };
}

// Identificação das espécies entre as equipes de referência (nomes do Showdown) e as tabelas do jogo e do save.

/** ID do Showdown sem as diferenças de nome entre o Smogon e as tabelas do jogo (máscaras, formas de aparência). */
export function normId(s) {
  const id = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return id.replace(/mask$/, '').replace(/incarnate$/, '')
    .replace(/^(tatsugiri)(curly|droopy|stretchy)$/, '$1').replace(/^(dudunsparce)(two|three)segment$/, '$1')
    .replace(/^(gastrodon|shellos)(east|west)$/, '$1').replace(/^necrozma(dusk)mane$/, 'necrozma$1').replace(/^necrozma(dawn)wings$/, 'necrozma$1');
}
/** Os IDs de uma espécie do jogo ou do save: o nome do Showdown, nome + forma e, sem forma, o nome. */
export function speciesIds(sp) {
  const out = new Set();
  if (sp.showdown) out.add(normId(sp.showdown));
  if (sp.form) out.add(normId(`${sp.name}-${sp.form}`));
  else out.add(normId(sp.name));
  return out;
}

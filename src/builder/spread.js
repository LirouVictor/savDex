// Natureza e EVs do competitivo: o spread (natureza + EVs) que os sets do Smogon da espécie mais usam e que combina com
// os golpes do moveset do app, e a comparação com o Pokémon do save (natureza, EVs e IVs dos stats que importam).
// Os dados vêm das tabelas da referência competitiva (`natures`, `spreads` em src/data/smogon/*.json; smogon.js).

import { NATURES, natureFromId } from '../parser/natures.js';
import { SHOWDOWN_ORDER, STAT_LABEL } from '../export.js';

/** "Jolly:0/252/0/0/4/252" → { nature: 'Jolly', evs: { hp: 0, atk: 252, … } } (null se não for um spread válido). */
export function parseSpread(key) {
  const [nature, ev] = String(key).split(':');
  const n = NATURES.indexOf(nature);
  const v = (ev || '').split('/').map(Number);
  if (n < 0 || v.length !== 6 || v.some(x => !Number.isFinite(x))) return null;
  return { nature, evs: Object.fromEntries(SHOWDOWN_ORDER.map((k, i) => [k, v[i]])) };
}

/** A natureza atrapalha o moveset? Baixa o lado em que ele ataca, ou sobe o lado que nenhum golpe usa. */
function clashes(nature, set) {
  if (!set || !set.length) return false;
  const nat = natureFromId(NATURES.indexOf(nature));
  if (!nat || !nat.plus) return false;
  const phys = set.some(x => x.category === 0 && x.power !== 1), spec = set.some(x => x.category === 1);
  if (!phys && !spec) return false;
  if ((nat.minus === 'atk' && phys) || (nat.minus === 'spa' && spec)) return true;
  return (nat.plus === 'atk' && !phys) || (nat.plus === 'spa' && !spec);
}

/**
 * O spread do competitivo para a espécie e o moveset: a natureza mais usada que não atrapalha os golpes e, com ela, o
 * spread mais usado. `natures`/`spreads`: Map → fração dos sets (smogon.js). null sem dados.
 * @returns {{ nature: string, evs: object, natureShare: number, share: number } | null}
 */
export function pickSpread(natures, spreads, set = null) {
  if (!spreads || !spreads.size) return null;
  const list = [...spreads].map(([k, v]) => ({ ...parseSpread(k), share: v })).filter(x => x.nature);
  if (!list.length) return null;
  const nats = natures && natures.size ? [...natures] : list.map(x => [x.nature, x.share]);
  const ok = nats.find(([n]) => !clashes(n, set) && list.some(x => x.nature === n)) || [list[0].nature];
  const s = list.find(x => x.nature === ok[0]);
  return { nature: s.nature, evs: s.evs, natureShare: (natures && natures.get(s.nature)) || s.share, share: s.share };
}

/** "252 Atk / 4 SpD / 252 Spe" (só os stats com EVs). */
export const evText = evs => SHOWDOWN_ORDER.filter(k => evs && evs[k]).map(k => `${evs[k]} ${STAT_LABEL[k]}`).join(' / ');

/**
 * O spread contra o Pokémon do save: natureza igual (ou a Mint a dar, se o jogo tem: `itemOk`), EVs iguais e os stats
 * com EVs do spread (os que importam) que estão com IV abaixo de 31.
 */
export function compareSpread(spread, mon, itemOk = () => false) {
  const natureOk = !!(mon.nature && mon.nature.name === spread.nature);
  const mint = !natureOk && itemOk(`${spread.nature} Mint`) ? `${spread.nature} Mint` : null;
  const evs = mon.evs || null;
  const evsOk = !!evs && SHOWDOWN_ORDER.every(k => (evs[k] || 0) === (spread.evs[k] || 0));
  const lowIvs = mon.ivs ? SHOWDOWN_ORDER.filter(k => spread.evs[k] >= 100 && mon.ivs[k] < 31) : [];
  return { natureOk, mint, evsOk, evs, lowIvs };
}

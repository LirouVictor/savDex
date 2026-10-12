// Peças comuns dos importadores de equipes de referência (build-refteams.mjs, build-tourteams.mjs): o que vai para o app de
// cada set (só dados derivados) e o identificador estável.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setRoleKeys } from '../src/builder/strategies.js';
import { FIELD, FIELD_MOVES, MEGA_FIELD, ABUSERS, MOVE_ABUSERS, MEGA_ABUSERS } from '../src/ai/strategy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Golpes do app (src/data/moves.json: nome, tipo; poder, precisão, PP, categoria 0 físico / 1 especial / 2 status)
const MOVES = JSON.parse(readFileSync(path.join(ROOT, 'src/data/moves.json'), 'utf8'));
const TYPES = JSON.parse(readFileSync(path.join(ROOT, 'src/data/types.json'), 'utf8'));
export const toId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const moveById = new Map();
MOVES.moves.forEach((row, i) => { if (row) moveById.set(toId(row[0]), { name: row[0], type: TYPES[row[1]], power: MOVES.details[i][0], category: MOVES.details[i][3] }); });
// Nomes que o Showdown escreve diferente do expansion
const ALIAS = { vicegrip: 'visegrip', hijumpkick: 'highjumpkick' };
// Hidden Power com o tipo no nome (Hidden Power Ice): o golpe do app com o tipo do set
export const moveOf = name => {
  const hp = /^Hidden Power (\w+)$/.exec(name);
  if (hp) return { ...moveById.get('hiddenpower'), name, type: hp[1].toLowerCase() };
  return moveById.get(ALIAS[toId(name)] || toId(name)) || null;
};

// Megapedra / orbe primal → a forma de batalha
const MEGA_ITEM = /ite( [XYZ])?$/;
function megaOf(item) {
  if (!item) return null;
  if (item === 'Red Orb' || item === 'Blue Orb') return 'Primal';
  if (!MEGA_ITEM.test(item) || ['Eviolite', 'Meteorite'].includes(item)) return null;
  const m = / ([XYZ])$/.exec(item);
  return m ? `Mega-${m[1]}` : 'Mega';
}

const sortU = xs => [...new Set(xs)].sort();
/** O que vai para o app de cada set: só dados derivados. */
export function member(set, unknown) {
  const moves = (set.moves || []).map(n => { const mv = moveOf(n); if (!mv) unknown.add(n); return mv; }).filter(Boolean);
  const mega = megaOf(set.item);
  const c = { abs: set.ability ? [set.ability] : [], item: set.item || null, moves, types: [], b: null };
  const hits = moves.filter(m => (m.category === 0 || m.category === 1) && m.type);
  const phys = hits.filter(m => m.category === 0).length, spec = hits.length - phys;
  const fields = { set: [], auto: [], use: [] };
  if (FIELD[set.ability]) { fields.set.push(FIELD[set.ability]); fields.auto.push(FIELD[set.ability]); }
  if (MEGA_FIELD[set.item]) { fields.set.push(MEGA_FIELD[set.item]); fields.auto.push(MEGA_FIELD[set.item]); }
  for (const m of moves) {
    if (FIELD_MOVES[m.name]) fields.set.push(FIELD_MOVES[m.name]);
    if (m.name === 'Trick Room') fields.set.push('Trick Room');
    // Weather Ball: aproveita o clima da equipe (decidido no app, pelo clima que alguém põe)
    if (MOVE_ABUSERS[m.name] && m.name !== 'Weather Ball') fields.use.push(...MOVE_ABUSERS[m.name]);
  }
  if (ABUSERS[set.ability]) fields.use.push(ABUSERS[set.ability]);
  if (MEGA_ABUSERS[set.item]) fields.use.push(MEGA_ABUSERS[set.item]);
  const out = { s: set.species };
  if (mega) out.mega = mega;
  out.r = setRoleKeys(c);
  for (const k of ['set', 'auto', 'use']) if (fields[k].length) out[k] = sortU(fields[k]);
  out.at = sortU(hits.map(m => m.type));
  out.dmg = hits.length;
  out.cat = !hits.length ? '-' : phys && spec ? 'M' : phys ? 'P' : 'S';
  return out;
}

// Identificador estável (FNV-1a em base 36)
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

#!/usr/bin/env node
// Gera src/data/refteams/<formato>.json: as EQUIPES DE REFERÊNCIA do montador (src/builder/reference.js).
//
// Fonte: as equipes de exemplo (sample teams) do Smogon reunidas pelo projeto pkmn/smogon
// (https://github.com/pkmn/smogon, data/teams/<formato>.json; o mesmo conteúdo de https://data.pkmn.cc/teams/).
// O projeto tira as equipes dos tópicos de "Sample Teams" de cada formato (fórum do Smogon), confere cada uma com o
// validador do Pokémon Showdown e atualiza todo dia. Não é uma API oficial do Smogon; o código é MIT, mas os SETS são
// do Smogon e dos autores (o README do pkmn/smogon diz isso). Por isso, como nas estatísticas (npm run smogon), só vai
// para o app o que é DERIVADO: as espécies de cada equipe (a forma, e se megaevolui) e, de cada set, os papéis que ele
// cumpre pelas regras do próprio app (strategies.js: pivô, hazards, setup…), o campo que põe ou aproveita
// (ai/strategy.js), os tipos dos golpes de dano e quantos são. Golpes, item, habilidade, natureza, EVs e Tera não são
// copiados. Nome e autor vêm como a fonte dá (o pkmn/smogon avisa que podem não ser os do tópico); o script confere se o
// autor aparece na primeira página do tópico do formato (o link vem da lista mestra de equipes de exemplo do Smogon) e
// marca a equipe como "partially_verified" só nesse caso. Equipes de exemplo não são resultados de torneio: `results`
// fica vazio (o formato já tem o lugar para resultados com fonte, para uma importação controlada no futuro).
//
// Uso: npm run refteams   (precisa de rede: raw.githubusercontent.com e www.smogon.com; o resultado é versionado)

import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setRoleKeys } from '../src/builder/strategies.js';
import { FIELD, FIELD_MOVES, MEGA_FIELD, ABUSERS, MOVE_ABUSERS, MEGA_ABUSERS } from '../src/ai/strategy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/data/refteams');
const DATASET = f => `https://raw.githubusercontent.com/pkmn/smogon/main/data/teams/${f}.json`;
const DATASET_PAGE = f => `https://github.com/pkmn/smogon/blob/main/data/teams/${f}.json`;
const MASTER = 'https://www.smogon.com/forums/threads/master-list-of-ps-sample-teams.3777422/';
// Formatos importados (Singles 6 contra 6, Gen 9: os do Quetzal). `label` = o nome do formato na lista mestra (de onde
// vem o link do tópico). Doubles, Monotype, Little Cup e metagames com regras próprias ficam de fora.
const FORMATS = [
  { id: 'gen9nationaldex', name: 'Gen 9 National Dex', label: 'National Dex' },
  { id: 'gen9nationaldexubers', name: 'Gen 9 National Dex Ubers', label: 'National Dex Ubers' },
  { id: 'gen9ou', name: 'Gen 9 OU', label: 'OU' },
  { id: 'gen9uu', name: 'Gen 9 UU', label: 'UU' },
  { id: 'gen9ru', name: 'Gen 9 RU', label: 'RU' },
  { id: 'gen9nu', name: 'Gen 9 NU', label: 'NU' },
  { id: 'gen9pu', name: 'Gen 9 PU', label: 'PU' },
];

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.text();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(res => setTimeout(res, 2000 * attempt));
    }
  }
}

// Golpes do app (src/data/moves.json: nome, tipo; poder, precisão, PP, categoria 0 físico / 1 especial / 2 status)
const MOVES = JSON.parse(readFileSync(path.join(ROOT, 'src/data/moves.json'), 'utf8'));
const TYPES = JSON.parse(readFileSync(path.join(ROOT, 'src/data/types.json'), 'utf8'));
const toId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const moveById = new Map();
MOVES.moves.forEach((row, i) => { if (row) moveById.set(toId(row[0]), { name: row[0], type: TYPES[row[1]], power: MOVES.details[i][0], category: MOVES.details[i][3] }); });
// Nomes que o Showdown escreve diferente do expansion
const ALIAS = { vicegrip: 'visegrip', hijumpkick: 'highjumpkick' };
// Hidden Power com o tipo no nome (Hidden Power Ice): o golpe do app com o tipo do set
const moveOf = name => {
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
function member(set, unknown) {
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

// Identificador estável: formato + espécies em ordem + autor (a ordem das equipes no arquivo da fonte muda)
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

const text = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase();

async function main() {
  await mkdir(OUT, { recursive: true });
  const master = await get(MASTER);
  const links = new Map();
  for (const m of master.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)) {
    const label = m[2].trim().replace(/&#0?39;/g, "'");
    if (!links.has(label) && /smogon\.com\/forums\/threads\//.test(m[1])) links.set(label, m[1]);
  }
  const retrieved = new Date().toISOString().slice(0, 10);
  for (const f of FORMATS) {
    const thread = links.get(f.label);
    if (!thread) throw new Error(`Tópico de equipes de exemplo de "${f.label}" não está na lista mestra`);
    const page = text(await get(thread));
    const raw = JSON.parse(await get(DATASET(f.id)));
    const unknown = new Set();
    const teams = [];
    const seen = new Set();
    for (const t of Object.values(raw)) {
      if (!t.data || t.data.length !== 6) continue;
      const members = t.data.map(set => member(set, unknown));
      const key = members.map(m => m.s).sort().join('|') + '|' + (t.author || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const team = { id: `${f.id}-${hash(key)}` };
      if (t.name) team.name = t.name;
      if (t.author) team.author = t.author;
      team.verification = t.author && page.includes(t.author.toLowerCase()) ? 'partially_verified' : 'unverified';
      team.members = members;
      teams.push(team);
    }
    const out = {
      format: f.id, name: f.name, gen: 9, mode: 'singles', kind: 'sample_team',
      source: {
        name: 'Smogon sample teams (pkmn/smogon)', dataset: DATASET_PAGE(f.id), thread, list: MASTER, retrieved,
        license: 'sets © Smogon e autores; aqui só espécies e dados derivados pelo app',
      },
      teams,
      // Resultados de torneio: registros à parte (equipe, jogador, evento, data, colocação, URL da prova, verificação).
      // Equipes de exemplo não têm resultado.
      results: [],
    };
    await writeFile(path.join(OUT, `${f.id}.json`), JSON.stringify(out, null, 1).replace(/\n\s+(?=[\]}"\d-])/g, m => (m.length > 4 ? ' ' : m)) + '\n');
    const checked = teams.filter(t => t.verification === 'partially_verified').length;
    console.log(`${f.id}: ${teams.length} equipes (${checked} com o autor citado no tópico)${unknown.size ? `; golpes desconhecidos: ${[...unknown].join(', ')}` : ''}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

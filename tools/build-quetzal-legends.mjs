// Gera src/data/quetzal-legends.json (requisitos dos encontros únicos do Quetzal) a partir de tools/quetzal-legends-src.mjs.
// Liga cada Pokémon do guia ao número da espécie no save (o mesmo de quetzal-wild.json) e confere: os de Johto têm de
// estar na tabela de encontros únicos lida da ROM (quetzal-wild.json → legend); os de Hoenn e Kanto, com um lugar que
// existe no mapa da região. Não precisa de rede nem da ROM.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SOURCE, JOHTO, HOENN, KANTO } from './quetzal-legends-src.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = async f => JSON.parse(await readFile(path.join(ROOT, f), 'utf8'));
const fail = msg => { console.error(msg); process.exit(1); };

const S = await json('src/data/species.json'), Q = await json('src/data/quetzal.json'), W = await json('src/data/quetzal-wild.json');
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ids = new Map();
const add = (name, id) => { const k = norm(name); if (!ids.has(k)) ids.set(k, []); ids.get(k).push(id); };
S.species.forEach((s, id) => { if (s) add(s[0], id); });
for (const [id, s] of Object.entries(Q.species)) { if (s[10]) add(s[10], +id); add(s[0], +id); }

const URL = { johto: SOURCE + 'johto/legendary-pokemon/', hoenn: SOURCE + 'legendary-pokemon/', kanto: SOURCE + 'kanto/legendary-pokemon/' };
const out = {};
let n = 0;
for (const [guide, list] of [['johto', JOHTO], ['hoenn', HOENN || []], ['kanto', KANTO || []]]) {
  for (const [name, slug, ver, pt, en, place, where] of list) {
    const region = where || guide; // as Ilhas Sete ficam no guia de Kanto
    const cands = ids.get(norm(name)) || [];
    let id;
    if (region === 'johto') {
      // o número que a ROM usa (Hoopa da ROM é o Hoopa-Unbound; vale o do guia pelo nome da espécie)
      id = cands.find(c => W.legend[c]) ?? [...ids].filter(([k]) => k.startsWith(norm(name))).flatMap(([, v]) => v).find(c => W.legend[c]);
      if (id == null) fail(`${name} (Johto) não está nos encontros únicos da ROM.`);
      if (place) fail(`${name}: em Johto o lugar vem da ROM.`);
    } else {
      id = cands.find(c => c <= 898) ?? cands[0];
      if (id == null) fail(`${name}: espécie não encontrada.`);
      if (place && !W.places.some(p => p[2] === region && norm(p[0]) === norm(place))) fail(`${name}: lugar "${place}" não existe em ${region}.`);
    }
    if (pt.length !== en.length || !pt.length) fail(`${name}: textos em português e inglês não batem.`);
    (out[id] ||= []).push({ region, url: URL[guide] + slug + '.html', ver, pt, en, ...(place ? { place } : {}) });
    n++;
  }
}
await writeFile(path.join(ROOT, 'src/data/quetzal-legends.json'), JSON.stringify({
  meta: { source: 'Guia da comunidade do Pokémon Quetzal (' + SOURCE + '), em palavras nossas; não conferido no jogo', read: '2026-10-16' },
  legends: out,
}) + '\n');
console.log(`${n} encontros com requisitos, ${Object.keys(out).length} espécies`);

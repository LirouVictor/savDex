#!/usr/bin/env node
// Gera as descrições em português dos golpes e das habilidades a partir da ROM do Pokémon Quetzal PT-BR.
//
// A tradução do Quetzal traz duas descrições de cada golpe e de cada habilidade (a curta do resumo e a longa, com o
// efeito inteiro); aqui vai a longa. Os nomes continuam em inglês no app (regra do projeto); só o texto é traduzido.
// A ROM NUNCA vai para o repositório; daqui só saem os textos.
//
// As tabelas são achadas por assinatura: o texto curto e o longo do Pound e o "Sem habilidade especial", e as tabelas
// de ponteiros que apontam para eles (curta e longa seguidas). O script para sem gravar se algo não bater.
//
// Saída (versionada; carregada só quando a interface está em português e o jogador toca num golpe ou numa habilidade):
//   - src/data/move-text-pt.json: [por ID do golpe no Quetzal, 1–848] (1–847 = IDs do app; 848 = Nihil Light)
//   - src/data/ability-text-pt.json: { nome normalizado (o mesmo de ability-text.json): descrição }
//
// Uso: npm run texts-pt [-- caminho/da/rom.gba]   (padrão: o .gba com "quetzal" no nome em fixtures/rom/; sem rede)

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeText, encodeText } from '../src/parser/charset.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = msg => { throw new Error(msg); };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// Letras da tradução que o charset ocidental não tem (achadas no texto: "pisão", "alterações", "PORTÃO")
const PT = { 0x30: 'Ã', 0x32: 'ã', 0x33: 'õ' };

async function findRom() {
  if (process.argv[2]) return process.argv[2];
  const dir = path.join(ROOT, 'fixtures/rom');
  const gba = (await readdir(dir).catch(() => [])).find(f => /quetzal/i.test(f) && f.endsWith('.gba'));
  return gba ? path.join(dir, gba) : fail('Coloque o .gba em fixtures/rom/ (nome com "quetzal") ou passe o caminho: npm run texts-pt -- rom.gba');
}

const rom = await readFile(await findRom());
const enc = s => Buffer.concat([Buffer.from(encodeText(s, s.length)), Buffer.from([0xff])]);
const ptr = o => rom.readUInt32LE(o) - 0x08000000;

/** Texto da descrição: quebras de linha viram espaço, sem o que não é letra conhecida. */
function desc(o) {
  let s = '';
  for (let i = o; i < o + 600 && rom[i] !== 0xff; i++) {
    const b = rom[i];
    if (b === 0xfe || b === 0xfa || b === 0xfb) { s += ' '; continue; }
    const c = PT[b] ?? decodeText(rom, i, 1);
    if (c === '?' && b !== 0xac) fail(`Caractere desconhecido 0x${b.toString(16)} em 0x${o.toString(16)}.`);
    s += c === '' ? ' ' : c;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Posição (na ROM) do começo de um texto, com o fim de outro texto (0xFF) ou um 0 de alinhamento antes dele. */
function findText(s) {
  const b = Buffer.from(encodeText(s, s.length));
  for (let i = rom.indexOf(b); i >= 0; i = rom.indexOf(b, i + 1)) if (rom[i - 1] === 0xff || rom[i - 1] === 0) return i;
  return fail(`Texto "${s}" não encontrado na ROM.`);
}
/** Tabela de ponteiros cuja entrada `index` aponta para `o`. */
function tableTo(o, check) {
  const p = Buffer.alloc(4);
  p.writeUInt32LE(o + 0x08000000);
  for (let i = rom.indexOf(p); i >= 0; i = rom.indexOf(p, i + 1)) if (i % 4 === 0 && check(i)) return i;
  return fail(`Tabela de ponteiros para 0x${o.toString(16)} não encontrada.`);
}

// Nomes (17 bytes) para conferir a contagem e ligar as habilidades pelo nome
function names(first, second, index) {
  const a = enc(first), b = enc(second);
  for (let i = rom.indexOf(a); i >= 0; i = rom.indexOf(a, i + 1)) {
    if (rom.subarray(i + 17, i + 17 + b.length).equals(b)) {
      const base = i - index * 17, out = [null];
      for (let k = 1; k < 2000; k++) { const n = decodeText(rom, base + k * 17, 17).replace(/’/g, "'"); if (!n) break; out.push(n); }
      return out;
    }
  }
  return fail(`Lista com "${first}" não encontrada.`);
}
const moveNames = names('Pound', 'Karate Chop', 1);
const abilityNames = names('Overgrow', 'Blaze', 65);

// Golpes: tabela curta (golpe 1 no índice 0) seguida da longa
const N = moveNames.length - 1;
const shortPound = findText('Golpeia alvo com');
const longPound = findText('Golpeia o alvo para causar dano.');
const longBase = tableTo(longPound, i => ptr(i - N * 4) === shortPound);
if (ptr(longBase - N * 4) !== shortPound) fail('A tabela curta dos golpes não fica logo antes da longa.');
const moves = [null];
for (let id = 1; id <= N; id++) moves.push(desc(ptr(longBase + (id - 1) * 4)));
if (!/pernas|alvo/i.test(moves[1]) || !/Fada/.test(moves[N])) fail('Descrições dos golpes não conferem (Pound, Nihil Light).');

// Habilidades: curta (habilidade 0 = nenhuma) seguida da longa
const shortNone = findText('Sem habilidade especial.');
const shortBase = tableTo(shortNone, () => true);
// A tabela curta acaba onde começa a longa (a da habilidade 0: "Não possui habilidade especial…")
let A = 0;
for (let k = 200; k < 1000 && !A; k++) { const o = ptr(shortBase + k * 4); if (o > 0 && o < rom.length && desc(o).startsWith('Não possui habilidade especial')) A = k; }
if (!A || abilityNames[A - 1] === undefined) fail('A tabela longa das habilidades não fica logo depois da curta.');
const known = JSON.parse(await readFile(path.join(ROOT, 'src/data/ability-text.json'), 'utf8'));
// Nomes abreviados na ROM (17 bytes) → a chave do app pelo começo e pelas letras na ordem
const abbrev = (full, short) => { let k = 0; for (const c of full) if (c === short[k]) k++; return k === short.length && full[0] === short[0]; };
const abilities = {};
for (let id = 1; id < A; id++) {
  let k = norm(abilityNames[id]);
  if (!known[k]) k = Object.keys(known).find(x => abbrev(x, k)) || k;
  const text = desc(ptr(shortBase + (A + id) * 4));
  // Mesmo nome com variantes no app (As One, Embody Aspect): cada repetição é a próxima variante, na ordem do expansion
  const variant = Object.keys(known).find(x => x !== k && x.startsWith(k) && !abilities[x]);
  if (variant) abilities[variant] = text;
  if (!abilities[k]) abilities[k] = text;
}
if (!/chuva/i.test(abilities.drizzle) || !abilities.stench) fail('Descrições das habilidades não conferem (Drizzle, Stench).');

await writeFile(path.join(ROOT, 'src/data/move-text-pt.json'), JSON.stringify(moves) + '\n');
await writeFile(path.join(ROOT, 'src/data/ability-text-pt.json'), JSON.stringify(abilities) + '\n');
console.log(`golpes: ${N} descrições; habilidades: ${Object.keys(abilities).length} (${Object.keys(abilities).filter(k => !known[k]).length} sem par no ability-text.json)`);

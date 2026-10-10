import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Arquivos .js de src/ (todos, inclusive subpastas). */
function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    return e.isDirectory() ? jsFiles(p) : e.name.endsWith('.js') ? [p] : [];
  });
}

describe('index.html', () => {
  it('não repete id (um <use href="#x"> pegaria o primeiro elemento, não o ícone)', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup).toEqual([]);
  });

  it('todo ícone usado (<use href="#x">) é um <symbol> do index.html', () => {
    const symbols = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
    const src = [html, ...jsFiles(new URL('../src', import.meta.url).pathname).map(f => readFileSync(f, 'utf8'))].join('\n');
    const used = new Set([...src.matchAll(/<use href="#([\w-]+)"/g)].map(m => m[1]));
    // Também os nomes passados para os blocos do resumo e a barra de navegação (montam o <use> com ${...})
    for (const m of src.matchAll(/tile\('st-[\w-]+', '([\w-]+)'/g)) used.add(m[1]);
    expect([...used].filter(id => !symbols.has(id))).toEqual([]);
  });
});

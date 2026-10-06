import { defineConfig } from 'vite';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Gera dist/sw.js. Na instalação, só o essencial para abrir o app (página, entrada, app e o que eles importam
// direto, CSS, fontes, ícones, manifest); tabelas e pacotes carregados sob demanda (jogos, IA, inglês, imagem
// da equipe…) são guardados na primeira vez que forem usados. Leveza: quem só abre saves do Quetzal nunca
// baixa as tabelas de DS ou do Unbound.
function serviceWorker() {
  const publicDir = path.resolve('public');
  const listPublic = (dir, prefix = '') => readdirSync(dir).flatMap(f => {
    const full = path.join(dir, f);
    return statSync(full).isDirectory() ? listPublic(full, prefix + f + '/') : [prefix + f];
  });
  return {
    name: 'quetzal-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle)
        .filter(f => !f.endsWith('.map') && !f.endsWith('.woff')) // .woff só é usado em navegadores muito antigos
        .concat(listPublic(publicDir).filter(f => f !== '_headers'));
      const core = new Set();
      const add = name => {
        const c = bundle[name];
        if (!c || core.has(name)) return;
        core.add(name);
        if (c.type === 'chunk') (c.imports || []).forEach(add);
      };
      for (const c of Object.values(bundle)) if (c.type === 'chunk' && (c.isEntry || c.name === 'app')) add(c.fileName);
      // O que não é JS (CSS, fontes woff2, ícones, manifest) é pequeno e entra sempre
      for (const f of assets) if (!f.endsWith('.js')) core.add(f);
      const files = ['./', ...assets.filter(f => f !== 'index.html' && core.has(f)).map(f => './' + f)];
      const lazy = assets.filter(f => !core.has(f)).map(f => './' + f);
      const version = createHash('sha256').update(files.join('\n') + Object.values(bundle).map(c => c.code || c.source || '').join('')).digest('hex').slice(0, 12);
      const template = readFileSync(path.resolve('src/sw-template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files)).replace('__LAZY__', JSON.stringify(lazy)),
      });
    },
    // A CSP do _headers precisa do hash do script inline do index.html (aplicação do tema).
    writeBundle(opts) {
      const dir = opts.dir || 'dist';
      const headers = path.join(dir, '_headers');
      if (!existsSync(headers)) return;
      const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
      const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
      const hashes = inline.map(code => `'sha256-${createHash('sha256').update(code).digest('base64')}'`).join(' ');
      writeFileSync(headers, readFileSync(headers, 'utf8').replace("'sha256-__THEME_HASH__'", hashes));
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  plugins: [serviceWorker()],
  test: {
    include: ['test/**/*.test.js'],
  },
});

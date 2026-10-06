// Service worker (gerado no build a partir de src/sw-template.js).
// - App: na instalação, só o essencial (PRECACHE); navegação responde do cache e atualiza em segundo plano.
// - Pacotes sob demanda (LAZY: tabelas de cada jogo, IA, inglês…): guardados na primeira vez que forem usados,
//   num cache que passa de uma versão para a outra (os nomes têm hash) e perde o que saiu do build.
// - Sprites (PokeAPI/sprites): cache-first, guardando os que já foram vistos para uso offline.
// - Compartilhar (share_target do manifest): recebe o .sav enviado por outro app, guarda e abre a página.

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const LAZY = __LAZY__;
const APP_CACHE = 'qsv-app-' + VERSION;
const LAZY_CACHE = 'qsv-lazy-v1';
const SPRITE_CACHE = 'qsv-sprites-v1';
const MAX_SPRITES = 1500;
const SPRITE_PREFIX = 'https://raw.githubusercontent.com/PokeAPI/sprites/';
// Mesmos nomes de src/main.js
const SHARE_CACHE = 'qsv-share';
const SHARE_KEY = './shared-save';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('qsv-app-') && key !== APP_CACHE) await caches.delete(key);
    }
    // Pacotes sob demanda que não existem mais nesta versão
    const lazy = await caches.open(LAZY_CACHE);
    const keep = new Set(LAZY.map(f => new URL(f, self.registration.scope).href));
    for (const req of await lazy.keys()) if (!keep.has(req.url)) await lazy.delete(req);
    await self.clients.claim();
  })());
});

async function trimSprites(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_SPRITES; i++) await cache.delete(keys[i]);
}

async function spriteFirst(request) {
  const cache = await caches.open(SPRITE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trimSprites(cache);
  }
  return res;
}

async function appFirst(request, event) {
  const cache = await caches.open(APP_CACHE);
  const isNav = request.mode === 'navigate';
  const key = isNav ? './' : request;
  const hit = await cache.match(key, { ignoreSearch: isNav }) || (isNav ? null : await caches.match(request, { cacheName: LAZY_CACHE }));
  // Fora do essencial (pacotes sob demanda): guardado no cache que passa de uma versão para a outra
  const target = isNav || PRECACHE.some(f => new URL(f, self.registration.scope).href === request.url) ? cache : await caches.open(LAZY_CACHE);
  const update = () => fetch(request).then(res => {
    if (res.ok) target.put(key, res.clone());
    return res;
  });
  if (hit) {
    // Arquivos do build têm hash no nome e não mudam; só a página é atualizada em segundo plano.
    if (isNav) event.waitUntil(update().catch(() => {}));
    return hit;
  }
  return update();
}

// O arquivo compartilhado chega num POST multipart. Fica num cache só até a página abrir e ler.
async function receiveShare(request) {
  try {
    const file = (await request.formData()).get('save');
    if (file && typeof file !== 'string') {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(SHARE_KEY, new Response(file, { headers: { 'x-file-name': encodeURIComponent(file.name || 'save.sav') } }));
    }
  } catch { /* a página abre normalmente e mostra a tela inicial */ }
  return Response.redirect('./?shared=1', 303);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/share')) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.url.startsWith(SPRITE_PREFIX)) { event.respondWith(spriteFirst(request)); return; }
  if (new URL(request.url).origin === location.origin) event.respondWith(appFirst(request, event));
});

const CACHE_NAME = 'financeiro-cache-v5';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './style.css',
  './js/icons.js',
  './js/utils.js',
  './js/state.js',
  './js/auth.js',
  './js/dashboard.js',
  './js/mes.js',
  './js/compromissos.js',
  './js/cartoes.js',
  './js/backup.js',
  './js/auditoria.js',
  './js/relatorios.js',
  './js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: tenta a rede primeiro (pra pegar atualizações), cai pro cache se estiver offline.
// cache:'no-store' é importante aqui -- sem isso, o próprio cache HTTP do navegador podia
// devolver uma resposta antiga pro fetch() sem nem chegar a rede de verdade, fazendo
// "network first" na prática se comportar como "cache antigo first" (já causou updates
// não aparecerem mesmo depois de recarregar a página manualmente).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Só mexe em arquivo do próprio site. Antes o SW interceptava TODO GET, então:
  // (1) as chamadas ao Supabase eram cacheadas e, offline, o fallback devolvia o
  // index.html para quem esperava JSON — o supabase-js quebrava ao interpretar;
  // (2) scripts de CDN vêm como resposta opaca e cache.put() rejeita, gerando
  // promessa não tratada a cada carregamento.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        // Só guarda resposta boa e do mesmo domínio (basic) — evita gravar erro
        // 404/500 no cache e servir isso como se fosse a versão offline.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // Fallback pro shell só faz sentido em navegação; para um .js ou .css
        // devolver HTML criaria um erro de sintaxe confuso.
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});

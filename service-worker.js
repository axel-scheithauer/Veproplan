const CACHE_NAME = 'veproplan-cache-v11';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './js-yaml.min.js',
  './manifest.json',
  './icon.svg',
  './favicon.ico'
];

// Fall back to the cache if the network is slow/unavailable.
const NET_TIMEOUT = 3500;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first: always try to fetch the freshest copy (so code updates apply
// on a normal reload — no need to re-install the app). The cache is refreshed
// on every successful fetch and used as a fallback when offline or slow.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT))
    ]);
    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    throw err;
  }
}

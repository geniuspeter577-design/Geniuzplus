const IMAGE_CACHE_PREFIX = 'geniuzplus-title-images-';
const IMAGE_CACHE_NAME = `${IMAGE_CACHE_PREFIX}v1`;
const MAX_CACHED_IMAGES = 240;
const SHELL_CACHE_PREFIX = 'geniuzplus-app-shell-';
const SHELL_CACHE_NAME = `${SHELL_CACHE_PREFIX}v1`;
const MAX_CACHED_SHELL_REQUESTS = 100;

async function trimCache(cache, maximumEntries) {
  const keys = await cache.keys();
  if (keys.length > maximumEntries) {
    await Promise.all(keys.slice(0, keys.length - maximumEntries).map((key) => cache.delete(key)));
  }
}

function updateCache(request, cacheName, maximumEntries) {
  return fetch(request).then(async (response) => {
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
      await trimCache(cache, maximumEntries);
    }
    return response;
  }).catch(() => undefined);
}

function serveStaleWhileRevalidate(event, cacheName, maximumEntries) {
  const request = event.request;
  const refresh = updateCache(request, cacheName, maximumEntries);
  event.waitUntil(refresh.then(() => undefined));
  event.respondWith(caches.open(cacheName)
    .then((cache) => cache.match(request))
    .then((cached) => cached ?? refresh)
    .then((response) => response ?? Response.error()));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await self.skipWaiting();
    try {
      const cache = await caches.open(SHELL_CACHE_NAME);
      await cache.add('/');
    } catch {
      // The first page may be opened without a usable network connection.
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) =>
        (name.startsWith(IMAGE_CACHE_PREFIX) && name !== IMAGE_CACHE_NAME) ||
        (name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE_NAME))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.destination !== 'image') {
    if (
      request.method === 'GET' &&
      (request.mode === 'navigate' || ['script', 'style', 'font'].includes(request.destination))
    ) {
      serveStaleWhileRevalidate(event, SHELL_CACHE_NAME, MAX_CACHED_SHELL_REQUESTS);
    }
    return;
  }

  serveStaleWhileRevalidate(event, IMAGE_CACHE_NAME, MAX_CACHED_IMAGES);
});

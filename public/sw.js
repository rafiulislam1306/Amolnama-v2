const CACHE_NAME = 'amolnama-v2-cache-v2';

// Define the core files needed for the app to load offline immediately
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  // Pre-cache core assets so the app frame works offline right after installing
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Pre-caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  // Clean up old caches when a new service worker takes over
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Bypass non-GET requests (Service Workers cannot cache POST/PUT/DELETE)
  if (event.request.method !== 'GET') return;

  // Bypass caching for ALL Firebase/Google APIs and browser extensions
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('identitytoolkit') ||
      event.request.url.includes('firebase') ||
      event.request.url.startsWith('chrome-extension')) {
      return;
  }

  // Network-First Strategy: Fetch fresh code, fallback to cache if offline
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache valid responses (allow 'cors' so Google Fonts and external CDNs work offline)
        if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        // Network failed, serve from cache
        return caches.match(event.request).then(cachedResponse => {
            // Return the cached file if we have it
            if (cachedResponse) {
                return cachedResponse;
            }
            // If the network fails AND the file isn't in the cache, safely return an offline status
            // instead of returning 'undefined' and crashing the app's fetch engine
            return new Response('Network error and resource not found in cache.', {
                status: 503,
                statusText: 'Service Unavailable'
            });
        });
      })
  );
});
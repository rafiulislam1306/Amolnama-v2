const CACHE_NAME = 'amolnama-v2-cache-__BUILD_HASH__';

const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const withBase = (path) => `${BASE_PATH}${path}`;

// Define the core files needed for the app to load offline immediately
const CORE_ASSETS = [
  withBase('/'),
  withBase('/index.html'),
  withBase('/manifest.json'),
  withBase('/favicon.svg'),
  withBase('/icons.svg'),
  withBase('/icon-192.png'),
  withBase('/icon-512.png')
  // __INJECTED_ASSETS__
];

self.addEventListener('install', event => {
  // Pre-cache core assets so the app frame works offline right after installing
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Pre-caching core assets');
        return Promise.allSettled(CORE_ASSETS.map(url => cache.add(url)));
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

  // Bypass non-HTTP(S) schemes (chrome-extension://, data:, blob:, etc.)
  if (!event.request.url.startsWith('http')) return;

  // Bypass caching for ALL Firebase/Google APIs
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('identitytoolkit') ||
      event.request.url.includes('firebase')) {
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
            
            // SPA Navigation Fallback: If it's a page navigation, serve index.html
            if (event.request.mode === 'navigate') {
                return caches.match(withBase('/index.html')).then(res => res || caches.match(withBase('/')));
            }

            // If it's a missing image or API call, safely return an offline status
            return new Response('Network error and resource not found in cache.', {
                status: 503,
                statusText: 'Service Unavailable'
            });
        });
      })
  );
});

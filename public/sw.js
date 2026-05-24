const CACHE_NAME = 'amolnama-v2-cache-v4';

const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const withBase = (path) => `${BASE_PATH}${path}`;

// Define the core files needed for the app to load offline immediately
const CORE_ASSETS = [
  withBase('/'),
  withBase('/index.html'),
  withBase('/favicon.svg'),
  withBase('/icons.svg'),
  withBase('/icon-192.png'),
  withBase('/icon-512.png')
];

self.addEventListener('install', event => {
  // Pre-cache core assets so the app frame works offline right after installing
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Pre-caching core assets');
        // Use Promise.all to ensure atomic caching (fails if any core asset fails)
        return Promise.all(CORE_ASSETS.map(url => cache.add(url)));
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

  const url = event.request.url;

  // Bypass caching for ALL Firebase/Google APIs and browser extensions
  if (url.includes('googleapis.com') || 
      url.includes('identitytoolkit') ||
      url.includes('firebase') ||
      url.startsWith('chrome-extension')) {
      return;
  }

  // Determine if it is a static hashed asset, font, or image asset (highly cacheable and immutable)
  const isStaticAsset = url.includes('/assets/') || 
                        url.includes('fonts.googleapis.com') || 
                        url.includes('fonts.gstatic.com') ||
                        url.endsWith('.png') ||
                        url.endsWith('.svg') ||
                        url.endsWith('.ico') ||
                        url.endsWith('.woff2');

  if (isStaticAsset) {
    // Cache-First Strategy: serve from cache immediately, fetch from network if missing
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
  } else {
    // Network-First Strategy: fresh data for index.html, API calls, and manifest
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // SPA Navigation Fallback: If it's a page navigation, serve index.html
            if (event.request.mode === 'navigate') {
              return caches.match(withBase('/index.html'));
            }
            return new Response('Network error and resource not found in cache.', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        })
    );
  }
});

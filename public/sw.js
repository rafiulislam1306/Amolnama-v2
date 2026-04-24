const CACHE_NAME = 'amolnama-v2-cache';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // This minimal fetch listener is required by browsers to trigger the PWA Install prompt
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
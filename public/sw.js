const CACHE_NAME = 'nse-market-mood-v3'; // Bump version to clear old cache
const urlsToCache = [
    '/',  // This will now point to public folder
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Take control of all pages immediately
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // NEVER cache API requests - always fetch fresh data
    if (event.request.url.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Cache other static assets
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
        )
    );
});
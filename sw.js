// Notenkraker Service Worker
// Versie hoef je ALLEEN te verhogen als je het cachegedrag zelf wijzigt,
// of als je nieuwe statische bestanden toevoegt aan STATIC_ASSETS.
// index.html wordt altijd live opgehaald (network-first).

const CACHE = 'notenkraker-v2';

// Statische bestanden die gecacht worden (cache-first)
const STATIC_ASSETS = [
  './manifest.json',
  './icons/favicon-lm.ico',
  './icons/favicon-dm.ico',
  './icons/favicon-lv.ico',
  './icons/favicon-dv.ico',
  './icons/icon-lm-32.png',
  './icons/icon-lm-96.png',
  './icons/icon-lm-180.png',
  './icons/icon-lm-192.png',
  './icons/icon-lm-512.png',
  './icons/icon-dm-32.png',
  './icons/icon-dm-96.png',
  './icons/icon-dm-180.png',
  './icons/icon-dm-192.png',
  './icons/icon-dm-512.png',
  './icons/icon-lv-32.png',
  './icons/icon-lv-96.png',
  './icons/icon-lv-180.png',
  './icons/icon-lv-192.png',
  './icons/icon-lv-512.png',
  './icons/icon-dv-32.png',
  './icons/icon-dv-96.png',
  './icons/icon-dv-180.png',
  './icons/icon-dv-192.png',
  './icons/icon-dv-512.png',
];

// Installeer: cache alleen de statische bestanden
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting(); // activeer nieuwe SW direct
});

// Activeer: verwijder oude caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim(); // neem direct controle over alle open tabs
});

// Fetch-strategie:
// - index.html → network-first (altijd de laatste versie van GitHub)
// - al het overige → cache-first (snel, statisch)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isHTML) {
    // Network-first: probeer live te laden, val terug op cache
    e.respondWith(
      fetch(e.request)
        .then(response => {
          // Sla verse versie op in cache
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request)) // offline: gebruik cache
    );
  } else {
    // Cache-first: gebruik cache, haal op als niet aanwezig
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

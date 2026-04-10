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

// ── Share Target: vang POST /app.html op (Android "Delen via…" / iOS Share Sheet) ──
// Het OS stuurt het gedeelde audiobestand als multipart-POST naar ./app.html.
// De SW slaat het op in een aparte cache en stuurt door met ?shared_audio=…
// zodat app.html het bij DOMContentLoaded kan ophalen.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method === 'POST' && url.pathname.endsWith('/app.html')) {
    e.respondWith((async () => {
      try {
        const formData  = await e.request.formData();
        const audioFile = formData.get('audio');   // naam = share_target.params.files[0].name

        if (audioFile instanceof File && audioFile.size > 0) {
          const cache    = await caches.open('nk-shared-audio-v1');
          const safeKey  = encodeURIComponent(audioFile.name.replace(/[^a-zA-Z0-9._-]/g, '_'));
          const storeUrl = url.origin + '/__nk_shared__/' + safeKey;

          await cache.put(
            new Request(storeUrl),
            new Response(audioFile, {
              headers: { 'Content-Type': audioFile.type || 'audio/mpeg' }
            })
          );

          const redir = url.origin + url.pathname + '?shared_audio=' + safeKey;
          return Response.redirect(redir, 303);
        }
      } catch (err) {
        console.warn('[SW] share-target fout:', err);
      }
      // Geen geldig audiobestand: gewoon app.html ophalen
      return fetch(new Request(url.origin + url.pathname, { method: 'GET' }));
    })());
    return;   // vroeg terug – volgende fetch-listener niet aanroepen
  }
});

// ── Fetch-strategie:
// - index.html / app.html → network-first (altijd de laatste versie van GitHub)
// - al het overige        → cache-first (snel, statisch)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  // POST-requests voor share-target worden door de vorige listener afgehandeld;
  // hier enkel GET-requests
  if (e.request.method !== 'GET') return;

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

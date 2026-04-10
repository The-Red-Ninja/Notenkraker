// Notenkraker Service Worker
// Versie hoef je ALLEEN te verhogen als je het cachegedrag zelf wijzigt,
// of als je nieuwe statische bestanden toevoegt aan STATIC_ASSETS.
// index.html wordt altijd live opgehaald (network-first).

const CACHE = 'notenkraker-v3';
const SHARE_CACHE = 'nk-shared-audio-v1';

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

// Activeer: verwijder oude caches (maar NIET de share-cache)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== SHARE_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim(); // neem direct controle over alle open tabs
});

// ── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Share Target: onderschep POST naar /app.html ──────────────────────────
  // Chrome stuurt dit POST-verzoek wanneer de gebruiker "Delen via Notenkraker"
  // kiest. De SW moet dit altijd afhandelen — ook als de app gesloten was.
  // Werkwijze:
  //   1. Lees het audiobestand uit de multipart-body
  //   2. Sla het op in de share-cache onder een vaste sleutel
  //   3. Stuur de browser door naar app.html?shared_audio=1  (GET)
  //      → Chrome opent (of hergebruikt) de app-tab
  //   4. app.html leest de sleutel en haalt het bestand op uit de cache
  if (e.request.method === 'POST' && url.pathname.endsWith('/app.html')) {
    e.respondWith(
      (async () => {
        try {
          const formData  = await e.request.formData();
          const audioFile = formData.get('audio');

          if (audioFile instanceof File && audioFile.size > 0) {
            const cache = await caches.open(SHARE_CACHE);

            // Vaste cache-sleutels op basis van de SW-locatie
            // (werkt correct op GitHub Pages submap én op rootdomeinen)
            const base = self.registration.scope; // bijv. https://host/Notenkraker/
            await cache.put(
              new Request(base + '__nk_shared_file__'),
              new Response(audioFile, {
                headers: { 'Content-Type': audioFile.type || 'audio/mpeg' }
              })
            );
            await cache.put(
              new Request(base + '__nk_shared_meta__'),
              new Response(
                JSON.stringify({ name: audioFile.name, type: audioFile.type }),
                { headers: { 'Content-Type': 'application/json' } }
              )
            );

            // 303 → browser wisselt naar GET, opent de app op de juiste URL
            return Response.redirect(base + 'app.html?shared_audio=1', 303);
          }
        } catch (err) {
          console.warn('[SW] share-target fout:', err);
        }
        // Geen geldig audiobestand → gewoon app.html laden
        const base = self.registration.scope;
        return fetch(new Request(base + 'app.html', { method: 'GET' }));
      })()
    );
    return;
  }

  // ── Gewone fetch-strategie ────────────────────────────────────────────────
  // HTML-bestanden → network-first (altijd de laatste versie van GitHub)
  // Al het overige → cache-first (snel, statisch)
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/';

  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

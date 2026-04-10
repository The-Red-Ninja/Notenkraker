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

  // ── Share Target: onderschep POST naar app.html ───────────────────────────
  // Chrome stuurt een multipart POST wanneer de gebruiker "Delen via" kiest.
  // Response.redirect() vanuit een SW op een OS-POST geeft ERR_HTTP2_PROTOCOL_ERROR.
  // Correcte aanpak: bestand opslaan in cache, dan clients.openWindow() aanroepen,
  // en een lege 200-response teruggeven zodat Chrome niet crasht.
  if (e.request.method === 'POST' && url.pathname.endsWith('/app.html')) {
    e.waitUntil(
      (async () => {
        try {
          const formData  = await e.request.formData();
          const audioFile = formData.get('audio');
          const base      = self.registration.scope; // https://host/Notenkraker/

          if (audioFile instanceof File && audioFile.size > 0) {
            // Sla bestand + metadata op in vaste cache-sleutels
            const cache = await caches.open(SHARE_CACHE);
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
          }

          // Stuur signaal naar alle open app-vensters
          const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          const appClients = allClients.filter(c => c.url.includes('/app.html'));

          if (appClients.length > 0) {
            // App is al open: stuur een bericht zodat hij het bestand laadt
            appClients[0].postMessage({ type: 'NK_SHARED_AUDIO' });
            appClients[0].focus();
          } else {
            // App is gesloten: open een nieuw venster met het signaal
            await self.clients.openWindow(base + 'app.html?shared_audio=1');
          }
        } catch (err) {
          console.warn('[SW] share-target fout:', err);
          // Open de app zonder bestand als fallback
          const base = self.registration.scope;
          await self.clients.openWindow(base + 'app.html');
        }
      })()
    );

    // Geef een lege 200 terug zodat Chrome de navigatie niet als fout beschouwt
    e.respondWith(new Response('', { status: 200 }));
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

// Notenkraker Service Worker
const CACHE       = 'notenkraker-v4';
const SHARE_CACHE = 'nk-shared-audio-v1';

const STATIC_ASSETS = [
  './manifest.json',
  './icons/favicon-lm.ico',
  './icons/favicon-dm.ico',
  './icons/favicon-lv.ico',
  './icons/favicon-dv.ico',
  './icons/icon-lm-32.png',  './icons/icon-lm-96.png',
  './icons/icon-lm-180.png', './icons/icon-lm-192.png', './icons/icon-lm-512.png',
  './icons/icon-dm-32.png',  './icons/icon-dm-96.png',
  './icons/icon-dm-180.png', './icons/icon-dm-192.png', './icons/icon-dm-512.png',
  './icons/icon-lv-32.png',  './icons/icon-lv-96.png',
  './icons/icon-lv-180.png', './icons/icon-lv-192.png', './icons/icon-lv-512.png',
  './icons/icon-dv-32.png',  './icons/icon-dv-96.png',
  './icons/icon-dv-180.png', './icons/icon-dv-192.png', './icons/icon-dv-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Share Target POST ──────────────────────────────────────────────────────
  // Chrome stuurt een multipart POST naar app.html wanneer de gebruiker
  // "Delen via Notenkraker" kiest. Regels:
  //   • Response.redirect() op een SW-POST → ERR_HTTP2_PROTOCOL_ERROR (altijd)
  //   • e.respondWith(new Response('',{status:200})) + e.waitUntil(openWindow)
  //     is het enige patroon dat Chrome Android accepteert
  //   • Als de app al open is: postMessage zodat hij niet opnieuw navigeert
  if (e.request.method === 'POST' && url.pathname.endsWith('/app.html')) {

    // KRITIEK: respondWith() moet SYNCHROON worden aangeroepen in de event-handler,
    // anders gooit Chrome een "handler already run" fout.
    // Geef meteen een lege 200 terug — geen redirect, geen fout.
    e.respondWith(new Response('', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));

    // Verwerk het bestand asynchroon via waitUntil
    e.waitUntil((async () => {
      const base = self.registration.scope; // https://host/Notenkraker/
      try {
        const formData  = await e.request.formData();
        const audioFile = formData.get('audio');

        if (audioFile instanceof File && audioFile.size > 0) {
          // Sla bestand + metadata op in cache
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
      } catch (err) {
        console.warn('[SW] share-target: formData fout:', err);
      }

      // Stuur naar app: bestaand venster of nieuw openen
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      const appClient = allClients.find(c => c.url.includes('/app.html'));

      if (appClient) {
        // App is al open: stuur bericht en breng naar voren
        appClient.postMessage({ type: 'NK_SHARED_AUDIO' });
        try { appClient.focus(); } catch (_) {}
      } else {
        // App was gesloten: open nieuw venster
        await self.clients.openWindow(base + 'app.html?shared_audio=1');
      }
    })());
    return; // Geen verdere fetch-verwerking
  }

  // ── Gewone fetch-strategie ─────────────────────────────────────────────────
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/';

  if (isHTML) {
    // Network-first voor HTML (altijd verse versie van GitHub)
    e.respondWith(
      fetch(e.request)
        .then(response => {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first voor statische bestanden
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

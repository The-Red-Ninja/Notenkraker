// Notenkraker Service Worker  v5
const CACHE       = 'notenkraker-v5';
const SHARE_CACHE = 'nk-shared-audio-v1';

// share.html is bewust klein (< 1KB) zodat hij altijd precached kan worden.
// De SW serveert hem uit cache zonder het netwerk te raken — dit is de
// enige manier om de share-target POST te onderscheppen op GitHub Pages,
// want GitHub Pages weigert POST-verzoeken met ERR_HTTP2_PROTOCOL_ERROR.
const STATIC_ASSETS = [
  './share.html',          // ← share-target action, MOET in cache zitten
  './manifest.json',
  './icons/favicon-lm.ico', './icons/favicon-dm.ico',
  './icons/favicon-lv.ico', './icons/favicon-dv.ico',
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

  // ── Share Target POST naar share.html ─────────────────────────────────────
  // Chrome stuurt dit POST-verzoek wanneer de gebruiker "Delen via" kiest.
  // De SW onderschept dit VOORDAT het netwerk geraakt wordt, omdat share.html
  // in de precache zit. GitHub Pages zou anders ERR_HTTP2_PROTOCOL_ERROR geven.
  //
  // Aanpak: geef direct een lege 200 terug (synchroon, verplicht),
  // sla het bestand op in de cache, en stuur de app een signaal via
  // postMessage (app al open) of openWindow (app was gesloten).
  if (e.request.method === 'POST' && url.pathname.endsWith('/share.html')) {

    // Synchroon een lege pagina teruggeven — geen redirect, geen fout
    e.respondWith(
      caches.match('./share.html').then(cached =>
        cached || new Response('<p>laden…</p>', { headers: { 'Content-Type': 'text/html' } })
      )
    );

    // Asynchroon het audiobestand verwerken
    e.waitUntil((async () => {
      const base = self.registration.scope;
      try {
        const formData  = await e.request.formData();
        const audioFile = formData.get('audio');
        if (audioFile instanceof File && audioFile.size > 0) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            new Request(base + '__nk_shared_file__'),
            new Response(audioFile, { headers: { 'Content-Type': audioFile.type || 'audio/mpeg' } })
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
        console.warn('[SW] share formData fout:', err);
      }

      // Stuur signaal naar app
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const appClient  = allClients.find(c => c.url.includes('/app.html'));
      if (appClient) {
        appClient.postMessage({ type: 'NK_SHARED_AUDIO' });
        try { appClient.focus(); } catch (_) {}
      } else {
        await self.clients.openWindow(base + 'app.html?shared_audio=1');
      }
    })());
    return;
  }

  // ── GET share.html → altijd uit cache ─────────────────────────────────────
  if (url.pathname.endsWith('/share.html')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // ── Gewone fetch-strategie ─────────────────────────────────────────────────
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/';
  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

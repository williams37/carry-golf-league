// Carry service worker: network-first for pages, cache-first for hashed assets. Works offline.
const CACHE = 'carry-v6';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => {}))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // never cache Supabase/API calls
  // Course library + tee ratings: answer from cache instantly (works offline), refresh in the background for next time.
  if (url.pathname.endsWith('/courses.json') || url.pathname.endsWith('/tees.json')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit ? (e.waitUntil(fresh), hit) : fresh;
    }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put('./index.html', r.clone())); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; })));
});

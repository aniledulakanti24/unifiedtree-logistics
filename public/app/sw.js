// Offline shell. Pages and assets load from the network first and fall back to cache;
// the app shell is stored at install so UT Log still opens on a weak or missing signal.
// API responses are never cached.
const CACHE = 'ut-log-v2';
const SHELL = ['./', './index.html', './offline.html', './app.css?v=10', './hub.css?v=17', './manifest.webmanifest', './icon-192.png', './icon-512.png', '../assets/favicon.svg', '../assets/logo-light.svg', './js/main.js', './js/core.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/v1/')) return;
  e.respondWith(fetch(e.request).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./offline.html') : undefined))));
});
// Tapping a booking alert opens (or focuses) the app on that page.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './#/home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.includes('/app/'));
    if (open) { open.navigate(target).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});

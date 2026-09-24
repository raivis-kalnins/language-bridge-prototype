const CACHE = 'language-bridge-v0.1.0';
const CORE = ['./','./index.php','./assets/app.css','./assets/app.js','./data/words.json','./manifest.webmanifest','./assets/icons/owl-book-64.png','./assets/icons/owl-book-192.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); return res;
  }).catch(() => caches.match('./'))));
});

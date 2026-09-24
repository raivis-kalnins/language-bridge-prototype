'use strict';
const FALLBACK_VERSION = '1.3.7';
const VERSION = new URL(self.location.href).searchParams.get('v') || FALLBACK_VERSION;
const STATIC = `book-reader-static-${VERSION}`;
const RUNTIME = `book-reader-runtime-${VERSION}`;
const versioned = path => `${path}?v=${encodeURIComponent(VERSION)}`;
const STATIC_ASSETS = [
  './', './offline.html', versioned('./manifest.webmanifest'), versioned('./assets/app.css'), versioned('./assets/i18n.js'), versioned('./assets/app.js'), versioned('./assets/natural-tts.js'), './assets/icons/owl-book-64.png', './assets/icons/owl-book-192.png', './assets/icons/owl-book-512.png', './assets/flags/gb.svg', './assets/flags/de.svg', './assets/flags/fr.svg', './assets/flags/es.svg', './assets/flags/ru.svg', './assets/flags/pl.svg', './assets/flags/lv.svg', './assets/flags/lt.svg', './assets/flags/ee.svg', './assets/flags/dk.svg', './assets/flags/se.svg', './assets/flags/no.svg', './assets/flags/fi.svg', './assets/flags/is.svg', './assets/flags/ua.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC).then(cache => Promise.all(STATIC_ASSETS.map(url => cache.add(url).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![STATIC, RUNTIME].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.includes('api.php') || url.pathname.includes('convert.php')) return;
    const isDocument = req.mode === 'navigate' || req.destination === 'document';
    if (isDocument) {
      event.respondWith(fetch(req).then(res => {
        if (res && res.ok) caches.open(RUNTIME).then(c => c.put(req, res.clone())).catch(() => null);
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('./').then(home => home || caches.match('./offline.html')))));
      return;
    }
    event.respondWith(caches.match(req).then(hit => {
      const network = fetch(req).then(res => {
        if (res && res.ok) caches.open(RUNTIME).then(c => c.put(req, res.clone())).catch(() => null);
        return res;
      }).catch(() => null);
      return hit || network.then(res => res || caches.match('./offline.html'));
    }));
    return;
  }
  if (/cdn\.jsdelivr\.net|huggingface\.co|hf\.co|cdn-lfs\.huggingface\.co|cas-bridge\.xethub\.hf\.co/.test(url.hostname)) {
    event.respondWith(caches.open(RUNTIME).then(async cache => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => null);
      return res;
    }));
  }
});

// SW mínimo: el shell funciona sin internet (el PC está en tu WiFi).
const CACHE = 'vox-remote-v1';
const CORE = ['./', 'index.html', 'client.js', 'manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});
self.addEventListener('fetch', (e) => {
  if (!e.request.url.includes('/api/')) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).catch(() => caches.match('index.html'))));
  }
});

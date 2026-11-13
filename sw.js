const CACHE = 'ggg-apok-v16';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'games.js', 'battle.js', 'maps.js', 'audio.js', 'questions.json', 'manifest.json',
  'vendor/peerjs.min.js', 'vendor/mqtt.min.js', 'vendor/qrcode.js', 'fonts/titan.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo.png',
  'media/intro.mp4', 'media/intro-poster.jpg', 'badges/00_ralf.png', 'badges/01_dr-gosse.png', 'badges/02_h-2-o-k-o-p-f.png', 'badges/03_tamma-hanken.png',
  'badges/04_yen.png', 'badges/05_zlatan.png', 'badges/06_adev.png', 'badges/07_luecke.png',
  'badges/08_busfahrer.png', 'badges/09_hooooooopp-e.png', 'badges/10_schlomo.png', 'badges/11_gaul.png',
  'badges/12_der-wuerger.png', 'badges/13_herausforderer.png',
  'figs/00_ralf.jpg', 'figs/01_dr-gosse.jpg', 'figs/02_h-2-o-k-o-p-f.jpg', 'figs/03_tamma-hanken.jpg', 'figs/04_yen.jpg', 'figs/05_zlatan.jpg', 'figs/06_adev.jpg', 'figs/07_luecke.jpg', 'figs/08_busfahrer.jpg', 'figs/09_hooooooopp-e.jpg', 'figs/10_schlomo.jpg', 'figs/11_gaul.jpg', 'figs/12_der-wuerger.jpg'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // network first, so updates arrive; cache as offline fallback
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});

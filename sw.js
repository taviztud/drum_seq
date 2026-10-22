// Offline app shell. Drum samples are cached separately by smplr's CacheStorage.
// Bump VERSION when shipping changes so returning visitors get the new files.
const VERSION = 'drum_seq-v3.4.0';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'src/main.js', 'src/rack.js', 'src/plan.js', 'src/project.js', 'src/pattern.js', 'src/bass.js', 'src/generate.js', 'src/kits.js',
  'src/ui/knob.js', 'src/ui/note-view.js', 'src/ui/drum-view.js', 'src/ui/mixer-view.js', 'src/ui/song-view.js',
  'src/worklets/open303-processor.js', 'src/worklets/va-processor.js', 'vendor/smplr-1.1.0.mjs',
  'vendor/fonts/archivo-latin-wdth-normal.woff2', 'vendor/fonts/archivo-latin-wdth-italic.woff2', 'vendor/fonts/dseg7-classic-bolditalic.woff2',
];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('drum_seq-v') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));
// Network first, so updates show up right away; the cache answers when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

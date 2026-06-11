// Service worker: кэширует оболочку приложения, чтобы PWA открывался
// мгновенно и без вашего сервера. Сам перевод всё равно требует интернета
// (соединение идёт напрямую к Gemini в облаке).

// При изменении файлов поднимите версию — старый кэш удалится.
const CACHE = 'translator-v4';

const SHELL = [
    'index.html',
    'manifest.json',
    'icon-192.png',
    'icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Кэшируем только GET к нашему же origin (статика).
    // WebSocket к Gemini и любые внешние запросы идут напрямую, мимо кэша.
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
        return;
    }

    const isHTML = req.mode === 'navigate' ||
        req.destination === 'document' ||
        new URL(req.url).pathname.endsWith('index.html');

    if (isHTML) {
        // index.html — NETWORK-FIRST: при наличии сети всегда берём свежую
        // версию (и обновляем кэш), а кэш используем только офлайн.
        // Так новые деплои подхватываются сами, без ручной чистки кэша.
        event.respondWith(
            fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(req, copy));
                return res;
            }).catch(() => caches.match(req).then((c) => c || caches.match('index.html')))
        );
        return;
    }

    // Остальная статика (иконки, manifest) — CACHE-FIRST: быстро и редко меняется.
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(req, copy));
                return res;
            }).catch(() => cached);
        })
    );
});

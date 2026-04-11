const CACHE_PREFIX = 'upkeep';
const CACHE_NAME = `${CACHE_PREFIX}-v20260411pwa1`;
const APP_ASSETS = [
	'./',
	'./app.js',
	'./index.css',
	'./index.html',
	'./index.js',
	'./manifest.webmanifest?v=20260411pwa3',
	'./icons/icon.svg?v=20260411pwa1',
	'./icons/icon-192.png?v=20260411pwa1',
	'./icons/icon-512.png?v=20260411pwa1',
	'./icons/icon-maskable-512.png?v=20260411pwa1',
	'./icons/icon-monochrome-512.png?v=20260411pwa1',
	'../alpine.min.js'
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS))
	);
	self.skipWaiting();
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(keys => Promise.all(
			keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
		)).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	if (event.request.method !== 'GET') {
		return;
	}

	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(() => caches.open(CACHE_NAME).then(cache => cache.match('./index.html')))
		);
		return;
	}

	event.respondWith(
		caches.open(CACHE_NAME).then(cache => cache.match(event.request).then(cachedResponse => {
			if (cachedResponse) {
				return cachedResponse;
			}

			return fetch(event.request).then(networkResponse => {
				if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
					return networkResponse;
				}

				let responseClone = networkResponse.clone();
				event.waitUntil(cache.put(event.request, responseClone));
				return networkResponse;
			});
		}))
	);
});

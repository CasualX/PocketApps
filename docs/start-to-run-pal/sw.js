const CACHE_PREFIX = 'start-to-run-pal';
const CACHE_NAME = `${CACHE_PREFIX}-v20260802offline1`;
const APP_SHELL_URL = new URL('./index.html', self.registration.scope).href;
const APP_ASSETS = [
	'./',
	'./app.js',
	'./icons/icon.svg?v=20260420pwa1',
	'./icons/icon-192.png?v=20260420pwa1',
	'./icons/icon-512.png?v=20260420pwa1',
	'./icons/icon-maskable-512.png?v=20260420pwa1',
	'./icons/icon-monochrome-512.png?v=20260420pwa1',
	'./index.css',
	'./index.html',
	'./index.js',
	'./manifest.webmanifest?v=20260420pwa1',
	'../alpine.min.js',
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => cache.addAll(APP_ASSETS))
			.then(() => self.skipWaiting())
	);
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
			caches.open(CACHE_NAME).then(cache =>
				cache.match(APP_SHELL_URL).then(cachedShell => cachedShell || fetch(event.request))
			)
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

				const responseClone = networkResponse.clone();
				event.waitUntil(cache.put(event.request, responseClone));
				return networkResponse;
			});
		}))
	);
});

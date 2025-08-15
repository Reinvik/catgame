
const CACHE_NAME = 'gato-distribucion-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/constants.ts',
  '/metadata.json',
  '/hooks/useAudio.ts',
  '/components/Modal.tsx',
  '/components/ForkliftIcon.tsx',
  '/manifest.json',
  '/icon.svg',
  'https://cdn.tailwindcss.com',
  'https://esm.sh/react@^19.1.1',
  'https://esm.sh/react-dom@^19.1.1/client',
  'https://esm.sh/react@^19.1.1/jsx-runtime'
];

self.addEventListener('install', event => {
  // Realiza la instalación
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Solo se manejan las solicitudes GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si se encuentra en caché, se retorna la respuesta de la caché
        if (response) {
          return response;
        }
        // Si no, se busca en la red
        return fetch(event.request).then(
          response => {
            // Si la respuesta de la red no es válida, se retorna tal cual
            if(!response || response.status !== 200) {
              return response;
            }

            // Se clona la respuesta para poder almacenarla en caché y retornarla
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // No se cachea el propio service worker
                if (event.request.url.indexOf('sw.js') === -1) {
                    cache.put(event.request, responseToCache);
                }
              });

            return response;
          }
        );
      })
  );
});

const CACHE_NAME =
  "ddn-rider-v1";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/ddn-rider-192.png",
  "./icons/ddn-rider-512.png"
];

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(cache =>
          cache.addAll(
            STATIC_ASSETS
          )
        )
    );

    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      caches
        .keys()
        .then(keys =>
          Promise.all(
            keys
              .filter(
                key =>
                  key !== CACHE_NAME
              )
              .map(
                key =>
                  caches.delete(key)
              )
          )
        )
    );

    self.clients.claim();
  }
);

self.addEventListener(
  "fetch",
  event => {

    if (
      event.request.method !==
      "GET"
    ) {
      return;
    }

    const requestUrl =
      new URL(
        event.request.url
      );

    if (
      requestUrl.origin !==
      self.location.origin
    ) {
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then(response => {

          const responseClone =
            response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache =>
              cache.put(
                event.request,
                responseClone
              )
            );

          return response;
        })
        .catch(() =>
          caches.match(
            event.request
          )
        )
    );
  }
);
/* GeoGLTF service worker — офлайн-кеш коду, бібліотеки three.js та моделей. */
const CACHE = "geogltf-v7";

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./src/app.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/library.json",
  "./assets/vendor/three/three.module.js",
  "./assets/vendor/three/addons/controls/OrbitControls.js",
  "./assets/vendor/three/addons/loaders/GLTFLoader.js",
  "./assets/vendor/three/addons/utils/BufferGeometryUtils.js",
  "./assets/models/cube.glb",
  "./assets/models/cube_slice.glb",
  "./assets/models/prism_tri.glb",
  "./assets/models/prism_hex.glb",
  "./assets/models/Piramide.glb",
  "./assets/models/Cylynder.glb",
  "./assets/models/cone.glb",
  "./assets/models/sphere.glb",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  // Cache-first зі мережевим оновленням (stale-while-revalidate).
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

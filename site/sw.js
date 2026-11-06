// The service worker. The page fetches everything it needs on a first visit
// (the shell, the runtime, the fonts, the holo), so caching each response as
// it passes is enough for the app to load, verify and answer offline; only
// the icons and the manifest, which the page itself never requests, are
// fetched ahead, after install. Nothing is fetched twice, so the first visit
// is as fast with the worker as without it.
//
// precache.json, written by pages.yml after the site is assembled, carries a
// version that is the hash of every served file: a new deploy is a new cache,
// an unchanged deploy is not. Every file but index.html is immutable per
// deploy (the holo is content-addressed), so the cache is the source and the
// network the fallback; index.html goes to the network first, so a new deploy
// is seen on the next visit, and the new worker then tells the page once.
const MANIFEST = "./precache.json";
let cacheName = null;

async function manifest() {
  const response = await fetch(MANIFEST, { cache: "no-store" });
  if (!response.ok) throw new Error(`precache.json: HTTP ${response.status}`);
  return response.json();
}

async function currentCacheName() {
  if (cacheName) return cacheName;
  const names = (await caches.keys()).filter((name) => name.startsWith("prism-"));
  cacheName = names[names.length - 1] ?? null;
  return cacheName;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const list = await manifest();
    cacheName = `prism-${list.version}`;
    const cache = await caches.open(cacheName);
    await cache.put(MANIFEST, new Response(JSON.stringify(list), { headers: { "content-type": "application/json" } }));
    const eager = list.files.filter((file) => file.eager).map((file) => new Request(file.path, { cache: "reload" }));
    await cache.addAll(eager);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = await currentCacheName();
    for (const name of await caches.keys()) {
      if (name.startsWith("prism-") && name !== keep) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

// The canonical frame comes from the template's Pages site: its pointer from
// the network first (so a new frame shows on the next load), and its modules,
// immutable by their SHA-256, from the cache first; both are kept for offline.
const framePointer = /\/frame\/current\.json$/;
const frameModule = /\/frame\/[0-9a-f]{64}\/prism-frame\.mjs$/;
async function frame(request, url) {
  const name = await currentCacheName();
  const cache = name ? await caches.open(name) : null;
  if (frameModule.test(url.pathname)) {
    const hit = cache && (await cache.match(request));
    if (hit) return hit;
  }
  try {
    const fresh = await fetch(request);
    if (fresh.ok && cache) await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (cache && (await cache.match(request))) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "GET" && (framePointer.test(url.pathname) || frameModule.test(url.pathname))) {
    event.respondWith(frame(event.request, url));
    return;
  }
  // Only the app's own files: another app on the same origin (Holo Search's
  // registry, say) is never cached here, so it is never served stale.
  if (event.request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith("/precache.json")) return;
  const isPage = event.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  event.respondWith((async () => {
    const name = await currentCacheName();
    const cache = name ? await caches.open(name) : null;
    if (isPage) {
      try {
        const fresh = await fetch(event.request);
        if (fresh.ok && cache) await cache.put("./", fresh.clone());
        return fresh;
      } catch {
        return (cache && ((await cache.match("./")) ?? (await cache.match(event.request)))) ?? Response.error();
      }
    }
    const hit = cache && (await cache.match(event.request, { ignoreSearch: true }));
    if (hit) return hit;
    const fresh = await fetch(event.request);
    if (fresh.ok && cache) await cache.put(event.request, fresh.clone());
    return fresh;
  })());
});

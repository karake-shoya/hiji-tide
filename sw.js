// 圏外でも潮見表が開くようにするための Service Worker。
// 潮位・日の出入り・月齢・釣りどきはブラウザ内で計算するので、通信なしで完全に動く。
//
// 🔴 js/ にファイルを足したら SHELL に書き足し、VERSION を1つ上げること。
//    上げ忘れると古いファイルが配られ続ける。

const VERSION = "v1";
const CACHE = `hiji-tide-${VERSION}`;

const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/style.css",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-180.png",
  "/js/main.js",
  "/js/config.js",
  "/js/tide.js",
  "/js/astro.js",
  "/js/fishing.js",
  "/js/chart.js",
  "/js/format.js",
  "/js/weather.js",
  "/js/news.js",
  "/js/store.js",
  "/js/data/fish.js",
  "/js/data/gear.js",
  "/js/data/terms.js",
  "/js/ui/view.js",
  "/js/ui/menu.js",
  "/js/ui/panels.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // 1つでも失敗すると全部入らないので、取れたものだけ入れる
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** 取れたら配って控えも取る。取れなければ控えを配る */
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const c = await caches.open(CACHE);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw new Error("offline");
  }
}

/** 控えがあれば即配る。無ければ取りに行く */
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) {
    const c = await caches.open(CACHE);
    c.put(req, res.clone());
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // ページ本体は新しいものを優先する。圏外ならキャッシュしたページを出す
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req).catch(() => caches.match("/index.html")));
    return;
  }

  // ニュースと天気は鮮度が命。取れなければ控えでしのぐ
  if (!sameOrigin || url.pathname.startsWith("/api/")) {
    e.respondWith(networkFirst(req).catch(() => new Response("", { status: 504 })));
    return;
  }

  e.respondWith(cacheFirst(req).catch(() => new Response("", { status: 504 })));
});

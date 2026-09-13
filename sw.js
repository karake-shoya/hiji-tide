// 圏外でも潮見表が開くようにするための Service Worker。
// 潮位・日の出入り・月齢・釣りどきはブラウザ内で計算するので、通信なしで完全に動く。
//
// 🔴 css/ か js/ にファイルを足したら SHELL に書き足し、VERSION を1つ上げること。
//    中身を変えただけなら VERSION はそのままでよい（css と js はネットワーク優先で配るので、
//    次に開いたときに最新が出る）。
//    書き足しの漏れは test/shell.test.js が落とす（VERSION の上げ忘れまでは見ていない）。

const VERSION = "v6";

/** ネットワークを待つ上限。これを過ぎたらキャッシュで出す（釣り場の弱い電波で待たされないため） */
const NET_TIMEOUT = 2500;
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
  "/js/ui/nav.js",
  "/js/ui/panels.js",
  "/js/ui/pull.js",
  "/js/ui/week.js",
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

/**
 * ネットワークを先に試し、取れたら控えも更新する。
 * 遅いときと圏外のときはキャッシュで出す。裏のネットワークはそのまま走らせて控えを新しくするので、
 * 一度タイムアウトしても次に開いたときには最新になっている。
 */
function networkFirst(req) {
  const net = fetch(req).then((res) => {
    if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
    return res;
  });
  net.catch(() => {}); // 誰も待っていない間に失敗しても警告を出さない

  const tooSlow = new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NET_TIMEOUT));

  return Promise.race([net, tooSlow]).catch(async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    return net; // 控えも無ければ、遅くてもネットワークを待つしかない
  });
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

  // ニュースと天気は鮮度が命。
  // css と js も新しいものを優先する。cache-first にすると、直したものが実機に届くまで
  // 数回ひらき直す必要があって実用にならなかった（2026-09-13 に実測）
  if (!sameOrigin || url.pathname.startsWith("/api/") || /^\/(css|js)\//.test(url.pathname)) {
    e.respondWith(networkFirst(req).catch(() => new Response("", { status: 504 })));
    return;
  }

  // アイコンと manifest は変わらないので控えを先に出す
  e.respondWith(cacheFirst(req).catch(() => new Response("", { status: 504 })));
});

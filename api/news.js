// 釣りニュースの見出しを返す。RSS はブラウザから直接読めない（CORS）ためここで中継する。
// 記事本文（description / content:encoded）は読み捨てる。見出しと原文リンクだけを返す。

const FEEDS = [
  { url: "https://tsurinews.jp/feed/", name: "TSURINEWS", host: "tsurinews.jp" },
  { url: "https://tsurihack.com/feed/", name: "TSURI HACK", host: "tsurihack.com" },
];
const LIMIT = 6;      // 一覧に出す総件数
const PER_FEED = 4;   // 1サイトが一覧を占めないようにする上限

// &#8230; のような数値参照と主要な名前付き参照を戻す
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // & は最後に戻す。先に戻すと二重デコードになる
}

function safeChar(code) {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "";
}

function unwrap(raw) {
  const s = raw.trim();
  const cdata = s.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return decodeEntities((cdata ? cdata[1] : s).trim());
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? unwrap(m[1]) : "";
}

// 配信元以外への誘導を防ぐ。リンク先は必ずそのフィードのドメインに限る
function safeLink(url, host) {
  try {
    const u = new URL(url);
    const ok = u.protocol === "https:" &&
      (u.hostname === host || u.hostname.endsWith("." + host));
    return ok ? u.href : "";
  } catch {
    return "";
  }
}

function parseFeed(xml, feed) {
  return xml
    .split("<item>")
    .slice(1)
    .map((chunk) => chunk.split("</item>")[0])
    .map((block) => {
      const at = new Date(pick(block, "pubDate"));
      return {
        title: pick(block, "title"),
        link: safeLink(pick(block, "link"), feed.host),
        date: isNaN(at) ? "" : at.toISOString(),
        source: feed.name,
      };
    })
    .filter((it) => it.title && it.link)
    .slice(0, PER_FEED);
}

async function fetchFeed(feed) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "hiji-tide (+https://hiji-tide.vercel.app/)" },
    });
    if (!r.ok) throw new Error(feed.name + " status " + r.status);
    return parseFeed(await r.text(), feed);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  // 片方のサイトが落ちても、もう片方が取れていれば出す。全滅でも 200 と空配列を返す
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const items = settled
    .filter((s) => s.status === "fulfilled")
    .flatMap((s) => s.value)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, LIMIT);
  const failed = settled
    .map((s, i) => (s.status === "rejected" ? FEEDS[i].name : null))
    .filter(Boolean);

  res.status(200).send(JSON.stringify(failed.length ? { items, failed } : { items }));
};

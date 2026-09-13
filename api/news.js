// 釣りニュースの見出しを返す。RSS はブラウザから直接読めない（CORS）ためここで中継する。
// 記事本文（description / content:encoded）は読み捨てる。見出しと原文リンクだけを返す。

const FEED = "https://tsurinews.jp/feed/";
const SOURCE = "TSURINEWS";
const ALLOWED_HOST = "tsurinews.jp";
const LIMIT = 5;

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

// 元サイト以外への誘導を防ぐ
function safeLink(url) {
  try {
    const u = new URL(url);
    const ok = u.protocol === "https:" &&
      (u.hostname === ALLOWED_HOST || u.hostname.endsWith("." + ALLOWED_HOST));
    return ok ? u.href : "";
  } catch {
    return "";
  }
}

function parseFeed(xml) {
  return xml
    .split("<item>")
    .slice(1)
    .map((chunk) => chunk.split("</item>")[0])
    .map((block) => {
      const pub = pick(block, "pubDate");
      const at = new Date(pub);
      return {
        title: pick(block, "title"),
        link: safeLink(pick(block, "link")),
        date: isNaN(at) ? "" : at.toISOString(),
        source: SOURCE,
      };
    })
    .filter((it) => it.title && it.link)
    .slice(0, LIMIT);
}

module.exports = async (req, res) => {
  // 取得に失敗しても 200 と空配列を返す。ページ側はセクションを隠すだけで済む
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(FEED, {
      signal: ctrl.signal,
      headers: { "User-Agent": "hiji-tide (+https://hiji-tide.vercel.app/)" },
    });
    if (!r.ok) throw new Error("feed status " + r.status);
    const items = parseFeed(await r.text());
    res.status(200).send(JSON.stringify({ items }));
  } catch (e) {
    res.status(200).send(JSON.stringify({ items: [], error: String(e.message || e) }));
  } finally {
    clearTimeout(timer);
  }
};

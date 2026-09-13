// 釣りニュースの見出し。日付ナビとは連動せず、起動時に1回だけ読む。
//
// 🔴 見出し・日付・出典・元記事リンクだけを扱う。記事本文は持たない（引用条件を満たすため）。
// 中継は api/news.js（RSS には CORS ヘッダが無くブラウザから直接読めない）。

/**
 * 見出しの一覧。取れないときは空配列。
 * 外部由来の文字列なので、描画側では必ず textContent で入れること。
 */
export async function loadNews() {
  try {
    const r = await fetch("/api/news");
    const j = await r.json();
    const items = j && Array.isArray(j.items) ? j.items : [];
    return items.filter((it) => it && it.title && typeof it.link === "string" && it.link.startsWith("https://"));
  } catch {
    return [];
  }
}

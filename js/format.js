// 表示用の整形。日付と時刻は常に日本時間で扱う（UTC のメソッドに9時間足す）。

export const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 実時刻ミリ秒 → "HH:MM"（日本時間） */
export const fmt = (ms) => {
  const d = new Date(ms + 9 * 3600000);
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
};

/** 表示中の日からはみ出す時刻に「前」「翌」を付ける */
export const fmtD = (ms, d) => (ms < d.start ? "前" : ms >= d.end ? "翌" : "") + fmt(ms);

/** その時刻を含む日の JST 0:00 */
export function jstMidnight(dt) {
  const j = new Date(dt.getTime() + 9 * 3600000);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - 9 * 3600000);
}

/** 実時刻ミリ秒 → "YYYY-MM-DD"（日本時間） */
export const isoJst = (ms) => {
  const j = new Date(ms + 9 * 3600000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
};

/** JST の暦日を取り出す。{y, m, d, wd} */
export function jstParts(ms) {
  const j = new Date(ms + 9 * 3600000);
  return { y: j.getUTCFullYear(), m: j.getUTCMonth() + 1, d: j.getUTCDate(), wd: j.getUTCDay() };
}

/** "YYYY-MM-DD" → JST 0:00 の Date。書式違いと 2026-02-31 のような日付は null */
export function parseIsoJst(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, dd] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== dd) return null;
  return new Date(t.getTime() - 9 * 3600000);
}

/** URL の ?d=YYYY-MM-DD を読む。読めない値は null（呼び出し側で今日に戻す） */
export function dateFromQuery() {
  return parseIsoJst(new URLSearchParams(location.search).get("d"));
}

/** 分数 → "1時間38分"。0分は "0分" */
export function durationText(mins) {
  const h = Math.floor(mins / 60),
    m = Math.round(mins % 60);
  if (h && m) return `${h}時間${m}分`;
  if (h) return `${h}時間`;
  return `${m}分`;
}

/** ミリ秒 → "あと1時間38分" 相当の短い表記 */
export const untilText = (ms) => durationText(Math.max(0, Math.round(ms / 60000)));

/** 外部・利用者に由来する文字列を HTML に埋める前に無害化する */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

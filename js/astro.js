// 日の出・日の入り、月齢、潮回りの名前。外部への問い合わせはない。
//
// 🔴 tide.js と同じく動作の根幹。変更するときは `node --test test/` を通すこと。

import { D2R, LAT, LON } from "./config.js";

/**
 * その日の日の出・日の入り（大気差 -0.833° を考慮）。
 * @param {Date} date その日を含む時刻。正午を渡すのが安全
 */
export function sunTimes(date) {
  const rad = D2R,
    dayMs = 86400000,
    J1970 = 2440588,
    J2000 = 2451545;
  const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (d) => toJulian(d) - J2000;
  const e = rad * 23.4397;
  const d = toDays(date);
  const lw = rad * -LON,
    phi = rad * LAT;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const Jtransit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const h0 = rad * -0.833;
  const cosH = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH)));
  const a2 = 0.0009 + (H / (2 * Math.PI) + lw / (2 * Math.PI)) + n;
  const Jset = J2000 + a2 + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const Jrise = Jtransit - (Jset - Jtransit);
  return { rise: fromJulian(Jrise), set: fromJulian(Jset) };
}

/** 新月からの日数（0〜29.53）。 */
export function moonAge(date) {
  const synodic = 29.530588853;
  const newMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  let age = ((date.getTime() - newMoon) / 86400000) % synodic;
  if (age < 0) age += synodic;
  return age;
}

const TIDE_NAME = [null, "大潮", "大潮", "大潮", "中潮", "中潮", "中潮", "中潮", "小潮", "小潮", "小潮", "長潮", "若潮", "中潮", "中潮", "大潮", "大潮", "大潮", "大潮", "中潮", "中潮", "中潮", "中潮", "小潮", "小潮", "小潮", "長潮", "若潮", "中潮", "中潮", "大潮"];

/**
 * 潮回りの名前。月齢から求めるため旧暦基準の表記と1日ずれることがある。
 * 強さを見るときは名前より干満差の数値を優先すること。
 */
export function tideName(date) {
  const d = Math.floor(moonAge(date)) + 1;
  return TIDE_NAME[Math.min(30, d)] || "中潮";
}

/** 月の満ち欠けの見た目（月齢から絵文字と呼び名を返す）。 */
export function moonPhase(date) {
  const age = moonAge(date);
  const table = [
    [1.8, "🌑", "新月"],
    [5.5, "🌒", "三日月"],
    [9.2, "🌓", "上弦"],
    [12.9, "🌔", "十三夜"],
    [16.6, "🌕", "満月"],
    [20.3, "🌖", "居待月"],
    [24.0, "🌗", "下弦"],
    [27.7, "🌘", "有明月"],
  ];
  for (const [limit, icon, name] of table) if (age < limit) return { age, icon, name };
  return { age, icon: "🌑", name: "新月" };
}

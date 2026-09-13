// 風と天気（Open-Meteo・CC BY 4.0）。
//
// 🔴 非商用なら1日1万リクエストまで無料で API キーは要らない。広告を入れるときは要見直し。
// ⚠ 予報のある期間だけ返る。実測では今日から過去93日〜先15日。範囲外の日は API がエラーを返す。
// ⚠ 波高は別府湾内が海域モデルの範囲外（全て null）なので扱わない。

import { LAT, LON } from "./config.js";

const HOURLY = ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "temperature_2m", "precipitation_probability", "weather_code"].join(",");

const DIRS = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];

/** 風向（度）→ 16方位の日本語 */
export const windDir = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** WMO の天気コード → 絵文字と呼び名 */
export function sky(code) {
  const t = {
    0: ["☀️", "快晴"],
    1: ["🌤", "晴れ"],
    2: ["⛅", "薄曇り"],
    3: ["☁️", "曇り"],
    45: ["🌫", "霧"],
    48: ["🌫", "霧"],
    51: ["🌦", "霧雨"],
    53: ["🌦", "霧雨"],
    55: ["🌦", "霧雨"],
    56: ["🌧", "冷たい霧雨"],
    57: ["🌧", "冷たい霧雨"],
    61: ["🌧", "弱い雨"],
    63: ["🌧", "雨"],
    65: ["🌧", "強い雨"],
    66: ["🌧", "冷たい雨"],
    67: ["🌧", "冷たい雨"],
    71: ["🌨", "弱い雪"],
    73: ["🌨", "雪"],
    75: ["🌨", "強い雪"],
    77: ["🌨", "霧雪"],
    80: ["🌦", "にわか雨"],
    81: ["🌦", "にわか雨"],
    82: ["🌦", "激しいにわか雨"],
    85: ["🌨", "にわか雪"],
    86: ["🌨", "にわか雪"],
    95: ["⛈", "雷雨"],
    96: ["⛈", "雷雨と雹"],
    99: ["⛈", "雷雨と雹"],
  };
  return t[code] || ["", ""];
}

const cache = new Map(); // 日付文字列 → hourly データ（予報の範囲外は null）

/** その日の予報。範囲外なら null。通信の失敗は覚えず、次に開いたとき再試行する */
export async function loadWeather(iso) {
  if (cache.has(iso)) return cache.get(iso);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=${HOURLY}&timezone=Asia%2FTokyo&wind_speed_unit=ms&start_date=${iso}&end_date=${iso}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    const h = j && j.hourly && Array.isArray(j.hourly.time) ? j.hourly : null;
    cache.set(iso, h); // 範囲外の日（API が error を返す）も覚えて再問い合わせしない
    return h;
  } catch {
    return null;
  }
}

/** すでに取得済みならその値、まだなら undefined */
export const cachedWeather = (iso) => cache.get(iso);

const hourMs = (t) => Date.parse(t + ":00+09:00");

/** 区間 from〜to に重なる時刻の平均。データが無い項目は null */
export function avgOver(h, from, to) {
  let ws = 0,
    wn = 0,
    ts = 0,
    tn = 0,
    pMax = null;
  for (let i = 0; i < h.time.length; i++) {
    const ms = hourMs(h.time[i]);
    if (ms < from || ms > to) continue;
    const w = h.wind_speed_10m?.[i];
    if (w != null) {
      ws += w;
      wn++;
    }
    const t = h.temperature_2m?.[i];
    if (t != null) {
      ts += t;
      tn++;
    }
    const p = h.precipitation_probability?.[i];
    if (p != null) pMax = pMax === null ? p : Math.max(pMax, p);
  }
  return { wind: wn ? ws / wn : null, temp: tn ? ts / tn : null, pop: pMax };
}

/** 3時間ごとの並び。画面の天気欄に出す形にそろえる */
export function threeHourly(h, hours = [0, 3, 6, 9, 12, 15, 18, 21]) {
  return hours.map((hh) => {
    const i = h.time.findIndex((t) => Number(t.slice(11, 13)) === hh);
    if (i < 0) return { hour: hh };
    return {
      hour: hh,
      wind: h.wind_speed_10m?.[i] ?? null,
      dir: h.wind_direction_10m?.[i] ?? null,
      temp: h.temperature_2m?.[i] ?? null,
      pop: h.precipitation_probability?.[i] ?? null,
      code: h.weather_code?.[i] ?? null,
    };
  });
}

/** その日の最大瞬間風速と、その時刻 */
export function peakGust(h) {
  let gust = null,
    at = 0;
  for (let i = 0; i < h.time.length; i++) {
    const g = h.wind_gusts_10m?.[i];
    if (g != null && (gust === null || g > gust)) {
      gust = g;
      at = Number(h.time[i].slice(11, 13));
    }
  }
  return gust === null ? null : { gust, at };
}

/** 風速の強さ。3m/s と 5m/s で色を変える */
export const windClass = (v) => (v == null ? "" : v >= 5 ? "strong" : v >= 3 ? "mid" : "");

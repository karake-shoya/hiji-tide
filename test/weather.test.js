// 天気から釣りに向かない時間帯を割り出すところ。
//
// 通信はしない。Open-Meteo が返す形（hourly）を手で作って、
// 区間のまとめ方と注意書きの出方だけを見る。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";

import { conditionsOver, cautionOf, CAUTION } from "../js/weather.js";

const ms = (hhmm) => Date.parse(`2026-09-20T${hhmm}:00+09:00`);

/** 0時から1時間刻みで n 時間ぶんの hourly を作る */
function hourly(rows) {
  return {
    time: rows.map((_, i) => `2026-09-20T${String(i).padStart(2, "0")}:00`),
    wind_speed_10m: rows.map((r) => r.wind ?? null),
    wind_gusts_10m: rows.map((r) => r.gust ?? null),
    temperature_2m: rows.map((r) => r.temp ?? null),
    precipitation_probability: rows.map((r) => r.pop ?? null),
    weather_code: rows.map((r) => r.code ?? null),
  };
}

test("区間のまとめは風と気温が平均、降水確率と突風が最大", () => {
  const h = hourly([
    { wind: 1, gust: 2, temp: 20, pop: 10, code: 0 },
    { wind: 3, gust: 9, temp: 22, pop: 90, code: 3 },
    { wind: 5, gust: 6, temp: 24, pop: 40, code: 3 },
    { wind: 99, gust: 99, temp: 99, pop: 99, code: 95 }, // 区間の外。混ざってはいけない
  ]);
  const a = conditionsOver(h, ms("00:00"), ms("02:00"));
  assert.equal(a.wind, 3, "風は平均");
  assert.equal(a.temp, 22, "気温は平均");
  assert.equal(a.pop, 90, "降水確率は最大");
  assert.equal(a.gust, 9, "突風は最大");
  assert.deepEqual(a.codes, [0, 3], "天気コードは重複なしで出た順");
});

test("データが無い項目は null、コードは空の並び", () => {
  const h = hourly([{}, {}]);
  const a = conditionsOver(h, ms("00:00"), ms("01:00"));
  assert.deepEqual(a, { wind: null, temp: null, pop: null, gust: null, codes: [] });
  assert.deepEqual(cautionOf(a), { level: null, reasons: [] }, "取れない日は注意書きを出さない");
});

test("おだやかな時間帯には何も出さない", () => {
  const c = cautionOf({ wind: 2.4, gust: 4, pop: 20, codes: [1] });
  assert.equal(c.level, null);
  assert.deepEqual(c.reasons, []);
});

test("風が強めなら「用心して」、限度を超えたら「向かない」", () => {
  const mid = cautionOf({ wind: CAUTION.wind, gust: 5, pop: 0, codes: [0] });
  assert.equal(mid.level, "warn");
  assert.equal(mid.reasons.length, 1);
  assert.match(mid.reasons[0], /風が平均5\.0m\/s/);

  const bad = cautionOf({ wind: CAUTION.windBad, gust: 5, pop: 0, codes: [0] });
  assert.equal(bad.level, "avoid");
  assert.equal(bad.reasons.length, 1, "7m/s のときに 5m/s の文を重ねて出さない");
  assert.match(bad.reasons[0], /釣りになりません/);
});

test("突風だけが強い時間帯も拾う", () => {
  const warn = cautionOf({ wind: 2, gust: CAUTION.gust, pop: 0, codes: [0] });
  assert.equal(warn.level, "warn");
  assert.match(warn.reasons[0], /最大瞬間8\.0m\/s/);

  const bad = cautionOf({ wind: 2, gust: CAUTION.gustBad, pop: 0, codes: [0] });
  assert.equal(bad.level, "avoid");
  assert.equal(bad.reasons.length, 1);
});

test("雷は風がなくても「向かない」", () => {
  const c = cautionOf({ wind: 1, gust: 1, pop: 50, codes: [3, 95] });
  assert.equal(c.level, "avoid");
  assert.match(c.reasons[0], /雷/);
});

test("強い雨のときは降水確率を重ねない", () => {
  const c = cautionOf({ wind: 1, gust: 1, pop: 90, codes: [65] });
  assert.equal(c.level, "warn");
  assert.equal(c.reasons.length, 1);
  assert.match(c.reasons[0], /強い雨の予報（降水確率90%）/);

  const rainy = cautionOf({ wind: 1, gust: 1, pop: CAUTION.pop, codes: [61] });
  assert.equal(rainy.level, "warn");
  assert.match(rainy.reasons[0], /降水確率70%/);
});

test("雪と霧も理由に出る", () => {
  assert.match(cautionOf({ wind: 1, gust: 1, pop: 0, codes: [73] }).reasons[0], /雪/);
  assert.match(cautionOf({ wind: 1, gust: 1, pop: 0, codes: [45] }).reasons[0], /霧/);
});

test("理由は重い順。雷・風・突風・雨の順で並ぶ", () => {
  const c = cautionOf({ wind: 8, gust: 12, pop: 95, codes: [95, 65] });
  assert.equal(c.level, "avoid");
  assert.deepEqual(
    c.reasons.map((r) => r.slice(0, 4)),
    ["雷雨の予", "風が平均", "最大瞬間", "強い雨の"]
  );
});

// 潮汐・日の出入り・釣りどき判定の回帰テスト。
//
// test/fixtures/tide-2026.json は、モジュールへ分割する前の index.html から生成した値。
// ここが通るかぎり、分割やリファクタで推算結果は1つも動いていない。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { tide, CONST, Z0 } from "../js/tide.js";
import { sunTimes, moonAge, tideName } from "../js/astro.js";
import { dayData, bestSlots, allSlots, dayStrength, FLOW_REF } from "../js/fishing.js";
import { isoJst, jstMidnight } from "../js/format.js";

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/tide-2026.json"), "utf8"));

/** 浮動小数の一致。分割しただけなら完全一致するが、丸め誤差ぶんだけ許す */
const EPS = 1e-9;
const near = (a, b, what) => assert.ok(Math.abs(a - b) < EPS, `${what}: ${a} ≠ ${b}（差 ${Math.abs(a - b)}）`);

const jstStart = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600000;
};

test("調和定数そのものが変わっていない", () => {
  assert.equal(CONST.length, golden.constCount, "分潮の数");
  assert.equal(Z0, golden.Z0, "基準面 Z0");
  assert.equal(FLOW_REF, golden.FLOW_REF, "流速スコアの基準");
});

test("2026年の全日・1時間刻みの潮位が分割前と一致する", () => {
  const first = jstStart("2026-01-01");
  assert.equal(golden.hourly.length, 365 * 24, "点の数");
  for (let i = 0; i < golden.hourly.length; i++) {
    near(tide(first + i * 3600000), golden.hourly[i], `潮位 i=${i}`);
  }
});

test("日の出・日の入り・月齢・潮回りが分割前と一致する", () => {
  for (const day of golden.days) {
    const noon = new Date(jstStart(day.iso) + 12 * 3600000);
    near(sunTimes(noon).rise.getTime(), day.sunrise, `日の出 ${day.iso}`);
    near(sunTimes(noon).set.getTime(), day.sunset, `日の入り ${day.iso}`);
    near(moonAge(noon), day.moonAge, `月齢 ${day.iso}`);
    assert.equal(tideName(noon), day.tideName, `潮回り ${day.iso}`);
  }
});

test("満潮・干潮・最大流速・釣りどき区間が分割前と一致する", () => {
  for (const day of golden.days) {
    const d = dayData(new Date(jstStart(day.iso)));
    near(d.maxFlow, day.maxFlow, `最大流速 ${day.iso}`);

    assert.equal(d.inDay.length, day.ext.length, `満干潮の数 ${day.iso}`);
    d.inDay.forEach((e, i) => {
      const [type, ms, v] = day.ext[i];
      assert.equal(e.type, type, `満干潮の種別 ${day.iso}[${i}]`);
      near(e.ms, ms, `満干潮の時刻 ${day.iso}[${i}]`);
      near(e.v, v, `満干潮の潮位 ${day.iso}[${i}]`);
    });

    const { slots, weak } = bestSlots(d);
    assert.equal(weak, day.weak, `次善フラグ ${day.iso}`);
    assert.equal(slots.length, day.slots.length, `釣りどきの数 ${day.iso}`);
    slots.forEach((s, i) => {
      const [from, to, avg] = day.slots[i];
      near(s.from, from, `釣りどき開始 ${day.iso}[${i}]`);
      near(s.to, to, `釣りどき終了 ${day.iso}[${i}]`);
      near(s.avg, avg, `釣りどき平均スコア ${day.iso}[${i}]`);
    });
  }
});

test("釣りどきが0件になる日は2026年で4月9日だけ", () => {
  // 閾値を 0.42 まで下げても、40分以上続く区間が取れない日がある。
  // UI はこの日に空の文面を出す。件数が変わったら採点式か閾値が動いている。
  const empty = golden.days.filter((d) => d.slots.length === 0).map((d) => d.iso);
  assert.deepEqual(empty, ["2026-04-09"]);

  const weak = golden.days.filter((d) => d.weak && d.slots.length === 1).length;
  assert.equal(weak, 40, "次善の1件だけを出す日の数");
});

test("どの日も本命と次点で2〜3本の時間帯が出る", () => {
  // 本命（TH_MAIN）だけだと年の半分は1本しか出ない。行く時間を選べるよう、
  // 閾値を下げた次点で2〜3本に揃える。件数が動いたら TH_EXTRA か WANT_SLOTS が変わっている
  const counts = {};
  for (const day of golden.days) {
    const d = dayData(new Date(jstStart(day.iso)));
    const all = allSlots(bestSlots(d));
    assert.ok(all.length >= 2 && all.length <= 3, `時間帯の数 ${day.iso}: ${all.length}`);
    counts[all.length] = (counts[all.length] || 0) + 1;
  }
  assert.deepEqual(counts, { 2: 99, 3: 266 });
});

test("次点は本命を1つも動かさず、重ならずに足される", () => {
  const HOUR = 3600000;
  for (const day of golden.days) {
    const d = dayData(new Date(jstStart(day.iso)));
    const b = bestSlots(d);
    // 本命は分割前のまま（件数と時刻は上の回帰テストが見ている）
    assert.equal(b.slots.length, day.slots.length, `本命の数 ${day.iso}`);
    assert.ok(
      b.slots.every((s) => !s.sub),
      `本命に sub が立っている ${day.iso}`
    );

    const all = allSlots(b);
    assert.deepEqual(
      all.map((s) => s.from),
      all.map((s) => s.from).sort((a, c) => a - c),
      `時刻順 ${day.iso}`
    );
    for (const e of b.extra) {
      assert.equal(e.sub, true, `次点の印 ${day.iso}`);
      assert.ok(e.to - e.from >= 40 * 60000, `次点の長さ ${day.iso}`);
      assert.ok(e.to > d.start && e.from < d.end, `次点がその日と重なる ${day.iso}`);
      for (const other of all) {
        if (other === e) continue;
        assert.ok(e.from - HOUR >= other.to || e.to <= other.from - HOUR, `次点が近すぎる ${day.iso}`);
      }
    }
  }
});

test("本命が0件の4月9日も、次点だけで2本出す", () => {
  const b = bestSlots(dayData(new Date(jstStart("2026-04-09"))));
  assert.equal(b.slots.length, 0, "本命は従来どおり0件");
  assert.equal(b.weak, true);
  assert.equal(b.extra.length, 2);
});

test("日の強弱バッジの境目は 45 と 35 cm/時", () => {
  assert.equal(dayStrength(45).key, "strong");
  assert.equal(dayStrength(44.6).key, "strong", "表示は45なので strong に倒す");
  assert.equal(dayStrength(44.4).key, "mid");
  assert.equal(dayStrength(35).key, "mid");
  assert.equal(dayStrength(34.4).key, "calm");
});

test("日付の整形が日本時間で往復する", () => {
  assert.equal(isoJst(jstStart("2026-09-13")), "2026-09-13");
  assert.equal(isoJst(jstStart("2026-09-13") + 86399999), "2026-09-13", "その日の23:59:59も同じ日");
  assert.equal(isoJst(jstStart("2026-09-13") + 86400000), "2026-09-14", "翌0:00は翌日");
  assert.equal(jstMidnight(new Date(jstStart("2026-09-13") + 5 * 3600000)).getTime(), jstStart("2026-09-13"));
});

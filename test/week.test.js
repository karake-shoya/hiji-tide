// 週間ビューが並べる7日ぶんの要約。
// 採点そのものは fishing.js の回帰テスト（tide.test.js）が見ているので、
// ここでは「単日と同じ値を並べているか」だけを見る。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";

import { dayData, bestSlots, dayStrength } from "../js/fishing.js";
import { tideName } from "../js/astro.js";
import { weekSummary } from "../js/ui/week.js";

const jstStart = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600000;
};

test("起点の日から7日ぶんを日付順に並べる", () => {
  const rows = weekSummary(jstStart("2026-09-13"));
  assert.equal(rows.length, 7);
  assert.deepEqual(
    rows.map((r) => r.iso),
    ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"]
  );
  assert.equal(rows[0].label, "9月13日(日)");
  assert.equal(weekSummary(jstStart("2026-09-13"), 3).length, 3, "日数は変えられる");
});

test("各行の値が単日の計算と一致する", () => {
  for (const row of weekSummary(jstStart("2026-09-13"))) {
    const d = dayData(new Date(jstStart(row.iso)));
    const { slots, weak } = bestSlots(d);
    assert.equal(row.range, d.range, `干満差 ${row.iso}`);
    assert.equal(row.tideName, tideName(new Date(d.start + 12 * 3600000)), `潮回り ${row.iso}`);
    assert.deepEqual(row.strength, dayStrength(d.maxFlow), `強弱 ${row.iso}`);
    assert.equal(row.weak, weak, `次善フラグ ${row.iso}`);
    assert.equal(row.start, d.start, `日の始まり ${row.iso}`);
    assert.equal(row.end, d.end, `日の終わり ${row.iso}`);

    const best = slots.length ? slots.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
    if (!best) {
      assert.equal(row.top, null, `釣りどきなし ${row.iso}`);
    } else {
      assert.equal(row.top.from, best.from, `いちばんの開始 ${row.iso}`);
      assert.equal(row.top.to, best.to, `いちばんの終了 ${row.iso}`);
    }
  }
});

test("釣りどきが0件の日は top が null になる", () => {
  // 2026年で釣りどきが取れないのは 4月9日だけ（tide.test.js で全日を確認済み）
  const rows = weekSummary(jstStart("2026-04-06"));
  const empty = rows.filter((r) => r.top === null).map((r) => r.iso);
  assert.deepEqual(empty, ["2026-04-09"]);
});

test("同じ日を2回作っても同じ値になる", () => {
  // 2回目は作り直さずキャッシュから返す。値が食い違えば使い回しが壊れている
  const a = weekSummary(jstStart("2026-09-13"));
  const b = weekSummary(jstStart("2026-09-13"));
  assert.deepEqual(b, a);

  // 1日ずらしたときも、重なる6日は同じ値で並ぶ
  const c = weekSummary(jstStart("2026-09-14"));
  assert.deepEqual(c.slice(0, 6), a.slice(1));
});

test("1日ぶんの計算結果を抱え込まない", () => {
  // dayData は1日あたり約1900点を返す。7日ぶん持ち続けないための歯止め
  const row = weekSummary(jstStart("2026-09-13"), 1)[0];
  assert.equal(row.pts, undefined);
  assert.equal(row.scored, undefined);
});

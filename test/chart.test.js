// 潮位グラフの満干潮ラベルの置き方。
//
// ラベルは必ず点の真上（真下）に置く。端で枠内へ押し込むと、離れたラベルが
// 隣の点の時刻に見える（2026-09-19 の 23:58 が実際にそうなっていた）。
// はみ出しは左右の余白をラベルの半幅より広く取ることで防ぐ。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";

import { dayData, bestSlots } from "../js/fishing.js";
import { drawChart } from "../js/chart.js";
import { fmt, isoJst } from "../js/format.js";

/** "22:30" の実寸の目安。font-size 11.5・太字の数字5文字（実測 35px） */
const LABEL_W = 35;
const LINE_H = 12;

const jstStart = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600000;
};

/**
 * その日のグラフから、満干潮の点とラベルを取り出す。
 * 座標は SVG の出力そのものを読む（余白の値をテスト側に書き写さないため）。
 */
function labelsOf(startMs) {
  const d = dayData(new Date(startMs));
  const { slots } = bestSlots(d);
  const { markup } = drawChart(d, slots);

  const W = Number(markup.match(/viewBox="0 0 ([\d.]+) [\d.]+"/)[1]);
  // 極値の点は r="3.6" の circle だけ（「いま」の丸は r="5.5"）
  const points = [...markup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="3\.6"/g)].map((m) => Number(m[1]));
  // 時刻ラベルの text だけ拾う（目盛りの「0時」などは除く）
  const texts = [...markup.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>(\d\d:\d\d)<\/text>/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    t: m[3],
    left: Number(m[1]) - LABEL_W / 2,
    right: Number(m[1]) + LABEL_W / 2,
  }));

  return { W, points, texts, times: d.inDay.map((e) => fmt(e.ms)) };
}

test("ラベルは必ずその点の真上に置く", () => {
  // 右端ぎりぎりに極値が来る日。以前はここでラベルを枠内へ押し込んでいた
  const { points, texts, times } = labelsOf(jstStart("2026-09-19"));
  assert.deepEqual(texts.map((l) => l.t), times, "ラベルの並びが満干潮と合わない");
  assert.equal(points.length, texts.length, "点とラベルの数が合わない");
  texts.forEach((l, i) => {
    assert.ok(Math.abs(l.x - points[i]) < 0.1, `${l.t} のラベルが点から離れている（点 ${points[i]} / ラベル ${l.x}）`);
  });
});

test("2026年の全日で、ラベルが枠からはみ出さず、点からも離れない", () => {
  const outside = [];
  const detached = [];
  let checked = 0;

  for (let i = 0; i < 365; i++) {
    const iso = isoJst(jstStart("2026-01-01") + i * 86400000);
    const { W, points, texts } = labelsOf(jstStart(iso));
    texts.forEach((l, n) => {
      checked++;
      if (l.left < 0 || l.right > W) outside.push(`${iso} ${l.t}`);
      if (Math.abs(l.x - points[n]) >= 0.1) detached.push(`${iso} ${l.t}`);
    });
  }

  assert.ok(checked > 1400, `見たラベルが少なすぎる（${checked}件）`);
  assert.deepEqual(outside, [], `枠からはみ出す日がある（${outside.length}件）: ${outside.slice(0, 5).join(", ")}`);
  assert.deepEqual(detached, [], `点から離れる日がある（${detached.length}件）: ${detached.slice(0, 5).join(", ")}`);
});

test("2026年の全日で、ラベル同士が重ならない", () => {
  const hits = [];
  for (let i = 0; i < 365; i++) {
    const iso = isoJst(jstStart("2026-01-01") + i * 86400000);
    const { texts } = labelsOf(jstStart(iso));
    for (let a = 0; a < texts.length; a++) {
      for (let b = a + 1; b < texts.length; b++) {
        const overlapX = texts[a].left < texts[b].right && texts[b].left < texts[a].right;
        const overlapY = Math.abs(texts[a].y - texts[b].y) < LINE_H;
        if (overlapX && overlapY) hits.push(`${iso} ${texts[a].t}/${texts[b].t}`);
      }
    }
  }
  assert.deepEqual(hits, [], `重なる日がある: ${hits.slice(0, 5).join(", ")}`);
});

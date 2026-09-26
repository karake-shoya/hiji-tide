// 1時間ごとの釣りどき度（★1〜5）。
//
// 採点は新しく作らず、dayData() の score を1時間ごとに平均して5段階に落とすだけ。
// 境目は本命（0.52）と次点のいちばん下（0.36）に揃えてある。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";

import { dayData, hourlyStars, starOf, STAR_CUTS } from "../js/fishing.js";

const jstStart = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600000;
};

test("1日24マス・1時間刻み・★は1〜5", () => {
  const d = dayData(new Date(jstStart("2026-09-13")));
  const stars = hourlyStars(d);
  assert.equal(stars.length, 24);
  stars.forEach((s, i) => {
    assert.equal(s.from, d.start + i * 3600000, `${i}時台の起点`);
    assert.ok(s.stars >= 1 && s.stars <= 5, `${i}時台の★が範囲外: ${s.stars}`);
    assert.equal(s.stars, starOf(s.avg));
  });
});

test("平均はその1時間に入る点だけで取る", () => {
  const d = dayData(new Date(jstStart("2026-09-13")));
  const s = hourlyStars(d)[5];
  const ps = d.scored.filter((p) => p.ms >= s.from && p.ms < s.from + 3600000);
  assert.equal(ps.length, 30, "2分刻みで30点");
  assert.equal(s.avg, ps.reduce((a, p) => a + p.score, 0) / ps.length);
});

test("境目は本命 0.52・次点の下限 0.36 に揃っていて、ちょうどの値は上の段に入る", () => {
  assert.deepEqual(STAR_CUTS, [0.2, 0.36, 0.52, 0.7]);
  STAR_CUTS.forEach((c, i) => {
    assert.equal(starOf(c), i + 2, `${c} ちょうどは★${i + 2}`);
    assert.equal(starOf(c - 0.0001), i + 1, `${c} の手前は★${i + 1}`);
  });
  assert.equal(starOf(0), 1);
  assert.equal(starOf(1), 5);
});

test("マズメに掛からない時間は★4止まり（2026年の全日）", () => {
  for (let i = 0; i < 365; i++) {
    const d = dayData(new Date(jstStart("2026-01-01") + i * 86400000));
    for (const s of hourlyStars(d)) {
      const dark = d.scored.filter((p) => p.ms >= s.from && p.ms < s.from + 3600000).every((p) => p.light === 0);
      if (dark) assert.ok(s.stars <= 4, `${new Date(s.from + 9 * 3600000).toISOString().slice(0, 13)}時台が★${s.stars}`);
    }
  }
});

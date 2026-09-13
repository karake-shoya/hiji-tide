// 釣れる魚のデータの形。
//
// 中身の正しさ（本当にその月に釣れるか）は機械では見られない。
// ここで見るのは、並べ方が壊れていないことと、出典が付いていることだけ。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";

import { FISH, SEASONS, SOURCES, fishOfMonth } from "../js/data/fish.js";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

test("月の指定が1〜12で、旬はその魚が出る月に含まれる", () => {
  for (const f of FISH) {
    assert.ok(f.months.length, `${f.name} に月が無い`);
    for (const m of f.months) assert.ok(Number.isInteger(m) && m >= 1 && m <= 12, `${f.name} の月 ${m}`);
    for (const m of f.peak) {
      assert.ok(Number.isInteger(m) && m >= 1 && m <= 12, `${f.name} の旬 ${m}`);
      assert.ok(f.months.includes(m), `${f.name} の旬 ${m}月 が months に無い`);
    }
  }
});

test("どの月にも出せる魚がある", () => {
  for (const m of MONTHS) assert.ok(fishOfMonth(m).length > 0, `${m}月に出せる魚が無い`);
});

test("旬の魚が先に並ぶ", () => {
  for (const m of MONTHS) {
    const list = fishOfMonth(m);
    const lastPeak = list.findLastIndex((f) => f.peak.includes(m));
    const firstOff = list.findIndex((f) => !f.peak.includes(m));
    if (lastPeak >= 0 && firstOff >= 0) assert.ok(lastPeak < firstOff, `${m}月の並びで旬が後ろに来ている`);
  }
});

/* ===== 日出町のお魚暦との対応 ===== */

test("地元の水揚げは季節名で持ち、知らない季節を書かない", () => {
  const known = Object.keys(SEASONS);
  assert.deepEqual(known, ["春", "夏", "秋", "冬"]);
  for (const f of FISH) {
    assert.ok(Array.isArray(f.local), `${f.name} に local が無い`);
    for (const s of f.local) assert.ok(known.includes(s), `${f.name} の local "${s}" は季節名でない`);
    assert.equal(new Set(f.local).size, f.local.length, `${f.name} の local に重複がある`);
  }
});

test("お魚暦に名前がある魚を、取りこぼさず持っている", () => {
  // 日出町「深江の朝市 お魚暦」に載っていて、このページでも扱っている魚。
  // 一覧から魚を消すときは、ここも一緒に直すこと
  const expected = {
    アジ: ["春", "夏", "秋", "冬"],
    メバル: ["春"],
    アオリイカ: ["夏"],
    チヌ: ["春"],
    サゴシ: ["春", "秋"],
    カレイ: ["夏"],
    タコ: ["夏"],
    グレ: ["春"],
  };
  for (const [name, seasons] of Object.entries(expected)) {
    const f = FISH.find((x) => x.name === name);
    assert.ok(f, `${name} が一覧から消えている`);
    assert.deepEqual(f.local, seasons, `${name} の水揚げの季節`);
  }
  // それ以外は朝市の一覧に無い＝空。ただし「釣れない」という意味ではない
  const listed = new Set(Object.keys(expected));
  for (const f of FISH) if (!listed.has(f.name)) assert.deepEqual(f.local, [], `${f.name} は朝市の一覧に無いはず`);
});

/* ===== 出典 ===== */

test("出典がそろっていて、すべて https のリンクを持つ", () => {
  assert.ok(SOURCES.length >= 3, "出典が足りない");
  for (const s of SOURCES) {
    assert.ok(s.title, "題が無い出典がある");
    assert.ok(s.org, `${s.title} の発行元が無い`);
    assert.ok(s.url.startsWith("https://"), `${s.title} の URL が https でない`);
  }
});

test("きまりの数値を持つ魚には、条文の出どころを書いてある", () => {
  // タコは第1種共同漁業権の対象で、体重の下限もある。文面から数値が消えたら気づけるように
  const tako = FISH.find((f) => f.name === "タコ");
  assert.match(tako.tip, /200/, "まだこ200グラムの制限が文面から消えている");
  assert.match(tako.tip, /漁業権/, "漁業権の断りが文面から消えている");
});

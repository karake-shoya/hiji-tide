// 釣行メモの書き出し・読み込み。
//
// 読み込むファイルは端末の外から来る。壊れた値・別アプリのファイル・長すぎる文字列で
// 画面が壊れないことを、ここで押さえる。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeImport, mergeImport } from "../js/store.js";

const file = (over = {}) => ({
  app: "hiji-tide",
  version: 1,
  exportedAt: "2026-09-13T14:20:00.000Z",
  logs: {},
  gear: { checked: {}, custom: [] },
  ...over,
});

const log = (over = {}) => ({ fish: "アジ 12匹", note: "サビキ", tideName: "大潮", range: 179, maxFlow: 48, savedAt: 1000, ...over });

/* ===== 受け取ってよい形か ===== */

test("日出の潮の書き出しでないファイルは受け取らない", () => {
  assert.equal(sanitizeImport(null), null, "null");
  assert.equal(sanitizeImport("文字列"), null, "文字列");
  assert.equal(sanitizeImport({}), null, "app が無い");
  assert.equal(sanitizeImport(file({ app: "ほかのアプリ" })), null, "別アプリ");
  assert.equal(sanitizeImport(file({ version: 99 })), null, "知らない版");
  assert.ok(sanitizeImport(file()), "自分の書き出しは通る");
});

test("日付になっていないキーの記録は捨てる", () => {
  const clean = sanitizeImport(file({ logs: { "2026-09-13": log(), "2026-02-31": log(), "9/13": log(), "": log() } }));
  assert.deepEqual(Object.keys(clean.logs), ["2026-09-13"]);
});

test("__proto__ という日付のキーを持ち込ませない", () => {
  // オブジェクトリテラルで書くとプロトタイプの設定になってしまうので、実際の経路と同じ JSON.parse を通す
  const raw = JSON.parse('{"app":"hiji-tide","version":1,"logs":{"__proto__":{"fish":"わるいやつ"},"2026-09-13":{"fish":"アジ"}}}');
  assert.ok(Object.hasOwn(raw.logs, "__proto__"), "JSON 経由なら自身のキーとして存在する");

  const clean = sanitizeImport(raw);
  assert.deepEqual(Object.keys(clean.logs), ["2026-09-13"]);
  assert.equal(Object.getPrototypeOf(clean.logs), Object.prototype, "プロトタイプを汚していない");
  assert.equal({}.fish, undefined, "ほかのオブジェクトにも漏れていない");
});

test("長すぎる文字列は保存するときと同じ上限で切る", () => {
  const clean = sanitizeImport(
    file({
      logs: { "2026-09-13": log({ fish: "あ".repeat(200), note: "い".repeat(900) }) },
      gear: { checked: {}, custom: [{ id: "c1", label: "う".repeat(90) }] },
    })
  );
  assert.equal(clean.logs["2026-09-13"].fish.length, 120, "釣れたもの");
  assert.equal(clean.logs["2026-09-13"].note.length, 600, "メモ");
  assert.equal(clean.gear.custom[0].label.length, 40, "自分で足した持ち物");
});

test("数値でない値と、知らないキーは落とす", () => {
  const clean = sanitizeImport(
    file({ logs: { "2026-09-13": log({ range: "179cm", maxFlow: null, savedAt: "きのう", evil: "<script>" }) } })
  );
  const l = clean.logs["2026-09-13"];
  assert.equal(l.range, null);
  assert.equal(l.maxFlow, null);
  assert.equal(l.savedAt, 0, "savedAt は数値でなければ 0");
  assert.equal(l.evil, undefined, "知らないキーは持ち込まない");
  assert.deepEqual(Object.keys(l).sort(), ["fish", "maxFlow", "note", "range", "savedAt", "tideName"]);
});

test("中身が空でも受け取れる", () => {
  const clean = sanitizeImport({ app: "hiji-tide", version: 1 });
  assert.deepEqual(clean.logs, {});
  assert.deepEqual(clean.gear, { checked: {}, custom: [] });
});

/* ===== 端末の中身と混ぜる ===== */

const current = {
  logs: { "2026-09-13": log({ fish: "端末のアジ", savedAt: 2000 }), "2026-09-10": log({ fish: "端末のカサゴ", savedAt: 1000 }) },
  gear: { checked: { life: true }, custom: [{ id: "c1", label: "エギ 3.0号" }] },
};

test("同じ日付は、あとで保存した方を残す", () => {
  const incoming = sanitizeImport(
    file({
      logs: {
        "2026-09-13": log({ fish: "ファイルのアジ", savedAt: 1500 }), // 端末の方が新しい
        "2026-09-10": log({ fish: "ファイルのカサゴ", savedAt: 3000 }), // ファイルの方が新しい
        "2026-09-01": log({ fish: "ファイルのメバル", savedAt: 500 }), // 端末に無い
      },
    })
  );
  const r = mergeImport(current, incoming);

  assert.equal(r.logs["2026-09-13"].fish, "端末のアジ", "端末が新しい日は残す");
  assert.equal(r.logs["2026-09-10"].fish, "ファイルのカサゴ", "ファイルが新しい日は差し替える");
  assert.equal(r.logs["2026-09-01"].fish, "ファイルのメバル", "端末に無い日は足す");
  assert.deepEqual({ added: r.added, updated: r.updated, skipped: r.skipped }, { added: 1, updated: 1, skipped: 1 });
});

test("savedAt の無い記録は、端末側に負ける", () => {
  const incoming = sanitizeImport(file({ logs: { "2026-09-13": { fish: "古いファイル" } } }));
  const r = mergeImport(current, incoming);
  assert.equal(r.logs["2026-09-13"].fish, "端末のアジ");
  assert.equal(r.skipped, 1);
});

test("持ち物は id で重複を避けて足し、チェックはどちらかが付いていれば付ける", () => {
  const incoming = sanitizeImport(
    file({
      gear: {
        checked: { shoes: true, life: true },
        custom: [
          { id: "c1", label: "別の端末のエギ" }, // すでにある id
          { id: "c2", label: "ワーム 2インチ" }, // 新しい
        ],
      },
    })
  );
  const r = mergeImport(current, incoming);

  assert.deepEqual(r.gear.custom.map((c) => c.id), ["c1", "c2"]);
  assert.equal(r.gear.custom[0].label, "エギ 3.0号", "同じ id は端末側を残す");
  assert.deepEqual(r.gear.checked, { life: true, shoes: true });
});

test("端末が空でも混ぜられる", () => {
  const incoming = sanitizeImport(file({ logs: { "2026-09-13": log() } }));
  const r = mergeImport({ logs: {}, gear: { checked: {}, custom: [] } }, incoming);
  assert.equal(Object.keys(r.logs).length, 1);
  assert.equal(r.added, 1);
});

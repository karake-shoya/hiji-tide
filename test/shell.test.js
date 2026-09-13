// sw.js の SHELL と、実際に置いてあるファイルの突き合わせ。
//
// js/ か css/ にファイルを足したとき SHELL への書き足しを忘れると、
// Service Worker が古い資産を配り続ける。それをここで落とす。
//
//   node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** sw.js の SHELL 配列に並んでいるパスを取り出す */
function shellPaths() {
  const src = readFileSync(join(ROOT, "sw.js"), "utf8");
  const m = src.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(m, "sw.js から SHELL 配列を読み取れない。書式を変えたならこのテストも直すこと");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** dir 配下のファイルを "/dir/name" の形で全部並べる */
function filesUnder(dir) {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => "/" + join(dir, e.parentPath.slice(join(ROOT, dir).length), e.name).replaceAll("\\", "/"))
    .sort();
}

const SHELL = shellPaths();

test("js/ と css/ のファイルが全部 SHELL に入っている", () => {
  const actual = [...filesUnder("js"), ...filesUnder("css")];
  const missing = actual.filter((p) => !SHELL.includes(p));
  assert.deepEqual(missing, [], `sw.js の SHELL に足して VERSION を1つ上げること → ${missing.join(", ")}`);
});

test("SHELL に並んでいるファイルが実在する", () => {
  // "/" はページ本体そのものなので実ファイルの照合から外す
  const gone = SHELL.filter((p) => p !== "/").filter((p) => !existsSync(join(ROOT, p.slice(1))));
  assert.deepEqual(gone, [], `消したファイルが SHELL に残っている → ${gone.join(", ")}`);
});

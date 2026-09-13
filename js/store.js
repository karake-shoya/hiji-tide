// 端末内の保存。localStorage だけを使い、外へは何も送らない。
//
// プライベートブラウズや容量超過では localStorage が例外を投げる。
// 読み書きは必ず try/catch で包み、失敗しても画面は動かす。

import { parseIsoJst } from "./format.js";

const KEY = {
  theme: "hiji.theme",
  gear: "hiji.gear",
  logs: "hiji.logs",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // 保存できなくても画面は止めない
  }
}

/* ===== 表示テーマ ===== */
export const getTheme = () => (read(KEY.theme, "dark") === "bright" ? "bright" : "dark");
export const setTheme = (v) => write(KEY.theme, v === "bright" ? "bright" : "dark");

/* ===== 持ち物 ===== */
// {checked: {id: true}, custom: [{id, label}]}
export const getGear = () => {
  const g = read(KEY.gear, {});
  return { checked: g.checked && typeof g.checked === "object" ? g.checked : {}, custom: Array.isArray(g.custom) ? g.custom : [] };
};
export function setGearChecked(id, on) {
  const g = getGear();
  if (on) g.checked[id] = true;
  else delete g.checked[id];
  write(KEY.gear, g);
}
export function addGearItem(label) {
  const text = String(label).trim().slice(0, 40);
  if (!text) return null;
  const g = getGear();
  const item = { id: "c" + Date.now().toString(36), label: text };
  g.custom.push(item);
  write(KEY.gear, g);
  return item;
}
export function removeGearItem(id) {
  const g = getGear();
  g.custom = g.custom.filter((c) => c.id !== id);
  delete g.checked[id];
  write(KEY.gear, g);
}
export function clearGearChecks() {
  const g = getGear();
  g.checked = {};
  write(KEY.gear, g);
}

/* ===== 釣行メモ ===== */
// {"2026-09-13": {fish, note, tideName, range, maxFlow, savedAt}}
export const getLogs = () => {
  const l = read(KEY.logs, {});
  return l && typeof l === "object" ? l : {};
};
export const getLog = (iso) => getLogs()[iso] || null;

export function saveLog(iso, data) {
  const logs = getLogs();
  const fish = String(data.fish || "").trim().slice(0, 120);
  const note = String(data.note || "").trim().slice(0, 600);
  if (!fish && !note) {
    delete logs[iso];
  } else {
    logs[iso] = {
      fish,
      note,
      tideName: data.tideName || "",
      range: typeof data.range === "number" ? data.range : null,
      maxFlow: typeof data.maxFlow === "number" ? Math.round(data.maxFlow) : null,
      savedAt: Date.now(),
    };
  }
  return write(KEY.logs, logs);
}

export function deleteLog(iso) {
  const logs = getLogs();
  delete logs[iso];
  write(KEY.logs, logs);
}

/** 新しい順の一覧。[{iso, ...log}] */
export const logList = () =>
  Object.entries(getLogs())
    .map(([iso, v]) => ({ iso, ...v }))
    .sort((a, b) => b.iso.localeCompare(a.iso));

/**
 * 同じ潮回りで釣れた記録のうち、いちばん新しいもの。
 * 表示中の日そのものは除く。魚を書いていない記録は拾わない。
 */
export function similarLog(tideName, excludeIso) {
  return logList().find((l) => l.iso !== excludeIso && l.tideName === tideName && l.fish) || null;
}

/* ===== 書き出しと読み込み ===== */
//
// 端末が変わると記録は消える。外へ送らない設計は変えないので、
// ファイルとして書き出し、ファイルから戻す道だけを用意する。

const FILE_APP = "hiji-tide";
const FILE_VERSION = 1;

/** 書き出す中身。釣行メモと持ち物の両方を1つにまとめる */
export function exportData() {
  return {
    app: FILE_APP,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    logs: getLogs(),
    gear: getGear(),
  };
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * 読み込んだ中身を、置いてよい形に整える。
 * 🔴 ファイルは端末の外から来る。ここを通さずに保存しない。
 *
 * @returns {{logs:object, gear:{checked:object, custom:Array}}|null} 受け取れない形なら null
 */
export function sanitizeImport(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== FILE_APP || obj.version !== FILE_VERSION) return null;

  const logs = {};
  const src = obj.logs && typeof obj.logs === "object" ? obj.logs : {};
  // Object.keys を使う。for-in だと __proto__ 経由のキーを拾う
  for (const iso of Object.keys(src)) {
    if (!parseIsoJst(iso)) continue; // 書式違いと 2026-02-31 のような日付を捨てる
    const l = src[iso];
    if (!l || typeof l !== "object") continue;
    logs[iso] = {
      fish: str(l.fish, 120),
      note: str(l.note, 600),
      tideName: str(l.tideName, 10),
      range: num(l.range),
      maxFlow: num(l.maxFlow),
      savedAt: num(l.savedAt) ?? 0,
    };
  }

  const g = obj.gear && typeof obj.gear === "object" ? obj.gear : {};
  const checked = {};
  if (g.checked && typeof g.checked === "object") {
    for (const id of Object.keys(g.checked)) if (g.checked[id] === true) checked[id] = true;
  }
  const custom = (Array.isArray(g.custom) ? g.custom : [])
    .filter((c) => c && typeof c === "object" && str(c.id, 40) && str(c.label, 40))
    .map((c) => ({ id: str(c.id, 40), label: str(c.label, 40) }));

  return { logs, gear: { checked, custom } };
}

/**
 * 端末の中身と、読み込んだ中身を混ぜる。保存はしない（純粋な計算だけ）。
 * 同じ日付は savedAt があとの方を残す。取り込む側に savedAt が無ければ端末を残す。
 *
 * @returns {{logs:object, gear:object, added:number, updated:number, skipped:number}}
 */
export function mergeImport(current, incoming) {
  const logs = { ...current.logs };
  let added = 0,
    updated = 0,
    skipped = 0;

  for (const iso of Object.keys(incoming.logs)) {
    const next = incoming.logs[iso];
    const now = logs[iso];
    if (!now) {
      logs[iso] = next;
      added++;
    } else if ((next.savedAt || 0) > (now.savedAt || 0)) {
      logs[iso] = next;
      updated++;
    } else {
      skipped++;
    }
  }

  const custom = current.gear.custom.slice();
  const have = new Set(custom.map((c) => c.id));
  for (const c of incoming.gear.custom) {
    if (have.has(c.id)) continue; // 同じ id は端末側を残す
    custom.push(c);
    have.add(c.id);
  }

  return {
    logs,
    gear: { checked: { ...current.gear.checked, ...incoming.gear.checked }, custom },
    added,
    updated,
    skipped,
  };
}

/**
 * 読み込んだ文字列を取り込んで保存する。
 * @returns {{ok:boolean, added?:number, updated?:number, skipped?:number, reason?:string}}
 */
export function importData(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, reason: "ファイルの中身を読めませんでした。書き出したファイルをそのまま選んでください。" };
  }

  const clean = sanitizeImport(obj);
  if (!clean) return { ok: false, reason: "このファイルは日出の潮の書き出しではありません。" };

  const before = { logs: getLogs(), gear: getGear() };
  const r = mergeImport(before, clean);

  // 片方だけ書けた状態を残さない。失敗したら元に戻す
  if (!write(KEY.logs, r.logs)) {
    return { ok: false, reason: "この端末では保存できませんでした（プライベートモードか、空き容量が足りないかもしれません）。" };
  }
  if (!write(KEY.gear, r.gear)) {
    write(KEY.logs, before.logs);
    return { ok: false, reason: "この端末では保存できませんでした（プライベートモードか、空き容量が足りないかもしれません）。" };
  }
  return { ok: true, added: r.added, updated: r.updated, skipped: r.skipped };
}

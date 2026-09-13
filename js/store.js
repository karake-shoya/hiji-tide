// 端末内の保存。localStorage だけを使い、外へは何も送らない。
//
// プライベートブラウズや容量超過では localStorage が例外を投げる。
// 読み書きは必ず try/catch で包み、失敗しても画面は動かす。

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

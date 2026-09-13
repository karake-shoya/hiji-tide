// 釣りどきの判定。潮の流速とマズメ（日の出・日の入り前後）から時間帯を採点する。
//
// 🔴 採点式と閾値は変更しない。変えると過去の日と比べられなくなる。

import { tide } from "./tide.js";
import { sunTimes } from "./astro.js";

/** 流速スコアの基準（cm/時）。大潮の最大流速がほぼこの値 */
export const FLOW_REF = 50;

/** 釣りどきと判定する閾値。下2つは潮が動かない日に次善の1件を出すための段階 */
const TH_MAIN = 0.52;
const TH_FALLBACK = [0.48, 0.42];

/** 区間として認める最短の長さ */
const MIN_RUN_MS = 40 * 60000;

/**
 * 1日ぶんの推算をまとめて作る。
 * @param {Date} baseDate JST 0:00 を指す Date
 */
export function dayData(baseDate) {
  const start = baseDate.getTime();
  const end = start + 86400000;
  const step = 2 * 60000;

  // 極値の検出は前後6時間まで見る。日をまたぐ時合の「上げ何分」を出すのに必要
  const pts = [];
  for (let m = -360 * 60000; m <= (24 * 60 + 360) * 60000; m += step) {
    pts.push({ ms: start + m, v: tide(start + m) });
  }

  // 満潮・干潮（極値）
  const ext = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1].v,
      b = pts[i].v,
      c = pts[i + 1].v;
    if (b >= a && b >= c) ext.push({ type: "hi", ms: pts[i].ms, v: b });
    else if (b <= a && b <= c) ext.push({ type: "lo", ms: pts[i].ms, v: b });
  }
  const inDay = ext.filter((e) => e.ms >= start && e.ms < end);
  const sun = sunTimes(new Date(start + 12 * 3600000));

  // スコアは前後2時間ぶんだけ作る。日をまたぐ時合を切らずにつなぐため
  let maxFlow = 0;
  const scored = pts
    .filter((p) => p.ms >= start - 120 * 60000 && p.ms <= end + 120 * 60000)
    .map((p) => {
      const flow = Math.abs(tide(p.ms + 15 * 60000) - tide(p.ms - 15 * 60000)) * 2; // cm/h
      if (p.ms >= start && p.ms < end && flow > maxFlow) maxFlow = flow;
      return { ms: p.ms, v: p.v, flow };
    });

  const sr = sun.rise.getTime(),
    ss = sun.set.getTime();
  scored.forEach((p) => {
    const dSun = Math.min(Math.abs(p.ms - sr), Math.abs(p.ms - ss)) / 60000;
    const light = dSun <= 45 ? 1 : dSun <= 90 ? 0.55 : 0;
    p.light = light;
    // 分母はその日の最大ではなく固定値。日をまたいで強さを比べられるようにする
    p.score = 0.62 * Math.min(1, p.flow / FLOW_REF) + 0.38 * light;
  });

  const range = inDay.length ? Math.round(Math.max(...inDay.map((e) => e.v)) - Math.min(...inDay.map((e) => e.v))) : null;

  return { start, end, pts, ext, inDay, scored, sun, maxFlow, range };
}

function slotsAt(d, th) {
  const runs = [];
  let cur = null;
  for (const p of d.scored) {
    if (p.score >= th) {
      if (!cur) cur = { from: p.ms, to: p.ms, sum: 0, n: 0, light: 0 };
      cur.to = p.ms;
      cur.sum += p.score;
      cur.n++;
      cur.light = Math.max(cur.light, p.light);
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs
    .filter((r) => r.to - r.from >= MIN_RUN_MS)
    .filter((r) => r.to > d.start && r.from < d.end) // その日と重なる区間だけ残す
    .map((r) => ({ ...r, avg: r.sum / r.n }))
    .sort((a, b) => b.avg - a.avg);
}

/**
 * その日の釣りどき。
 * weak は「潮が動かない日に次善の1件を出した」ことを示す。
 */
export function bestSlots(d) {
  const main = slotsAt(d, TH_MAIN);
  if (main.length) return { slots: main.slice(0, 3).sort((a, b) => a.from - b.from), weak: false };
  for (const th of TH_FALLBACK) {
    const r = slotsAt(d, th);
    if (r.length) return { slots: [r[0]], weak: true };
  }
  // 0件になる日はある。2026年を全日実測すると 4/9 の1日だけで、
  // 0.42 以上の区間は3本あるがどれも34分しか続かず MIN_RUN_MS に届かない。
  // 呼び出し側は空を受け取る前提で書くこと。
  return { slots: [], weak: true };
}

/** 潮の「上げ◯分／下げ◯分」。前後の極値が取れないときは null */
export function tidePhase(d, ms) {
  let prev = null,
    next = null;
  for (const e of d.ext) {
    if (e.ms <= ms) prev = e;
    if (e.ms > ms && !next) next = e;
  }
  if (!prev || !next) return null;
  const r = (ms - prev.ms) / (next.ms - prev.ms);
  const bu = Math.max(1, Math.min(10, Math.ceil(r * 10)));
  const dir = prev.type === "lo" ? "上げ" : "下げ";
  return { dir, bu, next, prev };
}

/**
 * 釣りどき区間の理由。「上げ5分（潮がよく動く） ＋ 朝マズメ」のもと。
 * @returns {string[]}
 */
export function slotReasons(d, slot, weak) {
  // 日をまたぐ区間は、その日に入っている部分の中間で潮の状態を見る
  const mid = (Math.max(slot.from, d.start) + Math.min(slot.to, d.end)) / 2;
  const p = tidePhase(d, mid);
  const sr = d.sun.rise.getTime(),
    ss = d.sun.set.getTime();
  const reasons = [];
  if (p) reasons.push(`${p.dir}${p.bu}分（${weak ? "この日では動くほう" : "潮がよく動く"}）`);
  if (Math.abs(mid - sr) < 90 * 60000) reasons.push("朝マズメ");
  if (Math.abs(mid - ss) < 90 * 60000) reasons.push("夕マズメ");
  return reasons;
}

/** その日の潮の動きの強さ。見出し横のバッジに使う3段階 */
export function dayStrength(maxFlow) {
  // 判定は表示と同じ丸めた値で行う（45 と出ているのに「ふつう」になるのを防ぐ）
  const flow = Math.round(maxFlow);
  if (flow >= 45) return { key: "strong", label: "よく動く", flow };
  if (flow >= 35) return { key: "mid", label: "ふつう", flow };
  return { key: "calm", label: "静か", flow };
}

/** 「もうすぐ」と言える猶予 */
const SOON_MS = 90 * 60000;

/**
 * いま釣りどきかどうか。今日を表示しているときだけ意味を持つ。
 * 🔴 新しい採点基準は作らない。dayData が付けた score と bestSlots の区間をそのまま使う。
 *
 * @returns {{level:"go"|"soon"|"rest", score:number, reasons:string[], current:object|null,
 *            next:object|null, msToNext:number|null, endsInMs:number|null}}
 */
export function nowVerdict(d, slots, weak, nowMs = Date.now()) {
  const current = slots.find((s) => nowMs >= s.from && nowMs <= s.to) || null;
  const next = slots.find((s) => s.from > nowMs) || null;
  const msToNext = next ? next.from - nowMs : null;

  // いちばん近い採点済みの点のスコアを拾う（採点は2分刻み）
  let score = 0;
  let best = Infinity;
  for (const p of d.scored) {
    const gap = Math.abs(p.ms - nowMs);
    if (gap < best) {
      best = gap;
      score = p.score;
    }
  }

  if (current) {
    return {
      level: "go",
      score,
      reasons: slotReasons(d, current, weak),
      current,
      next,
      msToNext,
      endsInMs: current.to - nowMs,
    };
  }
  if (next && msToNext <= SOON_MS) {
    return { level: "soon", score, reasons: slotReasons(d, next, weak), current: null, next, msToNext, endsInMs: null };
  }
  return { level: "rest", score, reasons: [], current: null, next, msToNext, endsInMs: null };
}

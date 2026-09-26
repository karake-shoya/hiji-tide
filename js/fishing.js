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

/** 次点を拾う段階。本命が少ない日に、この順で閾値を下げて足りないぶんを補う */
const TH_EXTRA = [0.48, 0.42, 0.36];

/** 1日に出す時間帯の数（本命＋次点）。2026年を全日実測すると必ず2本以上は取れる */
const WANT_SLOTS = 3;

/** 本命からこの間隔より近い区間は、同じ山を閾値違いで拾い直しただけとみなして捨てる */
const EXTRA_GAP_MS = 60 * 60000;

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
 * 本命が WANT_SLOTS に届かない日に、閾値を下げて次点の時間帯を拾う。
 *
 * 🔴 本命の判定（TH_MAIN と weak）には触らない。ここで拾うのは「ほかに挙げるならここ」
 *    という弱い時間帯なので、必ず sub が立つ。画面は本命と見分けがつく形で出すこと。
 */
function extraSlots(d, picked) {
  const out = [];
  // 本命と同じ山を閾値違いで拾い直したもの、次点どうしの重なりを落とす
  const clashes = (r) => [...picked, ...out].some((p) => r.from - EXTRA_GAP_MS < p.to && p.from - EXTRA_GAP_MS < r.to);
  for (const th of TH_EXTRA) {
    for (const r of slotsAt(d, th)) {
      if (picked.length + out.length >= WANT_SLOTS) return out.sort((a, b) => a.from - b.from);
      if (!clashes(r)) out.push({ ...r, sub: true });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/**
 * その日の釣りどき。
 * slots が本命、extra が次点（弱いので sub が立つ）。
 * weak は「潮が動かない日に次善の1件を出した」ことを示す。
 *
 * 🔴 slots と weak は採点式そのものなので、過去の日と比べられるよう出方を変えない。
 *    件数を2〜3本に揃えるのは extra の仕事。
 */
export function bestSlots(d) {
  const main = slotsAt(d, TH_MAIN);
  if (main.length) {
    const slots = main.slice(0, 3).sort((a, b) => a.from - b.from);
    return { slots, weak: false, extra: extraSlots(d, slots) };
  }
  for (const th of TH_FALLBACK) {
    const r = slotsAt(d, th);
    if (r.length) return { slots: [r[0]], weak: true, extra: extraSlots(d, [r[0]]) };
  }
  // 本命が0件になる日はある。2026年を全日実測すると 4/9 の1日だけで、
  // 0.42 以上の区間は3本あるがどれも34分しか続かず MIN_RUN_MS に届かない。
  // その日も extra は取れるが、呼び出し側は slots が空の前提で書くこと。
  return { slots: [], weak: true, extra: extraSlots(d, []) };
}

/**
 * 1時間ごとの釣りどき度（★1〜5）の境目。★2〜★5 の下限を並べてある。
 * 0.52 は本命、0.36 は次点のいちばん下と同じ線。0.70 は本命の強さにマズメが重なった時間。
 * 🔴 score を段に落とすだけで、新しい採点基準ではない。どの日も同じものさしで比べるため、
 *    その日の中での相対評価にはしない。マズメが無い時間は score が 0.62 を超えないので★4止まり。
 */
export const STAR_CUTS = [0.2, 0.36, 0.52, 0.7];

/** 1時間平均の score → ★の数。境目ちょうどの値は上の段に入れる */
export const starOf = (avg) => 1 + STAR_CUTS.filter((c) => avg >= c).length;

/**
 * その日の 0時台〜23時台の釣りどき度。前後の日へは延ばさない。
 * ⚠ 1時間の平均なので、分単位で区切る釣りどき区間とは食い違うことがある（README 参照）。
 * @returns {{from:number, avg:number, stars:number}[]} 24本
 */
export function hourlyStars(d) {
  const out = [];
  for (let h = 0; h < 24; h++) {
    const from = d.start + h * 3600000;
    const ps = d.scored.filter((p) => p.ms >= from && p.ms < from + 3600000);
    const avg = ps.reduce((a, p) => a + p.score, 0) / ps.length;
    out.push({ from, avg, stars: starOf(avg) });
  }
  return out;
}

/** 本命と次点を時刻順に1本の並びへ。画面とグラフはこれを出す */
export function allSlots({ slots, extra }) {
  return [...slots, ...(extra || [])].sort((a, b) => a.from - b.from);
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
 * 次点（slot.sub）は本命より弱いので、潮の動きの言い方を落とす。
 * @returns {string[]}
 */
export function slotReasons(d, slot, weak) {
  // 日をまたぐ区間は、その日に入っている部分の中間で潮の状態を見る
  const mid = (Math.max(slot.from, d.start) + Math.min(slot.to, d.end)) / 2;
  const p = tidePhase(d, mid);
  const sr = d.sun.rise.getTime(),
    ss = d.sun.set.getTime();
  const reasons = [];
  const tone = slot.sub ? "本命ほどではない" : weak ? "この日では動くほう" : "潮がよく動く";
  if (p) reasons.push(`${p.dir}${p.bu}分（${tone}）`);
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
 * 🔴 新しい採点基準は作らない。bestSlots が出した区間をそのまま3段階に落とすだけ。
 *
 * @returns {{level:"go"|"soon"|"rest", reasons:string[], current:object|null,
 *            next:object|null, msToNext:number|null, endsInMs:number|null}}
 */
export function nowVerdict(d, slots, weak, nowMs = Date.now()) {
  const current = slots.find((s) => nowMs >= s.from && nowMs <= s.to) || null;
  const next = slots.find((s) => s.from > nowMs) || null;
  const msToNext = next ? next.from - nowMs : null;

  if (current) {
    return { level: "go", reasons: slotReasons(d, current, weak), current, next, msToNext, endsInMs: current.to - nowMs };
  }
  if (next && msToNext <= SOON_MS) {
    return { level: "soon", reasons: slotReasons(d, next, weak), current: null, next, msToNext, endsInMs: null };
  }
  return { level: "rest", reasons: [], current: null, next, msToNext, endsInMs: null };
}

// 週タブ。「今週いつ行くか」を決めるための7日一覧。
//
// 潮位はブラウザ内の推算なので、7日ぶんでも通信は要らない（実測 53ms／Mac・Node 24）。
// 採点は単日とまったく同じ fishing.js を通す。ここで新しい基準は作らない。

import { dayData, bestSlots, dayStrength } from "../fishing.js";
import { tideName } from "../astro.js";
import { isoJst, jstMidnight, jstParts, parseIsoJst, fmtD, durationText, WD } from "../format.js";

const DAYS = 7;
const TITLE = "この先7日";

// 一度作った要約は使い回す。潮汐の推算は同じ日なら必ず同じ値になるため。
// 日付を1日送ると7日のうち6日は前回と同じで、作り直すと1回 43ms をまた払うことになる。
const cache = new Map();
const CACHE_MAX = 60;

/** 1日ぶんの要約。🔴 dayData が返す点列（約1900点）は持ち帰らない */
function summaryOf(startMs) {
  const iso = isoJst(startMs);
  const hit = cache.get(iso);
  if (hit) return hit;

  const d = dayData(jstMidnight(new Date(startMs)));
  const { slots, weak } = bestSlots(d);
  const p = jstParts(d.start);
  // その日のいちばんを1つだけ。取り方は単日の「この日のいちばん」と揃える
  const best = slots.length ? slots.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;

  const row = {
    iso,
    label: `${p.m}月${p.d}日(${WD[p.wd]})`,
    start: d.start,
    end: d.end,
    range: d.range,
    tideName: tideName(new Date(d.start + 12 * 3600000)),
    strength: dayStrength(d.maxFlow),
    weak,
    top: best ? { from: best.from, to: best.to, avg: best.avg } : null,
  };

  cache.set(iso, row);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); // 入れた順に捨てる
  return row;
}

/**
 * 起点の日から days 日ぶんの要約を作る。
 *
 * @param {number} startMs 起点の日の JST 0:00（実時刻ミリ秒）
 * @returns {Array<{iso:string,label:string,start:number,end:number,range:number|null,
 *                  tideName:string,strength:object,weak:boolean,
 *                  top:{from:number,to:number,avg:number}|null}>}
 */
export function weekSummary(startMs, days = DAYS) {
  return Array.from({ length: days }, (_, i) => summaryOf(startMs + i * 86400000));
}

/* ===== 描画 ===== */

function row(r, todayIso, viewIso) {
  const when = r.top
    ? `<div class="wt">${fmtD(r.top.from, r)} – ${fmtD(r.top.to, r)}
         <span class="len">${durationText(Math.round((r.top.to - r.top.from) / 60000))}</span></div>`
    : `<div class="wt none">目立った釣りどきなし</div>`;

  const mark = r.iso === todayIso ? '<span class="wtoday">今日</span>' : "";

  return `<button class="weekrow${r.weak ? " sub" : ""}" data-goto="${r.iso}"
      ${r.iso === viewIso ? 'aria-current="date"' : ""}>
    <div class="wday">${r.label}${mark}</div>
    <div class="wmeta">干満差${r.range ?? "—"}cm・${r.tideName}<span class="badge ${r.strength.key}">${r.strength.label}</span></div>
    ${when}
  </button>`;
}

export const weekPanel = {
  title: TITLE,
  render(body, ctx) {
    const from = parseIsoJst(ctx.iso) || jstMidnight(new Date());
    const rows = weekSummary(from.getTime());
    // 「今日」の印は描いた時点の日。開きっぱなしで日をまたぐと古いままだが、
    // タブを切り替えるか日付を動かせば描き直される
    const todayIso = isoJst(Date.now());

    body.innerHTML = `
      <h2>${TITLE}</h2>
      <p class="note" style="padding-top:0">${rows[0].label} から7日ぶんの、その日いちばんの釣りどきです。行をタップするとその日の潮に移ります。</p>
      <div class="weeklist">${rows.map((r) => row(r, todayIso, ctx.iso)).join("")}</div>
      <p class="note">薄い行は、潮の動きが弱く突出した時合が無い日です。強いて挙げるならこの時間帯、という意味になります。<br>
      1日の中のほかの時間帯・天気・満干潮は、行をタップした先の潮タブに出ます。</p>`;
  },
};

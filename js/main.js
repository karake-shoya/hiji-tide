// 起動と配線。日付が変わるたびにここから描画をやり直す。

import { dayData, bestSlots } from "./fishing.js";
import { tideName } from "./astro.js";
import { jstMidnight, isoJst, jstParts, dateFromQuery, parseIsoJst, WD } from "./format.js";
import { loadWeather, cachedWeather } from "./weather.js";
import { isScrubbing } from "./chart.js";
import { loadNews } from "./news.js";
import { initNav, showTab, refreshTab } from "./ui/nav.js";
import * as view from "./ui/view.js";

const $ = (id) => document.getElementById(id);

let viewDate = dateFromQuery() || jstMidnight(new Date());
let current = null; // 最後に描いた日のデータ。各画面へ渡すのに使う

/* ===== 天気（非同期。潮汐の描画はこれを待たない） ===== */
let weatherGen = 0; // 日付を連打したとき、古い応答を捨てるための世代番号
let weatherShownFor = null; // いま天気を描いてある日。同じ日の描き直しを省く

function updateWeather(d) {
  const gen = ++weatherGen;
  const iso = isoJst(d.start);
  const sec = $("weatherSec");
  // 未取得か範囲外の日だけ隠す。取得済みの日で隠すと、毎分の再描画で欄が点滅する
  if (!cachedWeather(iso)) sec.hidden = true;
  loadWeather(iso)
    .then((h) => {
      if (gen !== weatherGen || !h) return; // 表示中の日が変わっていたら捨てる
      if (weatherShownFor !== iso) {
        view.renderWeather(h);
        weatherShownFor = iso;
      }
      view.annotateSlots(h); // 釣りどきは毎回描き直されるので毎回添える
      sec.hidden = false;
    })
    .catch(() => {});
}

/* ===== 潮の画面 ===== */
// 潮タブが隠れているときも描いておく。戻ったときに古い「いま」が出ないようにするため
function render() {
  const d = dayData(viewDate);
  const isToday = d.start === jstMidnight(new Date()).getTime();
  const { slots, weak } = bestSlots(d);
  // 今日は現在時刻、それ以外の日は朝9時を基準に見る（画面にも「09:00 時点は」と出る）
  const refMs = isToday ? Date.now() : d.start + 9 * 3600000;
  const iso = isoJst(d.start);
  current = { d, iso, isToday };

  view.renderDateBar(d, isToday);
  view.renderVerdict(d, slots, weak, isToday, Date.now());
  view.renderRecall(d, iso);
  view.renderNow(d, isToday, refMs);
  view.renderChart(d, slots);
  view.renderBadge(d);
  view.renderSlots(d, slots, weak);
  view.renderTideTable(d);
  view.renderMeta(d);
  view.renderFishPreview(jstParts(d.start).m);

  // 表示中の日を URL に載せる。連打で履歴が溜まらないよう replaceState を使う
  // タブの情報（history.state）は残す。file:// では例外になるが描画は止めない
  try {
    history.replaceState(history.state, "", isToday ? location.pathname : `${location.pathname}?d=${iso}`);
  } catch {}

  updateWeather(d);
}

/** 各画面へ渡す、表示中の日の情報 */
function context() {
  const d = current.d;
  const p = jstParts(d.start);
  return {
    iso: current.iso,
    label: `${p.m}月${p.d}日(${WD[p.wd]})`,
    month: p.m,
    tideName: tideName(new Date(d.start + 12 * 3600000)),
    range: d.range,
    maxFlow: d.maxFlow,
    // 週の一覧から日付を動かす口。書式の違う値は無視する
    goto: (iso) => {
      const dt = parseIsoJst(iso);
      if (dt) goto(dt);
    },
  };
}

function goto(date) {
  viewDate = jstMidnight(date);
  render();
  refreshTab(); // 釣果と魚も表示中の日に追随させる
}

/* ===== 起動 ===== */
initNav(context);

$("prev").addEventListener("click", () => goto(new Date(viewDate.getTime() - 86400000)));
$("next").addEventListener("click", () => goto(new Date(viewDate.getTime() + 86400000)));
$("todayBtn").addEventListener("click", () => goto(new Date()));
$("picker").addEventListener("change", (e) => {
  const d = parseIsoJst(e.target.value);
  if (d) goto(d);
});

render();

// 釣行メモをすぐ書けるよう、?log=1 で開いたときは釣果タブから始める
// （履歴は積まない。戻るでサイトを離れてしまうため）
if (new URLSearchParams(location.search).get("log") === "1") showTab("log", true);

loadNews().then(view.renderNews);

// 今日を見ているときだけ、1分ごとに「いま」の位置と判定を描き直す。
// グラフをなぞっている間は描き直さない（SVG を作り直すと指の追従が切れるため）
setInterval(() => {
  if (isScrubbing()) return;
  if (viewDate.getTime() === jstMidnight(new Date()).getTime()) render();
}, 60000);

// 圏外でも潮見表が開くようにする
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// 起動と配線。日付が変わるたびにここから描画をやり直す。

import { dayData, bestSlots } from "./fishing.js";
import { tideName } from "./astro.js";
import { jstMidnight, isoJst, jstParts, dateFromQuery, parseIsoJst, WD } from "./format.js";
import { loadWeather, cachedWeather, avgOver } from "./weather.js";
import { loadNews } from "./news.js";
import { initChrome, openPanel } from "./ui/menu.js";
import * as view from "./ui/view.js";

const $ = (id) => document.getElementById(id);

let viewDate = dateFromQuery() || jstMidnight(new Date());
let current = null; // 最後に描いた日のデータ。パネルへ渡すのに使う

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
      view.annotateSlots(h, avgOver); // 釣りどきは毎回描き直されるので毎回添える
      sec.hidden = false;
    })
    .catch(() => {});
}

/* ===== 描画 ===== */
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
  // file:// やサンドボックス内では例外になるので、失敗しても描画は止めない
  try {
    history.replaceState(history.state, "", isToday ? location.pathname : `${location.pathname}?d=${iso}`);
  } catch {}

  updateWeather(d);
}

/** パネルへ渡す、表示中の日の情報 */
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
  };
}

function goto(date) {
  viewDate = jstMidnight(date);
  render();
}

/* ===== 起動 ===== */
initChrome(context);

$("prev").addEventListener("click", () => goto(new Date(viewDate.getTime() - 86400000)));
$("next").addEventListener("click", () => goto(new Date(viewDate.getTime() + 86400000)));
$("todayBtn").addEventListener("click", () => goto(new Date()));
$("picker").addEventListener("change", (e) => {
  const d = parseIsoJst(e.target.value);
  if (d) goto(d);
});

render();

loadNews().then(view.renderNews);

// 今日を見ているときだけ、1分ごとに「いま」の位置と判定を描き直す
setInterval(() => {
  if (viewDate.getTime() === jstMidnight(new Date()).getTime()) render();
}, 60000);

// 圏外でも潮見表が開くようにする
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// 釣行メモをすぐ書けるよう、?log=1 で開いたときはメモを開く
if (new URLSearchParams(location.search).get("log") === "1") openPanel("log", context());

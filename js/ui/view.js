// トップ画面の描画。DOM を組み立てるのはここだけに寄せてある。

import { tide } from "../tide.js";
import { moonPhase, tideName } from "../astro.js";
import { tidePhase, slotReasons, dayStrength, nowVerdict } from "../fishing.js";
import { drawChart, attachScrub } from "../chart.js";
import { fmt, fmtD, isoJst, jstParts, WD, durationText, untilText, escapeHtml } from "../format.js";
import { sky, windDir, windClass, threeHourly, peakGust, conditionsOver, cautionOf } from "../weather.js";
import { fishOfMonth } from "../data/fish.js";
import { termButton } from "../data/terms.js";
import { similarLog } from "../store.js";

const $ = (id) => document.getElementById(id);

/** 釣りどきの理由に、タップで説明が出る用語ボタンを混ぜる */
function withTerms(reason) {
  if (/^(?:上げ|下げ)\d+分/.test(reason)) {
    return reason.replace(/^((?:上げ|下げ)\d+分)/, (m) => termButton("bu", m));
  }
  if (reason.includes("マズメ")) return termButton("mazume", reason);
  return reason;
}

const reasonsText = (reasons) => reasons.map(withTerms).join(" ＋ ") || "潮の動きはおだやかです";

/* ===== いま行くべきか ===== */

// 前回描いた中身。今日の画面は毎分描き直されるので、変わっていなければ DOM を触らない。
// 触ると aria-live が変更とみなして、同じ文言を1分おきに読み上げてしまう
let lastVerdict = "";

function paintVerdict(tone, cap, head, sub) {
  const html = `<div class="cap">${cap}</div>
    <div class="head"><span class="dot"></span>${head}</div>
    <div class="sub">${sub}</div>`;
  const key = tone + " " + html;
  if (key === lastVerdict) return;
  lastVerdict = key;
  const box = $("verdict");
  box.className = "verdict " + tone;
  box.innerHTML = html;
}

export function renderVerdict(d, slots, weak, isToday, nowMs) {
  const calmDay = `潮の動きが弱い日です。朝夕の${termButton("mazume", "マズメ")}を優先してください。`;

  // 今日以外は「その日のいちばん」を出す
  if (!isToday) {
    if (!slots.length) return paintVerdict("rest", "この日の見通し", "目立った釣りどきなし", calmDay);
    const top = slots.reduce((a, b) => (b.avg > a.avg ? b : a));
    return paintVerdict(
      weak ? "soon" : "go",
      "この日のいちばん",
      `${fmtD(top.from, d)} – ${fmtD(top.to, d)}`,
      reasonsText(slotReasons(d, top, weak))
    );
  }

  const v = nowVerdict(d, slots, weak, nowMs);
  if (v.level === "go") {
    return paintVerdict(
      "go",
      "いまの海",
      "いまが釣りどき",
      `${reasonsText(v.reasons)}<br>この時間帯は <b>${fmtD(v.current.to, d)}</b> まで（あと${untilText(v.endsInMs)}）`
    );
  }
  if (v.level === "soon") {
    return paintVerdict(
      "soon",
      "いまの海",
      "もうすぐ釣りどき",
      `<b>${fmtD(v.next.from, d)}</b> から ${fmtD(v.next.to, d)}（あと${untilText(v.msToNext)}）<br>${reasonsText(v.reasons)}`
    );
  }
  const tail = v.next
    ? `次の釣りどきは <b>${fmtD(v.next.from, d)}</b> から（あと${untilText(v.msToNext)}）`
    : slots.length
      ? "この日の釣りどきは終わりました。明日の欄も見てみてください。"
      : calmDay;
  return paintVerdict("rest", "いまの海", "いまはひと休み", tail);
}

/* ===== 前回この潮で釣れたもの ===== */
export function renderRecall(d, iso) {
  const box = $("recall");
  const name = tideName(new Date(d.start + 12 * 3600000));
  const hit = similarLog(name, iso);
  if (!hit) {
    box.innerHTML = "";
    return;
  }
  const [, mm, dd] = hit.iso.split("-");
  box.innerHTML = `<div class="recall">前回の<b>${name}</b>（${Number(mm)}月${Number(dd)}日）は <b>${escapeHtml(hit.fish)}</b> が釣れています</div>`;
}

/* ===== 今の潮 ===== */
export function renderNow(d, isToday, refMs) {
  const ph = tidePhase(d, refMs);
  const lv = Math.round(tide(refMs));
  const head = isToday ? "いま" : `${fmt(refMs)} 時点`;
  const phaseText = ph ? termButton("bu", `${ph.dir}${ph.bu}分`) : "—";

  let nx = "";
  if (ph) {
    const mins = Math.round((ph.next.ms - refMs) / 60000);
    nx = `次の${ph.next.type === "hi" ? "満潮" : "干潮"}は <b>${fmt(ph.next.ms)}</b>（あと${durationText(mins)}・${Math.round(ph.next.v)}cm）`;
  }
  $("now").innerHTML = `<div class="phase">${head}は ${phaseText}</div>
    <div class="lv">${lv}<small>cm</small></div>
    <div class="nx">${nx}</div>`;
}

/* ===== グラフ ===== */
export function renderChart(d, slots) {
  const box = $("chart");
  const { markup, Y } = drawChart(d, slots);
  box.innerHTML = markup;

  const readout = $("readout");
  // 触っていないときは使い方を出す。潮位の数値はヒーローに出ているので繰り返さない
  const idle = () => {
    readout.textContent = "グラフを指でなぞると、その時刻の潮位が出ます";
  };
  idle();
  attachScrub(box, d, Y, (info) => {
    if (!info) return idle();
    const ph = tidePhase(d, info.ms);
    readout.innerHTML = `${fmt(info.ms)} は <b>${Math.round(info.v)}cm</b>${ph ? `・${ph.dir}${ph.bu}分` : ""}`;
  });
}

/* ===== 釣りどきの区間 ===== */
/** @param {object[]} slots 本命と次点を時刻順にまとめたもの（allSlots の戻り値） */
export function renderSlots(d, slots, weak) {
  const box = $("slots");
  if (!slots.length) {
    box.innerHTML = `<div class="empty">この日は潮の動きが弱く、突出した${termButton("jiai", "時合")}がありません。小潮まわりは終日だらだら流れるので、朝夕の${termButton("mazume", "マズメ")}優先で。</div>`;
    return;
  }
  // 弱い区間を薄く出す基準は本命の最高スコア。slots は時刻順なので先頭が最高とは限らない
  const mains = slots.filter((r) => !r.sub);
  const best = mains.length ? Math.max(...mains.map((r) => r.avg)) : 0;
  const lead = weak ? `<div class="empty">この日は突出した${termButton("jiai", "時合")}がありません。強いて挙げるならこの時間帯です。</div>` : "";
  const tail = slots.some((r) => r.sub)
    ? `<div class="empty">「次点」は本命ほど潮が動かない時間帯です。都合が合わない日や、本命が深夜のときの二の手に。</div>`
    : "";

  // 天気の注意書きは weather.js の取得を待って annotateSlots が埋める（通信が落ちても空のまま）
  box.innerHTML =
    `<div class="caution day" hidden></div>` +
    lead +
    slots
      .map((r) => {
        const mins = Math.round((r.to - r.from) / 60000);
        const sub = r.sub || weak || r.avg < best * 0.9 ? " sub" : "";
        const tier = r.sub ? `<span class="tier">次点</span>` : "";
        return `<div class="slot${sub}" data-from="${r.from}" data-to="${r.to}">
          <div class="t">${fmtD(r.from, d)} – ${fmtD(r.to, d)}<span class="len">${durationText(mins)}</span>${tier}</div>
          <div class="why">${reasonsText(slotReasons(d, r, weak))}</div>
          <div class="env"></div>
          <div class="caution" hidden></div>
        </div>`;
      })
      .join("") +
    tail;
}

/* ===== 天気と風 ===== */
export function renderWeather(h) {
  $("weather").innerHTML = threeHourly(h)
    .map((c) => {
      const [icon] = sky(c.code);
      const cls = windClass(c.wind);
      return `<div class="cell">
        <div class="h">${c.hour}時</div>
        <div class="sky">${icon || "—"}</div>
        <div class="tp">${c.temp == null ? "—" : Math.round(c.temp)}<small>℃</small></div>
        <div class="pp">${c.pop == null ? "" : "☂" + c.pop + "%"}</div>
        <div class="wd${cls ? " " + cls : ""}">${c.wind == null ? "—" : c.wind.toFixed(1)}<small>m/s</small></div>
        <div class="dr">${c.dir == null ? "" : windDir(c.dir)}</div>
      </div>`;
    })
    .join("");

  const g = peakGust(h);
  $("weatherNote").innerHTML = g
    ? `${termButton("gust", "最大瞬間")} ${g.gust.toFixed(1)}m/s（${g.at}時ごろ）。5m/s を超えると釣りにくくなります。`
    : "";
}

/* ===== 釣りに向かない天気の注意書き ===== */

const CAUTION_HEAD = {
  avoid: "⚠ この時間帯は釣りに向きません",
  warn: "⚠ 行くなら用心してください",
};

/** 1枚に出す理由の数。重い順に並んでいるので、あふれたぶんは軽いほうから落ちる */
const CAUTION_MAX = 3;

function paintCaution(box, level, reasons, head) {
  if (!box) return;
  box.className = box.classList.contains("day") ? "caution day" : "caution";
  if (!level) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.classList.add(level);
  box.hidden = false;
  box.innerHTML =
    `<b>${head || CAUTION_HEAD[level]}</b>` +
    reasons
      .slice(0, CAUTION_MAX)
      .map((r) => `<span>${r}</span>`)
      .join("");
}

/**
 * 釣りどきの各区間に、その時間帯の気温・降水確率・風と、荒れるときの注意書きを足す。
 * 注意書きは採点には入らない（fishing.js は天気を見ていない）ので、ここで添えるだけ。
 */
export function annotateSlots(h) {
  const levels = [];
  document.querySelectorAll("#slots .slot").forEach((el) => {
    const a = conditionsOver(h, Number(el.dataset.from), Number(el.dataset.to));
    const env = el.querySelector(".env");
    if (!env) return;
    const parts = [];
    if (a.temp != null) parts.push(`🌡 ${Math.round(a.temp)}℃`);
    if (a.pop != null) parts.push(`☂ ${a.pop}%`);
    if (a.wind != null) parts.push(`💨 ${a.wind.toFixed(1)}m/s`);
    env.innerHTML = parts.map((p) => `<span>${p}</span>`).join("");

    const c = cautionOf(a);
    levels.push(c.level);
    paintCaution(el.querySelector(".caution"), c.level, c.reasons);
  });

  // どの時間帯も「向かない」日は、節の頭でまとめて断っておく。
  // 1本でも行ける時間帯があるなら、区間ごとの注意書きだけで足りる
  const allBad = levels.length > 0 && levels.every((l) => l === "avoid");
  paintCaution(
    document.querySelector("#slots .caution.day"),
    allBad ? "avoid" : null,
    ["時間帯をずらしても逃げられないので、日を変えることも考えてください。"],
    "⚠ この日は天気か風が荒れます"
  );
}

/* ===== 満潮・干潮 ===== */
export function renderTideTable(d) {
  const rows = d.inDay
    .slice()
    .sort((a, b) => a.ms - b.ms)
    .map(
      (e) => `<tr><td><span class="tag ${e.type}">${e.type === "hi" ? "満潮" : "干潮"}</span></td>
        <td class="tm">${fmt(e.ms)}</td><td class="num">${Math.round(e.v)} cm</td></tr>`
    )
    .join("");
  $("tideTable").innerHTML = `<tr><th style="width:78px">潮</th><th>時刻</th><th class="num">潮位</th></tr>${rows}`;
}

/* ===== この日のデータ ===== */
export function renderMeta(d) {
  const noon = new Date(d.start + 12 * 3600000);
  const mp = moonPhase(noon);
  const st = dayStrength(d.maxFlow);
  $("meta").innerHTML = `
    <div><dt>${termButton("range", "干満差")}</dt><dd>${d.range !== null ? d.range + " cm" : "—"}</dd></div>
    <div><dt>${termButton("cycle", "潮回り")}</dt><dd>${tideName(noon)}</dd></div>
    <div><dt>日の出</dt><dd>${fmt(d.sun.rise.getTime())}</dd></div>
    <div><dt>日の入り</dt><dd>${fmt(d.sun.set.getTime())}</dd></div>
    <div><dt>${termButton("moon", "月齢")}</dt><dd>${mp.icon} ${mp.age.toFixed(1)}</dd></div>
    <div><dt>${termButton("flow", "最大流速の目安")}</dt><dd>${st.flow} cm/時</dd></div>`;
}

/* ===== 日の強弱バッジ ===== */
export function renderBadge(d) {
  const st = dayStrength(d.maxFlow);
  const el = $("dayBadge");
  el.className = "badge " + st.key;
  el.textContent = st.label;
}

/* ===== 魚 ===== */
export const fishCard = (f) => `<div class="fish-card">
  <div class="em">${f.emoji}</div>
  <div>
    <div class="nm">${f.name}${f.easy ? '<span class="easy">初心者向け</span>' : ""}</div>
    <div class="how">${f.how}</div>
  </div>
</div>`;

export function renderFishPreview(month) {
  $("fishPreview").innerHTML = fishOfMonth(month).slice(0, 3).map(fishCard).join("");
}

/* ===== ニュース ===== */
export function renderNews(items) {
  if (!items.length) return;
  const ul = $("news");
  ul.textContent = "";
  for (const it of items) {
    const a = document.createElement("a");
    a.href = it.link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = it.title; // 外部由来の文字列なので textContent で入れる
    const at = it.date ? new Date(it.date) : null;
    const m = document.createElement("div");
    m.className = "m";
    m.textContent = (at && !isNaN(at) ? `${at.getMonth() + 1}月${at.getDate()}日・` : "") + (it.source || "");
    a.appendChild(m);
    const li = document.createElement("li");
    li.appendChild(a);
    ul.appendChild(li);
  }
  $("newsSec").hidden = false;
}

/* ===== 下部の日付バー ===== */
export function renderDateBar(d, isToday) {
  const p = jstParts(d.start);
  $("dateMain").textContent = `${p.m}月${p.d}日(${WD[p.wd]})`;
  $("dateSub").textContent = `${d.range !== null ? `干満差${d.range}cm・` : ""}${tideName(new Date(d.start + 12 * 3600000))}`;
  $("picker").value = isoJst(d.start);
  $("todayBtn").dataset.on = isToday ? "1" : "0";
}

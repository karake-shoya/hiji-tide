// 潮位カーブの SVG。色はテーマ変数を参照するので、明暗の切替に自動で追随する。

import { tide } from "./tide.js";
import { fmt } from "./format.js";

const W = 360,
  H = 230,
  PT = 22,
  PB = 30,
  PL = 6,
  PR = 6;

/** グラフ内の x 座標 ⇔ 時刻の相互変換 */
const xOf = (d, ms) => PL + ((ms - d.start) / 86400000) * (W - PL - PR);
const msOf = (d, x) => d.start + ((x - PL) / (W - PL - PR)) * 86400000;

/**
 * その日の潮位カーブを描く。
 * @param {object} d dayData() の戻り値
 * @param {object[]} slots 釣りどきの区間
 */
export function drawChart(d, slots) {
  const dayPts = d.scored.filter((p) => p.ms >= d.start && p.ms <= d.end);
  const vals = dayPts.map((p) => p.v);
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  const yMin = Math.floor((lo - 25) / 20) * 20,
    yMax = Math.ceil((hi + 25) / 20) * 20;
  const X = (ms) => xOf(d, ms);
  const Y = (v) => PT + (1 - (v - yMin) / (yMax - yMin)) * (H - PT - PB);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="この日の潮位カーブ。釣りどきの時間帯と夜間、満潮・干潮の時刻を重ねてある">`;
  s += `<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--accent)" stop-opacity=".45"/>
    <stop offset="1" stop-color="var(--accent)" stop-opacity=".04"/></linearGradient></defs>`;

  // 夜間
  const sr = d.sun.rise.getTime(),
    ss = d.sun.set.getTime();
  s += `<rect x="${PL}" y="${PT}" width="${X(sr) - PL}" height="${H - PT - PB}" fill="var(--night)"/>`;
  s += `<rect x="${X(ss)}" y="${PT}" width="${W - PR - X(ss)}" height="${H - PT - PB}" fill="var(--night)"/>`;

  // 釣りどきの帯（日をまたぐ区間はグラフの端で切る）
  const clampX = (ms) => Math.max(PL, Math.min(W - PR, X(ms)));
  for (const r of slots) {
    const x0 = clampX(r.from),
      x1 = clampX(r.to);
    s += `<rect x="${x0}" y="${PT}" width="${Math.max(2, x1 - x0)}" height="${H - PT - PB}" fill="var(--chart-band)"/>`;
  }

  // 時刻の目盛り
  for (let hh = 0; hh <= 24; hh += 6) {
    const x = PL + (hh / 24) * (W - PL - PR);
    s += `<line x1="${x}" y1="${PT}" x2="${x}" y2="${H - PB}" stroke="var(--chart-grid)" stroke-width="1"/>`;
    s += `<text x="${x}" y="${H - PB + 16}" fill="var(--muted)" font-size="11" text-anchor="${hh === 0 ? "start" : hh === 24 ? "end" : "middle"}">${hh}時</text>`;
  }

  // 波形
  let path = "";
  dayPts.forEach((p, i) => {
    path += (i ? "L" : "M") + X(p.ms).toFixed(1) + " " + Y(p.v).toFixed(1);
  });
  s += `<path d="${path}L${X(d.end)} ${H - PB}L${PL} ${H - PB}Z" fill="url(#wg)"/>`;
  s += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/>`;

  // 満潮・干潮
  for (const e of d.inDay) {
    const x = X(e.ms),
      y = Y(e.v);
    const up = e.type === "hi";
    s += `<circle cx="${x}" cy="${y}" r="3.6" fill="var(--${up ? "rise" : "fall"})"/>`;
    const tx = Math.max(24, Math.min(W - 24, x));
    s += `<text x="${tx}" y="${up ? y - 10 : y + 19}" fill="var(--${up ? "rise" : "fall"})" font-size="11.5" font-weight="700" text-anchor="middle">${fmt(e.ms)}</text>`;
  }

  // 日の出・日の入り
  for (const ms of [sr, ss]) {
    const x = X(ms);
    s += `<line x1="${x}" y1="${PT}" x2="${x}" y2="${H - PB}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="2 3" opacity=".65"/>`;
  }

  // いま
  const now = Date.now();
  if (now >= d.start && now < d.end) {
    const x = X(now);
    s += `<line x1="${x}" y1="${PT - 10}" x2="${x}" y2="${H - PB}" stroke="var(--ink)" stroke-width="1.5"/>`;
    s += `<circle cx="${x}" cy="${Y(tide(now))}" r="5.5" fill="var(--ink)"/>`;
    s += `<text x="${x}" y="${PT - 14}" fill="var(--ink)" font-size="11" text-anchor="middle">いま</text>`;
  }

  // 指でなぞったときのカーソル。最初は隠しておく
  s += `<g class="scrub" style="display:none">
    <line y1="${PT}" y2="${H - PB}" stroke="var(--gold)" stroke-width="1.6"/>
    <circle r="6" fill="var(--gold)"/>
  </g>`;

  s += `</svg>`;
  return { markup: s, Y, yMin, yMax };
}

/**
 * グラフを指でなぞると、その時刻の潮位を読めるようにする。
 * @param {HTMLElement} box グラフを入れた要素
 * @param {object} d dayData() の戻り値
 * @param {(info:{ms:number,v:number}|null)=>void} onRead なぞっている間の通知。離すと null
 */
export function attachScrub(box, d, Y, onRead) {
  const svg = box.querySelector("svg");
  if (!svg) return;
  const g = svg.querySelector(".scrub");
  const line = g.querySelector("line");
  const dot = g.querySelector("circle");

  const toViewX = (clientX) => {
    const r = svg.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  };

  let active = false;

  const move = (clientX) => {
    const x = Math.max(PL, Math.min(W - PR, toViewX(clientX)));
    const ms = msOf(d, x);
    const v = tide(ms);
    line.setAttribute("x1", x);
    line.setAttribute("x2", x);
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", Y(v));
    g.style.display = "";
    onRead({ ms, v });
  };

  const end = () => {
    if (!active) return;
    active = false;
    g.style.display = "none";
    onRead(null);
  };

  svg.addEventListener("pointerdown", (e) => {
    active = true;
    svg.setPointerCapture?.(e.pointerId);
    move(e.clientX);
  });
  svg.addEventListener("pointermove", (e) => {
    if (active) move(e.clientX);
  });
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("pointerleave", end);
}

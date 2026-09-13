// 画面の上端から指で下へ引くとリロードする（「引っ張って更新」）。
//
// ホーム画面から開いた PWA には再読み込みボタンが無く、
// body の overscroll-behavior-y: none でブラウザ標準の引っ張って更新も止めてあるので、自前で用意する。
// 見た目の輪は JS で body の末尾に足す（index.html は骨組みだけに保つ）。

import { isOverlayOpen } from "./nav.js";

/** 指について輪が下がる上限（px） */
const MAX = 96;
/** ここまで引いて離すとリロードする（px） */
const THRESHOLD = 64;
/** 引いた距離に対する輪の追従率。1 未満にして粘りを出す */
const RESIST = 0.5;
/** 縦に引いたと判ずる最小の動き（px）。これ未満では横スワイプと区別できない */
const SLOP = 6;

let el = null; // 輪。画面の上に浮かせる
let icon = null; // 中の矢印。引くほど回り、離せる位置で上を向く

let startY = 0;
let startX = 0;
let tracking = false; // 上端で指が触れている（引きかどうかはまだ決めていない）
let pulling = false; // 縦の引きと判じて、ページのスクロールを止めている
let dist = 0;
let busy = false; // リロード中。重ねて始めさせない

function build() {
  el = document.createElement("div");
  el.className = "ptr";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    `<div class="ptr-ring"><svg viewBox="0 0 24 24" width="22" height="22">` +
    `<path d="M12 4v13M6 12l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg></div>`;
  icon = el.querySelector("svg");
  document.body.appendChild(el);
}

function draw(d) {
  const p = Math.min(1, d / THRESHOLD);
  el.style.transform = `translate3d(0, ${d}px, 0)`;
  el.style.opacity = String(Math.min(1, p * 1.2));
  icon.style.transform = `rotate(${p * 180}deg)`;
  el.classList.toggle("is-ready", p >= 1);
}

/** 輪を画面の外へ戻す */
function reset() {
  el.classList.add("is-animating");
  el.classList.remove("is-ready", "is-busy");
  el.style.transform = "";
  el.style.opacity = "";
  icon.style.transform = "";
  dist = 0;
}

function run(refresh) {
  busy = true;
  el.classList.add("is-animating", "is-busy");
  el.classList.remove("is-ready");
  el.style.transform = `translate3d(0, ${THRESHOLD}px, 0)`;
  el.style.opacity = "1";
  icon.style.transform = "";
  // 押した手ごたえが見えるよう一拍おいてから実行する
  setTimeout(() => {
    Promise.resolve()
      .then(refresh)
      .catch(() => {})
      // リロードならここへは戻ってこない。戻ってきたときのために輪は片づける
      .then(() => {
        busy = false;
        reset();
      });
  }, 180);
}

/** いま引っ張り始めてよい状況か */
function canStart(target) {
  if (busy || isOverlayOpen()) return false;
  if (window.scrollY > 0) return false;
  // グラフを指でなぞる読み取りと取り合わない
  return !target?.closest?.("#chart");
}

/**
 * 上端で引き下げたときの更新をつなぐ。
 * @param {() => any} refresh 引き切って離したときにすること。既定はページのリロード
 */
export function initPullToRefresh(refresh = () => location.reload()) {
  if (!("ontouchstart" in window)) return; // 指で操作しない端末では出さない
  build();

  addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1 || !canStart(e.target)) return;
      tracking = true;
      pulling = false;
      dist = 0;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    },
    { passive: true }
  );

  addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!pulling) {
        // 上や横へ動いたなら、これは引っ張りではない。以降は素通しする
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) return (tracking = false);
        if (dy < SLOP) return;
        if (window.scrollY > 0) return (tracking = false);
        pulling = true;
        el.classList.remove("is-animating"); // 引いている間は指にそのまま付ける
      }

      // ページのスクロールと、端でのゴムの跳ねを止める
      if (e.cancelable) e.preventDefault();
      dist = Math.min(MAX, dy * RESIST);
      draw(dist);
    },
    { passive: false }
  );

  const end = () => {
    if (!tracking) return;
    const go = pulling && dist >= THRESHOLD;
    tracking = false;
    pulling = false;
    if (go) run(refresh);
    else reset();
  };
  addEventListener("touchend", end);
  addEventListener("touchcancel", end);
}

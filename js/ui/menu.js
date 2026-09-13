// ハンバーガーメニュー、全画面パネル、用語のボトムシート、明るさの切り替え。
//
// 開いているものは常に1つだけ。開くときに履歴を1つ積むので、
// Android の戻るボタンとスワイプバックでも閉じられる。

import { PANELS } from "./panels.js";
import { TERMS } from "../data/terms.js";
import { getTheme, setTheme } from "../store.js";

const $ = (id) => document.getElementById(id);

const THEME_COLOR = { dark: "#062029", bright: "#f4f8f8" };

/** 明るさを画面に反映する。ブラウザの上下のバーの色も合わせる */
export function applyTheme(v) {
  const theme = v === "bright" ? "bright" : "dark";
  document.documentElement.dataset.theme = theme;
  $("themeColor")?.setAttribute("content", THEME_COLOR[theme]);
  $("themeDark")?.setAttribute("aria-pressed", String(theme === "dark"));
  $("themeBright")?.setAttribute("aria-pressed", String(theme === "bright"));
}

let closeCurrent = null;

function openOverlay(closeImpl) {
  const first = !closeCurrent;
  if (closeCurrent) closeCurrent(); // 開いているものを差し替える。履歴は増やさない
  closeCurrent = closeImpl;
  if (first) {
    try {
      history.pushState({ hijiOverlay: 1 }, "");
    } catch {
      /* file:// では失敗する。閉じるボタンで閉じられるので続行 */
    }
  }
  document.body.style.overflow = "hidden";
}

function closeOverlay(fromPop) {
  if (!closeCurrent) return;
  closeCurrent();
  closeCurrent = null;
  document.body.style.overflow = "";
  if (!fromPop) {
    try {
      history.back();
    } catch {}
  }
}

/* ===== それぞれの見た目 ===== */
function openDrawer() {
  $("drawer").hidden = false;
  $("scrim").hidden = false;
  $("menuBtn").setAttribute("aria-expanded", "true");
  openOverlay(() => {
    $("drawer").hidden = true;
    $("scrim").hidden = true;
    $("menuBtn").setAttribute("aria-expanded", "false");
  });
}

/** メニューの項目を全画面で開く */
export function openPanel(key, ctx) {
  const p = PANELS[key];
  if (!p) return;
  $("panelTitle").textContent = p.title;
  const body = $("panelBody");
  body.innerHTML = "";
  body.scrollTop = 0;
  p.render(body, ctx);
  $("panel").hidden = false;
  openOverlay(() => {
    $("panel").hidden = true;
    $("panelBody").innerHTML = "";
  });
}

function openSheet(term) {
  $("sheetTitle").textContent = term.title;
  $("sheetBody").innerHTML = term.body;
  $("sheet").hidden = false;
  $("scrim").hidden = false;
  openOverlay(() => {
    $("sheet").hidden = true;
    $("scrim").hidden = true;
  });
}

/**
 * 画面まわりの操作をつなぐ。
 * @param {() => object} getContext 表示中の日の情報を返す関数（パネルへ渡す）
 */
export function initChrome(getContext) {
  applyTheme(getTheme());

  $("menuBtn").addEventListener("click", openDrawer);
  $("scrim").addEventListener("click", () => closeOverlay(false));
  $("panelClose").addEventListener("click", () => closeOverlay(false));
  $("sheetClose").addEventListener("click", () => closeOverlay(false));

  document.querySelectorAll("#drawer nav button").forEach((b) =>
    b.addEventListener("click", () => openPanel(b.dataset.panel, getContext()))
  );
  $("moreFish").addEventListener("click", () => openPanel("fish", getContext()));
  $("aboutBtn").addEventListener("click", () => openPanel("about", getContext()));

  $("themeDark").addEventListener("click", () => {
    setTheme("dark");
    applyTheme("dark");
  });
  $("themeBright").addEventListener("click", () => {
    setTheme("bright");
    applyTheme("bright");
  });

  // 用語ボタンはあちこちに動的に出るので、まとめて拾う
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".term");
    if (!btn) return;
    const t = TERMS[btn.dataset.term];
    if (t) openSheet(t);
  });

  window.addEventListener("popstate", () => closeOverlay(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay(false);
  });
}

// 下部タブによる画面の切り替えと、その上に重なるパネル・ボトムシート。
//
// タブもパネルも履歴を1つ積むので、Android の戻るボタンとスワイプバックで戻れる。
// 画面の中身そのものは panels.js（釣果・魚・その他）と main.js（潮）が作る。

import { PANELS } from "./panels.js";
import { TERMS } from "../data/terms.js";
import { getTheme, setTheme } from "../store.js";

const $ = (id) => document.getElementById(id);

const VIEWS = { tide: "viewTide", log: "viewLog", fish: "viewFish", more: "viewMore" };
const THEME_COLOR = { dark: "#062029", bright: "#f4f8f8" };

let getContext = () => ({});
let current = "tide";
let closeOverlay = null; // パネルかシートが開いていれば、それを閉じる関数

export const currentTab = () => current;

/** 明るさを画面に反映する。ブラウザの上下のバーの色も合わせる */
export function applyTheme(v) {
  const theme = v === "bright" ? "bright" : "dark";
  document.documentElement.dataset.theme = theme;
  $("themeColor")?.setAttribute("content", THEME_COLOR[theme]);
  document.querySelectorAll(".theme-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === theme)));
}

/* ===== タブ ===== */

/** いま開いているタブの中身を描き直す（日付を動かしたときに呼ぶ） */
export function refreshTab() {
  // 潮タブは main.js の render() が描くので、ここでは触らない
  if (current === "tide") return;
  const panel = PANELS[current];
  if (panel) panel.render($(VIEWS[current]), getContext());
}

/**
 * タブを切り替える。
 * @param {string} key tide / log / fish / more
 * @param {boolean} silent 履歴を触らない（戻る操作からの復元と、起動時の初期表示で使う）
 */
export function showTab(key, silent = false) {
  if (!VIEWS[key]) key = "tide";
  const changed = key !== current;
  current = key;

  for (const [k, id] of Object.entries(VIEWS)) $(id).hidden = k !== key;
  document.querySelectorAll(".tabbar button").forEach((b) => {
    if (b.dataset.tab === key) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });

  refreshTab();
  if (changed && !silent) {
    window.scrollTo(0, 0);
    try {
      history.pushState({ hijiTab: key }, "");
    } catch {
      /* file:// では失敗する。タブ自体は切り替わっているので続行 */
    }
  }
}

/* ===== 上に重なるもの ===== */
function openOverlay(closeImpl) {
  const first = !closeOverlay;
  if (closeOverlay) closeOverlay(); // 開いているものを差し替える。履歴は増やさない
  closeOverlay = closeImpl;
  if (first) {
    try {
      history.pushState({ hijiTab: current, hijiOverlay: 1 }, "");
    } catch {}
  }
  document.body.style.overflow = "hidden";
}

function dismiss(fromPop) {
  if (!closeOverlay) return;
  closeOverlay();
  closeOverlay = null;
  document.body.style.overflow = "";
  if (!fromPop) {
    try {
      history.back();
    } catch {}
  }
}

/** その他タブの項目を全画面で開く */
export function openPanel(key) {
  const p = PANELS[key];
  if (!p) return;
  $("panelTitle").textContent = p.title;
  const body = $("panelBody");
  body.innerHTML = "";
  body.scrollTop = 0;
  p.render(body, getContext());
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
 * @param {() => object} provider 表示中の日の情報を返す関数（各画面へ渡す）
 */
export function initNav(provider) {
  getContext = provider;
  applyTheme(getTheme());

  $("scrim").addEventListener("click", () => dismiss(false));
  $("panelClose").addEventListener("click", () => dismiss(false));
  $("sheetClose").addEventListener("click", () => dismiss(false));

  // 押せるものは動的に増えるので、まとめて拾う
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab],[data-go]");
    if (tab) return showTab(tab.dataset.tab || tab.dataset.go);

    const panel = e.target.closest("[data-panel]");
    if (panel) return openPanel(panel.dataset.panel);

    const term = e.target.closest(".term");
    if (term) {
      const t = TERMS[term.dataset.term];
      if (t) openSheet(t);
      return;
    }

    const theme = e.target.closest(".theme-btn");
    if (theme) {
      setTheme(theme.dataset.theme);
      applyTheme(theme.dataset.theme);
    }
  });

  window.addEventListener("popstate", (e) => {
    // 上に何か重なっていれば、まずそれを閉じる
    if (closeOverlay) return dismiss(true);
    showTab((e.state || {}).hijiTab || "tide", true);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismiss(false);
  });
}

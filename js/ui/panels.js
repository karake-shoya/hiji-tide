// ハンバーガーメニューから開く全画面パネルの中身。

import { FISH, fishOfMonth } from "../data/fish.js";
import { TERMS } from "../data/terms.js";
import { GEAR, GEAR_GROUPS } from "../data/gear.js";
import { weekPanel } from "./week.js";
import * as store from "../store.js";
import { WD, escapeHtml, isoJst } from "../format.js";

/* ===== いま釣れる魚 ===== */
const fishPanel = {
  title: "いま釣れる魚",
  render(body, ctx) {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    body.innerHTML = `
      <div class="rowbtns" style="flex-wrap:wrap;margin:0 0 14px">
        ${months.map((m) => `<button class="btn mbtn" data-m="${m}" style="min-height:44px;padding:0 12px">${m}月</button>`).join("")}
      </div>
      <div id="fishList" class="fish"></div>
      <p class="note">釣具店や釣り雑誌で一般に言われている時期をまとめた<b>目安</b>です。海水温と年によってずれます。<br>
      漁業のきまりで獲ってはいけない大きさ・時期が決まっている魚もいます。大分県の漁業調整規則を確認してください。</p>`;

    const list = body.querySelector("#fishList");
    const paint = (m) => {
      body.querySelectorAll(".mbtn").forEach((b) => {
        const on = Number(b.dataset.m) === m;
        b.classList.toggle("primary", on);
      });
      const fish = fishOfMonth(m);
      list.innerHTML = fish
        .map(
          (f) => `<div class="fish-card">
            <div class="em">${f.emoji}</div>
            <div>
              <div class="nm">${f.name}${f.easy ? '<span class="easy">初心者向け</span>' : ""}${f.peak.includes(m) ? '<span class="easy" style="background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--gold)">旬</span>' : ""}</div>
              <div class="how">${f.how}</div>
              <div class="how" style="color:var(--muted);margin-top:4px">${f.tip}</div>
            </div>
          </div>`
        )
        .join("");
    };
    body.querySelectorAll(".mbtn").forEach((b) => b.addEventListener("click", () => paint(Number(b.dataset.m))));
    paint(ctx.month);
  },
};

/* ===== 持ち物チェック ===== */
const gearPanel = {
  title: "持ち物チェック",
  render(body) {
    const paint = () => {
      const g = store.getGear();
      const row = (item, deletable) => `<li>
        <label>
          <input type="checkbox" data-id="${item.id}" ${g.checked[item.id] ? "checked" : ""}>
          <span class="txt"><span class="${item.must ? "must" : ""}">${escapeHtml(item.label)}</span>
            ${item.hint ? `<span class="hint">${item.hint}</span>` : ""}</span>
          ${deletable ? `<button class="del" data-del="${item.id}" aria-label="${escapeHtml(item.label)}を消す">✕</button>` : ""}
        </label>
      </li>`;

      const groups = GEAR_GROUPS.map((name) => {
        const items = GEAR.filter((i) => i.group === name);
        return `<h4>${name}</h4><ul class="check">${items.map((i) => row(i, false)).join("")}</ul>`;
      }).join("");

      const custom = g.custom.length
        ? `<h4>じぶんで足したもの</h4><ul class="check">${g.custom.map((i) => row(i, true)).join("")}</ul>`
        : "";

      body.innerHTML = `
        <p class="note" style="padding-top:0">チェックはこの端末だけに残ります。外へは送りません。</p>
        ${groups}${custom}
        <h4>足す</h4>
        <div class="rowbtns">
          <input type="text" id="gearNew" placeholder="例：エギ 3.0号" maxlength="40">
          <button class="btn primary" id="gearAdd">足す</button>
        </div>
        <div class="rowbtns">
          <button class="btn grow" id="gearClear">チェックを全部外す</button>
        </div>`;

      body.querySelectorAll('.check input[type="checkbox"]').forEach((cb) =>
        cb.addEventListener("change", () => store.setGearChecked(cb.dataset.id, cb.checked))
      );
      body.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.preventDefault(); // label の中にあるのでチェックが入ってしまうのを止める
          store.removeGearItem(b.dataset.del);
          paint();
        })
      );
      const input = body.querySelector("#gearNew");
      const add = () => {
        if (store.addGearItem(input.value)) paint();
      };
      body.querySelector("#gearAdd").addEventListener("click", add);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") add();
      });
      body.querySelector("#gearClear").addEventListener("click", () => {
        store.clearGearChecks();
        paint();
      });
    };
    paint();
  },
};

/* ===== 釣行メモ ===== */

/** 読み込んだ結果の知らせ。0件の節は出さない */
function importText({ added, updated, skipped }) {
  if (!added && !updated) {
    return skipped
      ? `読み込みましたが、${skipped}件ともこの端末の記録の方が新しいので、何も変わりませんでした。`
      : "このファイルに記録はありませんでした。";
  }
  const head = added && updated ? `新しく${added}件を読み込み、${updated}件を更新しました。` : added ? `新しく${added}件を読み込みました。` : `${updated}件を更新しました。`;
  return head + (skipped ? `${skipped}件はこの端末の記録の方が新しいので、そのままにしました。` : "");
}

const logPanel = {
  title: "釣行メモ",
  render(body, ctx) {
    const paint = () => {
      const cur = store.getLog(ctx.iso) || { fish: "", note: "" };
      const list = store.logList();
      body.innerHTML = `
        <h4>${ctx.label} の記録</h4>
        <p class="note" style="padding-top:0">${ctx.tideName}・干満差${ctx.range ?? "—"}cm の日です。この端末だけに残ります。</p>
        <div class="field">
          <label for="logFish">釣れたもの</label>
          <input type="text" id="logFish" maxlength="120" placeholder="例：アジ 12匹、カサゴ 2匹" value="${escapeHtml(cur.fish)}">
        </div>
        <div class="field">
          <label for="logNote">メモ</label>
          <textarea id="logNote" maxlength="600" placeholder="例：日の出前がよく当たった。サビキ 3号。風が強くて足元だけ">${escapeHtml(cur.note)}</textarea>
        </div>
        <div class="rowbtns">
          <button class="btn primary grow" id="logSave">保存する</button>
          ${cur.fish || cur.note ? '<button class="btn" id="logDel">消す</button>' : ""}
        </div>
        <div id="logSaved" class="note"></div>
        <h4>これまでの記録（${list.length}件）</h4>
        ${
          list.length
            ? list
                .map((l) => {
                  const [y, m, d] = l.iso.split("-").map(Number);
                  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
                  return `<div class="logrow">
                    <div class="lday">${y}年${m}月${d}日(${wd})
                      <span class="sm">${escapeHtml(l.tideName)}${l.range != null ? `・干満差${l.range}cm` : ""}</span></div>
                    ${l.fish ? `<div class="lfish">${escapeHtml(l.fish)}</div>` : ""}
                    ${l.note ? `<div class="lnote">${escapeHtml(l.note)}</div>` : ""}
                  </div>`;
                })
                .join("")
            : '<p class="note" style="padding-top:0">まだありません。釣れた日に書いておくと、次に同じ潮回りの日を開いたとき思い出せます。</p>'
        }

        <h4>記録の持ち出し</h4>
        <div class="rowbtns">
          <button class="btn grow" id="logExport">書き出す</button>
          <button class="btn grow" id="logImport">読み込む</button>
        </div>
        <input type="file" id="logFile" accept="application/json,.json" hidden>
        <div id="logIo" class="note"></div>
        <p class="note" style="padding-top:0">端末を変えるときに使います。釣行メモと持ち物が1つのファイルに入ります。
        読み込むと、同じ日付はあとで保存した方が残ります。ファイルは外へは送りません。</p>`;

      body.querySelector("#logSave").addEventListener("click", () => {
        const ok = store.saveLog(ctx.iso, {
          fish: body.querySelector("#logFish").value,
          note: body.querySelector("#logNote").value,
          tideName: ctx.tideName,
          range: ctx.range,
          maxFlow: ctx.maxFlow,
        });
        body.querySelector("#logSaved").textContent = ok ? "保存しました。" : "この端末では保存できませんでした（プライベートモードかもしれません）。";
        if (ok) setTimeout(paint, 600);
      });
      body.querySelector("#logDel")?.addEventListener("click", () => {
        store.deleteLog(ctx.iso);
        paint();
      });

      /* 書き出し・読み込み */
      const io = body.querySelector("#logIo");
      const fileInput = body.querySelector("#logFile");

      body.querySelector("#logExport").addEventListener("click", () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(store.exportData(), null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        // download を持たないブラウザ（古い iOS Safari）では新しいタブに出して手で保存してもらう
        if ("download" in a) a.download = `hiji-tide-${isoJst(Date.now())}.json`;
        else a.target = "_blank";
        a.rel = "noopener";
        // 切り離したままの click を無視するブラウザがあるので、いったん画面に入れてから押す
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000); // 保存が始まる前に消さない
        io.textContent = `${store.logList().length}件の記録を書き出しました。`;
      });

      body.querySelector("#logImport").addEventListener("click", () => fileInput.click());

      fileInput.addEventListener("change", async () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        io.textContent = "読み込んでいます…";
        let text = "";
        try {
          text = await f.text();
        } catch {
          io.textContent = "ファイルを開けませんでした。";
          return;
        }
        fileInput.value = ""; // 同じファイルをもう一度選べるようにする
        const r = store.importData(text);
        if (!r.ok) {
          io.textContent = r.reason;
          return;
        }
        paint(); // 一覧を描き直す。io は消えるので、描いたあとに書き戻す
        body.querySelector("#logIo").textContent = importText(r);
      });
    };
    paint();
  },
};

/* ===== 用語 ===== */
const termsPanel = {
  title: "用語の説明",
  render(body) {
    body.innerHTML =
      "<dl>" +
      Object.values(TERMS)
        .map((t) => `<dt>${t.title}</dt><dd>${t.body}</dd>`)
        .join("") +
      "</dl>";
  },
};

/* ===== このサイトについて ===== */
const aboutPanel = {
  title: "このサイトについて",
  render(body) {
    body.innerHTML = `
      <h4>なにを出しているか</h4>
      <p>大分県日出町（別府湾）の潮位を、海上保安庁が公開している大分験潮所の潮汐調和定数（2021年算定・27分潮）から推算しています。日の出・日の入り、月齢、潮回りも同じページの中で計算していて、外部に問い合わせていません。<b>圏外でも潮見表は動きます。</b></p>

      <h4>精度</h4>
      <p>大潮〜中潮では気象庁の公式予測と時刻で±10分、潮位で±10cm程度の一致です。<b>小潮まわりは満干潮の時刻が最大1時間ほどずれます</b>（潮位曲線が平坦で極値が定まりにくいため）。実際の潮位は気圧・風でも変わります。</p>

      <h4>潮回りの名前について</h4>
      <p>大潮・小潮などの名前は月齢から求めています。旧暦を基準にした表記とは1日ずれることがあり、名前と実際の干満差が食い違う日もあります（長潮のほうが小潮より大きく動く、など）。強さを見るときは名前より<b>干満差の数値</b>を優先してください。</p>

      <h4>安全のために</h4>
      <p><b>航行・安全の判断には使わないでください。</b>正確な値は気象庁「潮位表」や海上保安庁の刊行物をご確認ください。<br>
      堤防からの釣りでもライフジャケットを着てください。単独での夜釣りは避け、行き先と帰る時刻を家族に伝えてから出かけてください。</p>

      <h4>風・天気とニュース</h4>
      <p>風と天気は <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> の予報です（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>）。予報のある期間だけ表示され、それ以外の日はこの欄が出ません。<br>
      釣りのニュースは <a href="https://tsurinews.jp/" target="_blank" rel="noopener noreferrer">TSURINEWS</a> と <a href="https://tsurihack.com/" target="_blank" rel="noopener noreferrer">TSURI HACK</a> の配信フィードから、見出しと日付だけを引用しています。本文や画像は載せていません。見出しをタップすると各サイトの元記事へ移動します。記事の著作権はそれぞれの発行元にあります。</p>

      <h4>釣れる魚について</h4>
      <p>釣具店や釣り雑誌で一般に言われている時期をまとめた目安です。実際の釣果を保証するものではありません。</p>

      <h4>端末に保存しているもの</h4>
      <p>持ち物チェック・釣行メモ・画面の明るさは、この端末の中だけに保存しています。外部へは送っていません。ブラウザの保存データを消すと一緒に消えます。</p>

      <h4>出典</h4>
      <p>潮位：「潮汐調和定数（大分）」（海上保安庁海洋情報部）<br>
      <a href="https://www1.kaiho.mlit.go.jp/TIDE/harmonic/constants/hc.php?s=0163" target="_blank" rel="noopener noreferrer">https://www1.kaiho.mlit.go.jp/TIDE/harmonic/constants/hc.php?s=0163</a><br>
      上記をもとに植野翔也が推算・作図したものです。海上保安庁および気象庁が作成・公表したデータそのものではありません。本サイトは個人が制作したもので、両庁とは一切関係ありません。</p>`;
  },
};

/* ===== その他（タブ） ===== */
const morePanel = {
  title: "その他",
  render(body) {
    const theme = store.getTheme();
    body.innerHTML = `
      <div class="morelist">
        <button class="morerow" data-panel="gear"><span class="ic">🎒</span>持ち物チェック</button>
        <button class="morerow" data-panel="terms"><span class="ic">📖</span>用語の説明</button>
        <button class="morerow" data-panel="about"><span class="ic">ℹ️</span>このサイトについて</button>
      </div>

      <h2>画面の明るさ</h2>
      <div class="theme-toggle" role="group" aria-label="画面の明るさ">
        <button class="theme-btn" data-theme="dark" aria-pressed="${theme === "dark"}">🌙 暗い</button>
        <button class="theme-btn" data-theme="bright" aria-pressed="${theme === "bright"}">☀️ 明るい</button>
      </div>
      <p class="note">日中の屋外では「明るい」のほうが見やすくなります。</p>

      <h2>このページについて</h2>
      <p class="note" style="padding-top:0">潮位は海上保安庁が公開する大分験潮所の調和定数からブラウザの中で計算しています。
      持ち物チェックと釣行メモはこの端末だけに保存され、外へは送りません。<br>
      <b>航行・安全の判断には使わないでください。</b></p>`;
  },
};

export const PANELS = { week: weekPanel, fish: fishPanel, gear: gearPanel, log: logPanel, terms: termsPanel, about: aboutPanel, more: morePanel };

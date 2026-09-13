# 日出の潮（hiji-tide）

大分県日出町・別府湾の潮見表と釣りどきを出す公開サイト。仕様と構成の正は [README.md](README.md)。

本番 https://hiji-tide.vercel.app/ ／ GitHub（**public**）karake-shoya/hiji-tide

## poporu（秘書ポポルの記憶）へのポインタ

🔴 **このリポの作業は poporu ではなく「このリポ」で `claude` を起動する。**

- **poporu 側に専用メモリは無い。** 設計・調査・仕様の正は**このリポ**（README と本ファイル）。poporu 側は `repos.md` の台帳1行のみ。
- **journal の領域名**: `hiji-tide`
- 🔴 **作業を終えたら poporu の当日 journal へ1ファイル書く。書式と規則の正はグローバル `~/.claude/CLAUDE.md` の「薄いポポル」節。** ここには写さない（写すと腐る）。⚠ **スマホ（クラウド）では `~/.claude/` が読まれないので、`poporu` も一緒に選ぶ。**

## このリポ固有の注意

- ⚠ **ローカル確認は `vercel dev` を使う。** 静的サーバで開くと `/api/news` が 404 になり、ニュースが出ない。

  ```bash
  vercel dev --cwd . --listen 4173
  ```

- ⚠ **public リポ。** 顧客名・副業SFの情報を書かない。Issue 本文も同じ。
- 🔴 **Open-Meteo（風）は非商用限定**（1日1万リクエスト）。広告・アフィリエイトを入れるときは差し替えを検討する。
- 🔴 **ニュースは見出し・日付・リンクだけ。記事本文は載せない。** 出典明記と掲載元リンクは TSURI HACK の[引用条件](https://tsurihack.com/copyright)に沿わせてある。取得元を増やすときも同じ条件を守る。
- **潮汐の推算ロジック（`CONST` / `tide()` / `sunTimes()`）は動作の根幹。** 変更するときは node で複数日を実測してから直す（手順は README の「釣りどきの決め方」と過去の journal）。

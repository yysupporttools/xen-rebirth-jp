# Xen Rebirth 日本語攻略サイト Ver.2

HTML / CSS / JavaScriptだけで表示できる静的サイトです。本文確認日：2026-09-11。

## すぐ見る

ZIPを「すべて展開」し、`dist/index.html`をブラウザで開いてください。
全14ページ、ボス画像4点、出典、スマートフォン対応のスタイルを同梱。表示に追加インストールは不要です。

## GitHub Pagesで無料公開する

1. GitHubで新しいPublicリポジトリを作成します（例：xen-rebirth-jp）。既存のsmelt-counterとは別にしてください。
2. このフォルダ内の `dist`、`scripts`、`.github`、README等をリポジトリ直下へアップロードし、既定ブランチを `main` にします。
3. 隠しフォルダ `.github/workflows/pages.yml` がアップロードされていることを確認します。親フォルダのさらに内側へ入れないでください。
4. Settings → Pages → Build and deployment → Source で **GitHub Actions** を選びます。
5. Actions → **Update boss schedule and publish Pages** → **Run workflow** を実行します。
6. 成功するとPagesのURLが表示されます。例：`https://ユーザー名.github.io/xen-rebirth-jp/`。

公開リポジトリで使えるGitHub FreeのPagesを想定。プランや利用条件は公式で確認してください。
https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

公開先：https://yysupporttools.github.io/xen-rebirth-jp/

## ボス予定の更新

- 残り時間は1秒ごとに端末時刻から再計算。タブを戻した際も再計算します。
- `Asia/Tokyo`へ変換するため、閲覧端末のタイムゾーンに依存しません。
- 公式タイマーが使用する `https://www.xenrebirth.com/events.php` を取得します。
- 同梱のGitHub Actionsが6時間ごと（UTCの0/6/12/18時17分）に予定を更新し、Pagesを再公開します。
- 開いたままのページは同じ公開サイトのデータを5分ごとに再取得します。公式サイトへのブラウザからのクロスオリジン通信は不要です。
- 取得に失敗するとワークフローは失敗し、前の公開内容を残します。12時間以上更新されない場合は古さを表示。収録期間の期限後はカウントダウンを止めて公式へ案内します。
- ZIPを開くだけの場合は収録期間の予定のみ有効です。将来の予定の自動取得にはGitHub Actionsでの公開か手動更新が必要です。
- GitHubの定期実行は遅れることがあります。Publicリポジトリでは長期の活動停止で定期実行が無効になる場合もあります。Actionsの実行状況を確認し、必要なら再有効化してください。
- 実際の出現・生存・討伐状況は取得していません。「予定の出現枠」は公式の予定期間です。

手動更新（Python 3.10以上、追加パッケージ不要）：

```text
python scripts/update_bosses.py
```

`dist/assets/boss-data.js` と `boss-data.json` が更新されます。通常の静的ホスティングなら両方をアップロードしてください。画像も再取得する場合だけ `--images` を付けます。

## 編集場所

- `dist/index.html`：トップ
- `dist/start.html`：登録・認証・ダウンロード・起動
- `dist/classes.html`：6職業の一覧
- `dist/class-*.html`：6職業の個別ガイドと共通転職ガイド
- `dist/systems.html`：ペット・騎乗・パーティ・ギルド・ダンジョン
- `dist/bosses.html`：日本時間ボスタイマー
- `dist/tools.html`：精錬サイトへの入口
- `dist/sources.html`：出典と編集方針
- `dist/assets/style.css`：デザイン
- `dist/assets/app.js`：タイマー
- `scripts/update_bosses.py`：公式予定の取得・検証

文章はHTMLを直接編集できます。ビルド工程はありません。リンクは相対パスです。

## 精錬サイトとの統合範囲

`https://yysupporttools.github.io/smelt-counter/` へリンクしています。
個人記録は既存サイトを使ったブラウザ・端末で引き続き参照できます。
精錬サイト本体・共有バックエンド・既存データは変更していません。

## 情報と素材

公式サイトの職業紹介と公式サイト内Lexiconを参照し、日本語で独自に要約しました。
Lexiconには利用者執筆記事も含まれます。仕様変更や編集中の内容もあるため、ゲーム内の最新表示を優先してください。各ページに出典リンクを記載しています。
6系統の公式早見表に掲載された全129項目（未確認1項目を含む）を日本語で収録。職業画像48点とスキルアイコン128点を追加しています。SKILL_DATA.jsonにスキルデータ、IMAGE_SOURCES.jsonに画像ごとの出典を同梱。
登録・メール認証・ゲームログインは実施していません。認証手順は実画面の案内に従う形式です。
ボス画像4点の出典：公式Worldboss Event Timer、`images/db/events/hippo.png`、`snaked.png`、`ra.png`、`amaranth.png`。
名称・ゲーム画像の権利は各権利者に帰属します。
イベントカレンダー・掲示板・新しいガチャ集計は今回のVer.2の範囲には含みません。

## 動作確認

検証内容と結果は `VALIDATION.md` を参照してください。

Art of War / Heavy Slam / Blizzard: user-provided skill icons added on 2026-09-13.

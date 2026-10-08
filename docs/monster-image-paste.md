# モンスター図鑑への画像追加

モンスター詳細の「画像を追加」から、ゲーム内画像をCtrl＋Vで貼り付けるか、画像ファイルを選べます。プレビューを確認して追加すると、その場で共有図鑑に表示されます。画像URLからの追加も利用できます。

PNG / JPEG / WebP、1枚2MBまで、縦横4096px以内。既存の画像は残り、追加された画像をモンスター詳細で確認できます。Lv・ドロップ・DEFなどの情報追記と記事修正報告は、引き続き管理者が確認します。「確認用画像」は非公開の証拠画像であり、図鑑には公開しません。

## 画像追加API

`site-feedback` の `POST action: add_image` を使用します。

```json
{
  "action": "add_image",
  "monster_id": "図鑑に掲載されているID",
  "title": "モンスター名",
  "article_url": "https://yysupporttools.github.io/xen-rebirth-jp/monsters.html#ID",
  "visitor": "ブラウザーのUUID",
  "monster_image": { "type": "image/png", "data": "base64" },
  "image_url": "",
  "author_name": "",
  "source_url": ""
}
```

ファイルとURLを両方指定した場合は、ファイルを優先します。URLだけの追加では `monster_image` を省略します。成功時に `{ok:true,id,image_url,publication_mode:'immediate'}` を返します。

Lv・ドロップ・DEF・出現場所・備考・自由本文はこの操作では公開しません。公開される `monster_updates.details` はサーバーが生成する `image_url` / `image_source` / `publication_mode` の3項目です。一般の情報追記は従来の `submit` と管理者確認を使用します。過去の確認待ち画像は自動公開しません。

## 保存・検証・管理

- 画像専用の追加枠（10分間に60枚、日本時間の1日に500枚）を判定してから、サーバーだけがStorageへ保存します。Lv・ドロップ・DEFなどの情報追記と記事修正報告は、従来の10分間に5件、1日に30件を維持します。一般ユーザーのStorage直接書き込み権限はありません。
- 貼り付け・ファイル画像の原本はprivate `article-feedback`、図鑑表示用コピーはpublic `monster-images`に保存します。
- 即時公開の画像だけに `publication_mode: immediate` を付けます。管理者確認済みの追記と表示を区別します。
- PNG/JPEG/WebPの構造と寸法を検証します。画像URLは公開HTTPSのホストに限定し、ローカル・プライベートIPを拒否します。
- 公開図鑑JSONのID集合を5分キャッシュして照合し、未登録モンスターへの孤立投稿を拒否します。
- 管理者は既存の投稿管理から画像を非公開にできます。管理済みの公開コピーだけを削除し、任意の外部URLや公式画像を削除しません。
- 公開時の応答が失われた場合は保存された投稿を確認し、既に公開された画像を誤って削除しません。cleanup候補も現時点で公開中の画像は除外します。

## 既存プロジェクトへの反映

最初の貼り付け対応の `monster-image-paste.sql` に続き、差分 `monster-image-immediate.sql` と画像専用枠の `docs/monster-image-rate.sql` を適用します。`site-feedback/index.ts`を更新し、フロントのキャッシュ番号を変更します。`verify_jwt=false`で公開keyを検証し、管理操作は従来通り実Authユーザーと管理者権限を確認します。初期作成用 `site-feedback.sql` は再適用しません。追加枠の仕様は `docs/monster-image-rate.md` を参照してください。

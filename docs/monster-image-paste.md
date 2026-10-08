# モンスター図鑑への画像貼り付け登録

モンスター詳細の「画像を貼り付けて登録」から、コピーしたゲーム内画像を Ctrl＋V で貼り付けられます。ファイル選択も利用できます。プレビューを確認し、取り消し・選び直しをしてから送信できます。

PNG / JPEG / WebP、1枚2MBまで。投稿された画像は管理者の確認待ちとして非公開で保存します。管理者が「この画像を図鑑へ掲載する」を選び、「公開済み」で保存した画像を共有図鑑に掲載します。元の公式画像がある場合は、モンスター詳細の追加画像として表示します。公式画像が未登録の場合は一覧画像にも反映します。

従来の画像URL入力も利用できます。「確認用画像」は管理者にだけ見える証拠画像であり、図鑑には公開しません。

## 保存と権限制御

- 従来の確認用画像: `article-feedback` private bucket / `attachment_path`
- 貼り付けた図鑑画像の審査待ち原本: 同 private bucket / `monster_image_path`
- 承認された図鑑画像: `monster-images` public bucket / `monster_image_public_path`
- 公開画像のURLは承認時にサーバーが `monster_updates.details.image_url` に設定し、`image_source = uploaded` を付けます。
- Storageに一般ユーザーの画像書き込みポリシーは追加しません。公開コピーは実際の管理者セッションを検証したEdge Functionだけが作成します。
- 非公開へ戻すと公開データを除去し、その投稿の管理済み公開画像だけを削除します。任意の画像URLや公式画像は削除対象にしません。
- 削除失敗は非公開の `feedback_private.image_cleanup` に残り、次の管理者保存時に再試行します。
- 管理操作が競合した場合は、読み込み時の状態・更新日時が一致する場合だけ承認します。

## 既存プロジェクトへの反映順

1. `docs/monster-image-paste.sql` を差分マイグレーションとして適用します。
2. `supabase/functions/site-feedback/index.ts` を既存 `site-feedback` に更新します。従来通り publishable key と管理者JWTの独自検証を行うため `verify_jwt=false` を維持します。
3. `report-issues.js` / CSSと`monsters.js`を公開し、全HTMLの対応するURLに新しいキャッシュ番号を付けます。

既存の `site-feedback.sql` は再適用しません。今回の差分は既存報告や投稿を書き換えません。管理者画面へのログインは質問掲示板と同じです。

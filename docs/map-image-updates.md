# 拡大マップ画像の更新

既存マップの名前・IDを保ったまま、拡大マップ画像を新しい写真に変更します。変更前後の写真は `game_map_image_versions` に記録し、ストレージの古い画像は削除しません。

## 公開クライアントの契約

`POST /functions/v1/map-image` に `apikey` と `x-xen-client: map-nav-v1` を付けます。操作は `action: replace_image` の1種類です。

入力：`map_id`（選択した元のUUID）、`visitor_id`（既存の端末UUID）、`expected_image_url`、`expected_image_hash`（null可）、`expected_revision`、`image_url`、`image_hash`、`width`、`height`。

アップロード先は `map-images/manual-updates/<map_id>/<file_uuid>.webp`。入力 PNG / JPEG / WebP をブラウザで WebP に変換し、実データ2MiB以内、縦横100〜4096ピクセルにします。Edgeは指定した自分のプロジェクト・パスだけを取得し、WebPコンテナ、実際の画像寸法、SHA-256、最大バイト数を確認します。外部URL・クエリ・別マップのアップロードを受け付けません。

成功結果：`saved: true`、`map_id`、`image_url`、`source_image_hash`、`image_source: manual`、`image_revision`、`image_width`、`image_height`、`updated_at`。公開マップの4追加列は source/revision/width/height だけです。

更新時には元の画像URL・ハッシュ・版番号をDBの行ロック内で比較します。別の操作が先に更新した場合は409で停止し、上書きの再試行は行いません。更新後の読込みに失敗しても成功結果を画面へ適用し、古い座標を新しい画像へ重ねません。

## 写真の優先と座標

手動で更新した写真は `image_source=manual` になり、以後のAI観測では写真URL・ハッシュ・版番号・画像寸法・画像更新日時を維持します。名称の別表記がある場合も、最新の手動画像を優先して同じ元のIDへ観測を記録します。

新しい写真に対応していると確認できない既存NPC座標は表示しません。既存の座標・NPC名・過去の観測は削除せず、AIの新しい観測も候補として保存します。手動画像へのAI観測で既存の平均座標を更新しません。この変更では共有NPC位置修正ツールを追加しません。

## 権限と制限

新しい `map_image_replace` は SECURITY INVOKER で、service_role のみ実行可能です。公開の anon/authenticated に UPDATE 権限を追加しません。Edgeでは公開キー、サイトのOrigin、専用クライアントを確認します。service role はサーバー内だけで使用します。

既存の非公開 `feedback_private.throttle` をマップ画像更新専用のハッシュ空間で再利用します。他の投稿のカウントとは分離し、60回/10分・500回/日本日付で制限します。ハッシュはEdge内の秘密情報でソルトし、元のIPや端末IDを公開記録に残しません。ロック順序を固定し、制限エラー時には新しいカウンター行も巻き戻します。

## 確認手順

- `outputs/map-image-update-20261009/test-edge.cjs`：実際のEdgeコードと既存のWebPファイルを使い、公開キー・Origin・パス・ハッシュ・寸法・サイズ上限・サービス専用RPC・競合エラーを確認します。通信はメモリー内の代替で、アップロードやDB書き込みは行いません。
- `scripts/test-map-location.cjs`：自動収集で手動写真を上書きしない、既存座標を描画しない、元の地名キーを使うことを確認します。
- `outputs/map-image-update-20261009/rollback-fixture.sql`：SQLの承認・適用後にのみ実行します。専用の仮データを1トランザクション内で作り、CAS競合・画像履歴・service_roleだけの実行・手動写真保持・生の観測保持・平均座標の保護・制限エラー巻戻しを検証し、全変更をROLLBACKします。

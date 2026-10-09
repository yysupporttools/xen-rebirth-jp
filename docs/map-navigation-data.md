# マップナビの保存データ契約

`dist/assets/map-navigation-data.js` は、既存の公開データだけを読み込み、拡大マップ画像の未登録場所を追加するためのクライアントです。認証・テーブル定義・権限・RPCは変更していません。

## 読み込み

事前に `glossary-config.js`、`vendor/supabase.js`、`map-registry.js` を読み込みます。

`window.XenMapNavigationData.load()` は次を返します。

- `maps`: 元の ID を保持したマップ行。名称だけ既存の地名レジストリで正規化し、元の名称を `map_name_original` に残します。
- `mapGroups`: 名称ごとの表示グループ。`map_variants` 内の写真・ID はすべて保持します。
- `mapNpcs`: 保存画像上の座標。`map_id` と画像を対応させ、別写真の座標は重ねません。`x_norm / y_norm` は左上を原点に各辺0〜1000です。ゲームのワールド座標ではありません。
- `npcProfiles`、`knowledge`: 公開NPC紹介と会話に記録されたマップ名。紹介画像は `image_url`。
- `monsters`: 名前・Lv・地域・出現マップ・出典だけの図鑑検索情報。公開投稿の Lv と出現場所は、それぞれの項目の最新値を反映します。`mapSource` が `catalog` または `player`。地域の見出しだけを指す場所は `regionOnly` とします。モンスターの正確な座標は存在しません。
- `monsterUpdates`: 公開投稿の原文データ。
- `transitions`: 空配列。現状の本番DBにマップ遷移テーブルはありません。`game_dialogue_transitions` は会話遷移なので使用しません。
- `warnings`: NPCの紹介・会話・図鑑の投稿情報の一部を取得できなかった場合の説明。

各公開テーブルを ID 順で500件ずつ読みます。単ページ上限でデータを欠落させません。マップ画像と座標の取得は必須で、失敗時は一式を読み込めなかったことを返します。

2026-10-09の公開APIによる読み込みは、マップ17行（表示グループ16）、座標303、NPC紹介102、会話240、図鑑投稿54を取得しました。

## 手動追加

`saveMap({name, file, cropped: true})` を利用します。`cropped: true` は、UIで拡大マップ全体だけを切り抜いたことを確認してから渡します。入力は PNG / JPEG / WebP、2MiB以内、縦横100〜4096ピクセルです。WebPに変換して2MiB以内に収めます。

地名は登録名称から候補を提示し、既知の別表記は統一します。未知の新しい名前も120文字以内で保持します。制御文字・HTMLの山括弧は受け付けません。

画像付きの既存マップは置き換えません。名称の別表記で登録された画像も対象です。写真が空でもNPC座標が残っている場所は、既存座標と別画像の不整合を避けるため手動追加を拒否します。

既存 `map-images` バケットに新しい UUID のファイルを `upsert:false` で追加し、`map_analysis_save` に空のNPC配列を送ります。既存の元の名称があればその名称を使い、別表記の新規親レコードを作りません。アップロード後にもマップと座標を読み直し、別の画面で登録済みになった場合は上書きしません。最終チェックと既存RPC呼び出しは同一トランザクションではないため、厳密な同時書き込み保証は既存APIの範囲外です。

## 手動NPC座標

共有の座標修正・出口登録機能は実装していません。既存RPCは同じNPCの座標を置換するのではなく観測回数で平均します。また、画像ハッシュを条件とする保存拒否機能はありません。このため、別画像への座標流用や既存座標の平均化を避けるには、現状では自端末用のマーカーとして扱います。

不足画像やNPC位置は、翻訳・NPC検索の既存拡大マップ解析から収集できます。このヘルパーはバックエンド・既存の自動収集処理を変更しません。

## 確認

`outputs/map-navigation-20261009/test-map-navigation-data.cjs` で実ファイルを読み込み、公開データの全件ロード、1102件のページ分割、名称統一、画像ごとの座標保持、項目別の図鑑更新、画像付きマップ拒否、座標だけあるマップ拒否、不正形式拒否、新規地名追加、並行登録検知、既存生名称の再利用を検証しています。テストのRPC・アップロードはメモリー内の代替で、本番にテスト書き込みを行っていません。

参照: [Supabase JavaScript pagination](https://supabase.com/docs/reference/javascript/range)、[Storage upload](https://supabase.com/docs/reference/javascript/file-buckets-upload)、[RPC](https://supabase.com/docs/reference/javascript/rpc)。


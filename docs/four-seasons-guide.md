# 四季イベントの用語集追加内容

登録先：既存の「基本用語」分類。見出しは「四季イベント / Four Seasons Event」、識別子は `four-seasons-event` です。本文・別名・出典を照合し、既存の用語集と静的カタログに同名の記事がないことを確認しました。イベントカレンダーの開催日時レコードは別の目的であり、今回追加・複製しません。

## 掲載本文

春・夏・秋・冬の専用マップで季節のSign（交換用アイテム）を集める週末イベントです。
開催：毎週土曜日0:00〜日曜日23:59（ゲームのサーバー時刻）。

### 参加方法

1. Esseneの転送NPC付近から北（Engrave Path方面）へ進み、Event Guideに話しかけます。
2. 最初の選択肢で入口マップAisenへ移動します。
3. Aisenにある4つの季節ポータルから行きたいマップを選び、モンスターを倒してSignを集めます。
4. 集めたSignを対応する季節の交換NPCに渡します。

### 季節マップとドロップ

| 季節 | Aisen内のポータル | マップ | ドロップするSign |
| --- | --- | --- | --- |
| 春 | 緑 | Alparan | Spring Sign |
| 夏 | 黄色 | Shaonell | Summer Sign |
| 秋 | オレンジ | Murein | Fall Sign |
| 冬 | 水色 | Kiblock | Winter Sign |

各マップのモンスターが、その季節のSignをドロップすることがあります。

### 交換

季節のSignは各種Lucky BallやSeal Exchange Ticketと交換できます。Seal Exchange Ticketは再抽選（reroll）に使うアイテムです。
交換品・必要個数は、出典ページのSpring / Summer / Fall / Winter Exchange画像とゲーム内の交換画面をご確認ください。
出典：公式Lexicon「Four Seasons Exchange」（OnionMage12）。2026年10月9日確認。本項は日本語の要約です。

[公式Lexicon：Four Seasons Exchange](https://www.xenrebirth.com/lexicon/index.php?entry/163-four-seasons-exchange/)

## 確認事項

- 出典本文を日本語で要約し、全文の逐語訳は行っていません。
- サーバー時刻をそのまま明示します。タイムゾーンや日本時間の開催時刻を推測していません。
- 必要Lvの記載は出典本文にないため、登録値はnullです。「Lv制限なし」とは断定しません。
- 交換個数は公式の画像のみの情報のため、未確認の数値を記載していません。
- 交換NPCの個人名、細かな報酬名、移動料金は推測していません。
- 用語集の既存RPC `glossary_save_term` の引数を確認済みです。登録には既存の保存処理を利用します。新しい分類・DB構造・権限の追加は不要です。

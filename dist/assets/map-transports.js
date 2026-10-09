"use strict";
// Explicit user-confirmed connections only. Brynhilld city labels identify Arcarinas Square.
// Summer Hill Street remains a distinct map with the confirmed same town departure service.
// No return route or landing coordinates are inferred.
(function(root){root.XEN_MAP_TRANSPORTS={
  "version": 1,
  "source": "利用者のゲーム内確認",
  "edges": [
    {
      "a": "Essene",
      "b": "Arcarinas Square",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 1,
      "condition": "Transporter / Lv1以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Arcarinas Square",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Essene",
      "b": "Midori Spa",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 55,
      "condition": "Transporter / Lv55以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Midori Spa",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Essene",
      "b": "Jotunheim",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 60,
      "condition": "Transporter / Lv60以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Jotunheim",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Essene",
      "b": "Abundance Town",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 30,
      "condition": "Transporter / Lv30以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Village of Abundance",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Essene",
      "b": "Albatross City",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 35,
      "condition": "Transporter / Lv35以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Albatross Village",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Essene",
      "b": "Eir",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 40,
      "condition": "Transporter / Lv40以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Eir",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Essene",
      "b": "Candy Vault",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 25,
      "condition": "Transporter / Lv25以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Candy Vault",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Arcarinas Square",
      "b": "Essene",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 16,
      "condition": "Transporter / Lv16以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Essene",
      "landingPointKnown": false,
      "exitA": [],
      "sourceTown": "Arcarinas Square"
    },
    {
      "a": "Arcarinas Square",
      "b": "Midori Spa",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 55,
      "condition": "Transporter / Lv55以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Midori Spa",
      "landingPointKnown": false,
      "exitA": [],
      "sourceTown": "Arcarinas Square"
    },
    {
      "a": "Arcarinas Square",
      "b": "Jotunheim",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 60,
      "condition": "Transporter / Lv60以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Jotunheim",
      "landingPointKnown": false,
      "exitA": [],
      "sourceTown": "Arcarinas Square"
    },
    {
      "a": "Arcarinas Square",
      "b": "Abundance Town",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 30,
      "condition": "Transporter / Lv30以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Village of Abundance",
      "landingPointKnown": false,
      "exitA": [],
      "sourceTown": "Arcarinas Square"
    },
    {
      "a": "Arcarinas Square",
      "b": "Albatross City",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 35,
      "condition": "Transporter / Lv35以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Albatross Village",
      "landingPointKnown": false,
      "exitA": [],
      "sourceTown": "Arcarinas Square"
    },
    {
      "a": "Arcarinas Square",
      "b": "Eir",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 40,
      "condition": "Transporter / Lv40以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Eir",
      "landingPointKnown": false,
      "exitA": [],
      "sourceTown": "Arcarinas Square"
    },
    {
      "a": "Arcarinas Square",
      "b": "Candy Vault",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 25,
      "condition": "Transporter / Lv25以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Candy Vault",
      "landingPointKnown": false,
      "exitA": [],
      "sourceTown": "Arcarinas Square"
    },
    {
      "a": "Abundance Town",
      "b": "Essene",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 16,
      "condition": "Transporter / Lv16以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Essene",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Abundance Town",
      "b": "Arcarinas Square",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 1,
      "condition": "Transporter / Lv1以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Arcarinas Square",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Abundance Town",
      "b": "Midori Spa",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 55,
      "condition": "Transporter / Lv55以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Midori Spa",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Abundance Town",
      "b": "Jotunheim",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 60,
      "condition": "Transporter / Lv60以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Jotunheim",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Abundance Town",
      "b": "Eir",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 40,
      "condition": "Transporter / Lv40以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Eir",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Abundance Town",
      "b": "Candy Vault",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 25,
      "condition": "Transporter / Lv25以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Candy Vault",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Midori Spa",
      "b": "Essene",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 16,
      "condition": "Transporter / Lv16以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Essene",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Midori Spa",
      "b": "Arcarinas Square",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 1,
      "condition": "Transporter / Lv1以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Arcarinas Square",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Midori Spa",
      "b": "Jotunheim",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 60,
      "condition": "Transporter / Lv60以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Jotunheim",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Midori Spa",
      "b": "Yvel",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 100,
      "condition": "Transporter / Lv100以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Yvel",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Midori Spa",
      "b": "Eir",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 40,
      "condition": "Transporter / Lv40以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Eir",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Midori Spa",
      "b": "Candy Vault",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 25,
      "condition": "Transporter / Lv25以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Candy Vault",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Midori Spa",
      "b": "Abundance Town",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 30,
      "condition": "Transporter / Lv30以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Village of Abundance",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Jotunheim",
      "b": "Essene",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 16,
      "condition": "Transporter / Lv16以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Essene",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Jotunheim",
      "b": "Arcarinas Square",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 1,
      "condition": "Transporter / Lv1以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Arcarinas Square",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Jotunheim",
      "b": "Midori Spa",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 55,
      "condition": "Transporter / Lv55以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Midori Spa",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Jotunheim",
      "b": "Yvel",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 100,
      "condition": "Transporter / Lv100以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Yvel",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Jotunheim",
      "b": "Eir",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 40,
      "condition": "Transporter / Lv40以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Eir",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Jotunheim",
      "b": "Candy Vault",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 25,
      "condition": "Transporter / Lv25以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Candy Vault",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Jotunheim",
      "b": "Abundance Town",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 30,
      "condition": "Transporter / Lv30以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Village of Abundance",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Yvel",
      "b": "Jotunheim",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 60,
      "condition": "Transporter / Lv60以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Jotunheim",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Essene",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 16,
      "condition": "Transporter / Lv16以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Essene",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Arcarinas Square",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 1,
      "condition": "Transporter / Lv1以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Arcarinas Square",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Midori Spa",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 55,
      "condition": "Transporter / Lv55以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Midori Spa",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Town of Deceased",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 100,
      "condition": "Transporter / Lv100以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Town of Deceased",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Jotunheim",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 60,
      "condition": "Transporter / Lv60以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Jotunheim",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Candy Vault",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 25,
      "condition": "Transporter / Lv25以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Candy Vault",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Abundance Town",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 30,
      "condition": "Transporter / Lv30以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Village of Abundance",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Albatross City",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 35,
      "condition": "Transporter / Lv35以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Albatross Village",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Eir",
      "b": "Oasis",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 80,
      "condition": "Transporter / Lv80以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Oasis",
      "landingPointKnown": false,
      "levelConfirmation": "確認済み",
      "exitA": []
    },
    {
      "a": "Candy Vault",
      "b": "Essene",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 16,
      "condition": "Transporter / Lv16以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Essene",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Candy Vault",
      "b": "Arcarinas Square",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 1,
      "condition": "Transporter / Lv1以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Arcarinas Square",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Candy Vault",
      "b": "Midori Spa",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 55,
      "condition": "Transporter / Lv55以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Midori Spa",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Candy Vault",
      "b": "Jotunheim",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 60,
      "condition": "Transporter / Lv60以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Jotunheim",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Candy Vault",
      "b": "Eir",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 40,
      "condition": "Transporter / Lv40以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Eir",
      "landingPointKnown": false,
      "exitA": []
    },
    {
      "a": "Candy Vault",
      "b": "Abundance Town",
      "kind": "transporter",
      "directed": true,
      "verified": true,
      "minLevel": 30,
      "condition": "Transporter / Lv30以上",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Village of Abundance",
      "landingPointKnown": false,
      "exitA": []
    }
  ],
  "cityOriginMaps": {
    "Arcarinas Square": [
      "Summer Hill Street"
    ]
  },
  "cityOriginEvidence": {
    "Arcarinas Square": "利用者のゲーム内確認：Brynhild Trisects側のBrinhilld入口はArcarinas Squareへ接続。Summer Hill Streetは別地区を維持し、登録済みTransporter会話による同じ行先の出発サービスだけ参照します。到着位置は未確認。"
  },
  "noTransporterTowns": [
    "Oasis",
    "Albatross City"
  ],
  "unresolvedTownNames": [
    "Town of Deceased"
  ],
  "specialRoutes": [
    {
      "a": "Essene",
      "b": "Library",
      "kind": "npc-transport",
      "npcName": "Logather",
      "directed": true,
      "verified": true,
      "minLevel": 70,
      "requiredItems": [
        "Library Card"
      ],
      "feeKron": null,
      "condition": "Logather / Lv70以上 / Library Card所持",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Library",
      "landingPointKnown": false,
      "exitA": [
        "Logather"
      ]
    },
    {
      "a": "Essene",
      "b": "Library B2",
      "kind": "npc-transport",
      "npcName": "Logather",
      "directed": true,
      "verified": true,
      "minLevel": 70,
      "requiredItems": [
        "Library Card"
      ],
      "feeKron": 5000,
      "condition": "Logather / Lv70以上 / Library Card所持 / 5,000 Kron",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Library B2",
      "landingPointKnown": false,
      "exitA": [
        "Logather"
      ],
      "costKron": 5000
    },
    {
      "a": "Essene",
      "b": "Library B4",
      "kind": "npc-transport",
      "npcName": "Logather",
      "directed": true,
      "verified": true,
      "minLevel": 70,
      "requiredItems": [
        "Library Card"
      ],
      "feeKron": 10000,
      "condition": "Logather / Lv70以上 / Library Card所持 / 10,000 Kron",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Library B4",
      "landingPointKnown": false,
      "exitA": [
        "Logather"
      ],
      "costKron": 10000
    },
    {
      "a": "Essene",
      "b": "Library room",
      "kind": "npc-transport",
      "npcName": "Logather",
      "directed": true,
      "verified": true,
      "minLevel": 70,
      "requiredItems": [
        "Library Card"
      ],
      "feeKron": null,
      "condition": "Logather / Lv70以上 / Library Card所持",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Library room",
      "landingPointKnown": false,
      "exitA": [
        "Logather"
      ]
    },
    {
      "a": "Essene",
      "b": "Shipdock",
      "kind": "npc-transport",
      "npcName": "Expedition Transporter Garcia",
      "directed": true,
      "verified": true,
      "minLevel": 100,
      "requiredFlags": [
        "garciaQuest"
      ],
      "costKron": 15000,
      "feeKron": 15000,
      "condition": "Expedition Transporter Garcia / Lv100以上 / 前提クエスト完了 / 15,000 Kron",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Shipdock",
      "landingPointKnown": false,
      "exitA": [
        "Expedition Transporter Garcia"
      ]
    },
    {
      "a": "Essene",
      "b": "Aisen",
      "kind": "event-transport",
      "npcName": "Event Guide",
      "directed": true,
      "verified": true,
      "requiredFlags": [
        "fourSeasonsWeekend"
      ],
      "schedule": {
        "days": [
          0,
          6
        ]
      },
      "condition": "Event Guide / Four Seasons Event / サーバー時間の土日のみ",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Aisen",
      "landingPointKnown": false,
      "exitA": [
        "Event Guide"
      ]
    },
    {
      "a": "Arcarinas Square",
      "b": "Pirates Ship dock",
      "kind": "npc-transport",
      "npcName": "Officer Jack",
      "directed": true,
      "verified": true,
      "minLevel": null,
      "requiredItems": [],
      "requiredFlags": [],
      "condition": "Officer Jack / Go To Pirates’ Ship",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Pirates Ship dock",
      "landingPointKnown": false,
      "exitA": [
        "Officer Jack"
      ]
    }
  ],
  "noExpandedMapMaps": [
    "Pirates Ship dock",
    "Brynhilld Culvert"
  ],
  "extraConnections": [
    {
      "a": "Mall Street",
      "b": "Brynhilld Culvert",
      "kind": "dungeon",
      "directed": true,
      "verified": true,
      "dirA": "top-right",
      "direction": "top-right",
      "minLevel": null,
      "requiredItems": [],
      "requiredFlags": [],
      "condition": "Mall Street右上の入口",
      "source": "利用者のゲーム内確認",
      "destinationLabel": "Brynhilld Culvert",
      "landingPointKnown": false,
      "exitA": [
        "Brynhilld Culvert",
        "Brynhild Culvert"
      ]
    }
  ]
};})(typeof window!=="undefined"?window:globalThis);

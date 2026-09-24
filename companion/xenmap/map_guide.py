"""Verified Xen Rebirth world-map names and route graph.

Walking links are bidirectional.  Transport links are intentionally directional:
the destination lists differ by town and the latest player-confirmed information
must take precedence over the old "all towns connect" prototype.
"""

from collections import deque
import re


# English name -> name used by the former Japanese Xenepic map.
# Unknown names remain English instead of being guessed.
MAP_NAMES = {
    "Brynhilld": "ブリンヒルド",
    "Village of Abundance": "アビス",
    "Candyvault": "カルバルツ倉庫",
    "Essene": "エスネ",
    "Albatross Village": "アトロス",
    "Death Valley": "デース谷",
    "Luan Basin": "ルアン盆地",
    "Cyoren Forest": "シオレンの森",
    "Shaio Forest": "シャイオの森",
    "Belteranin Forest": "ベルテラニンの森",
    "Urail Valley": "ウレイル谷",
    "Ashton Basin": "エスタス盆地",
    "Baskerville Forest": "バスカビルの森",
    "Sylphaen Forest": "シルフィンの森",
    "Colrona Forest": "コルロナの森",
    "Felix Forest": "フェリクスの森",
    "Limus Basin": "リムス盆地",
    "Wavin Plains": "ワビン平原",
    "Crosby Plains": "クロスビ平原",
    "Aristone Plains": "アリストン平原",
    "Harquil Plains": "ハルクィル平原",
    "Alicia Forest": "アルシアの森",
    "Realto Plains": "リアルト平原",
    "Berdana Forest": "ベルダナの森",
    "Evergail Grove": "エバガイルグローブ",
    "Ashely Forest": "アシュリーの森",
    "Onix Hill": "オニックスヒル",
    "Paladino Grove": "プラディノグローブ",
    "Engrave Path": "エングレイブパース",
    "Castella Forest": "カステルの森",
    "Mythril Mines": "ミスリル鉱山",
    "Cobalt's Cave": "コバルト洞窟",
    "Oasis": "オアシス",
    "Eir": "エイル",
    "Town of the Deceased": "死者の村",
    "Jotunnheim": "ヨツンハイム",
    "Midori Spa": "緑温泉",
    "Yvel": "エイル東部都市",
    "Ashmon Hills": "アシュモンヒル",
    "Bairyn Forests": "バイリンの森",
    "Sudden Hill": "サドンヒル",
    "Malian Forest": "マリアンの森",
    "Trakian Path": "トラキアンパース",
    "Saifield Forest": "セイフィールドの森",
    "Kastled Grove": "カステルドグローブ",
    "Titanus Plains": "ティタヌス平原",
    "Skitchy Gorge": "スキッチ峡谷",
    "Sleepless Grave": "眠れぬ者の墓",
    "Sand Desert Dungeon": "砂漠ダンジョン",
    "Ice Caves": "氷の洞窟",
    "Amorica Cave": "アモリカ洞窟",
    "Memorial Chapel": "記念礼拝堂",
    "Lost Brynhilld": "ロスト・ブリンヒルド",
    "Pirate Ship": "海賊船",
    "Labyrinth": "ラビリンス",
    "Museidon Library Labyrinth": "ミュセイオン図書館迷宮",
    "Temple of Pansidia": "パンシディア神殿",
    "Secret Altar": "秘密の祭壇",
    "Tramis Mansion": "トラミス邸",
    "Amorica Forest": "アモリカの森",
    "Bangle Valley": "ベングル谷",
    "Mardigras Valley": "マルディグラス谷",
    "Tincrush Valley": "ティンクラッシュ谷",
    "Harding Forest": "ハーディングの森",
    "Lithroid Forest": "リトロイドの森",
    "Big Apple Forest": "ビッグアップルの森",
    "Odalisque Forest": "オダリスクの森",
    "Premusson Path": "プレムソンパース",
    "Eaglerentin Plain": "イグレティン平原",
    "Celephane Gorge": "セレファン峡谷",
    "Templar Gorge": "テンプル峡谷",
    "Marque Basin": "マーキ盆地",
    "Vanderoll Plains": "ベンダロール平原",
    "Darive Plains": "ダライブ平原",
    "Harrington Forest": "ハリントンの森",
    "Gaudy Forest": "ガウディの森",
    "Telling Denver Lake": "テンリングデンバー湖",
    "Sheriff Forest": "シェリフの森",
    "Kryston Forest": "クリストンの森",
    "Bradley Forest": "ブラッドリーの森",
    "Belpharen Valley": "ベルファレンの谷",
    "Salem Valley": "セイラム谷",
    "Witchwood Forest": "ウィッチウッドの森",
    "Furanden Forest": "フラウンデンの森",
    "Lost Wedge Valley": "ロストウェッジ谷",
    "Parade Valley": "パレード谷",
    "Sherwood Valley": "シャーウッド谷",
    "Turmeit Desert": "トゥルメイト砂漠",
    "Hidden Dock": "ヒドゥンドック",
    "Gefle Camp": "ゲフレキャンプ",
    "Shenzhen Forest": "シンセンの森",
    "Shenzhen Waterfall Exit": "シンセン滝出口",
    "Shenzhen Waterfall": "シンセン滝",
    "Shenzhen Canyon Entrance": "シンセン峡谷入口",
    "Shenzhen Canyon": "シンセン峡谷",
    "Aerial Forest": "エアリアルの森",
    "Brunen Basin": "ブルネン盆地",
    "Brynhilld Trisects": "ブリンヒルド三叉路",
    "Linear Forest": "リニアの森",
    "Loem Valley": "ロエム谷",
    "Waimea Gorge": "ワイメア峡谷",
    "Arcarinas Square": "アルカリナス広場",
    "Guild Plaza": "ギルド広場",
    "Summerhill Street": "サマーヒル通り",
}


DUNGEONS = {
    "Sleepless Grave", "Mythril Mines", "Cobalt's Cave",
    "Sand Desert Dungeon", "Ice Caves", "Amorica Cave",
    "Memorial Chapel", "Lost Brynhilld", "Pirate Ship", "Labyrinth",
    "Museidon Library Labyrinth", "Temple of Pansidia", "Secret Altar",
    "Brynhilld Culvert B1F", "Brynhilld Culvert B2F",
    "Cave to Brynhilld Altar", "Knight's Convention",
}


# Compatibility with old releases, OCR variations, and names corrected by the user.
ALIASES = {
    "Candy Vault": "Candyvault",
    "Alcia Forest": "Alicia Forest",
    "Pladino Grove": "Paladino Grove",
    "Ashley Forest": "Ashely Forest",
    "Bairyn Forest": "Bairyn Forests",
    "Belpharen Forest": "Belpharen Valley",
    "Belterranin Forest": "Belteranin Forest",
    "Fraunden Forest": "Furanden Forest",
    "Abundance Town": "Village of Abundance",
    "Village of the Dead": "Town of the Deceased",
    "Jotunn heim": "Jotunnheim",
    "Albatross City": "Albatross Village",
    "Eaglerentin Plains": "Eaglerentin Plain",
    "Museidon Library": "Museidon Library Labyrinth",
    "Scoring Plains": "Scorging Plains",
    "Pamanent Plateau": "Pamament Plateau",
    "Floating Island of Dragons' Dock": "Floating Island of Dragons Dock",
    "Dragons' Floating Ship Dock": "Floating Island of Dragons Dock",
}


# Coordinates on the bundled 2000 x 1575 overview map.  Maps without reliable
# overview coordinates still work in text routes and in the collected-map atlas.
MAP_COORDS = {
    "Brynhilld": (350, 350), "Death Valley": (180, 420),
    "Luan Basin": (180, 720), "Cyoren Forest": (180, 790),
    "Shaio Forest": (180, 845), "Belteranin Forest": (180, 900),
    "Urail Valley": (180, 960), "Ashton Basin": (180, 1080),
    "Castella Forest": (430, 465), "Callisto Gorge": (515, 465),
    "Bernald Forest": (600, 465), "Theglaia Forest": (675, 465),
    "Othellos Forest": (755, 465), "Stout Forest": (920, 465),
    "Felix Forest": (920, 540), "Curior Forest": (920, 620),
    "Candyvault": (920, 690), "Berdana Forest": (920, 760),
    "Colrona Forest": (920, 820), "Baskerville Forest": (760, 815),
    "Sylphaen Forest": (835, 815), "Ashely Forest": (760, 900),
    "Onix Hill": (835, 900), "Paladino Grove": (915, 900),
    "Engrave Path": (915, 985), "Alicia Forest": (1000, 690),
    "Realto Plains": (1070, 690), "Taisen Plains": (1150, 690),
    "Lombard Plains": (1230, 690), "Scorging Plains": (1310, 690),
    "Rudwork Path": (1390, 690), "Proteron Gorge": (1470, 690),
    "Skitchy Gorge": (1580, 690), "Titanus Plains": (1580, 770),
    "Eir": (1505, 825), "Essene": (955, 1080),
    "Evergail Grove": (1000, 1080), "Crosseven Path": (1000, 1140),
    "Virely Grove": (1000, 1210), "Meryle Wood": (1000, 1280),
    "Wavin Plains": (1000, 1350), "Crosby Plains": (1070, 1350),
    "Aristone Plains": (1150, 1350), "Harquil Plains": (1230, 1350),
    "Albatross Village": (1310, 1350), "Limus Basin": (1230, 1275),
    "Oasis": (1085, 805), "Village of Abundance": (520, 935),
    "Town of the Deceased": (1880, 805), "Jotunnheim": (1585, 240),
    "Midori Spa": (750, 95), "Yvel": (1140, 405),
    "Ashmon Hills": (300, 1080), "Bairyn Forests": (390, 1080),
    "Sudden Hill": (485, 1080), "Malian Forest": (580, 1080),
    "Trakian Path": (670, 1080), "Saifield Forest": (755, 1080),
    "Kastled Grove": (850, 1080), "Sleepless Grave": (1505, 905),
    "Mythril Mines": (240, 790), "Cobalt's Cave": (455, 790),
    "Sand Desert Dungeon": (1180, 785), "Ice Caves": (1175, 520),
    "Amorica Cave": (1800, 275), "Memorial Chapel": (1880, 745),
    "Lost Brynhilld": (285, 245), "Pirate Ship": (395, 245),
    "Labyrinth": (455, 245), "Museidon Library Labyrinth": (900, 1135),
    "Temple of Pansidia": (520, 1135), "Secret Altar": (175, 1135),
    "Darive Plains": (1660, 825), "Vanderoll Plains": (1660, 900),
    "Marque Basin": (1660, 980), "Templar Gorge": (1740, 980),
    "Celephane Gorge": (1820, 980), "Eaglerentin Plain": (1820, 900),
    "Premusson Path": (1820, 820), "Odalisque Forest": (1820, 735),
    "Big Apple Forest": (1820, 655), "Lithroid Forest": (1820, 575),
    "Harding Forest": (1820, 495), "Tincrush Valley": (1820, 415),
    "Mardigras Valley": (1820, 335), "Bangle Valley": (1820, 255),
    "Amorica Forest": (1820, 180), "Harrington Forest": (840, 690),
    "Gaudy Forest": (760, 690), "Telling Denver Lake": (670, 690),
    "Sheriff Forest": (580, 690), "Kryston Forest": (485, 690),
    "Bradley Forest": (390, 690), "Belpharen Valley": (390, 760),
    "Salem Valley": (390, 825), "Witchwood Forest": (390, 890),
    "Furanden Forest": (390, 950), "Lost Wedge Valley": (1060, 330),
    "Parade Valley": (1060, 410), "Sherwood Valley": (1060, 490),
    "Turmeit Desert": (1165, 825), "Hidden Dock": (685, 1335),
    "Gefle Camp": (605, 1335), "Shenzhen Forest": (605, 1265),
    "Shenzhen Waterfall Exit": (605, 1195), "Shenzhen Waterfall": (520, 1195),
    "Shenzhen Canyon Entrance": (175, 1265), "Shenzhen Canyon": (175, 1195),
    "Aerial Forest": (420, 350), "Brunen Basin": (300, 350),
    "Brynhilld Trisects": (360, 350), "Linear Forest": (510, 350),
    "Loem Valley": (420, 420), "Waimea Gorge": (220, 350),
    "Arcarinas Square": (350, 235), "Guild Plaza": (350, 165),
    "Tramis Mansion": (350, 100), "Summerhill Street": (430, 235),
}


# Each tuple represents consecutive, confirmed walkable exits.
WALK_CHAINS = (
    ("Brynhilld", "Arcarinas Square"),
    ("Arcarinas Square", "Mall Street"),
    ("Arcarinas Square", "Guild Plaza", "Tramis Mansion"),
    ("Arcarinas Square", "Summerhill Street"),
    ("Arcarinas Square", "Brynhilld Trisects"),
    ("Brynhilld Trisects", "Brunen Basin", "Waimea Gorge", "Death Valley", "Routuer Valley", "Augilas Gorge", "Mystra Hill", "Mystra Basin", "Luan Basin", "Cyoren Forest", "Shaio Forest", "Belteranin Forest", "Urail Valley", "Ashton Basin", "Brolly Basin", "Ashmon Hills", "Bairyn Forests", "Sudden Hill", "Malian Forest", "Trakian Path", "Saifield Forest", "Kastled Grove", "Essene"),
    ("Brynhilld Trisects", "Aerial Forest", "Linear Forest", "Oblique Forest", "Loren Valley", "Kramer Forest", "Ivolgue Forest", "Empion Forest", "Morpheus Forest", "Midori Spa"),
    ("Aerial Forest", "Loem Valley", "Castella Forest", "Callisto Gorge", "Bernald Forest", "Theglaia Forest", "Othellos Forest", "Stout Forest", "Felix Forest", "Curior Forest", "Candyvault"),
    ("Cyoren Forest", "Mythril Mines"),
    ("Belteranin Forest", "Grudin Forest", "Vargas Forest", "Furanden Forest", "Witchwood Forest", "Salem Valley", "Belpharen Valley", "Bradley Forest", "Kryston Forest", "Sheriff Forest", "Telling Denver Lake", "Gaudy Forest", "Harrington Forest", "Candyvault"),
    ("Furanden Forest", "Village of Abundance"),
    ("Salem Valley", "Cobalt's Cave"),
    ("Candyvault", "Berdana Forest", "Colrona Forest", "Sylphaen Forest", "Baskerville Forest", "Lavy Basin", "Ashely Forest", "Onix Hill", "Paladino Grove", "Engrave Path", "Essene"),
    ("Candyvault", "Alicia Forest", "Realto Plains", "Taisen Plains", "Lombard Plains", "Scorging Plains", "Rudwork Path", "Proteron Gorge", "Skitchy Gorge", "Titanus Plains", "Eir"),
    ("Essene", "Evergail Grove", "Crosseven Path", "Virely Grove", "Meryle Wood", "Wavin Plains", "Crosby Plains", "Aristone Plains", "Harquil Plains", "Albatross Village"),
    ("Harquil Plains", "Limus Basin", "Clipper Plains", "Elwood Plains", "Hiroshi Gorge", "Clingon Plains", "Lifeline Basin", "Pharaday Gorge", "Rosestar Basin", "Tolkin Gorge", "Hooters Plains", "Bailey Plains", "Eir"),
    ("Eir", "Darive Plains", "Vanderoll Plains", "Marque Basin", "Templar Gorge", "Celephane Gorge", "Eaglerentin Plain", "Premusson Path", "Odalisque Forest", "Big Apple Forest", "Lithroid Forest", "Harding Forest", "Tincrush Valley", "Mardigras Valley", "Bangle Valley", "Amorica Forest"),
    ("Eir", "Sleepless Grave"),
    ("Eaglerentin Plain", "Town of the Deceased"),
    ("Eaglerentin Plain", "Memorial Chapel"),
    ("Amorica Forest", "Amorica Cave"),
    ("Oasis", "Turmeit Desert", "Cretino Desert", "Aseraphel Desert", "Emperonie Plateau", "Taquestrim Plateau", "Phildevit Plateau", "Alison Gorge", "Heather Basin", "Tanline Gorge", "Acidbath Valley", "Chanthery Gorge"),
    ("Turmeit Desert", "Sand Desert Dungeon"),
    ("Yvel", "Siberas Plateau", "Anzers Plateau", "Bombile Plateau", "Monoroby Plateau", "Mute Basin", "Fies Plateau", "Noctein Plateau", "Rekiel Plateau", "Verazium Plateau", "Pamament Plateau", "Ramia Plateau", "Metapolis", "Robern Plains", "Arobec Plateau", "Hellein Plateau"),
    ("Yvel", "Lost Wedge Valley", "Nordis Valley", "Sheryle Forest", "Simpson Valley", "Pindown Valley", "Shudbee Forest", "Blackmail Forest", "Edine Plains", "Morpheus Forest"),
    ("Lost Wedge Valley", "Parade Valley", "Sherwood Valley", "Ice Caves"),
    ("Morpheus Forest", "Edine Plains"),
    ("Essene", "Museidon Library Labyrinth"),
    ("Floating Island of Dragons Dock", "Floating Island of Dragons' Head", "Dragons' Village"),
    ("Floating Island of Dragons Dock", "Hidden Dock"),
    ("Gefle Camp", "Shenzhen Forest"),
    ("Dragons' Village", "Floating Island of Dragons' Back"),
    ("Dragons' Village", "Floating Island of Dragons' Tail"),
    ("Floating Island of Dragons' Back", "Floating Island of Dragons' Left Wing"),
    ("Floating Island of Dragons' Back", "Floating Island of Dragons' Right Wing"),
    ("Shenzhen Forest", "Shenzhen Waterfall Exit", "Shenzhen Waterfall", "Temple of Pansidia"),
    ("Shenzhen Forest", "Shenzhen Canyon Entrance", "Shenzhen Canyon", "Secret Altar"),
    ("Tramis Mansion", "Knight's Convention"),
    ("Mall Street", "Brynhilld Culvert B1F", "Brynhilld Culvert B2F", "Cave to Brynhilld Altar"),
    ("Candyvault", "Candyvault Inn"),
)


# Latest player-confirmed, directional transport destinations.
TRANSPORT_LINKS = {
    "Candyvault": {
        "Village of Abundance": "トランスポーター",
        "Brynhilld": "トランスポーター",
        "Midori Spa": "トランスポーター",
        "Jotunnheim": "トランスポーター",
        "Essene": "トランスポーター",
        "Eir": "トランスポーター",
    },
    "Essene": {
        "Brynhilld": "トランスポーター",
        "Village of Abundance": "トランスポーター",
        "Midori Spa": "トランスポーター",
        "Candyvault": "トランスポーター",
        "Jotunnheim": "トランスポーター",
        "Eir": "トランスポーター",
        "Albatross Village": "トランスポーター",
        "Airship Boarding Gate": "遠征トランスポーター Garcia（Lv100+）",
    },
    "Jotunnheim": {
        "Brynhilld": "トランスポーター",
        "Village of Abundance": "トランスポーター",
        "Midori Spa": "トランスポーター",
        "Yvel": "トランスポーター",
        "Candyvault": "トランスポーター",
        "Eir": "トランスポーター",
    },
    "Yvel": {"Jotunnheim": "トランスポーター"},
    "Amorica Cave": {
        "Brynhilld": "NPC Nain",
        "Essene": "NPC Nain",
    },
    "Airship Boarding Gate": {"Floating Island of Dragons Dock": "飛空艇"},
    "Floating Island of Dragons Dock": {"Essene": "飛空艇"},
    "Hidden Dock": {"Gefle Camp": "進入許可（Lv125+）"},
    "Gefle Camp": {"Hidden Dock": "帰還"},
}


def _norm(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").casefold())


def _known_names():
    names = set(MAP_NAMES) | set(DUNGEONS) | set(TRANSPORT_LINKS)
    for chain in WALK_CHAINS:
        names.update(chain)
    for destinations in TRANSPORT_LINKS.values():
        names.update(destinations)
    return names


def canonical_name(name):
    raw = (name or "").strip()
    if raw in ALIASES:
        return ALIASES[raw]
    names = _known_names()
    if raw in names:
        return raw
    lookup = {_norm(candidate): candidate for candidate in names}
    for alias, canonical in ALIASES.items():
        lookup[_norm(alias)] = canonical
    return lookup.get(_norm(raw), raw)


def display_name(name):
    name = canonical_name(name)
    japanese = MAP_NAMES.get(name)
    return f"{name}（旧日本語名：{japanese}）" if japanese else name


def graph():
    result = {}
    for chain in WALK_CHAINS:
        for left, right in zip(chain, chain[1:]):
            result.setdefault(left, set()).add(right)
            result.setdefault(right, set()).add(left)
    for source, destinations in TRANSPORT_LINKS.items():
        result.setdefault(source, set()).update(destinations)
        for destination in destinations:
            result.setdefault(destination, set())
    return result


def is_teleport_edge(left, right):
    left, right = canonical_name(left), canonical_name(right)
    return right in TRANSPORT_LINKS.get(left, {})


def edge_label(left, right):
    left, right = canonical_name(left), canonical_name(right)
    return TRANSPORT_LINKS.get(left, {}).get(right, "徒歩")


def route(start, goal):
    start, goal = canonical_name(start), canonical_name(goal)
    links = graph()
    if start == goal and start in links:
        return [start]
    if start not in links or goal not in links:
        return []
    queue = deque([(start, [start])])
    visited = {start}
    while queue:
        current, path = queue.popleft()
        for following in sorted(links.get(current, ())):
            if following == goal:
                return path + [following]
            if following not in visited:
                visited.add(following)
                queue.append((following, path + [following]))
    return []


def find_map_in_text(text):
    lowered = (text or "").casefold()
    candidates = list(_known_names()) + list(ALIASES)
    matches = [name for name in candidates if name.casefold() in lowered]
    return canonical_name(max(matches, key=len)) if matches else ""

import hashlib
import json
import re
import threading
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

import pytesseract
from PIL import Image, ImageEnhance, ImageOps
from pytesseract import Output

from .config import app_data_dir, default_tesseract_path
from .map_guide import graph


def _normalized(value):
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def recognize_world_map_title(image):
    crop = image.crop((42, 15, min(image.width, 330), min(image.height, 52)))
    crop = ImageOps.grayscale(crop).resize((crop.width * 4, crop.height * 4))
    crop = crop.point(lambda value: 255 if value > 165 else 0)
    pytesseract.pytesseract.tesseract_cmd = default_tesseract_path()
    raw = pytesseract.image_to_string(crop, lang="eng", config="--psm 13").strip()
    candidate = _normalized(raw)
    if not candidate:
        return ""
    names = tuple(graph())
    best = max(names, key=lambda name: SequenceMatcher(None, candidate, _normalized(name)).ratio())
    score = SequenceMatcher(None, candidate, _normalized(best)).ratio()
    return best if score >= 0.58 else ""


def _marker_ratios(image, box):
    left, top, right, bottom = box
    crop = image.crop((max(0, left - 4), max(0, top - 4),
                       min(image.width, right + 4), min(image.height, bottom + 4))).convert("RGB")
    pixels = list(crop.getdata())
    if not pixels:
        return 0.0, 0.0
    green = sum(1 for red, value, blue in pixels
                if value >= 70 and value >= red + 16 and value >= blue + 7)
    red = sum(1 for value, green_value, blue in pixels
              if value >= 85 and value >= green_value + 24 and value >= blue + 18)
    return green / len(pixels), red / len(pixels)


def extract_map_labels(image):
    """Return likely green NPC and red monster labels from an expanded map."""
    pytesseract.pytesseract.tesseract_cmd = default_tesseract_path()
    scale = 2
    ocr_image = image.resize((image.width * scale, image.height * scale), Image.Resampling.LANCZOS)
    ocr_image = ImageEnhance.Contrast(ocr_image).enhance(1.35)
    ocr_image = ImageEnhance.Sharpness(ocr_image).enhance(1.8)
    data = pytesseract.image_to_data(ocr_image, lang="eng", config="--psm 11", output_type=Output.DICT, timeout=8)
    lines = {}
    for index, raw in enumerate(data.get("text", [])):
        text = re.sub(r"[^A-Za-z0-9' -]", "", raw).strip()
        if not text or int(float(data["conf"][index] or -1)) < 38:
            continue
        key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        left, top = int(data["left"][index]) // scale, int(data["top"][index]) // scale
        width, height = int(data["width"][index]) // scale, int(data["height"][index]) // scale
        lines.setdefault(key, []).append((left, top, left + width, top + height, text))
    found = {"npc": [], "monster": []}
    for words in lines.values():
        words.sort()
        left = min(word[0] for word in words); top = min(word[1] for word in words)
        right = max(word[2] for word in words); bottom = max(word[3] for word in words)
        text = " ".join(word[4] for word in words).strip()
        if len(text) < 3 or len(text) > 45 or len(re.sub(r"[^A-Za-z]", "", text)) < 3:
            continue
        normalized_text = _normalized(text)
        if any(SequenceMatcher(None, normalized_text, _normalized(name)).ratio() >= 0.78
               for name in graph()):
            continue
        green_ratio, red_ratio = _marker_ratios(image, (left - 18, top - 18, right + 18, bottom + 18))
        if max(green_ratio, red_ratio) < 0.006:
            continue
        kind = "monster" if red_ratio > green_ratio * 1.2 else "npc"
        found[kind].append({"name": text, "x": (left + right) // 2, "y": (top + bottom) // 2})
    return found


class MapCollectionStore:
    def __init__(self):
        self.directory = app_data_dir() / "map_collection"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "index.json"
        self.lock = threading.Lock()

    def _load(self):
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return {"maps": {}}

    def _save(self, data):
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def update(self, map_name, image, labels):
        digest = hashlib.sha256(image.resize((64, 64)).convert("L").tobytes()).hexdigest()[:16]
        safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", map_name).strip("_") or "unknown"
        image_path = self.directory / f"{safe_name}.png"
        with self.lock:
            data = self._load()
            record = data.setdefault("maps", {}).setdefault(map_name, {"npcs": {}, "monsters": {}})
            record.setdefault("npcs", {})
            record.setdefault("monsters", {})
            changed = record.get("hash") != digest
            record.update({"hash": digest, "image": image_path.name,
                           "updated": datetime.now().isoformat(timespec="seconds"),
                           "width": image.width, "height": image.height})
            for source_key, target_key in (("npc", "npcs"), ("monster", "monsters")):
                for label in labels.get(source_key, []):
                    key = label["name"].casefold()
                    existing = record[target_key].setdefault(key, {**label, "count": 0})
                    existing.update({"name": label["name"], "x": label["x"], "y": label["y"]})
                    existing["count"] = int(existing.get("count", 0)) + 1
            self._save(data)
            if changed or not image_path.exists():
                image.save(image_path, "PNG")
        return len(labels.get("npc", [])), len(labels.get("monster", []))

    def search(self, query=""):
        word = query.strip().casefold()
        with self.lock:
            data = self._load()
        rows = []
        for map_name, record in data.get("maps", {}).items():
            for storage_key, kind in (("npcs", "NPC"), ("monsters", "モンスター")):
                for key, label in record.get(storage_key, {}).items():
                    if not word or word in key or word in map_name.casefold() or word in kind.casefold():
                        rows.append((label.get("name", ""), kind, map_name, label.get("x", 0),
                                     label.get("y", 0), label.get("count", 1)))
        return sorted(rows, key=lambda row: (row[0].casefold(), row[2]))

    def delete_label(self, map_name, label_name, kind):
        with self.lock:
            data = self._load()
            record = data.get("maps", {}).get(map_name, {})
            key = "monsters" if kind == "モンスター" else "npcs"
            record.get(key, {}).pop(label_name.casefold(), None)
            self._save(data)

    def rename_label(self, map_name, old_name, new_name, kind):
        new_name = new_name.strip()
        if not new_name:
            return False
        with self.lock:
            data = self._load()
            record = data.get("maps", {}).get(map_name, {})
            storage_key = "monsters" if kind == "モンスター" else "npcs"
            labels = record.get(storage_key, {})
            old = labels.pop(old_name.casefold(), None)
            if not old:
                return False
            destination_key = new_name.casefold()
            existing = labels.get(destination_key)
            if existing:
                # Preserve the most recently collected position and combine confidence.
                existing["name"] = new_name
                existing["x"] = old.get("x", existing.get("x", 0))
                existing["y"] = old.get("y", existing.get("y", 0))
                existing["count"] = int(existing.get("count", 0)) + int(old.get("count", 0))
            else:
                old["name"] = new_name
                labels[destination_key] = old
            self._save(data)
        return True


class MapCollector:
    def __init__(self, status_callback=None):
        self.store = MapCollectionStore()
        self.status_callback = status_callback or (lambda _message: None)
        self.busy = False
        self.last_digest = ""
        self.lock = threading.Lock()

    def submit(self, image):
        digest = hashlib.sha256(image.resize((48, 48)).convert("L").tobytes()).hexdigest()
        with self.lock:
            if self.busy or digest == self.last_digest:
                return
            self.busy = True
            self.last_digest = digest
        threading.Thread(target=self._worker, args=(image.copy(),), daemon=True).start()

    def _worker(self, image):
        try:
            title = recognize_world_map_title(image)
            if not title:
                self.status_callback("収集中：マップ名を判定できませんでした")
                return
            labels = extract_map_labels(image)
            npc_count, monster_count = self.store.update(title, image, labels)
            self.status_callback(f"収集：{title}（NPC {npc_count}件／モンスター {monster_count}件）")
        except Exception as exc:
            self.status_callback(f"マップ収集エラー：{exc}")
        finally:
            with self.lock:
                self.busy = False

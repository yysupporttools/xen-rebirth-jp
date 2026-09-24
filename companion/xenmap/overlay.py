import ctypes
import re
import threading
import time
import tkinter as tk
from difflib import SequenceMatcher
from tkinter import ttk

import pytesseract
from PIL import ImageOps

from .capture import CaptureRegion, capture_screen_without_layered_windows
from .config import default_tesseract_path
from .map_collection import MapCollector
from .map_guide import MAP_COORDS, canonical_name, edge_label, graph, is_teleport_edge


# Coordinates are relative to the 508 x 508 expanded-map captures.  These
# measured points take priority over OCR and world-map estimates.
LOCAL_EXITS = {
    "Brynhilld Trisects": {
        "Brunen Basin": (18, 345),
        "Aerial Forest": (486, 388),
        "Arcarinas Square": (278, 18),
    },
    "Aerial Forest": {
        "Brynhilld Trisects": (12, 340),
        "Linear Forest": (476, 182),
        "Loem Valley": (285, 482),
    },
    "Brunen Basin": {
        "Brynhilld Trisects": (486, 350),
        "Waimea Gorge": (222, 482),
    },
    "Guild Plaza": {
        "Tramis Mansion": (258, 12),
        "Arcarinas Square": (275, 493),
    },
    "Tramis Mansion": {
        "Tramis Mansion Dungeon": (180, 38),
        "Guild Plaza": (185, 493),
    },
    "Summerhill Street": {
        "Arcarinas Square": (8, 210),
    },
    # The world-map coordinate fallback cannot distinguish these two exits.
    # Player captures confirm Linear Forest is left and Loren Valley is right.
    "Oblique Forest": {
        "Linear Forest": (8, 252),
        "Loren Valley": (500, 252),
    },
    # Entrances inside a field cannot be inferred from the outer border.
    "Turmeit Desert": {"Sand Desert Dungeon": (252, 116)},
    "Eaglerentin Plain": {"Memorial Chapel": (382, 98)},
    "Eir": {"Sleepless Grave": (300, 496)},
    "Amorica Forest": {"Amorica Cave": (268, 220)},
    "Cyoren Forest": {"Mythril Mines": (384, 398)},
}

SUPPORTED_MAPS = tuple(sorted(graph()))
VK_NUMPAD0 = 0x60


def _normalized(value):
    return re.sub(r"[^a-z0-9]", "", (value or "").casefold())


def _similarity(left, right):
    left, right = _normalized(left), _normalized(right)
    if not left or not right:
        return 0.0
    if left in right or right in left:
        shorter = min(len(left), len(right))
        longer = max(len(left), len(right))
        return max(0.82, shorter / max(1, longer))
    return SequenceMatcher(None, left, right).ratio()


def _match_map_candidate(raw):
    """Match OCR text, including short titles polluted by nearby labels."""
    candidate = _normalized(raw)
    if not candidate:
        return ""

    best = max(SUPPORTED_MAPS, key=lambda name: _similarity(candidate, name))
    if _similarity(candidate, best) >= 0.57:
        return canonical_name(best)

    # Three- and four-letter map names (notably Eir/Yvel) are sometimes read
    # together with a nearby shop label.  Compare individual OCR words only
    # for these short official names, so a result such as "[tir Store" can
    # still be identified as Eir without weakening long-name matching.
    words = re.findall(r"[a-z0-9]+", (raw or "").casefold())
    short_names = [name for name in SUPPORTED_MAPS if len(_normalized(name)) <= 4]
    matches = []
    for word in words:
        token = _normalized(word)
        if len(token) < 2:
            continue
        for name in short_names:
            score = SequenceMatcher(None, token, _normalized(name)).ratio()
            matches.append((score, name))
    if matches:
        score, name = max(matches)
        if score >= 0.66:
            return canonical_name(name)
    return ""


def recognize_map_title(image):
    """Read the expanded-map title and return its canonical route name."""
    # Keep the crop inside the dark title plate.  Including the map below it
    # makes Tesseract prefer a nearby exit/monster name on some maps (Oblique
    # Forest was previously misread as Sheryle Forest for this reason).
    crop = image.crop((45, 15, min(image.width, 430), min(image.height, 48)))
    crop = ImageOps.autocontrast(ImageOps.grayscale(crop))
    crop = crop.resize((crop.width * 4, crop.height * 4))
    try:
        pytesseract.pytesseract.tesseract_cmd = default_tesseract_path()
        for threshold in (180, 150):
            prepared = crop.point(lambda value, limit=threshold: 255 if value > limit else 0)
            raw = pytesseract.image_to_string(prepared, lang="eng", config="--psm 7")
            matched = _match_map_candidate(raw)
            if matched:
                return matched
    except Exception:
        return ""
    return ""


def _ocr_exit_label(image, next_map):
    """Locate the requested exit label in the live expanded-map image."""
    if image is None:
        return None
    scale = 3
    gray = ImageOps.autocontrast(ImageOps.grayscale(image))
    prepared = gray.resize((gray.width * scale, gray.height * scale))
    prepared = prepared.point(lambda value: 255 if value >= 142 else 0)
    try:
        pytesseract.pytesseract.tesseract_cmd = default_tesseract_path()
        data = pytesseract.image_to_data(
            prepared,
            lang="eng",
            config="--psm 11",
            output_type=pytesseract.Output.DICT,
        )
    except Exception:
        return None

    lines = {}
    count = len(data.get("text", ()))
    for index in range(count):
        text = str(data["text"][index]).strip()
        if not text:
            continue
        key = (
            data.get("block_num", [0] * count)[index],
            data.get("par_num", [0] * count)[index],
            data.get("line_num", [0] * count)[index],
        )
        lines.setdefault(key, []).append(
            (
                text,
                int(data["left"][index]),
                int(data["top"][index]),
                int(data["width"][index]),
                int(data["height"][index]),
            )
        )

    best = None
    target = _normalized(next_map)
    for words in lines.values():
        line_text = " ".join(item[0] for item in words)
        score = _similarity(target, line_text)
        if best is None or score > best[0]:
            left = min(item[1] for item in words)
            top = min(item[2] for item in words)
            right = max(item[1] + item[3] for item in words)
            bottom = max(item[2] + item[4] for item in words)
            best = (score, (left + right) / (2 * scale), (top + bottom) / (2 * scale))
    if best is None or best[0] < 0.56:
        return None

    x = min(max(8, best[1]), image.width - 8)
    y = min(max(8, best[2]), image.height - 8)
    # Exit labels normally touch an edge.  Interior dungeon labels are accepted
    # only when they are in the outer third of the expanded map.
    near_edge = (
        x <= image.width * 0.34
        or x >= image.width * 0.66
        or y <= image.height * 0.34
        or y >= image.height * 0.66
    )
    return (x, y) if near_edge else None


def _world_map_exit(map_name, next_map):
    """Last-resort cardinal direction derived from the overview map."""
    current = MAP_COORDS.get(map_name)
    following = MAP_COORDS.get(next_map)
    if not current or not following:
        return None
    dx, dy = following[0] - current[0], following[1] - current[1]
    if abs(dx) >= abs(dy):
        return (500, 254) if dx > 0 else (8, 254)
    return (254, 500) if dy > 0 else (254, 8)


def resolve_exit_point(image, map_name, next_map):
    map_name, next_map = canonical_name(map_name), canonical_name(next_map)
    measured = LOCAL_EXITS.get(map_name, {}).get(next_map)
    if measured is not None:
        return measured
    detected = _ocr_exit_label(image, next_map)
    if detected is not None:
        # Normalize to the reference 508 coordinate system.
        return (detected[0] * 508 / image.width, detected[1] * 508 / image.height)
    return _world_map_exit(map_name, next_map)


class LocalMapArrowOverlay:
    def __init__(self, root):
        self.color_key = "#010203"
        self.window = tk.Toplevel(root)
        self.window.withdraw()
        self.window.overrideredirect(True)
        self.window.attributes("-topmost", True)
        self.window.configure(bg=self.color_key)
        try:
            self.window.attributes("-transparentcolor", self.color_key)
        except tk.TclError:
            pass
        self.canvas = tk.Canvas(
            self.window,
            bg=self.color_key,
            highlightthickness=0,
            bd=0,
            takefocus=0,
        )
        self.canvas.pack(fill="both", expand=True)
        self.destination_frame = None

    def hide(self):
        self._destroy_destination_frame()
        self.window.withdraw()
        self.canvas.delete("all")

    def _destroy_destination_frame(self):
        if self.destination_frame is not None:
            self.destination_frame.destroy()
            self.destination_frame = None

    def _prepare(self, region):
        self._destroy_destination_frame()
        self.window.geometry(f"{region.width}x{region.height}{region.left:+d}{region.top:+d}")
        self.canvas.configure(width=region.width, height=region.height)
        self.canvas.delete("all")

    def show_destination_picker(self, region, map_name, destinations, callback):
        """Show the destination selector automatically over an expanded map."""
        self._prepare(region)
        panel_width = min(430, max(350, region.width - 24))
        frame = tk.Frame(
            self.window,
            bg="#102040",
            highlightbackground="#55ccff",
            highlightcolor="#55ccff",
            highlightthickness=2,
            padx=8,
            pady=6,
        )
        self.destination_frame = frame
        frame.place(x=(region.width - panel_width) // 2, y=52, width=panel_width, height=148)
        tk.Label(
            frame,
            text=f"現在地：{map_name}",
            bg="#102040",
            fg="#7fffff",
            font=("Yu Gothic UI", 11, "bold"),
        ).pack(anchor="w")

        destination_pairs = []
        for item in destinations:
            if isinstance(item, (tuple, list)) and len(item) >= 2:
                destination_pairs.append((str(item[0]), str(item[1])))
            else:
                destination_pairs.append((str(item), str(item)))
        label_to_name = {label: name for name, label in destination_pairs}

        search_row = tk.Frame(frame, bg="#102040")
        search_row.pack(fill="x", pady=(5, 2))
        tk.Label(
            search_row,
            text="検索",
            bg="#102040",
            fg="white",
            font=("Yu Gothic UI", 10),
        ).pack(side="left", padx=(0, 6))
        search_value = tk.StringVar()
        search_entry = tk.Entry(search_row, textvariable=search_value, font=("Yu Gothic UI", 10))
        search_entry.pack(side="left", fill="x", expand=True)

        row = tk.Frame(frame, bg="#102040")
        row.pack(fill="x", pady=(3, 2))
        labels = [label for _name, label in destination_pairs]
        value = tk.StringVar(value=labels[0] if labels else "")
        picker = ttk.Combobox(
            row,
            textvariable=value,
            values=labels,
            state="readonly",
            width=28,
            font=("Yu Gothic UI", 10),
        )
        picker.pack(side="left", fill="x", expand=True)

        def filter_destinations(*_args):
            word = search_value.get().strip().casefold()
            matched = [
                label
                for name, label in destination_pairs
                if not word or word in name.casefold() or word in label.casefold()
            ]
            picker.configure(values=matched)
            value.set(matched[0] if matched else "")

        search_value.trace_add("write", filter_destinations)

        def apply_selection():
            label = value.get().strip()
            destination = label_to_name.get(label, label)
            if not destination:
                return
            self._destroy_destination_frame()
            self._click_through()
            callback(destination)

        tk.Button(
            row,
            text="この目的地へ",
            command=apply_selection,
            font=("Yu Gothic UI", 10, "bold"),
            bg="#e8f4ff",
        ).pack(side="left", padx=(6, 0))
        tk.Label(
            frame,
            text="英語名または日本語名で検索できます",
            bg="#102040",
            fg="white",
            font=("Yu Gothic UI", 9),
        ).pack(anchor="w")
        self.window.deiconify()
        self.window.lift()
        self.window.after_idle(self._make_interactive)
        search_entry.focus_set()
        return True

    def show_exit(self, region, map_name, next_map, point=None, image=None):
        point = point or resolve_exit_point(image, map_name, next_map)
        if point is None:
            self.hide()
            return False
        self._prepare(region)
        sx, sy = region.width / 508.0, region.height / 508.0
        x, y = point[0] * sx, point[1] * sy
        cx, cy = region.width / 2, region.height / 2
        dx, dy = x - cx, y - cy
        length = max(1.0, (dx * dx + dy * dy) ** 0.5)
        start_x, start_y = x - dx / length * 92, y - dy / length * 92
        self.canvas.create_line(
            start_x,
            start_y,
            x,
            y,
            fill="black",
            width=11,
            arrow="last",
            arrowshape=(24, 30, 12),
        )
        self.canvas.create_line(
            start_x,
            start_y,
            x,
            y,
            fill="#ff2020",
            width=6,
            arrow="last",
            arrowshape=(22, 28, 11),
        )
        self.canvas.create_oval(x - 12, y - 12, x + 12, y + 12, outline="white", width=4)
        label_x = min(max(115, start_x), region.width - 115)
        label_y = min(max(25, start_y - 26), region.height - 25)
        text = f"次の出口：{next_map}"
        for ox, oy in ((-2, -2), (2, -2), (-2, 2), (2, 2)):
            self.canvas.create_text(
                label_x + ox,
                label_y + oy,
                text=text,
                fill="black",
                font=("Yu Gothic UI", 13, "bold"),
            )
        self.canvas.create_text(
            label_x,
            label_y,
            text=text,
            fill="#ffff55",
            font=("Yu Gothic UI", 13, "bold"),
        )
        self.window.deiconify()
        self.window.lift()
        self.window.after_idle(self._click_through)
        return True

    def show_transport(self, region, map_name, next_map, method):
        self._prepare(region)
        width = min(430, region.width - 20)
        x1 = (region.width - width) // 2
        self.canvas.create_rectangle(
            x1,
            54,
            x1 + width,
            118,
            fill="#102040",
            outline="#55ccff",
            width=2,
        )
        self.canvas.create_text(
            region.width // 2,
            74,
            text=f"{map_name} → {next_map}",
            fill="#ffff55",
            font=("Yu Gothic UI", 12, "bold"),
        )
        self.canvas.create_text(
            region.width // 2,
            99,
            text=f"移動方法：{method}",
            fill="white",
            font=("Yu Gothic UI", 11, "bold"),
        )
        self.window.deiconify()
        self.window.lift()
        self.window.after_idle(self._click_through)
        return True

    def show_compact(self, region, map_name):
        self._prepare(region)
        text = f"案内を最小化中｜{map_name}｜テンキー0で戻す"
        self.canvas.create_rectangle(
            8,
            8,
            min(region.width - 8, 360),
            38,
            fill="#102040",
            outline="#55ccff",
            width=2,
        )
        self.canvas.create_text(
            18,
            23,
            text=text,
            anchor="w",
            fill="white",
            font=("Yu Gothic UI", 9, "bold"),
        )
        self.window.deiconify()
        self.window.lift()
        self.window.after_idle(self._click_through)

    def _make_interactive(self):
        try:
            user32 = ctypes.windll.user32
            child = self.window.winfo_id()
            wrapper = user32.GetParent(child) or child
            style = user32.GetWindowLongW(wrapper, -20)
            user32.SetWindowLongW(
                wrapper,
                -20,
                (style | 0x00080000 | 0x00000080) & ~0x00000020,
            )
            user32.SetForegroundWindow(wrapper)
        except Exception:
            pass

    def _click_through(self):
        try:
            user32 = ctypes.windll.user32
            child = self.window.winfo_id()
            wrapper = user32.GetParent(child) or child
            style = user32.GetWindowLongW(wrapper, -20)
            user32.SetWindowLongW(
                wrapper,
                -20,
                style | 0x00080000 | 0x00000020 | 0x00000080 | 0x08000000,
            )
        except Exception:
            pass




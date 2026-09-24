import base64
import ctypes
import io
import json
import queue
import secrets
import threading
import time
import tkinter as tk
from dataclasses import asdict
from tkinter import messagebox, ttk

import pytesseract
from PIL import ImageOps
from .bridge import make_server
from .capture import CaptureRegion, capture_screen_without_layered_windows
from .config import app_data_dir, default_tesseract_path
from .map_collection import extract_map_labels
from .map_guide import MAP_NAMES, canonical_name, edge_label, is_teleport_edge
from .model import Atlas, title_name
from .overlay import LOCAL_EXITS, LocalMapArrowOverlay


def read_map(image):
    """Use the original tool's title-only crop, normalized for display scaling."""
    image = image.resize((508, 508))
    crop = ImageOps.grayscale(image.crop((45, 15, 430, 48)))
    # A closed map (bright scenery in the title slot) must not keep an old arrow.
    if sum(crop.histogram()[:110]) / (crop.width * crop.height) < 0.45:
        return '', {}, image
    crop = ImageOps.autocontrast(crop).resize((1540, 132))
    raw = pytesseract.image_to_string(crop.point(lambda p: 255 if p > 165 else 0),
                                     lang='eng', config='--psm 7', timeout=5)
    name = title_name(raw)
    # Never use a whole-frame fuzzy match: NPC/exit text can name another area.
    return name, {}, image


def read_exits(image, names):
    data = pytesseract.image_to_data(ImageOps.autocontrast(ImageOps.grayscale(image)).resize((1016, 1016)),
                                    lang='eng', config='--psm 11',
                                    output_type=pytesseract.Output.DICT, timeout=8)
    lines = {}
    for i, text in enumerate(data['text']):
        if not text.strip() or float(data['conf'][i]) < 55:
            continue
        key = (data['block_num'][i], data['par_num'][i], data['line_num'][i])
        lines.setdefault(key, []).append(i)
    found = {}
    for items in lines.values():
        name = title_name(' '.join(data['text'][i] for i in items))
        x = (min(data['left'][i] for i in items) + max(data['left'][i] + data['width'][i] for i in items)) / 4
        y = (min(data['top'][i] for i in items) + max(data['top'][i] + data['height'][i] for i in items)) / 4
        # Only recognized area names are used as links. Unknown titles enter the
        # atlas first; revisiting the neighbouring area can then learn its exit.
        if name in names and y > 52 and (x < 170 or x > 335 or y > 335):
            found[name] = [x, y]
    return found


class Companion:
    def __init__(self, root):
        self.root = root
        self.atlas = Atlas(app_data_dir() / 'atlas.json')
        self.commands = queue.Queue()
        self.events = queue.Queue(maxsize=2)
        self.lock = threading.Lock()
        self.state = {}
        self.running = False
        self.closed = threading.Event()
        self.region = None
        self.current = ''
        self.destination = ''
        self.transports = False
        self.preview = ''
        self.labels = {'npc': [], 'monster': []}
        self.compact = False
        self.last_key = False
        self.seen_name = ''
        self.seen_count = 0
        self.last_scan = 0
        self.last_result = time.monotonic()
        self.picker_map = ''
        self.generation = 0
        self.overlay = LocalMapArrowOverlay(root)
        self.token = secrets.token_urlsafe(24)
        self.status = tk.StringVar(value='拡大マップの範囲を指定してください。')
        self.manual = tk.StringVar()
        root.title('Xen Rebirth マップ連携 β')
        root.geometry('650x430')
        frame = ttk.Frame(root, padding=16)
        frame.pack(fill='both', expand=True)
        ttk.Label(frame, text='ゲーム画面への道順案内', font=('Yu Gothic UI', 15, 'bold')).pack(anchor='w')
        ttk.Label(frame, text='①ゲームの拡大マップを開く → ②枠全体を指定 → ③案内を開始').pack(anchor='w', pady=8)
        bar = ttk.Frame(frame); bar.pack(fill='x')
        ttk.Button(bar, text='マップ範囲を指定', command=self.select_region).pack(side='left')
        ttk.Button(bar, text='案内を開始', command=self.start).pack(side='left', padx=6)
        ttk.Button(bar, text='停止', command=self.stop).pack(side='left')
        ttk.Label(frame, text='サイトの「ゲーム画面に矢印を表示」に貼り付ける接続コード').pack(anchor='w', pady=(16, 4))
        code = ttk.Entry(frame); code.insert(0, self.token); code.configure(state='readonly'); code.pack(fill='x')
        ttk.Button(frame, text='接続コードをコピー', command=self.copy_token).pack(anchor='w', pady=4)
        ttk.Label(frame, text='現在地の読み違いを修正（次のエリア認識時に自動解除）').pack(anchor='w', pady=(12, 4))
        entry = ttk.Entry(frame, textvariable=self.manual); entry.pack(fill='x')
        ttk.Button(frame, text='現在地を修正', command=self.correct).pack(anchor='w', pady=4)
        ttk.Label(frame, textvariable=self.status, wraplength=610).pack(anchor='w', pady=10)
        ttk.Label(frame, text='テンキー0：矢印を縮小／復元。停止すると読み取りと表示を終了します。\n画像・収集データはこのPCに保存します。ゲーム操作は行いません。', wraplength=610).pack(anchor='w')
        try:
            self.region = CaptureRegion(**json.loads((app_data_dir() / 'region.json').read_text()))
            self.status.set('前回の範囲を復元しました。「案内を開始」で読み取りを始めます。')
        except (OSError, ValueError, TypeError):
            pass
        self.publish()
        self.server = make_server(self.token, self.snapshot, self.commands)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        threading.Thread(target=self.worker, daemon=True).start()
        root.protocol('WM_DELETE_WINDOW', self.close)
        root.after(150, self.tick)

    def snapshot(self):
        with self.lock:
            return self.state

    def publish(self):
        path = self.atlas.route(self.current, self.destination, self.transports)
        state = {'version': 1, 'running': self.running, 'current': self.current,
                 'destination': self.destination, 'path': path, 'status': self.status.get(),
                 'maps': self.atlas.maps, 'destinations': sorted(self.atlas.graph()),
                 'japanese': MAP_NAMES, 'preview': self.preview, 'labels': self.labels}
        with self.lock:
            self.state = json.loads(json.dumps(state))

    def copy_token(self):
        self.root.clipboard_clear(); self.root.clipboard_append(self.token)

    def select_region(self):
        self.stop()
        selector = tk.Toplevel(self.root)
        user32 = ctypes.windll.user32
        left, top = user32.GetSystemMetrics(76), user32.GetSystemMetrics(77)
        width, height = user32.GetSystemMetrics(78), user32.GetSystemMetrics(79)
        selector.overrideredirect(True)
        selector.geometry(f'{width}x{height}{left:+d}{top:+d}')
        selector.attributes('-topmost', True); selector.attributes('-alpha', 0.35)
        canvas = tk.Canvas(selector, bg='black', cursor='cross', highlightthickness=0)
        canvas.pack(fill='both', expand=True)
        start = []
        def down(event):
            start[:] = [event.x_root, event.y_root]
        def move(event):
            if start:
                canvas.delete('box')
                canvas.create_rectangle(start[0]-left, start[1]-top, event.x, event.y,
                                        outline='yellow', width=4, tags='box')
        def up(event):
            if not start:
                return
            region = CaptureRegion(min(start[0], event.x_root), min(start[1], event.y_root),
                                   abs(event.x_root-start[0]), abs(event.y_root-start[1]))
            selector.destroy()
            if not (200 <= region.width <= 1600 and 200 <= region.height <= 1600
                    and 0.8 < region.width/region.height < 1.2):
                self.status.set('正方形に近い拡大マップの枠全体を囲んでください。')
                return
            self.region = region
            (app_data_dir() / 'region.json').write_text(json.dumps(asdict(region)))
            self.status.set('範囲を保存しました。「案内を開始」を押してください。')
        canvas.bind('<ButtonPress-1>', down); canvas.bind('<B1-Motion>', move); canvas.bind('<ButtonRelease-1>', up)
        selector.bind('<Escape>', lambda event: selector.destroy()); selector.focus_force()

    def start(self):
        if not self.region:
            self.status.set('先にマップ範囲を指定してください。'); return
        self.running = True
        self.last_result = time.monotonic()
        self.status.set('拡大マップのタイトルを読み取っています…')
        self.publish()

    def stop(self):
        self.generation += 1
        self.running = False; self.current = ''; self.preview = ''
        self.seen_name = ''; self.seen_count = 0
        self.overlay.hide(); self.status.set('停止中'); self.publish()

    def correct(self):
        name = title_name(self.manual.get())
        if not name or not self.current:
            self.status.set('拡大マップ認識中に、正しいエリア名を入力してください。'); return
        wrong = self.current
        self.atlas.remove(wrong)
        self.atlas.ignored.discard(name)
        self.correction = (self.seen_name, name)
        self.atlas.observe(name, {}); self.atlas.observe(name, {})
        self.current = name
        self.render(); self.publish()

    def worker(self):
        pytesseract.pytesseract.tesseract_cmd = default_tesseract_path()
        while not self.closed.wait(1.2):
            if not self.running or not self.region:
                continue
            region = self.region
            generation = self.generation
            try:
                image = capture_screen_without_layered_windows(region)
                name, _, image = read_map(image)
                exits, labels = {}, None
                if name and time.monotonic() - self.last_scan > 7:
                    exits = read_exits(image, set(self.snapshot()['destinations']))
                    labels = extract_map_labels(image)
                    self.last_scan = time.monotonic()
                event = (generation, region, name, exits, labels, image, '')
            except Exception as exc:
                event = (generation, region, '', {}, None, None, '読み取りエラー：' + str(exc)[:150])
            try:
                self.events.put(event, timeout=1)
            except queue.Full:
                pass

    def tick(self):
        while not self.commands.empty():
            command = self.commands.get_nowait()
            if command[0] == 'destination':
                self.destination, self.transports = command[1:]
            elif command[0] == 'clear':
                self.destination = ''
            elif command[0] == 'forget':
                self.atlas.remove(command[1])
            self.render()
        while not self.events.empty():
            generation, region, name, exits, labels, image, error = self.events.get_nowait()
            if not self.running or region != self.region or generation != self.generation:
                continue
            self.last_result = time.monotonic()
            if name == self.seen_name:
                self.seen_count += 1
            else:
                self.seen_name, self.seen_count = name, 1
            if not name or self.seen_count < 2:
                self.current = ''; self.preview = ''; self.labels = {'npc': [], 'monster': []}; self.overlay.hide()
                self.status.set(error or '拡大マップ待機中／エリア名を確認中')
                continue
            correction = getattr(self, 'correction', None)
            if correction and correction[0] == name:
                name = correction[1]
            else:
                self.correction = None
            self.current = name
            # Second title observation was already made by the stability gate.
            self.atlas.observe(name, {})
            self.atlas.observe(name, exits)
            if image:
                out = io.BytesIO(); image.save(out, format='JPEG', quality=75)
                self.preview = 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()
                if labels is not None:
                    self.labels = labels
                    image.save(app_data_dir() / ('map-' + self.map_id(name) + '.png'))
                    (app_data_dir() / ('labels-' + self.map_id(name) + '.json')).write_text(json.dumps(labels), encoding='utf-8')
            self.render()
        pressed = bool(ctypes.windll.user32.GetAsyncKeyState(0x60) & 0x8000)
        if pressed and not self.last_key:
            self.compact = not self.compact; self.render()
        self.last_key = pressed
        if self.running and time.monotonic() - self.last_result > 15:
            self.current = ''; self.overlay.hide(); self.status.set('読み取り応答待ち。案内を一時停止しています。')
        self.publish()
        self.root.after(150, self.tick)

    @staticmethod
    def map_id(name):
        import hashlib
        return hashlib.sha256(name.encode()).hexdigest()[:20]

    def render(self):
        if not self.running or not self.current:
            self.picker_map = ''; self.overlay.hide(); return
        path = self.atlas.route(self.current, self.destination, self.transports)
        if self.compact:
            self.overlay.show_compact(self.region, self.current); return
        if not self.destination:
            if self.picker_map != self.current or self.overlay.destination_frame is None:
                self.picker_map = self.current
                destinations = [(name, name + (' / ' + MAP_NAMES[name] if name in MAP_NAMES else ''))
                                for name in sorted(self.atlas.graph())]
                self.overlay.show_destination_picker(self.region, self.current, destinations,
                    lambda name: self.commands.put(('destination', name, self.transports)))
            self.status.set(self.current + '：サイトまたは拡大マップで行先を選んでください。'); return
        if len(path) < 2:
            self.overlay.hide()
            self.status.set('目的地に到着しました。' if path else self.current + '：接続が未登録、または徒歩経路がありません。')
            return
        following = path[1]
        if is_teleport_edge(self.current, following):
            self.overlay.show_transport(self.region, self.current, following, edge_label(self.current, following))
        else:
            point = LOCAL_EXITS.get(self.current, {}).get(following) or self.atlas.point(self.current, following)
            if not point:
                self.overlay.hide()
                self.status.set(f'{self.current} → {following}：出口を読み取り中（推測の矢印は表示しません）'); return
            self.overlay.show_exit(self.region, self.current, following, point=point)
        self.status.set(f'{self.current} → {following} ／ 目的地：{self.destination}')

    def close(self):
        self.running = False; self.closed.set(); self.overlay.hide()
        self.server.shutdown(); self.server.server_close(); self.root.destroy()


def main():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        pass
    root = tk.Tk()
    try:
        Companion(root)
    except Exception as exc:
        messagebox.showerror('起動できません', str(exc)); root.destroy(); return
    root.mainloop()

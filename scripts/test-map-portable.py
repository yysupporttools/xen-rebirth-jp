"""Run with the user's portable runtime. No game capture or visible UI."""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'companion'))
import tkinter as tk
from PIL import Image, ImageDraw, ImageFont
import pytesseract
from xenmap.app import Companion, read_map, read_exits
from xenmap.config import default_tesseract_path

pytesseract.pytesseract.tesseract_cmd = default_tesseract_path()
image = Image.new('RGB', (508, 508), '#202020')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)
draw.text((65, 18), 'Eir', fill='white', font=font)
draw.text((8, 350), 'Essene', fill='white', font=font)
name, _, normalized = read_map(image)
assert name == 'Eir', repr(name)
exits = read_exits(normalized, {'Eir', 'Essene'})
assert 'Essene' in exits, exits
assert read_map(Image.new('RGB', (508, 508), 'white'))[0] == ''
with tempfile.TemporaryDirectory() as directory:
    os.environ['XEN_MAP_DATA'] = directory
    root = tk.Tk(); root.withdraw()
    app = Companion(root)
    root.update()
    assert app.snapshot()['running'] is False
    assert 'Eir' in app.snapshot()['destinations']
    app.close()
print('PASS: portable imports, real Tesseract title/exit OCR on synthetic fixture, closed-map rejection, hidden Tk startup/shutdown')

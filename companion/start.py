"""Started with the existing portable Python. No package installation required."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from xenmap.app import main
    if '--check' in sys.argv:
        from xenmap.config import default_tesseract_path
        assert Path(default_tesseract_path()).is_file()
        print('PASS: portable runtime, map modules and OCR path')
    else:
        main()
except Exception:
    if '--check' in sys.argv:
        raise
    import ctypes
    import traceback
    ctypes.windll.user32.MessageBoxW(None, traceback.format_exc(), 'Xen Map Companion: startup error', 16)

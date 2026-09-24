"""Started with the existing portable Python. No package installation required."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    from xenmap.app import main
    main()
except Exception:
    import ctypes
    import traceback
    ctypes.windll.user32.MessageBoxW(None, traceback.format_exc(), 'Xen Map Companion: startup error', 16)

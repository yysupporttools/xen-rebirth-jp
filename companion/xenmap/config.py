import os
from pathlib import Path


def app_data_dir():
    path = Path(os.environ.get('XEN_MAP_DATA', str(Path(os.environ['LOCALAPPDATA']) / 'XenMapCompanion')))
    path.mkdir(parents=True, exist_ok=True)
    return path


def default_tesseract_path():
    return str(Path(os.environ['XEN_PORTABLE_ROOT']) / 'tesseract' / 'tesseract.exe')

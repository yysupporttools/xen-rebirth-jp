from dataclasses import dataclass
from PIL import ImageGrab


@dataclass
class CaptureRegion:
    left: int
    top: int
    width: int
    height: int


def capture_screen_without_layered_windows(region):
    return ImageGrab.grab(bbox=(region.left, region.top, region.left + region.width,
                               region.top + region.height), include_layered_windows=False,
                          all_screens=True).convert('RGB')

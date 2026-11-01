#!/usr/bin/env python3
"""Add safe-zone padding for Android maskable icons."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "icons" / "icon-512.png"
OUT = ROOT / "icons" / "icon-512-maskable.png"
CANVAS = 512
INSET = 0.72  # icon occupies ~72% of canvas (Material safe zone)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing {SRC}")
    img = Image.open(SRC).convert("RGBA")
    inner = int(CANVAS * INSET)
    resized = img.resize((inner, inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (15, 23, 42, 255))
    offset = (CANVAS - inner) // 2
    canvas.paste(resized, (offset, offset), resized)
    canvas.save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()

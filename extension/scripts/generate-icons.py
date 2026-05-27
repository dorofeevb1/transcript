#!/usr/bin/env python3
"""Генерирует icon-16/32/48/128.png в extension/icons/."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "icons"
SIZES = (16, 32, 48, 128)


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * 0.22
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(r), fill="#ff0033")
    # play triangle
    m = size * 0.32
    tri = [(m, m), (m, size - m), (size - m * 0.9, size / 2)]
    d.polygon(tri, fill="#ffffff")
    # subtitle bar
    bar_y = size * 0.78
    d.rounded_rectangle(
        (size * 0.22, bar_y, size * 0.78, bar_y + size * 0.08),
        radius=max(1, size // 32),
        fill="#ffffff",
    )
    return img


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    master = draw_icon(128)
    master.save(ROOT / "icon-source.png")
    for s in SIZES:
        out = ROOT / f"icon-{s}.png"
        draw_icon(s).save(out, optimize=True)
        print("wrote", out)
    print("Replace icon-source.png with your artwork and re-run this script.")


if __name__ == "__main__":
    main()

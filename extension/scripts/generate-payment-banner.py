#!/usr/bin/env python3
"""Баннер 480×220 для платёжной формы (иконка + типографика с кириллицей)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons" / "payment-banner-480x220.png"

W, H = 480, 220
ACCENT = (255, 0, 51)
ACCENT_SOFT = (255, 40, 85)

FONT_TITLE = (
    "/usr/share/fonts/julietaula-montserrat-fonts/Montserrat-Bold.otf",
    "/usr/share/fonts/google-noto-vf/NotoSans[wght].ttf",
    "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf",
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
)
FONT_BODY = (
    "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf",
    "/usr/share/fonts/google-carlito-fonts/Carlito-Regular.ttf",
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf",
)
FONT_MEDIUM = (
    "/usr/share/fonts/julietaula-montserrat-fonts/Montserrat-Regular.otf",
    "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf",
)


def pick_font(candidates: tuple[str, ...], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        p = Path(path)
        if p.is_file():
            return ImageFont.truetype(str(p), size)
    print("WARN: Cyrillic font not found, text may break. Install noto-sans or liberation-sans.", file=sys.stderr)
    return ImageFont.load_default()


def draw_app_icon(size: int) -> Image.Image:
    """Та же графика, что в generate-icons.py — чётко на любом масштабе."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * 0.22
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(r), fill="#ff0033")
    m = size * 0.32
    tri = [(m, m), (m, size - m), (size - m * 0.9, size / 2)]
    d.polygon(tri, fill="#ffffff")
    bar_y = size * 0.78
    d.rounded_rectangle(
        (size * 0.22, bar_y, size * 0.78, bar_y + size * 0.08),
        radius=max(1, size // 32),
        fill="#ffffff",
    )
    return img


def vertical_gradient(w: int, h: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    row = Image.new("RGB", (1, h))
    px = row.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return row.resize((w, h), Image.Resampling.BILINEAR)


def add_glow(base: Image.Image, cx: int, cy: int, radius: int, color: tuple[int, int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        fill=color,
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius // 2))
    return Image.alpha_composite(base.convert("RGBA"), layer)


def draw_glass_panel(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int, int] = (255, 255, 255, 18),
    border: tuple[int, int, int, int] = (255, 255, 255, 36),
) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=16, fill=fill, outline=border, width=1)
    merged = Image.alpha_composite(canvas.convert("RGBA"), layer)
    canvas.paste(merged.convert("RGB"))


def main() -> None:
    # фон: тёмный с лёгким бордовым подтоном
    canvas = vertical_gradient(W, H, (12, 12, 16), (32, 14, 22)).convert("RGBA")
    canvas = add_glow(canvas, 95, H // 2 + 5, 95, (*ACCENT, 70))
    canvas = add_glow(canvas, W - 60, 30, 70, (80, 30, 120, 40))

    draw = ImageDraw.Draw(canvas)

    # декоративная линия сверху
    for i in range(3):
        draw.line((0, i, W, i), fill=(*ACCENT, 180 - i * 40))

    icon_size = 108
    icon = draw_app_icon(icon_size)
    ix, iy = 36, (H - icon_size) // 2

    # тень под иконкой
    shadow = Image.new("RGBA", (icon_size + 24, icon_size + 24), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((10, 14, icon_size + 12, icon_size + 16), radius=22, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    canvas.paste(shadow, (ix - 10, iy - 6), shadow)
    canvas.paste(icon, (ix, iy), icon)

    # стеклянная панель для текста
    panel_x, panel_y = 168, 28
    panel_w, panel_h = W - panel_x - 20, H - 56
    draw_glass_panel(canvas, (panel_x, panel_y, panel_x + panel_w, panel_y + panel_h))

    draw = ImageDraw.Draw(canvas)
    tx = panel_x + 20
    ty = panel_y + 18

    font_title = pick_font(FONT_TITLE, 24)
    font_sub = pick_font(FONT_BODY, 13)
    font_chip = pick_font(FONT_MEDIUM, 11)

    draw.text((tx, ty), "Стенограмма видео", fill=(255, 255, 255), font=font_title)

    # акцентная черта под заголовком
    title_bb = draw.textbbox((tx, ty), "Стенограмма видео", font=font_title)
    draw.rounded_rectangle(
        (tx, title_bb[3] + 6, tx + 52, title_bb[3] + 9),
        radius=2,
        fill=ACCENT,
    )

    draw.text(
        (tx, title_bb[3] + 18),
        "Субтитры · перевод · экспорт txt / srt",
        fill=(200, 198, 210),
        font=font_sub,
    )

    # чипы платформ
    chips = ("YouTube", "Rutube", "VK")
    cx = tx
    cy = title_bb[3] + 44
    for label in chips:
        bb = draw.textbbox((0, 0), label, font=font_chip)
        cw, ch = bb[2] - bb[0] + 18, bb[3] - bb[1] + 10
        draw.rounded_rectangle((cx, cy, cx + cw, cy + ch), radius=ch // 2, fill=(48, 46, 58))
        draw.text((cx + 9, cy + 3), label, fill=(240, 238, 245), font=font_chip)
        cx += cw + 8

    # бейдж
    badge = "Бесплатно"
    bf = pick_font(FONT_TITLE, 12)
    bb = draw.textbbox((0, 0), badge, font=bf)
    bw, bh = bb[2] - bb[0] + 20, bb[3] - bb[1] + 10
    bx = panel_x + panel_w - bw - 16
    by = panel_y + panel_h - bh - 14
    draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=bh // 2, fill=ACCENT)
    draw.text((bx + 10, by + 3), badge, fill=(255, 255, 255), font=bf)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(OUT, "PNG", optimize=True)
    print("wrote", OUT, f"({W}×{H})")


if __name__ == "__main__":
    main()

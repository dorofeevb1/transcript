"""
Generate 5 store screenshots × 2 locales (EN/RU) for youtube-transcript-extension.

Output: store-assets/screenshots/{en,ru}/0[1-5].png at 1280×800.

Mockups — ImageMagick rasterizes the SVG. <foreignObject> is not supported so
text uses plain <text>. QA-AGENT regenerates from the real extension in Phase
C; see ../README.md for the exact popup state per shot.
"""
from __future__ import annotations
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE
W, H = 1280, 800

POPUP_W, POPUP_H = 360, 600
POPUP_X = W - POPUP_W - 90
POPUP_Y = (H - POPUP_H) // 2

FONT = "DejaVu Sans"

DARK = dict(
    bg="#0f0f0f",
    surface="#1e1e22",
    surface_hover="#2a2a2e",
    bg_elevated="#181818",
    border="#303030",
    fg="#f1f5f9",
    muted="#b3b3b3",
    text_secondary="#cbd5e1",
    text_muted="#94a3b8",
    accent="#ff4d6b",
    accent_hover="#ff7088",
    accent_soft="#3a1c24",
)


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def wrap(text: str, max_chars: int) -> list[str]:
    out: list[str] = []
    words = text.split()
    line = ""
    for w in words:
        candidate = (line + " " + w).strip()
        if len(candidate) <= max_chars or not line:
            line = candidate
        else:
            out.append(line)
            line = w
    if line:
        out.append(line)
    return out


def text_block(x, y, text, *, size, color, weight=500, max_chars=80, line_gap=1.3):
    lines = wrap(text, max_chars)
    out = []
    for i, ln in enumerate(lines):
        out.append(
            f'<text x="{x}" y="{y + int(size * line_gap * i)}" '
            f'font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{color}">'
            f'{esc(ln)}</text>'
        )
    return "\n".join(out)


SHOTS = [
    dict(
        eyebrow=dict(en="One click", ru="Один клик"),
        headline=dict(
            en="Transcripts in one click.",
            ru="Стенограммы в один клик.",
        ),
        sub=dict(
            en="Open any video, hit Get text. No signup, no upload, no waiting.",
            ru="Открыли видео — нажали «Получить». Без регистрации, без загрузки, без ожидания.",
        ),
        state="ready",
    ),
    dict(
        eyebrow=dict(en="Three platforms", ru="Три платформы"),
        headline=dict(
            en="YouTube, Rutube, and VK.",
            ru="YouTube, Rutube и VK.",
        ),
        sub=dict(
            en="One popup, three platforms. Captions pulled directly from each provider's track.",
            ru="Один popup, три платформы. Субтитры — напрямую из дорожек каждой площадки.",
        ),
        state="loading",
    ),
    dict(
        eyebrow=dict(en="Export", ru="Экспорт"),
        headline=dict(
            en="Export to TXT, SRT, or JSON.",
            ru="Экспорт в TXT, SRT или JSON.",
        ),
        sub=dict(
            en="Copy plain text, drop SRT into a player, or pipe JSON into your tooling.",
            ru="Копируйте текст, бросайте SRT в плеер или передавайте JSON в свои скрипты.",
        ),
        state="result",
    ),
    dict(
        eyebrow=dict(en="Translate", ru="Перевод"),
        headline=dict(
            en="Translate to any language.",
            ru="Перевод на любой язык.",
        ),
        sub=dict(
            en="30+ languages via Google by default, or fully offline via Argos and a local server.",
            ru="30+ языков через Google по умолчанию или офлайн через Argos на локальном сервере.",
        ),
        state="translate",
    ),
    dict(
        eyebrow=dict(en="Local Whisper", ru="Локальный Whisper"),
        headline=dict(
            en="Local Whisper — fully offline.",
            ru="Локальный Whisper — полностью офлайн.",
        ),
        sub=dict(
            en="No captions? Transcribe audio with Whisper on your machine. Nothing leaves the browser.",
            ru="Нет субтитров? Распознавайте аудио Whisper'ом локально. Ничего не уходит из браузера.",
        ),
        state="history",
    ),
]


def caption_block(eyebrow, headline, sub):
    parts = [
        f'<text x="90" y="270" font-family="{FONT}" font-size="18" font-weight="700" fill="#ff8aa0" letter-spacing="2">{esc(eyebrow.upper())}</text>',
        text_block(90, 320, headline, size=44, color="#f8fafc", weight=700, max_chars=24, line_gap=1.15),
        text_block(90, 470, sub, size=20, color="#cbd5e1", weight=500, max_chars=44, line_gap=1.45),
    ]
    return "\n".join(parts)


def popup_chrome(content_svg, header_action="Get text",
                 footer_actions=("Copy", ".txt", ".srt", "Settings")):
    c = DARK
    fa = list(footer_actions) + [""] * (4 - len(footer_actions))
    return f"""
  <g transform="translate({POPUP_X} {POPUP_Y})" filter="url(#shadow)">
    <rect x="0" y="0" width="{POPUP_W}" height="{POPUP_H}" rx="18" fill="{c['bg']}"/>
    <line x1="0" y1="56" x2="{POPUP_W}" y2="56" stroke="{c['border']}" stroke-width="1"/>
    <!-- brand mark -->
    <rect x="16" y="14" width="28" height="28" rx="6" fill="url(#brand)"/>
    <polygon points="26,22 26,36 38,29" fill="#ffffff"/>
    <rect x="22" y="38" width="14" height="2" rx="1" fill="#ffffff"/>
    <text x="52" y="29" font-family="{FONT}" font-size="13" font-weight="700" fill="{c['fg']}">Transcript</text>
    <text x="52" y="42" font-family="{FONT}" font-size="9" font-weight="500" fill="{c['text_muted']}">YouTube · Rutube · VK</text>

    <!-- primary action -->
    <rect x="{POPUP_W - 142}" y="14" width="88" height="28" rx="6" fill="{c['accent']}"/>
    <text x="{POPUP_W - 98}" y="32" text-anchor="middle" font-family="{FONT}" font-size="12" font-weight="600" fill="#ffffff">{esc(header_action)}</text>

    <!-- theme icon -->
    <circle cx="{POPUP_W - 36}" cy="28" r="5" fill="none" stroke="{c['muted']}" stroke-width="1.5"/>

    {content_svg}

    <!-- footer -->
    <line x1="0" y1="{POPUP_H - 44}" x2="{POPUP_W}" y2="{POPUP_H - 44}" stroke="{c['border']}" stroke-width="1"/>
    <text x="16"  y="{POPUP_H - 22}" font-family="{FONT}" font-size="11" font-weight="500" fill="{c['muted']}">{esc(fa[0])}</text>
    <text x="76"  y="{POPUP_H - 22}" font-family="{FONT}" font-size="11" font-weight="500" fill="{c['muted']}">{esc(fa[1])}</text>
    <text x="120" y="{POPUP_H - 22}" font-family="{FONT}" font-size="11" font-weight="500" fill="{c['muted']}">{esc(fa[2])}</text>
    <text x="{POPUP_W - 16}" y="{POPUP_H - 22}" text-anchor="end" font-family="{FONT}" font-size="11" font-weight="500" fill="{c['muted']}">{esc(fa[3])}</text>
  </g>
"""


def video_card(title, sub=""):
    c = DARK
    parts = [
        f'<rect x="16" y="72" width="{POPUP_W - 32}" height="64" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>',
        text_block(28, 92, title, size=13, color=c["fg"], weight=600, max_chars=38, line_gap=1.3),
    ]
    if sub:
        parts.append(f'<text x="28" y="124" font-family="{FONT}" font-size="11" fill="{c["text_secondary"]}">{esc(sub)}</text>')
    return "\n".join(parts)


def segmented(y, options, active_idx):
    c = DARK
    parts = [f'<rect x="16" y="{y}" width="{POPUP_W - 32}" height="38" rx="8" fill="{c["bg_elevated"]}" stroke="{c["border"]}" stroke-width="1"/>']
    box_w = (POPUP_W - 32 - 8) // len(options)
    x = 20
    for i, opt in enumerate(options):
        if i == active_idx:
            parts.append(f'<rect x="{x}" y="{y + 4}" width="{box_w - 2}" height="30" rx="6" fill="{c["accent"]}"/>')
            parts.append(f'<text x="{x + box_w/2 - 1}" y="{y + 24}" text-anchor="middle" font-family="{FONT}" font-size="11" font-weight="600" fill="#ffffff">{esc(opt)}</text>')
        else:
            parts.append(f'<text x="{x + box_w/2 - 1}" y="{y + 24}" text-anchor="middle" font-family="{FONT}" font-size="11" font-weight="500" fill="{c["text_secondary"]}">{esc(opt)}</text>')
        x += box_w
    return "\n".join(parts)


def card_title(x, y, text):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="11" font-weight="600" fill="{DARK["text_muted"]}" letter-spacing="0.6">{esc(text)}</text>'


def ready_state(locale):
    c = DARK
    is_ru = locale == "ru"
    return "\n".join([
        # source section
        f'<rect x="16" y="152" width="{POPUP_W - 32}" height="92" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>',
        card_title(28, 170, "ИСТОЧНИК" if is_ru else "SOURCE"),
        segmented(184, ["Субтитры" if is_ru else "Captions", "Whisper"], active_idx=0),
        # display section
        f'<rect x="16" y="256" width="{POPUP_W - 32}" height="92" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>',
        card_title(28, 274, "ОТОБРАЖЕНИЕ" if is_ru else "DISPLAY"),
        segmented(288, ["По минутам" if is_ru else "By minute", "По фразам" if is_ru else "By phrase"], active_idx=0),
        # history section
        f'<rect x="16" y="360" width="{POPUP_W - 32}" height="158" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>',
        card_title(28, 378, "ИСТОРИЯ" if is_ru else "HISTORY"),
        f'<rect x="28" y="392" width="{POPUP_W - 56}" height="32" rx="6" fill="{c["bg_elevated"]}"/>',
        f'<text x="40" y="412" font-family="{FONT}" font-size="11" fill="{c["text_secondary"]}">12:04 · {"Чёрные дыры" if is_ru else "Black holes 101"} · 14 min · ru</text>',
        f'<rect x="28" y="430" width="{POPUP_W - 56}" height="32" rx="6" fill="{c["bg_elevated"]}"/>',
        f'<text x="40" y="450" font-family="{FONT}" font-size="11" fill="{c["text_secondary"]}">09:51 · {"Rust веб-сервер" if is_ru else "Rust web server"} · 23 min · en</text>',
        f'<rect x="28" y="468" width="{POPUP_W - 56}" height="32" rx="6" fill="{c["bg_elevated"]}"/>',
        f'<text x="40" y="488" font-family="{FONT}" font-size="11" fill="{c["text_secondary"]}">22:11 · CRISPR · 8 min · ru</text>',
    ])


def loading_state(locale):
    c = DARK
    is_ru = locale == "ru"
    return "\n".join([
        # progress
        f'<rect x="16" y="156" width="{POPUP_W - 32}" height="4" rx="2" fill="{c["bg_elevated"]}"/>',
        f'<rect x="16" y="156" width="200" height="4" rx="2" fill="{c["accent"]}"/>',
        f'<text x="{POPUP_W/2}" y="184" text-anchor="middle" font-family="{FONT}" font-size="11" fill="{c["text_muted"]}">{"Загрузка субтитров…" if is_ru else "Loading captions…"}</text>',
        # skeleton lines
        f'<rect x="16" y="206" width="{POPUP_W - 32}" height="74" rx="10" fill="{c["surface"]}"/>',
        f'<rect x="28" y="222" width="220" height="10" rx="5" fill="{c["surface_hover"]}"/>',
        f'<rect x="28" y="238" width="280" height="8" rx="4" fill="{c["surface_hover"]}"/>',
        f'<rect x="28" y="252" width="180" height="8" rx="4" fill="{c["surface_hover"]}"/>',
        f'<rect x="16" y="296" width="{POPUP_W - 32}" height="74" rx="10" fill="{c["surface"]}"/>',
        f'<rect x="28" y="312" width="240" height="10" rx="5" fill="{c["surface_hover"]}"/>',
        f'<rect x="28" y="328" width="280" height="8" rx="4" fill="{c["surface_hover"]}"/>',
        f'<rect x="28" y="342" width="200" height="8" rx="4" fill="{c["surface_hover"]}"/>',
        f'<rect x="16" y="386" width="{POPUP_W - 32}" height="74" rx="10" fill="{c["surface"]}"/>',
        f'<rect x="28" y="402" width="180" height="10" rx="5" fill="{c["surface_hover"]}"/>',
        f'<rect x="28" y="418" width="280" height="8" rx="4" fill="{c["surface_hover"]}"/>',
        f'<rect x="28" y="432" width="220" height="8" rx="4" fill="{c["surface_hover"]}"/>',
    ])


def result_state(locale, *, translate=False):
    c = DARK
    is_ru = locale == "ru"
    head = "Стенограмма · YouTube · 14 мин" if is_ru else "Transcript · YouTube · 14 min"
    body_en = (
        "00:00 introduction. We talk about why event horizons form and what "
        "happens to objects that cross them. Mass curves spacetime, and at a "
        "critical density even light cannot escape."
    )
    body_ru = (
        "00:00 введение. Мы обсудим, почему возникает горизонт событий и что "
        "происходит с объектами, пересекшими его. Масса искривляет пространство, "
        "и при определённой плотности даже свет не вырывается наружу."
    )
    body = body_ru if is_ru else body_en
    parts = [
        f'<rect x="16" y="152" width="{POPUP_W - 32}" height="220" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>',
        f'<text x="28" y="172" font-family="{FONT}" font-size="11" fill="{c["text_muted"]}">{esc(head)}</text>',
        f'<line x1="28" y1="184" x2="{POPUP_W - 28}" y2="184" stroke="{c["border"]}" stroke-width="1"/>',
        text_block(28, 204, body, size=11, color=c["text_secondary"], weight=500, max_chars=48, line_gap=1.55),
    ]
    if translate:
        parts.append(f'<rect x="16" y="384" width="{POPUP_W - 32}" height="84" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>')
        parts.append(card_title(28, 402, "ПЕРЕВОД" if is_ru else "TRANSLATION"))
        parts.append(f'<rect x="28" y="412" width="{POPUP_W - 130}" height="36" rx="6" fill="{c["bg_elevated"]}" stroke="{c["border"]}" stroke-width="1"/>')
        parts.append(f'<text x="40" y="434" font-family="{FONT}" font-size="12" fill="{c["fg"]}">{esc("Français · fr" if is_ru else "Français · fr")}</text>')
        parts.append(f'<rect x="{POPUP_W - 96}" y="412" width="80" height="36" rx="6" fill="{c["accent"]}"/>')
        parts.append(f'<text x="{POPUP_W - 56}" y="434" text-anchor="middle" font-family="{FONT}" font-size="12" font-weight="600" fill="#fff">{esc("Применить" if is_ru else "Apply")}</text>')
    else:
        # segmented view-mode
        parts.append(f'<rect x="16" y="384" width="{POPUP_W - 32}" height="56" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>')
        parts.append(card_title(28, 400, "ОТОБРАЖЕНИЕ" if is_ru else "DISPLAY"))
        parts.append(segmented(412, ["По минутам" if is_ru else "By minute", "По фразам" if is_ru else "By phrase"], active_idx=0))
    return "\n".join(parts)


def history_state(locale):
    c = DARK
    is_ru = locale == "ru"
    entries = (
        [("Чёрные дыры — лекция МФТИ", "12:04 · 14 мин · ru"),
         ("Веб-сервер на Rust пошагово", "09:51 · 23 мин · en"),
         ("CRISPR за 8 минут", "22:11 · 8 мин · ru"),
         ("Аполлон-11: оригинальная запись", "14:02 · 47 мин · en"),
         ("Quantum computing 101", "08:33 · 19 мин · en"),
         ("История JavaScript", "07:12 · 32 мин · ru")]
        if is_ru else
        [("Black holes — MIT lecture", "12:04 · 14 min · ru"),
         ("Building a Rust web server", "09:51 · 23 min · en"),
         ("CRISPR explained in 8 minutes", "22:11 · 8 min · ru"),
         ("Apollo 11 raw audio", "14:02 · 47 min · en"),
         ("Quantum computing 101", "08:33 · 19 min · en"),
         ("History of JavaScript", "07:12 · 32 min · ru")]
    )
    parts = [
        f'<rect x="16" y="152" width="{POPUP_W - 32}" height="380" rx="10" fill="{c["surface"]}" stroke="{c["border"]}" stroke-width="1"/>',
        card_title(28, 170, "ИСТОРИЯ" if is_ru else "HISTORY"),
        f'<text x="{POPUP_W - 28}" y="170" text-anchor="end" font-family="{FONT}" font-size="11" font-weight="500" fill="{c["muted"]}">{esc("Очистить" if is_ru else "Clear")}</text>',
    ]
    y = 184
    for title, meta in entries:
        parts.append(f'<rect x="28" y="{y}" width="{POPUP_W - 56}" height="48" rx="8" fill="{c["bg_elevated"]}"/>')
        parts.append(f'<text x="40" y="{y + 18}" font-family="{FONT}" font-size="12" font-weight="500" fill="{c["fg"]}">{esc(title)}</text>')
        parts.append(f'<text x="40" y="{y + 36}" font-family="{FONT}" font-size="10" fill="{c["muted"]}">{esc(meta)}</text>')
        y += 56
    return "\n".join(parts)


def render_svg(locale, shot):
    is_ru = locale == "ru"
    state = shot["state"]
    open_title = "Откройте видео на поддерживаемом сайте" if is_ru else "Open a video on a supported site"
    real_title = "Как чёрные дыры искривляют время и пространство" if is_ru else "How black holes warp time and space"

    if state == "ready":
        body = video_card(open_title, "Whisper: готов" if is_ru else "Whisper: ready") + ready_state(locale)
    elif state == "loading":
        body = video_card(real_title, "YouTube · dQw4w9WgXcQ") + loading_state(locale)
    elif state == "result":
        body = video_card(real_title, "YouTube · dQw4w9WgXcQ · ru") + result_state(locale)
    elif state == "translate":
        body = video_card(real_title, "YouTube · dQw4w9WgXcQ · ru") + result_state(locale, translate=True)
    elif state == "history":
        body = video_card(open_title, "") + history_state(locale)
    else:
        body = ""

    header_action = "Получить" if is_ru else "Get text"
    if state == "translate":
        footer = ("Копировать", ".txt", ".srt", "Настройки") if is_ru else ("Copy", ".txt", ".srt", "Settings")
    elif state == "history":
        footer = ("Копировать", ".txt", ".srt", "Настройки") if is_ru else ("Copy", ".txt", ".srt", "Settings")
    else:
        footer = ("Копировать", ".txt", ".srt", "Настройки") if is_ru else ("Copy", ".txt", ".srt", "Settings")

    popup = popup_chrome(body, header_action=header_action, footer_actions=footer)
    caption = caption_block(shot["eyebrow"][locale], shot["headline"][locale], shot["sub"][locale])

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a0f1a"/>
      <stop offset="1" stop-color="#0f0f0f"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#cc0029"/>
      <stop offset="1" stop-color="#ff4d6b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.1" cy="0.1" r="0.7">
      <stop offset="0" stop-color="#ff4d6b" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#ff4d6b" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="30" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>
  {caption}
  {popup}
</svg>"""


def main() -> None:
    for locale in ("en", "ru"):
        outdir = OUT / locale
        outdir.mkdir(parents=True, exist_ok=True)
        for i, shot in enumerate(SHOTS, start=1):
            svg = render_svg(locale, shot)
            svg_path = outdir / f"{i:02d}.svg"
            png_path = outdir / f"{i:02d}.png"
            svg_path.write_text(svg, encoding="utf-8")
            subprocess.run(
                [
                    "magick",
                    "-background", "none",
                    "-density", "200",
                    str(svg_path),
                    "-resize", f"{W}x{H}",
                    "-depth", "8",
                    "-strip",
                    str(png_path),
                ],
                check=True,
            )
            print(f"  ok {png_path.relative_to(OUT.parent.parent)}")


if __name__ == "__main__":
    main()

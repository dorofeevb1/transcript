# Store screenshots — youtube-transcript-extension

5 shots × 2 locales (EN/RU) at **1280×800** PNG, RGBA, 8-bit.

PNGs committed here are SVG mockups rendered with ImageMagick (`_make.py`).
Visually accurate to the redesigned popup; for CWS / AMO submission,
QA-AGENT should regenerate from the real extension in Phase C via
Playwright using the per-shot spec below.

## Per-shot spec

Dark theme, popup width 360px, max-height 600px. Background is a 1280×800
dark-red gradient (`#3a0f1a → #0f0f0f`) with a soft accent glow top-left.
Popup right-side, caption block left-side.

### 01 — Ready / Three platforms
- Open the popup on a YouTube video (or just `chrome://newtab/` to show
  the "Open a video on a supported site" state). Whisper server is
  optional; the screenshot can show the empty status line.
- Caption:
  - EN: `THREE PLATFORMS` / `Transcripts for YouTube, Rutube, VK.` / `One popup, three platforms, the same clean text view by minute or by phrase.`
  - RU: `ТРИ ПЛАТФОРМЫ` / `Стенограммы YouTube, Rutube и VK.` / `Один popup, три платформы, одинаково чистый текст по минутам или фразам.`
- Popup state: empty video card + Source/Display cards (both with the
  default segmented option active) + History card.

### 02 — Loading
- Open YouTube video, click **Get text**, capture during the loading
  phase (progress bar at ~50%).
- Caption:
  - EN: `FETCH` / `Captions in seconds, no signup.` / `Direct from each platform's caption track. Optional local Whisper for audio fallback.`
  - RU: `ЗАГРУЗКА` / `Субтитры за секунды — без регистрации.` / `Напрямую из субтитров платформы. Опционально Whisper для аудио — локально.`
- Popup must show the progress bar + "Loading captions…" + 3 skeleton
  cards in the result area.

### 03 — Transcript result
- After 02 completes. Default "By minute" view active.
- Caption:
  - EN: `TRANSCRIPT` / `By minute or by phrase.` / `Switch the view instantly. Copy, or export to .txt / .srt / .json in one tap.`
  - RU: `СТЕНОГРАММА` / `По минутам или по фразам.` / `Переключайте режим мгновенно. Копируйте или экспортируйте в .txt / .srt / .json.`
- Popup must show: video card with full title, result card with
  ~6 lines of transcript text, and the Display segmented control.

### 04 — Translate
- Same as 03 but with the Translate card expanded and `Français · fr`
  selected (don't actually run translation for the screenshot; just
  show the controls).
- Caption:
  - EN: `TRANSLATE` / `Translate to 30+ languages.` / `Google translate by default, or offline Argos via the optional local server.`
  - RU: `ПЕРЕВОД` / `Перевод на 30+ языков.` / `По умолчанию — Google, или офлайн через Argos на локальном сервере.`

### 05 — History
- Seed `chrome.storage.local` with 6 history entries (sample titles
  in the locale). Open the popup on a non-video page.
- Caption:
  - EN: `HISTORY` / `Last 50 transcripts, cached locally.` / `Pick up where you left off. All in your browser, never on a server.`
  - RU: `ИСТОРИЯ` / `Последние 50 стенограмм — локальный кэш.` / `Возвращайтесь к любой работе. Всё в браузере — ничего на сервере.`

## Regenerating mockups

```
cd store-assets/screenshots
python3 _make.py
```

Requires `magick` (ImageMagick 7+).

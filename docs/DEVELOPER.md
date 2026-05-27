<div align="center">

# Руководство разработчика

Chrome / Firefox MV3 · TypeScript · Vite · FastAPI (Whisper)

[← Главная](../README.md) · [Пользователям](USER_GUIDE.md) · [Whisper](WHISPER-SERVER.md)

</div>

---

## Содержание

1. [Архитектура](#архитектура)
2. [Структура репозитория](#структура-репозитория)
3. [Сборка](#сборка)
4. [Расширение](#расширение)
5. [Service Worker](#service-worker)
6. [Платформы](#платформы)
7. [Перевод](#перевод)
8. [Whisper Server](#whisper-server)
9. [Хранение](#хранение)
10. [Тесты](#тесты)
11. [Расширение кодовой базы](#расширение-кодовой-базы)

---

## Архитектура

```
┌─────────────┐     sendMessage      ┌──────────────────┐
│ popup /     │ ◄──────────────────► │ service-worker   │
│ options     │     GET_PROGRESS     │ (MV3 background) │
└─────────────┘                      └────────┬─────────┘
                                              │
                    executeScript (MAIN)      │
                    ┌─────────────────────────┼─────────────────┐
                    ▼                         ▼                 ▼
            ┌───────────────┐        ┌──────────────┐   ┌──────────────┐
            │ inject-page   │        │ offscreen *  │   │ whisper-srv  │
            │ (per tab)     │        │ tabCapture * │   │ :8765        │
            └───────────────┘        └──────────────┘   └──────────────┘

* только Chrome-сборка; в Firefox — заглушки (@stt/*)
```

| Компонент | Роль |
|-----------|------|
| **popup** | UI: стенограмма, перевод, экспорт, история |
| **service-worker** | Оркестрация, кэш, прогресс, fetch |
| **content (isolated)** | `video-page.ts` — мост |
| **content (MAIN)** | `inject-page.ts`, `vk-net-hook.ts` |
| **offscreen** | запись аудио вкладки (Chrome) |
| **whisper-server** | STT, `/translate`, `/health` |

---

## Структура репозитория

```
transcript/
├── docs/                      # документация
├── extension/
│   ├── manifest.json
│   ├── src/
│   │   ├── background/        # service-worker.ts
│   │   ├── popup/             # popup-fetch.chromium|firefox.ts
│   │   ├── options/
│   │   ├── offscreen/
│   │   ├── content/
│   │   └── lib/               # @stt/* алиасы при FIREFOX_BUILD=1
│   ├── dist/                  # Chrome
│   └── dist-firefox/          # Firefox (не в git)
├── whisper-server/
└── Makefile
```

---

## Сборка

| Команда | Результат |
|---------|-----------|
| `make install-extension` | `npm ci` в extension |
| `make build-extension` | `extension/dist/` |
| `make build-firefox-zip` | `dist-firefox/` + ZIP (локально) |
| `make dev-extension` | Vite watch |
| `make dev-server` | :8765 |
| `make test` | Vitest + pytest |

**Firefox:** `FIREFOX_BUILD=1` → заглушки `tab-capture.firefox.ts`, `offscreen-doc.firefox.ts` → без API в бандле для AMO.

---

## Расширение

### Стек

TypeScript · Vite 5 · `@crxjs/vite-plugin` · Manifest V3 · Vitest

### Ключевые модули (`src/lib/`)

| Модуль | Назначение |
|--------|------------|
| `platform.ts` | URL → `{ platform, videoId }` |
| `captions.ts` | VTT / SRT / XML / json3 |
| `caption-normalize.ts` | дедуп VK |
| `innertube.ts` | YouTube Innertube |
| `rutube-captions*.ts` | Rutube |
| `vk-captions.ts` | VK |
| `translate*.ts` | перевод, пакеты |
| `job-state.ts` | прогресс в storage |
| `recording.chromium.ts` | STT pipeline |
| `browser-capabilities.ts` | Chrome vs Firefox |

### Content scripts

1. **vk-net-hook** — `world: MAIN`, перехват okcdn URL.
2. **video-page** — isolated, PING.

Остальное — `executeScript` + `inject-page.ts` (без `chrome.*` в MAIN).

---

## Service Worker

### Сообщения (`MessageType`)

| type | Описание |
|------|----------|
| `GET_TRANSCRIPT` | субтитры или STT |
| `TRANSLATE` | перевод результата |
| `GET_PROGRESS` | `StoredJob` |
| `CANCEL_STT` | отмена STT |
| `FETCH_REMOTE_TEXT` | fetch URL (okcdn) |

Ответ: `{ ok, result?, error?, progress?, job? }`. Async → **`return true`**.

### `StoredJob` (`job-state.ts`)

`kind`: `idle` | `transcript` | `translate` | `stt` — поля `processedSec`, `totalSec`, `phase`, `error`.

**Не** вызывать `sendMessage` из SW к себе для fetch — `fetch-remote-text.ts`.

---

## Платформы

| Платформа | Субтитры | Примечания |
|-----------|----------|------------|
| **youtube** | Innertube + timedtext | `innertube.ts` |
| **rutube** | `/api/play/options/` | SRT на CDN |
| **vk** | playerParams, okcdn | normalize rolling |

VK id: `-163306979_456250683` из `/video-163306979_456250683`.

---

## Перевод

```
translateTexts → runPool → translateChunkWithFallbacks
  1. translateChunkViaTab (MAIN)
  2. translateChunkViaServer
  3. GTX direct / split
```

`LARGE_SEGMENT_THRESHOLD = 200` → минутные блоки.

---

## Whisper Server

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/health` | статус |
| POST | `/transcribe` | STT |
| POST | `/translate` | Argos / Google |
| GET | `/youtube-captions/{id}` | запасной источник |

См. **[WHISPER-SERVER.md](WHISPER-SERVER.md)**

---

## Хранение

| Ключ | Содержимое |
|------|------------|
| `transcript:{platform}:{videoId}` | `TranscriptResult` |
| `translation:…` | перевод |
| `options` | настройки |
| `uiJob` | прогресс |
| `history` | история |

---

## Тесты

```bash
cd extension && npm run test      # unit
cd extension && npm run test:e2e    # сеть
cd whisper-server && pytest tests/ -v
```

---

## Расширение кодовой базы

### Новая платформа

1. `platform.ts`
2. `manifest.json` — permissions, matches
3. `service-worker.ts` — `fetchCaptionsTranscript`
4. `inject-page.ts` при необходимости
5. `platform.test.ts`

### Отладка

- SW: `chrome://extensions` → Inspect
- Popup: ПКМ → Inspect
- MAIN: DevTools страницы видео

### Версия

`extension/manifest.json` (**1.7.8**). После изменений: `npm run build` + ↻ в Chrome.

---

## Связанные документы

- [USER_GUIDE.md](USER_GUIDE.md)
- [PUBLISHING.md](PUBLISHING.md) · [PUBLISHING_FIREFOX.md](PUBLISHING_FIREFOX.md)
- [SOURCE-AMO.md](SOURCE-AMO.md)

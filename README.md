<div align="center">

<img src="extension/icons/icon-128.png" alt="Стенограмма видео" width="96" height="96">

# Стенограмма видео

**Полный текст роликов с YouTube, Rutube и VK** — субтитры, таймкоды, перевод и экспорт.  
Бесплатно, без платных облачных API.

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://github.com/dorofeevb1/transcript)
[![Firefox](https://img.shields.io/badge/Firefox-142%2B-FF7139?style=flat-square&logo=firefoxbrowser&logoColor=white)](docs/PUBLISHING_FIREFOX.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](extension/)
[![Version](https://img.shields.io/badge/version-1.7.8-ff0033?style=flat-square)](extension/manifest.json)

[Быстрый старт](#-быстрый-старт) · [Возможности](#-возможности) · [Документация](#-документация) · [Поддержка](#-поддержка)

</div>

---

## О проекте

Браузерное расширение извлекает **встроенные субтитры** с открытой страницы видео. Текст можно смотреть **по минутам** или **по фразам**, переводить и сохранять в `.txt`, `.srt` или `.json`.

Опционально — локальный сервер **Whisper** для распознавания из аудио, если у ролика нет субтитров (режим «Из аудио», в основном **Chrome**).

| Платформа | Субтитры | Перевод | Из аудио (Whisper) |
|-----------|:--------:|:-------:|:------------------:|
| **Chrome** | ✅ | ✅ | ✅ |
| **Firefox 142+** | ✅ | ✅ | — |

---

## ✨ Возможности

- **YouTube, Rutube, VK Видео** — один popup на всех сайтах
- **Субтитры за секунды** — без ручного копирования с экрана
- **Два режима отображения** — по минутам или по фразам
- **Экспорт** — `.txt`, `.srt`, `.json`
- **Перевод** — через Google Translate в контексте вкладки или офлайн Argos на сервере
- **История и кэш** — недавние стенограммы под рукой
- **6 языков интерфейса** — ru, en, uk, de, es, fr

---

## 🚀 Быстрый старт

### Требования

- **Node.js 20+** и **npm** — для сборки расширения
- **Chrome** или **Firefox 142+** (десктоп)

### Chrome

```bash
git clone https://github.com/dorofeevb1/transcript.git
cd transcript
make install-extension
make build-extension
```

1. Откройте `chrome://extensions`
2. Включите **Режим разработчика**
3. **Загрузить распакованное** → папка `extension/dist`
4. Откройте видео на YouTube / Rutube / VK → иконка расширения → **Получить текст**

### Firefox

```bash
make build-firefox-zip
```

Установка до публикации на AMO: `about:debugging` → **Загрузить временное дополнение** → `extension/dist-firefox/manifest.json`.  
Подробнее: **[docs/PUBLISHING_FIREFOX.md](docs/PUBLISHING_FIREFOX.md)**

### Опционально: Whisper-сервер

Для режима **«Из аудио»** и офлайн-перевода Argos:

```bash
make install-server
make dev-server    # http://127.0.0.1:8765
```

Подробнее: **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** · **[docs/WHISPER-SERVER.md](docs/WHISPER-SERVER.md)**

---

## 📚 Документация

| Документ | Содержание |
|----------|------------|
| **[docs/USER_GUIDE.md](docs/USER_GUIDE.md)** | Установка, режимы, перевод, история, FAQ |
| **[docs/DEVELOPER.md](docs/DEVELOPER.md)** | Архитектура, сообщения, сборка, тесты |
| **[docs/PUBLISHING.md](docs/PUBLISHING.md)** | Chrome Web Store, иконки, ZIP |
| **[docs/PUBLISHING_FIREFOX.md](docs/PUBLISHING_FIREFOX.md)** | Firefox AMO |
| **[docs/SOURCE-AMO.md](docs/SOURCE-AMO.md)** | Сборка исходников для рецензентов Mozilla |
| **[docs/WHISPER-SERVER.md](docs/WHISPER-SERVER.md)** | API локального сервера |

---

## 🛠 Разработка

```bash
make dev-extension   # Vite watch → extension/dist
make dev-server      # whisper-server :8765
make test            # unit-тесты (Vitest)
make build-firefox-zip
```

```
transcript/
├── docs/              # руководства
├── extension/         # Chrome / Firefox MV3 (TypeScript, Vite)
│   ├── src/           # popup, background, content scripts
│   ├── _locales/      # i18n
│   └── scripts/       # сборка Firefox для AMO
├── whisper-server/    # FastAPI, faster-whisper, Argos
└── Makefile
```

См. **[docs/DEVELOPER.md](docs/DEVELOPER.md)**

---

## 🔒 Политика конфиденциальности

- Расширение **не собирает** персональные данные и **не отправляет** их на серверы автора.
- Текст берётся из **субтитров на странице видео**, которую вы открыли сами.
- **Перевод** может обращаться к Google Translate (запросы к Google).
- **Настройки и история** хранятся локально в браузере (`storage`).
- **Whisper-сервер** (опционально) работает только на вашем компьютере (`127.0.0.1`), если вы его запустили.

---

## 💬 Поддержка

Расширение **бесплатное**. Добровольная поддержка:

| | Ссылка |
|---|--------|
| Issues и код | https://github.com/dorofeevb1/transcript |
| CloudTips (РФ, карта / СБП) | https://pay.cloudtips.ru/p/0290bc9b |

---

## 📄 Лицензия

Файл `LICENSE` в репозитории уточняется при публикации. Исходный код открыт на GitHub.

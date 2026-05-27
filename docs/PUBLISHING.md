<div align="center">

# Chrome Web Store

Публикация расширения «Стенограмма видео»

[← Главная](../README.md) · [Firefox AMO](PUBLISHING_FIREFOX.md)

</div>

---

## Содержание

1. [Иконки](#иконки)
2. [Сборка ZIP](#сборка-zip)
3. [Аккаунт разработчика](#аккаунт-разработчика)
4. [Листинг](#листинг)
5. [Модерация](#модерация)
6. [Обновления](#обновления)
7. [Без магазина](#без-магазина)

---

## Иконки

| Файл | Размер | Где |
|------|--------|-----|
| `icon-16.png` | 16×16 | Панель |
| `icon-32.png` | 32×32 | Меню |
| `icon-48.png` | 48×48 | `chrome://extensions` |
| `icon-128.png` | 128×128 | Магазин |

Папка: `extension/icons/`

**Своя иконка:**

```bash
# Положите 128×128 в extension/icons/icon-source.png
python3 extension/scripts/generate-icons.py
make build-extension
```

**Скриншоты для магазина:** 1280×800 или 640×400, PNG/JPG — popup, текст, настройки.

---

## Сборка ZIP

Публикуется только **`extension/dist`** после production-сборки.

```bash
make build-extension
cd extension/dist
zip -r ../transcript-extension.zip .
```

> ZIP в `.gitignore` — не коммитить. Проверка: «Загрузить распакованное» → `extension/dist`.

---

## Аккаунт разработчика

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Вход в Google-аккаунт
3. Регистрационный взнос **~$5** (разово)
4. Соглашение разработчика

> Из РФ оплата картой Google часто **не проходит** — нужна зарубежная карта или аккаунт партнёра.

---

## Листинг

| Поле | Рекомендация |
|------|----------------|
| **Название** | Стенограмма видео |
| **Краткое описание** | до 132 символов (из `_locales`) |
| **Категория** | Productivity |
| **Языки** | ru + en (+ uk, de, es, fr в `_locales`) |
| **Privacy policy** | URL на GitHub — раздел «Приватность» в [README](../README.md) |
| **Distribution** | Public или Unlisted |

**Разрешения в описании:** зачем `tabCapture`, доступ к YouTube/VK/Rutube, localhost для Whisper.

---

## Модерация

- Соответствие описанию
- Нет чужих торговых марок (логотип YouTube)
- Рабочая политика конфиденциальности
- Стабильная работа

---

## Обновления

1. `"version"` в `extension/manifest.json`
2. `make build-extension` → новый ZIP
3. Dashboard → **Package** → загрузить → Submit for review

---

## Без магазина

- [GitHub Releases](https://github.com/dorofeevb1/transcript/releases) — ZIP или инструкция
- Пользователь: `make build-extension` → `extension/dist`

---

## Ссылки

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Configure icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons)

<div align="center">

# Firefox · addons.mozilla.org

Публикация «Стенограмма видео» на AMO

[![Firefox](https://img.shields.io/badge/Firefox-142%2B-FF7139?style=flat-square&logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/)
[![AMO](https://img.shields.io/badge/регистрация-бесплатно-009688?style=flat-square)](https://addons.mozilla.org/developers/)

[← Главная](../README.md) · [Chrome Web Store](PUBLISHING.md)

</div>

---

## Содержание

1. [Проверка локально](#проверка-локально)
2. [Firefox vs Android](#firefox-vs-android)
3. [Аккаунт AMO](#аккаунт-amo)
4. [Что загружать](#что-загружать)
5. [Исходный код](#исходный-код)
6. [Листинг](#листинг)
7. [URL для взносов](#url-для-взносов)
8. [Обновления](#обновления)
9. [Chrome vs Firefox](#chrome-vs-firefox)

---

## Проверка локально

```bash
make build-firefox-zip
```

| | Chrome `dist/` | Firefox `dist-firefox/` |
|---|----------------|-------------------------|
| Сборка | `npm run build` | `FIREFOX_BUILD=1` + patch manifest |
| STT / tabCapture | ✅ | заглушки (нет в бандле) |
| `gecko.id` | — | `transcript@dorofeevb1.github` |
| min version | — | **142.0** |

**Тест:**

1. `about:debugging` → **Этот Firefox**
2. **Загрузить временное дополнение** → `extension/dist-firefox/manifest.json`
3. YouTube с субтитрами → popup → **Получить текст**

---

## Firefox vs Android

| Платформа | Рекомендация |
|-----------|----------------|
| **Firefox** (десктоп) | ✅ Да |
| **Firefox для Android** | ❌ Нет (пока не тестировали) |

Без `gecko_android` дополнение **не в каталоге Android**. На телефоне часто `m.youtube.com` — отдельные `matches` нужны позже.

---

## Аккаунт AMO

1. [addons.mozilla.org](https://addons.mozilla.org/) — вход
2. [Панель разработчика](https://addons.mozilla.org/developers/) → **Submit a New Add-on**
3. [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

Регистрация **бесплатная**; из РФ обычно без проблем с оплатой (в отличие от Chrome $5).

---

## Что загружать

### Каталог AMO (публично)

1. **Distribution:** On this site
2. **Файл:** `extension/transcript-firefox.zip` (после `make build-firefox-zip`, не в git)
3. **Исходники** — см. ниже
4. Описание, скриншоты, privacy policy
5. **Submit Version**

### Только подпись (без каталога)

«On your own» + [web-ext sign](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)

---

## Исходный код

Обязательно при Vite/TypeScript. На AMO: **«Да»** на bundler/минификатор.

```bash
./scripts/package-amo-source.sh
# → extension/transcript-source-amo.zip (не коммитить)
```

В архиве: **`docs/SOURCE-AMO.md`**, **`extension/scripts/build-firefox-amo.sh`**

**Примечания для рецензента:**

```
See docs/SOURCE-AMO.md in the source archive.
Build: cd extension && ./scripts/build-firefox-amo.sh
Requires Node.js 20+, npm ci. Output: transcript-firefox.zip
Test: Firefox 142+, YouTube with captions → «Получить текст».
```

---

## Листинг

| Поле | Значение |
|------|----------|
| Сводка | Субтитры YouTube/Rutube/VK, экспорт txt/srt, бесплатно |
| Категории | Видео + Языковые инструменты |
| Экспериментальное | Нет |
| Оплата | Нет |
| Privacy | [README § Приватность](../README.md#-политика-конфиденциальности) |

CloudTips в **описании** (не в URL взносов):

`Поддержать автора: https://pay.cloudtips.ru/p/0290bc9b`

---

## URL для взносов

Только белый список Mozilla. **CloudTips не подходит.**

```
https://github.com/dorofeevb1/transcript
```

---

## Обновления

1. Версия в `manifest.json`
2. `make build-firefox-zip`
3. Upload New Version + исходники при изменении кода

---

## Chrome vs Firefox

| | Chrome | Firefox |
|---|--------|---------|
| Взнос в магазин | ~$5 | **0** |
| Донаты в листинге | — | github.com |
| Исходники | редко | **часто обязательны** |
| STT | ✅ | ❌ |
| Из РФ (оплата магазина) | сложно | ок |

---

## Ссылки

- [Extension Workshop — Publish](https://extensionworkshop.com/documentation/publish/)
- [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Репозиторий](https://github.com/dorofeevb1/transcript)

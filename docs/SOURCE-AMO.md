<div align="center">

# Исходники для AMO (Firefox)

Инструкция сборки для рецензентов Mozilla (English below in headings)

[← Главная](../README.md) · [PUBLISHING_FIREFOX](PUBLISHING_FIREFOX.md)

</div>

---

Исходный **TypeScript** в папке **`extension/`**. Готовый XPI/ZIP (`transcript-firefox.zip`) **собирается** из неё и в архив исходников **не входит**.

---

## Требования

| | |
|---|---|
| **ОС** | Linux, macOS, Windows (bash) |
| **Node.js** | **20.x или 22.x** |
| **npm** | **10+** |

```bash
node -v && npm -v
```

---

## Сборка одной командой

```bash
cd extension
chmod +x scripts/build-firefox-amo.sh
./scripts/build-firefox-amo.sh
```

→ `dist-firefox/` и `transcript-firefox.zip`

---

## Пошагово

```bash
cd extension && npm ci && npm run build:firefox
cd dist-firefox && zip -r ../transcript-firefox.zip .
```

Из корня: `make build-firefox-zip`

---

## Notes for reviewers

| | |
|---|---|
| Browser | Firefox **142+** desktop |
| Android | not supported |
| Test | YouTube with captions → extension → «Получить текст» |
| Add-on | `transcript-firefox.zip` from build above |

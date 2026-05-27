<div align="center">

# Whisper Server

Локальный STT и перевод (`127.0.0.1:8765`)

[← Главная](../README.md) · [USER_GUIDE](USER_GUIDE.md) · [DEVELOPER](DEVELOPER.md)

</div>

---

FastAPI · **faster-whisper** · Argos / Google Translate

> Только для режима **«Из аудио»** в Chrome. Субтитры работают **без** сервера.

---

## Установка

```bash
cd whisper-server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Из корня: `make install-server` · `make dev-server`

**Docker:** `cd whisper-server && docker compose up --build`

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `WHISPER_MODEL` | `small` | `base`, `small`, `medium` |
| `WHISPER_DEVICE` | `auto` | `cpu`, `cuda`, `auto` |
| `TRANSLATE_ENGINE` | `auto` | `auto`, `argos`, `google` |

---

## API

### `GET /health`

```json
{ "ok": true, "model": "small", "translate": "argos" }
```

### `POST /transcribe?language=ru`

`multipart/form-data`, поле `file` → `{ "segments": [...] }`

### `POST /translate`

```json
{ "texts": ["Hello"], "target": "ru", "source": "en" }
```

Argos: `pip install argostranslate && python install_translate_models.py`

### `GET /youtube-captions/{video_id}`

Запасной источник субтитров.

---

## Тесты

```bash
cd whisper-server && .venv/bin/python -m pytest tests/ -v
```

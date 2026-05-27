"""
Локальный сервер распознавания речи (faster-whisper). Бесплатно, без облака.
"""
import asyncio
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from translate_router import translate_backend_info, translate_texts

MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
_model = None


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        device = os.environ.get("WHISPER_DEVICE", "auto")
        if device == "auto":
            try:
                import torch

                device = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                device = "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        _model = WhisperModel(MODEL_NAME, device=device, compute_type=compute_type)
    return _model


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="YouTube Transcript Whisper Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    info = translate_backend_info()
    return {
        "ok": True,
        "model": MODEL_NAME,
        "translate": info.get("engine", "google"),
        "translatePairs": info.get("pairs", []),
    }


class TranslateRequest(BaseModel):
    texts: list[str] = Field(..., max_length=8000)
    target: str
    source: str = "auto"


_TRANSLATE_BATCH = 20


@app.post("/translate")
async def translate(body: TranslateRequest):
    """Перевод: локальный Argos (если установлен) или Google."""
    try:
        if not body.texts:
            return {"ok": True, "texts": []}
        out: list[str] = []
        for i in range(0, len(body.texts), _TRANSLATE_BATCH):
            batch = body.texts[i : i + _TRANSLATE_BATCH]
            part = await asyncio.to_thread(
                translate_texts, batch, body.target, body.source
            )
            out.extend(part)
        info = translate_backend_info()
        return {"ok": True, "texts": out, "engine": info.get("engine", "google")}
    except Exception as e:
        return JSONResponse(status_code=502, content={"ok": False, "error": str(e), "texts": []})


@app.get("/youtube-captions/{video_id}")
def youtube_captions(video_id: str, language: str = Query("auto")):
    """Запасной источник субтитров через youtube-transcript-api.

    Порядок попыток:
    1. Запрошенный язык (если не 'auto').
    2. Любой доступный транскрипт (первый в списке).
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        api = YouTubeTranscriptApi()

        # Собираем список кандидатов
        candidates: list[str] = []
        if language and language not in ("auto", ""):
            candidates.append(language)
        candidates.append("ru")
        candidates.append("en")

        transcript = None
        last_err: Exception | None = None

        # Сначала пробуем известные языки
        try:
            transcript = api.fetch(video_id, languages=candidates)
        except Exception as e:
            last_err = e

        # Fallback: берём первый доступный транскрипт
        if transcript is None:
            try:
                tlist = api.list(video_id)
                first = next(iter(tlist))
                transcript = first.fetch()
            except Exception as e:
                last_err = e

        if transcript is None:
            raise last_err or RuntimeError("Субтитры недоступны")

        # API 0.6 → .snippets; API 0.5 → итерируемый объект со start/duration/text
        try:
            snippets = transcript.snippets
        except AttributeError:
            snippets = transcript  # type: ignore[assignment]

        segments = [
            {
                "start": s.start,
                "end": s.start + s.duration,
                "text": s.text,
            }
            for s in snippets
        ]
        lang_code = getattr(transcript, "language_code", language)
        return {
            "videoId": video_id,
            "language": lang_code,
            "segments": segments,
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "segments": []})


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Query("ru"),
):
    suffix = ".webm"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1]

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        model = get_model()
        lang: Optional[str] = None if language == "auto" else language
        segments_iter, _info = model.transcribe(
            tmp_path,
            language=lang,
            vad_filter=True,
        )
        segments = []
        for seg in segments_iter:
            text = (seg.text or "").strip()
            if not text:
                continue
            segments.append(
                {
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "text": text,
                }
            )
        return JSONResponse({"segments": segments})
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "segments": []},
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)

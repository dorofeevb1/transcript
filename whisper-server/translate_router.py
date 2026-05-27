"""Маршрутизация: локальный Argos → Google (fallback)."""
from __future__ import annotations

import os

from gtx_translate import translate_texts as translate_google

ENGINE = os.environ.get("TRANSLATE_ENGINE", "auto").lower()


def translate_texts(texts: list[str], target: str, source: str = "auto") -> list[str]:
    if not texts:
        return []
    if ENGINE == "google":
        return translate_google(texts, target, source)

    if ENGINE in ("auto", "argos", "local"):
        from local_translate import is_local_available, translate_texts_local

        if is_local_available(source, target):
            return translate_texts_local(texts, target, source)
        if ENGINE in ("argos", "local"):
            raise RuntimeError(
                "Локальный перевод выбран, но языковая пара не установлена. "
                "python install_translate_models.py"
            )

    return translate_google(texts, target, source)


def translate_backend_info() -> dict:
    from local_translate import _load_argos, list_installed_pairs

    if _load_argos() and list_installed_pairs():
        return {"engine": "argos", "pairs": list_installed_pairs()}
    if ENGINE == "google":
        return {"engine": "google", "pairs": []}
    return {"engine": "google", "pairs": [], "local": "not_installed"}

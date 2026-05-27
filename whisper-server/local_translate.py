"""Офлайн-перевод через Argos Translate (быстро, без интернета после установки моделей)."""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

_ARGOS = None
_ARGOS_ERR: Optional[str] = None

LANG_ALIASES = {
    "zh": "zh",
    "zh-cn": "zh",
    "zh-tw": "zh",
}


def normalize_lang(code: str) -> str:
    if not code or code == "auto":
        return "auto"
    c = code.strip().lower().replace("_", "-")
    return LANG_ALIASES.get(c, c.split("-")[0])


def _load_argos():
    global _ARGOS, _ARGOS_ERR
    if _ARGOS is True:
        return True
    if _ARGOS is False:
        return False
    try:
        import argostranslate.translate  # noqa: F401

        _ARGOS = True
        _ARGOS_ERR = None
        return True
    except ImportError as e:
        _ARGOS = False
        _ARGOS_ERR = str(e)
        return False


def list_installed_pairs() -> list[str]:
    if not _load_argos():
        return []
    import argostranslate.package

    return sorted(
        f"{p.from_code}->{p.to_code}" for p in argostranslate.package.get_installed_packages()
    )


def _get_translation(from_code: str, to_code: str):
    import argostranslate.translate

    from_lang = next(
        (l for l in argostranslate.translate.get_installed_languages() if l.code == from_code),
        None,
    )
    if not from_lang:
        return None
    return from_lang.get_translation(to_code)


def resolve_source_lang(source: str, target: str) -> Optional[str]:
    src = normalize_lang(source)
    tgt = normalize_lang(target)
    if src == tgt:
        return src
    if src != "auto":
        return src if _get_translation(src, tgt) else None
    for guess in ("en", "ru", "de", "fr", "es", "uk"):
        if guess != tgt and _get_translation(guess, tgt):
            return guess
    return None


def is_local_available(source: str, target: str) -> bool:
    if not _load_argos():
        return False
    src = resolve_source_lang(source, target)
    tgt = normalize_lang(target)
    return bool(src and src != tgt and _get_translation(src, tgt))


def _translate_one(text: str, translation) -> str:
    t = (text or "").strip()
    if not t or t == "[тишина]":
        return text
    return translation.translate(t)


def translate_texts_local(
    texts: list[str], target: str, source: str = "auto"
) -> list[str]:
    if not _load_argos():
        raise RuntimeError(
            _ARGOS_ERR or "argostranslate не установлен (pip install argostranslate)"
        )
    tgt = normalize_lang(target)
    src = resolve_source_lang(source, target)
    if not src:
        raise RuntimeError(
            f"Нет локальной модели для перевода → {tgt}. "
            f"Запустите: python install_translate_models.py"
        )
    if src == tgt:
        return list(texts)

    translation = _get_translation(src, tgt)
    if translation is None:
        raise RuntimeError(f"Пара {src}→{tgt} не установлена")

    # Большие пакеты (минутные блоки) — меньше потоков, иначе Argos «висит» без прогресса.
    if len(texts) > 12:
        workers = 2
    elif len(texts) > 4:
        workers = min(4, max(1, os.cpu_count() or 2))
    else:
        workers = min(8, max(1, os.cpu_count() or 4))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda t: _translate_one(t, translation), texts))

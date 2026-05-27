#!/usr/bin/env python3
"""Скачать офлайн-модели Argos Translate (en↔ru и др.)."""
from __future__ import annotations

# Популярные пары для YouTube-субтитров
DEFAULT_PAIRS = [
    ("en", "ru"),
    ("ru", "en"),
    ("en", "uk"),
    ("uk", "en"),
    ("en", "de"),
    ("de", "en"),
    ("en", "fr"),
    ("fr", "en"),
    ("en", "es"),
    ("es", "en"),
]


def main() -> None:
    import argostranslate.package
    import argostranslate.translate

    print("Обновление индекса пакетов Argos…")
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    installed = {
        (p.from_code, p.to_code) for p in argostranslate.package.get_installed_packages()
    }

    for from_code, to_code in DEFAULT_PAIRS:
        key = f"{from_code}->{to_code}"
        if (from_code, to_code) in installed:
            print(f"  ✓ {key} уже установлена")
            continue
        pkg = next(
            (p for p in available if p.from_code == from_code and p.to_code == to_code),
            None,
        )
        if not pkg:
            print(f"  ✗ {key} — нет в индексе")
            continue
        print(f"  → загрузка {key}…")
        path = pkg.download()
        argostranslate.package.install_from_path(path)
        print(f"  ✓ {key}")

    pairs = []
    for lang in argostranslate.translate.get_installed_languages():
        for t in lang.translations_from:
            pairs.append(f"{lang.code}->{t.to_lang.code}")
    print("\nУстановлено:", ", ".join(sorted(set(pairs))) or "(пусто)")


if __name__ == "__main__":
    main()

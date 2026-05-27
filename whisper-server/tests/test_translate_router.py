from unittest.mock import patch

from translate_router import translate_backend_info, translate_texts


def test_translate_uses_local_when_available():
    with (
        patch("local_translate.is_local_available", return_value=True),
        patch("local_translate.translate_texts_local", return_value=["Привет"]),
    ):
        out = translate_texts(["Hello"], "ru", "en")
    assert out == ["Привет"]


def test_backend_info_argos():
    with (
        patch("local_translate._load_argos", return_value=True),
        patch("local_translate.list_installed_pairs", return_value=["en->ru"]),
    ):
        info = translate_backend_info()
    assert info["engine"] == "argos"
    assert "en->ru" in info["pairs"]

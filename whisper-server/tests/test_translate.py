from fastapi.testclient import TestClient

from main import app


def test_translate_empty():
    client = TestClient(app)
    r = client.post("/translate", json={"texts": [], "target": "ru"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["texts"] == []


def test_extract_single():
    from gtx_translate import _extract_single

    data = [[["Привет", "Hello", None, None, 3]], None, "en"]
    assert _extract_single(data) == "Привет"

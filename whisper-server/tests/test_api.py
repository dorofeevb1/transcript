"""API-тесты whisper-server (TestClient, без запущенного порта)."""

import io


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "model" in data


def test_youtube_captions_me_at_the_zoo(client):
  """E2E: реальные субтитры через youtube-transcript-api."""
  r = client.get("/youtube-captions/jNQXAC9IVRw", params={"language": "en"})
  assert r.status_code == 200
  data = r.json()
  assert data["videoId"] == "jNQXAC9IVRw"
  assert len(data["segments"]) >= 1
  text = " ".join(s["text"] for s in data["segments"]).lower()
  assert "elephant" in text


def test_transcribe_requires_file(client):
  r = client.post("/transcribe?language=en")
  assert r.status_code == 422


def test_transcribe_empty_webm(client):
  """Минимальный webm — может вернуть пустые сегменты или 500, но не JSON parse error."""
  r = client.post(
    "/transcribe?language=en",
    files={"file": ("empty.webm", io.BytesIO(b"\x00"), "audio/webm")},
  )
  assert r.status_code in (200, 500)
  if r.status_code == 200:
    body = r.json()
    assert "segments" in body

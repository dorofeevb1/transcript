"""Google Translate (client=gtx) — для прокси с локального сервера."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
from urllib.parse import urlencode

import httpx

GTX_SINGLE = "https://translate.googleapis.com/translate_a/single"
GTX_BATCH = "https://translate.googleapis.com/translate_a/t"
SEG_SEP = "\u2063"
CHUNK_SIZE = 50
PARALLEL = 10

GTX_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://translate.google.com/",
}


def _extract_single(data) -> str:
    if not isinstance(data, list) or not data or not isinstance(data[0], list):
        raise ValueError("Неверный формат ответа Google Translate")
    parts = []
    for item in data[0]:
        if isinstance(item, list) and item and isinstance(item[0], str):
            parts.append(item[0])
    return "".join(parts)


def _post_batch(
    client: httpx.Client, chunk: list[str], target: str, source: str
) -> Optional[list[str]]:
    data: list[tuple[str, str]] = [
        ("client", "gtx"),
        ("sl", source or "auto"),
        ("tl", target),
        ("dt", "t"),
    ]
    for t in chunk:
        data.append(("q", t))
    body = urlencode(data)
    headers = {**GTX_HEADERS, "Content-Type": "application/x-www-form-urlencoded"}
    r = client.post(GTX_BATCH, content=body, headers=headers)
    if r.status_code != 200:
        return None
    body = r.json()
    if isinstance(body, list) and len(body) == len(chunk) and all(isinstance(x, str) for x in body):
        return body
    return None


def _get_separator(
    client: httpx.Client, chunk: list[str], target: str, source: str
) -> Optional[list[str]]:
    joined = SEG_SEP.join(chunk)
    params = {
        "client": "gtx",
        "sl": source or "auto",
        "tl": target,
        "dt": "t",
        "q": joined,
    }
    r = client.get(GTX_SINGLE, params=params, headers=GTX_HEADERS)
    if r.status_code != 200:
        return None
    translated = _extract_single(r.json())
    parts = translated.split(SEG_SEP)
    return parts if len(parts) == len(chunk) else None


def _translate_chunk(
    client: httpx.Client, chunk: list[str], target: str, source: str
) -> list[str]:
    batch = _post_batch(client, chunk, target, source)
    if batch is not None:
        return batch
    sep = _get_separator(client, chunk, target, source)
    if sep is not None:
        return sep
    out: list[str] = []
    for text in chunk:
        params = {
            "client": "gtx",
            "sl": source or "auto",
            "tl": target,
            "dt": "t",
            "q": text,
        }
        r = client.get(GTX_SINGLE, params=params, headers=GTX_HEADERS)
        r.raise_for_status()
        out.append(_extract_single(r.json()))
    return out


def translate_texts(texts: list[str], target: str, source: str = "auto") -> list[str]:
    if not texts:
        return []
    chunks: list[list[str]] = []
    for i in range(0, len(texts), CHUNK_SIZE):
        chunks.append(texts[i : i + CHUNK_SIZE])

    timeout = httpx.Timeout(60.0, connect=15.0)
    with httpx.Client(timeout=timeout) as client:
        if len(chunks) == 1:
            return _translate_chunk(client, chunks[0], target, source)

        results: list[list[str]] = [[] for _ in chunks]
        with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
            futures = {
                pool.submit(_translate_chunk, client, chunk, target, source): i
                for i, chunk in enumerate(chunks)
            }
            for fut in as_completed(futures):
                idx = futures[fut]
                results[idx] = fut.result()
    return [t for part in results for t in part]

# Architecture — youtube-transcript-extension

Target architecture for v2.0. Cross-platform (YouTube / Rutube / VK), MV3,
Chrome + Firefox, with an optional local Whisper STT server.

## 1. High-level diagram

```
   ┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
   │  YouTube watch page │    │   Rutube video page │    │   VK video page  │
   └──────────┬──────────┘    └──────────┬──────────┘    └────────┬─────────┘
              │ content scripts (ISOLATED + MAIN)                  │
              ▼                          ▼                         ▼
           video-page.ts            video-page.ts          video-page.ts +
                                                          vk-net-hook.ts (MAIN)
              │                          │                         │
              └──────────────────────────┼─────────────────────────┘
                                         │ runtime.sendMessage
                                         ▼
         ┌─────────────────────────────────────────────────────────┐
         │            Background Service Worker (Chrome)            │
         │            Background module (Firefox 142+)              │
         │   – platform router (Platform interface)                 │
         │   – translate gateway → translate.googleapis.com         │
         │   – STT gateway → 127.0.0.1:8765 (opt-in, Chrome only)   │
         └────────┬────────────────────────────┬───────────────────┘
                  │                            │
                  ▼                            ▼
           Popup UI                  Offscreen document
           (chunks, export,          (Chrome only:
            translate, history)       tabCapture for STT)
                  │
                  ▼
           chrome.storage.local (history + transcript cache)
           chrome.storage.sync  (settings: language, server URL)
```

## 2. Layers

| Layer          | Responsibility                                      | Where                       |
|----------------|-----------------------------------------------------|-----------------------------|
| presentation   | Popup, options, i18n (6 langs), theming             | `src/ui/popup`, `src/ui/options` |
| application    | Use cases: `getTranscript`, `translate`, `export`   | `src/app/`                  |
| domain         | `Transcript`, `Segment`, `Platform`, `STTJob` types | `src/domain/`               |
| infrastructure | Platform adapters, http, storage, STT, offscreen    | `src/infra/`                |
| shared         | Logger, i18n, errors, build-flag guards             | `src/shared/`               |

## 3. Messaging contract

```ts
// src/domain/messages.ts
export type Request =
  | { type: 'SW_PING' }
  | { type: 'GET_TRANSCRIPT'; tabId: number; platform: PlatformId; videoUrl: string }
  | { type: 'GET_PROGRESS'; jobId: string }
  | { type: 'CANCEL_STT'; jobId: string }
  | { type: 'TRANSLATE'; segments: Segment[]; from: Lang; to: Lang }
  | { type: 'FETCH_REMOTE_TEXT'; url: string }
  | { type: 'RELEASE_TAB_CAPTURE'; tabId: number };

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };
```

## 4. Storage layer

| Bucket                 | What                                            | TTL  |
|------------------------|-------------------------------------------------|------|
| `chrome.storage.sync`  | UI language, transcript display mode, Whisper server URL | none |
| `chrome.storage.local` | History (last 50 transcripts), transcript cache | 7d   |

Repository: `TranscriptRepo`, `HistoryRepo`, `SettingsRepo` in `src/infra/storage/`.

## 5. Platform adapter

The single most important abstraction in this extension.

```ts
// src/domain/platform.ts
export type PlatformId = 'youtube' | 'rutube' | 'vk';

export interface Platform {
  id: PlatformId;
  matches(url: URL): boolean;
  getVideoId(url: URL): string | null;
  fetchCaptions(ctx: PageCtx, signal: AbortSignal): Promise<Transcript | null>;
}
```

Three implementations live in `src/infra/platform/`:

- `youtube.ts` — uses Innertube `get_transcript` and `player` endpoints; can fall
  back to the page-rendered "Stenogram" panel.
- `rutube.ts` — DOM + private-video query param (`?p=`) handling.
- `vk.ts` — reads `window.__vkSubtitleUrls` populated by `vk-net-hook.ts`
  (MAIN-world hook documented in `SECURITY.md`).

The MAIN-world VK hook is the only piece of code that runs outside the
ISOLATED world. Its contract: capture-only, never mutate, never exfiltrate.

## 6. Browser split — Chromium vs Firefox

Firefox 142+ ships MV3 but lacks `offscreen`, `tabCapture`, and some service
worker behaviors. The codebase handles this with a Vite-time split:

```
src/infra/stt/
  tab-capture.chromium.ts    ← used in Chrome builds
  tab-capture.firefox.ts     ← stub: throws NotSupportedError
src/infra/offscreen/
  offscreen-doc.chromium.ts  ← used in Chrome builds
  offscreen-doc.firefox.ts   ← stub
src/ui/popup/
  popup-fetch.chromium.ts
  popup-fetch.firefox.ts
```

`FIREFOX_BUILD=1` env flag flips Vite resolution. `scripts/patch-firefox-manifest.mjs`
strips `offscreen`/`tabCapture` permissions and adds `browser_specific_settings.gecko`.

## 7. STT adapter (optional Whisper)

```ts
interface STT {
  available(): Promise<boolean>;
  transcribe(audio: Blob, lang: Lang, signal: AbortSignal): Promise<Transcript>;
}
```

Implementation `LocalWhisper` posts to `http://127.0.0.1:8765/transcribe` (only
host_permission for this origin). If the user hasn't started the server, the
popup shows the "Server not running — see Whisper guide" empty-state and the
captions path remains usable on its own.

## 8. Error boundaries & logging

`src/shared/logger.ts` with levels. No `console.log` in shipped code.
All cross-boundary calls wrap errors into `ErrorCode`:
`NO_CAPTIONS | PLATFORM_UNSUPPORTED | TRANSLATE_FAILED | STT_UNAVAILABLE |
TIMEOUT | RATE_LIMITED | INTERNAL`.

## 9. Build pipeline

- `npm run build` → Chrome `extension/dist/`
- `npm run build:firefox` → Firefox `extension/dist-firefox/`
- AMO source bundle: `scripts/build-firefox-amo.sh` (reproducible).
- CI: lint → typecheck → unit → e2e → both builds → zip artifacts.

## 10. Target folder layout

```
extension/src/
  app/
    use-cases/        getTranscript.ts, translate.ts, exportFile.ts, startSTT.ts
    container.ts
  domain/
    messages.ts, transcript.ts, platform.ts, errors.ts
  infra/
    chrome/           tabs.ts, scripting.ts, storage.ts
    platform/         youtube.ts, rutube.ts, vk.ts
    http/             client.ts
    translate/        google.ts, argos.ts
    stt/              tab-capture.chromium.ts, tab-capture.firefox.ts,
                      whisper-client.ts
    offscreen/        offscreen-doc.chromium.ts, offscreen-doc.firefox.ts
    storage/          history.repo.ts, transcript.repo.ts, settings.repo.ts
  ui/
    popup/            popup.html, popup.ts, popup.css,
                      popup-fetch.chromium.ts, popup-fetch.firefox.ts
    options/          options.html, options.ts
    offscreen/        offscreen.html (Chrome only)
  content/
    video-page.ts     (ISOLATED, all platforms)
    vk-net-hook.ts    (MAIN, VK only, capture-only)
  background/
    service-worker.ts (entry)
  shared/
    logger.ts, i18n.ts, env.ts (BUILD_TARGET flag)
```

## 11. Trade-offs

- **MAIN-world VK hook.** Necessary because VK's player makes its subtitle
  requests in page context. Documented in `SECURITY.md`; CWS reviewers can
  read the file inline.
- **Whisper server is optional and local-only.** Avoids cloud STT costs and
  privacy footprint; advanced users opt in by running the FastAPI app.
- **No popup framework.** Same call as the sibling extension — bundle stays
  under 80KB, audit surface is small.

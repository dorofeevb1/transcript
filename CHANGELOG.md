# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.2] — 2026-05-27

### Changed
- All `cd whisper-server && python main.py` hints across 6 locales replaced with a "Download the local server from GitHub Releases" message. The status line in the popup now renders a clickable `↗ Скачать` link pointing at `github.com/dorofeevb1/transcript/releases/latest` whenever the local server is unreachable. Users no longer need to clone the repo or install Python.

### Added
- `whisper-server/whisper-server.spec`: PyInstaller config that produces a single-file `whisper-server[.exe]` binary embedding faster-whisper, uvicorn, and FastAPI. Model weights are downloaded by faster-whisper on first run.
- `Makefile` target `build-server-binary`: local one-OS build.
- `.github/workflows/release-whisper.yml`: tag-triggered (`whisper-v*`) CI matrix that builds the binary on ubuntu-latest, windows-latest and macos-latest, then publishes all three as assets of a single GitHub Release.
- `extension/src/shared/whisper-download.ts`: single source of truth for the download URL constant.

## [1.8.1] — 2026-05-27

### Fixed
- YouTube captions now work without whisper-server even on POT-protected videos (the 2024 anti-replay change that broke baseUrls for anonymous visitors). New `yt-net-hook.ts` runs in MAIN world on `youtube.com` and observes the player's own `/api/timedtext` requests — those URLs are already POT/cookie-signed by YouTube. On "Get transcript" we re-fetch the captured URL; if none yet (user never toggled CC), we click the `.ytp-subtitles-button` programmatically, wait for the player to fetch, then restore the user's CC preference. Falls through to legacy strategies only if no URL is ever captured.
- Removed the unconditional "Либо запустите: cd whisper-server && python main.py" suffix that was appended to every caption error message via `errFetchCaptionsWhisper`. Whisper-server step itself now runs only when `serverUrl` is set.

## [1.8.0] — 2026-05-27

### Changed
- Translation pipeline ~5–10× faster on long videos:
  - `proxy.ts`: GTX sub-batches in `translateChunkWithFallbacks` now run in parallel (pool of 2 for Google, 4 for self-hosted server) instead of a sequential `for`.
  - `proxy.ts`: `translateChunkViaServer` parallelizes server sub-chunks (pool of 4) instead of awaiting them one by one.
  - `by-minute.ts`: raised `parallel` (3→6) and `packParallel` (2→4) and `chunkSize` (16→24) when a local whisper-server is configured. Google path unchanged to avoid 429.
  - `by-minute.ts`: dedupe minute-blocks globally before packing — repeating intros, "[Music]" markers, or silent stretches now hit the network once instead of once per pack.

## [1.0.0] — 2026-05-27

### Added
- Layered architecture: `app/use-cases`, `domain`, `infra/platform`, `infra/stt`, `shared/`.
- `Platform` adapters for YouTube, Rutube, VK behind a single interface.
- `STT` interface with `LocalWhisper` implementation (`infra/stt/whisper-client.ts`).
- `AbortController` plumbing in `getTranscript` and `translate` use cases.
- `shared/logger.ts` — prod-silent `info`, console-only `warn`/`error`.
- Content Security Policy: `script-src 'self'; object-src 'self'; base-uri 'self'; form-action 'self';`.
- Design system with light/dark/auto theme + manual toggle, WCAG AA contrast.
- Redesigned popup (360px) and options page with per-field auto-save.
- Store assets: icons 16/32/48/128, promo 440×280, marquee 1400×560, 5 screenshots × 2 locales.
- `SECURITY.md` with VK MAIN-world hook threat model.
- `docs/PRIVACY_POLICY.md`, `store-assets/cws-justification.md`.
- 6 locales: `en, ru, de, es, fr, uk`.
- Playwright config + first E2E spec (`extension/e2e/popup.spec.ts`).
- Plausible analytics stub (opt-out, no remote sink until `PLAUSIBLE_HOST` configured).
- Pro gating helpers (`shared/monetization.ts`).

### Changed
- HTML parsing in `inject-page.ts` (lines 226, 671, 702, 736) moved from regex to DOMParser.
- Firefox build (`scripts/patch-firefox-manifest.mjs`) strips `offscreen` and `tabCapture` cleanly.

### Security
- See `SECURITY.md`. CSP added. No inline scripts. No `innerHTML` write-side sinks.
- `npm audit` clean except 2 dev-only highs in `@crxjs/vite-plugin@2.4.0` transitive deps (rollup, esbuild) — not shipped.

### Known limitations
- Coverage on new Phase C files (`app/use-cases/*`, `infra/analytics/plausible.ts`, `infra/platform/{index,rutube,vk}.ts`) pending follow-up tests.
- `SECURITY.md` placeholder email needs replacement before publish.

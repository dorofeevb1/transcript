# Chrome Web Store — Permission Justifications

Paste each block into the matching field of the CWS developer dashboard
when submitting the extension.

## Single purpose

> Extract transcripts from YouTube, Rutube, and VK videos, with optional
> offline speech-to-text via a user-run local Whisper server.

## Permission: `storage`

> Stores user preferences (UI language, transcript display mode, optional
> local Whisper server URL) and a short cache of recently fetched
> transcripts so the user does not pay the network cost twice. All storage
> is local to the user's browser. Nothing is sent to a developer server.

## Permission: `scripting`

> Used to inject small, audited functions into the active video tab to
> read public player metadata (Innertube response on YouTube, `play/options`
> on Rutube, page state on VK). The extension never injects arbitrary user
> input. The injected functions live in `extension/src/content/inject-page.ts`
> and the call sites are in `extension/src/lib/innertube.ts`,
> `extension/src/lib/vk-captions.ts`, and
> `extension/src/lib/rutube-captions-via-tab.ts`.

## Permission: `activeTab`

> Lets the popup identify which video page the user is currently viewing,
> so it can fetch the matching transcript. The extension does not query or
> read any tab the user has not actively opened.

## Permission: `tabCapture`

> Required for the **optional** offline speech-to-text feature. When a
> video has no captions and the user has installed and started the bundled
> local Whisper server, `tabCapture` records the current tab's audio so the
> extension can POST it to `http://127.0.0.1:8765/transcribe` for
> transcription on the user's own machine. The recorded audio is never
> sent to a remote server.
>
> `tabCapture` is never invoked automatically. It only fires when:
>
> 1. The user has manually started the Whisper FastAPI server on
>    localhost.
> 2. The user clicks the "Transcribe via Whisper" button in the popup.
> 3. The current tab is on a supported video platform (YouTube, Rutube,
>    or VK).
>
> Recording stops as soon as the transcription job finishes or the user
> cancels. The Firefox build of the extension does not include
> `tabCapture` at all — it is stripped out at build time by
> `scripts/patch-firefox-manifest.mjs`.

## Permission: `offscreen`

> Chrome's `tabCapture` API can only be consumed from a document context,
> not directly from a service worker. The extension creates a single
> short-lived offscreen document (reason: `USER_MEDIA`) that holds the
> `MediaStream` from `tabCapture` long enough to encode the audio and send
> it to the local Whisper server, then closes itself. Source:
> `extension/src/lib/offscreen-doc.chromium.ts`.

## Host permission: `*://*.youtube.com/*`, `*://youtu.be/*`

> The extension's primary use case is fetching transcripts from YouTube.
> It calls YouTube's public `timedtext` and Innertube endpoints to retrieve
> caption tracks. No user credentials are sent beyond what the browser
> would normally include.

## Host permission: `*://rutube.ru/*`, `*://*.rutube.ru/*`

> Rutube exposes captions via its `play/options` JSON endpoint and a
> public subtitle CDN (`pic.rtbcdn.ru`). The extension fetches both as
> ordinary HTTP requests; no Rutube account is required.

## Host permission: `*://vk.com/*`, `*://*.vk.com/*`, `*://vkvideo.ru/*`

> VK's web player issues its subtitle requests in page context. The
> extension's MAIN-world content script (`vk-net-hook.ts`) observes the
> URLs of those requests (capture-only — never modifies or replays them)
> and the ISOLATED-world script then fetches the subtitle file. See
> `SECURITY.md` for the full threat model of this hook.

## Host permission: `*://*.okcdn.ru/*`, `*://*.vkuser.net/*`, `*://*.mycdn.me/*`

> VK serves subtitle and media files from these CDNs. The extension fetches
> already-known subtitle URLs from them. No POSTs, no user data attached.

## Host permission: `https://translate.googleapis.com/*`

> The optional translate action sends user-selected transcript segments to
> Google's public translate endpoint. Translation is not enabled by
> default — it requires an explicit click in the popup.

## Host permission: `http://127.0.0.1:8765/*`, `http://localhost:8765/*`

> Loopback address for the user-run Whisper STT server. Loopback means the
> traffic never leaves the user's machine; it is the standard way an
> extension talks to a local helper. Used only when the user has opted
> into the STT feature.

## Remote code

> The extension contains **no remote code**. Its content security policy
> is `script-src 'self'; object-src 'self';` — Chrome will refuse to
> execute any code that did not ship in the extension bundle. All
> JavaScript is bundled at build time by Vite.

## Data usage disclosure

> - **The extension does NOT collect:** PII, health data, financial data,
>   authentication data, personal communications, location, web history,
>   user activity logs.
> - **The extension stores locally:** transcripts the user has fetched
>   (cache and history), the user's settings.
> - **The extension sends to third parties only when the user clicks:**
>   transcript text to Google Translate, audio to the user's own local
>   Whisper server on loopback.
> - **The extension does NOT sell user data, transfer user data to third
>   parties for unrelated purposes, or use user data to determine
>   creditworthiness.**

## Privacy policy URL

> See `docs/PRIVACY_POLICY.md` in the source repository. This file should
> also be hosted at a public, persistent URL before submission; the
> URL goes in the "Privacy policy URL" field on the CWS dashboard.

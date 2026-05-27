# Privacy Policy — youtube-transcript-extension

_Last updated: 2026-05-27._

This document is the formal, publishable privacy policy for the
youtube-transcript-extension browser extension. The extension is open
source; the source of truth for the behaviour described here is the code in
this repository.

## TL;DR

- No developer-owned servers. No analytics. No advertising.
- All data stays on your device unless you explicitly click an action that
  contacts a third-party site (YouTube, Rutube, VK, Google Translate, or
  your own local Whisper server).
- No personally identifying information is collected.

## Data we collect

**None.** The extension does not transmit any data to the developer. There
is no telemetry endpoint, no error-reporting beacon, no analytics pixel.

## Data we store on your device

| Storage area           | Contents                                                  | Retention |
|------------------------|-----------------------------------------------------------|-----------|
| `chrome.storage.local` | Up to 50 recent transcript results, cached by video ID    | 7 days    |
| `chrome.storage.local` | History list (video ID, title, timestamp)                 | until cleared |
| `chrome.storage.sync`  | UI language, transcript display mode, Whisper server URL  | until cleared |

You can clear all of this by removing the extension. There is no remote
account to delete because there is no account.

## Data we send to third parties (only on your action)

### YouTube, Rutube, VK
When you open the popup on a supported video page and click "Get
transcript", the extension reads the caption track URL from the page (or
fetches it directly from the platform's public caption endpoint) and
downloads the captions. No identifying information is added to those
requests beyond what the browser would normally send.

### Google Translate (`translate.googleapis.com`)
If you click the translate action, the segments you have selected are sent
to Google's public translate endpoint. The extension does not add any
identifier. See Google's privacy policy for what Google does with that
traffic.

### Your local Whisper server (`127.0.0.1:8765`)
If you opt into Speech-to-Text by installing and running the included
FastAPI server, the extension uses `chrome.tabCapture` to record the
current tab's audio, then POSTs the audio to `http://127.0.0.1:8765/`.
This stays on your machine — `127.0.0.1` is the loopback address. The
extension never contacts a cloud STT service.

## Why we ask for `tabCapture`

`tabCapture` is the Chrome API that lets the extension grab the audio of
the active tab. We need it for the **optional** Whisper STT mode: when a
video has no captions and the user has opted into the local Whisper server,
the extension records the tab's audio and sends it to `127.0.0.1:8765` for
transcription on the user's own machine.

`tabCapture` is **never** invoked automatically. It only fires when:

1. The user has installed and started the bundled Whisper server.
2. The user has clicked the "Transcribe via Whisper" action in the popup.
3. The current tab is on one of the supported video platforms.

The recorded audio is never sent off the user's machine — only to
`127.0.0.1` (loopback). Recording stops automatically when the
transcription job completes or the user cancels.

The Firefox build of this extension does not include `tabCapture` at all:
the Vite build strips it out via `scripts/patch-firefox-manifest.mjs`.

## Why we ask for each host permission

| Host pattern                       | Reason                                                |
|------------------------------------|--------------------------------------------------------|
| `https://www.youtube.com/*`        | Fetch caption tracks and Innertube player metadata    |
| `https://youtube.com/*`            | Same, alternate canonical host                         |
| `https://youtu.be/*`               | Short-URL redirects for shared videos                  |
| `https://rutube.ru/*` (+ subs)     | Fetch Rutube `play/options` for caption track URL      |
| `https://vk.com/*` (+ subs)        | Read VK player page for subtitle endpoints             |
| `https://vkvideo.ru/*`             | VK's standalone video host                             |
| `https://*.okcdn.ru/*`             | VK serves subtitle files from this CDN                 |
| `https://*.vkuser.net/*`           | Alternate VK media CDN                                 |
| `https://*.mycdn.me/*`             | Alternate VK media CDN                                 |
| `https://translate.googleapis.com/*` | Translate action (only when the user clicks)        |
| `http://127.0.0.1:8765/*`          | Loopback to the user-run Whisper server                |
| `http://localhost:8765/*`          | Loopback alias for the same server                     |

## Children's privacy

The extension is not directed at children under 13. It does not knowingly
collect data from anyone.

## Changes

If we ever change this policy, the new version will be committed to this
repository with a new "Last updated" date and a CHANGELOG entry.

## Contact

Security: see `SECURITY.md`.
General: open an issue on the project repository.

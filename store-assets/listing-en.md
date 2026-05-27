# Chrome Web Store listing — EN

## Title (≤45 chars)

**Universal Video Transcript — YouTube + more**

(44 chars. "Universal Video Transcript" is the strongest keyword bundle for cross-platform intent; "YouTube" anchors the head term.)

Alternates:
- `Video Transcript: YouTube, Rutube, VK` (37)
- `Transcripts for YouTube, Rutube, VK — free` (42)

## Short description (≤132 chars)

**Free transcripts from YouTube, Rutube, and VK. Export TXT/SRT/JSON, translate, optional offline Whisper STT.**

(108 chars. Pulls the three platforms and the four headline features into one line.)

## Full description (≤1500 chars)

Get the full text of any video on YouTube, Rutube, or VK — for free, without copy-pasting from the player.

The extension reads the video's existing caption track (manual or auto-generated) and shows the transcript by minute or by phrase. Export as TXT, SRT, or JSON. Translate to any language with one click. Optional: when a video has no captions, install the bundled local Whisper server and transcribe from audio on your own machine.

Features:

- One popup that works on YouTube, Rutube, and VK Video
- Two display modes — by minute or by phrase
- Copy to clipboard, export to TXT, SRT, or JSON
- Translation via Google Translate or local Argos (offline, in-browser tab)
- 6 UI languages — English, Russian, Ukrainian, German, Spanish, French
- Light, dark, system theme
- Local history and cache for fast re-opening

Optional offline speech-to-text:

- Bundled FastAPI Whisper server, you run it locally
- Argos for offline translation after model download
- Audio never leaves your machine

For students, journalists, researchers, content creators, language learners, and anyone who needs a searchable text of what was actually said.

Privacy: no developer server, no analytics, no remote code. Transcripts and settings are stored only in your browser's local storage. Translation uses Google Translate only when you click "Translate". Whisper STT runs entirely on your machine on loopback.

Source is open. Issues and support: see the GitHub repository linked from the extension homepage.

## Category

**Productivity** (primary). Accessibility as secondary if available — transcripts are an a11y feature.

## Search tags (5)

1. youtube transcript
2. rutube transcript
3. vk video transcript
4. youtube to srt
5. whisper offline transcription

## Permission justifications

**storage** — Saves your preferences (UI language, display mode, optional Whisper server URL) and a local cache of recently fetched transcripts so the same video opens instantly the second time. Everything stays in your browser.

**scripting** — Injects small static functions into the open video tab to read public player metadata: YouTube's Innertube response, Rutube's `play/options`, VK's page state. The functions are shipped in the bundle; no user input ever becomes code.

**activeTab** — Lets the popup identify which video tab is open so it can fetch the matching transcript. The extension does not touch tabs you didn't open.

**tabCapture** — Required only for the optional "From audio" mode. When a video has no captions and the user has started the local Whisper server, this records the current tab's audio so the extension can POST it to `http://127.0.0.1:8765/transcribe`. The recording never leaves the user's machine. Firefox build does not include this permission.

**offscreen** — Chrome's `tabCapture` API can only run from a document context, not a service worker. The extension creates one short-lived offscreen document (`USER_MEDIA` reason) to hold the audio stream, then closes it.

**host: youtube.com, youtu.be** — Fetches the YouTube caption track and (as fallback) the Innertube `player` response for the current video.

**host: rutube.ru** — Rutube's captions are exposed via the public `play/options` JSON endpoint. The extension fetches them as regular HTTP requests; no Rutube account is required.

**host: vk.com, vkvideo.ru, okcdn.ru, vkuser.net, mycdn.me** — VK's player serves captions and CDN files from these origins. A MAIN-world content script observes the subtitle request URLs (capture-only — it never modifies the request) so the extension can re-fetch the file. See `SECURITY.md` for the full threat model.

**host: translate.googleapis.com** — Optional translate action posts user-selected transcript segments to Google's public translate endpoint. Translation is off by default and only runs after the user clicks "Translate".

**host: http://127.0.0.1:8765, http://localhost:8765** — Loopback address for the user-run Whisper STT server. Traffic never leaves the local machine.

**Remote code:** none. CSP is `script-src 'self'; object-src 'self';` — Chrome would block anything else.

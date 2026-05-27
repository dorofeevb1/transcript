# Security Policy — youtube-transcript-extension

This document is the formal security policy for the
`youtube-transcript-extension` project. It is the canonical reference for
store reviewers (Chrome Web Store, Firefox AMO), external researchers, and
contributors. A reviewer-oriented summary additionally lives in
`../SECURITY.md` at the repository root.

## Supported Versions

Security fixes are backported only to the latest minor of the latest major.
Older versions reach end-of-life when a successor minor ships and users are
auto-updated through the Chrome Web Store / AMO.

| Version | Supported           |
|---------|---------------------|
| 1.7.x   | Yes — current line  |
| 1.6.x   | Limited — critical only, until 2026-Q3 |
| < 1.6   | No                  |

## Reporting a Vulnerability

Please email **security@example.com**
<!-- PHASE-B-COORD: needs real address — tech lead decides which inbox to publish.
     Suggested options: security@<product-domain>, or a GitHub Security Advisory
     submitted via the repository's Security tab. -->
with subject `youtube-transcript-extension: <short summary>`.

Alternative: open a private report at
**GitHub Security Advisories** — `https://github.com/<org>/<repo>/security/advisories/new`
once the public repository URL is finalised.
<!-- PHASE-B-COORD: substitute real <org>/<repo> when repo is public. -->

Include:

- Extension version (`extension/manifest.json` → `version`)
- Browser & version (Chrome / Firefox / etc.)
- A minimal reproduction (URL + steps, or a short snippet)
- Your assessment of impact and any suggested fix

Expectations:

- Acknowledgement within **72 hours** of receipt
- Disposition within **14 days**: a fix in flight, a request for more
  information, or an explanation of why we consider the finding out of scope
- Public credit in release notes once a fix ships, if you want it

We follow **coordinated disclosure**: please give us a **90-day window** from
acknowledgement before public disclosure, or less if a fix has already
shipped. Please do not file public GitHub issues for unfixed vulnerabilities.

## Permissions Justification

Every entry in `extension/manifest.json` is justified by a concrete code path.

| Permission   | Why it is needed                                                | Where in code                                                                                  |
|--------------|-----------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| `storage`    | Persist UI settings, transcript cache, history                  | `src/lib/storage*.ts`, `src/popup/popup.ts`, `src/options/options.ts`, `src/background/service-worker.ts` |
| `scripting`  | Inject readers for captions/Innertube/VK page-context           | `src/background/service-worker.ts`, `src/lib/innertube.ts`, `src/lib/captions.ts`, `src/content/inject-page.ts` |
| `activeTab`  | Resolve currently-focused video tab                             | `src/popup/popup.ts`, `src/popup/popup-fetch.chromium.ts`, `src/lib/find-video-tab.ts`         |
| `offscreen`  | Required by Chrome's `tabCapture` flow (audio for Whisper STT)  | `src/lib/offscreen-doc.chromium.ts`                                                            |
| `tabCapture` | Capture tab audio when user opts into local Whisper STT         | `src/lib/tab-capture.chromium.ts`, `src/popup/popup-fetch.chromium.ts`                         |

**`tabCapture` justification (CWS reviewer-facing).** This permission is
opt-in. The capture stream is only created after the user explicitly clicks
the STT button and the extension has confirmed a local Whisper server is
reachable on `http://127.0.0.1:8765`. The captured audio is streamed to that
loopback address only; it never leaves the user's machine. There is no
developer-owned backend that ever sees audio. Source of truth:
`src/lib/tab-capture.chromium.ts` and `src/lib/offscreen-doc.chromium.ts`.

**Firefox build.** `scripts/patch-firefox-manifest.mjs` strips `offscreen`
and `tabCapture` from the AMO bundle and removes the offscreen
`web_accessible_resources` entry. STT is therefore unavailable on Firefox
by design.

### host_permissions

| Origin                                                       | Purpose                                                  |
|--------------------------------------------------------------|----------------------------------------------------------|
| `https://www.youtube.com/*`, `https://youtube.com/*`, `https://youtu.be/*` | YouTube captions + Innertube                |
| `https://rutube.ru/*`, `https://*.rutube.ru/*`               | Rutube captions                                          |
| `https://vk.com/*`, `https://*.vk.com/*`, `https://vkvideo.ru/*` | VK player + VK Video                                 |
| `https://*.okcdn.ru/*`, `https://*.vkuser.net/*`, `https://*.mycdn.me/*` | VK CDN endpoints for `.vtt`/`.srt` subtitle assets |
| `https://translate.googleapis.com/*`                         | Google Translate gateway (user-initiated)                |
| `http://127.0.0.1:8765/*`, `http://localhost:8765/*`         | Local Whisper server (loopback only, user-run)           |

No `<all_urls>`, no wildcard TLDs.

## Threat Model

### A. XSS via injected content

**Vector.** Captions, video metadata, and translated text are remote-sourced
and could carry hostile HTML. Any DOM construction from string templates is
a potential XSS sink.

**Mitigation.**

- CSP `script-src 'self'; object-src 'self'; base-uri 'self'; form-action 'self';`
  blocks `eval`, inline scripts, inline event-handler attributes, remote
  `<script src>`, base-tag hijacking, and form exfiltration.
- `grep -rnE "innerHTML\s*=" extension/src/ --include="*.ts"` returns empty
  — there are **no setter forms** of `innerHTML` in the source.
- The remaining `innerHTML` substrings in the codebase are **reads** of
  `document.documentElement.innerHTML` used by regex extractors (Innertube
  API key probe, subtitle URL scrape, YouTube player params). These reads
  do not parse, store, or re-emit HTML. Locations: `src/lib/innertube.ts`,
  `src/content/inject-page.ts`. Each is annotated with a `SECURITY:` JSDoc
  comment.
- Use `DOMParser` (not regex) for HTML parsing where actual structured
  parsing is required — see ARCHITECTURE.md §"Platform adapter" and the
  Backend-agent migration plan.

### B. Permission abuse

**Vector.** A compromised dependency or an unreviewed maintainer change
expands permissions silently.

**Mitigation.**

- Permissions are pinned to the minimum required, enumerated above, and
  re-checked at every release.
- `host_permissions` are explicit per origin; **no `<all_urls>`**.
- The Chrome Web Store and AMO listings' "permission justifications"
  mirror the table above verbatim.
- CI runs `npm audit` and fails the build on `critical`. `high` findings
  are reviewed manually (see "Build & Verification").

### C. Audio leakage via `tabCapture` (STT)

**Vector.** A bug in the STT flow could leak captured tab audio to an
attacker-controlled endpoint, or capture audio without user consent.

**Mitigation.**

- `tabCapture.getMediaStreamId` is only invoked from the popup after the
  user clicks the STT action and a `127.0.0.1:8765` health check
  succeeds. Source: `src/lib/tab-capture.chromium.ts`.
- The MediaStream is consumed in the offscreen document and `POST`ed
  exclusively to `http://127.0.0.1:8765/transcribe`. This URL is hard-coded
  in `src/lib/whisper-client.ts` (and the only host_permission of that
  shape).
- On capture completion the offscreen document closes, which releases the
  `tabCapture` track. A `RELEASE_TAB_CAPTURE` message is also defined for
  early cancellation.
- No developer-owned remote backend exists. Audio cannot reach a third
  party because no third-party host is declared in `host_permissions`.

### D. MAIN-world VK hook

**Vector.** `src/content/vk-net-hook.ts` runs in the VK page's own JS
context. MAIN-world code is more privileged than ISOLATED content scripts,
so a defect could leak request bodies, headers, or cookies.

**Mitigation (invariants — verifiable by reading the 52-line file).**

1. **Capture-only.** The hook wraps `window.fetch` and
   `XMLHttpRequest.prototype.open`, calls through with identical arguments,
   and records only the URL. Nothing is delayed, blocked, redirected, or
   replayed.
2. **No body or header inspection.** Request bodies and headers are not
   read. Response bodies are not read. Cookies / `Authorization` tokens
   are never touched.
3. **No exfiltration.** Captured URLs live in `window.__vkSubtitleUrls` on
   the same page. They are not sent to the background service worker, to
   the developer, to any third party, or to local storage. The array dies
   when the page navigates.
4. **Strict whitelist regex.** A URL is added only if it matches
   `/okcdn\.ru|subId=|subtitle|\.vtt|\.srt|type=13\b/i`. Non-matching URLs
   are ignored.
5. **One-shot install.** Flag `window.__VK_SUBS_HOOK__` blocks double
   installation.
6. **Scoped manifest match.** `content_scripts.matches` restricts the hook
   to `https://vk.com/*`, `https://*.vk.com/*`, `https://vkvideo.ru/*`. It
   cannot run on any other origin.

**Privilege amplification analysis.** VK ships first-party JS on the same
origin; that JS can already do anything `window` can do. The hook does
*not* expand what a hostile VK page could do — it has no access to
`chrome.*` APIs, cannot read cross-origin responses (CORS still applies to
the underlying `fetch`), and cannot reach extension storage or other tabs.
A hostile page that reads `__vkSubtitleUrls` learns only the URLs of
subtitle assets that the page itself just requested.

The hook source is inlined at build time from `vk-net-hook.ts`. There is
no user input or remote string that becomes executable. Reviewers can
read the whole file in one screen; do not modify it without security
re-review.

### E. Local Whisper server trust boundary

**Vector.** The user is asked to run a FastAPI server on
`127.0.0.1:8765`. A malicious server (or a process listening on that
port that the user did not start) could lie about transcription results
or attempt to abuse the audio stream.

**Mitigation.**

- The Whisper server is a separate, opt-in component documented in
  `docs/WHISPER-SERVER.md`. Users who do not start it cannot trigger STT.
- Communication is loopback-only; we never declare a public host for STT.
- The extension treats the server as untrusted: the returned transcript
  is rendered via `textContent`, never `innerHTML`.

## Build & Verification

**Reproducible build.**

```
npm ci
npm run build                # Chrome bundle in extension/dist/
npm run build:firefox        # Firefox bundle in extension/dist-firefox/
scripts/build-firefox-amo.sh # AMO source bundle
```

Each release publishes the SHA-256 of the `.zip` artifacts in the release
notes. Reviewers can compare against a local `shasum -a 256` of their own
re-build.

**Dependency audit.**

Current `npm audit` results:
- 2 `high` (rollup path-traversal via `@crxjs/vite-plugin`, advisory
  GHSA-mw96-cpmx-2vgc)
- 5 `moderate` (vite/esbuild/vitest dev-server CORS + path traversal)

All seven are in **dev-only build toolchain** and do not ship in the
packaged extension. We re-check on every release and upgrade as soon as a
non-breaking patched range becomes available.

**Static checks.**

- TypeScript strict mode (`tsc --noEmit`) — required green on CI.
- ESLint with `no-eval`, `no-implied-eval`, `no-new-func`, and a custom
  rule banning `innerHTML` writes.

## Out-of-scope

- Bugs in YouTube, Rutube, VK, Google Translate, or the user's Whisper
  server. Report to the relevant upstream.
- Issues in the user's OS, browser, or unrelated extensions.
- Self-XSS that requires the user to paste hostile JavaScript into the
  options page or DevTools.

/**
 * YouTube timedtext URL hook (runs in MAIN world).
 *
 * WHY
 * Since 2024 Google adds a POT (Proof-of-Origin Token) to caption baseUrls in
 * `ytInitialPlayerResponse`. Without YouTube cookies/signing the visitor receives an
 * empty XML body. The player itself, however, signs and fetches the right URL when
 * captions are turned on — and we can simply observe that request.
 *
 * WHAT IS CAPTURED
 * Only URLs matching `/^https?:\/\/[^/]*youtube\.com\/api\/timedtext/` are kept.
 * Non-matching requests pass through untouched.
 *
 * WHAT IS NOT DONE
 * - Captured URLs are stored ONLY in `window.__ytTimedtextUrls` on the same page.
 * - No network traffic is modified, redirected, blocked, or replayed.
 * - No request or response body is read, logged, or copied.
 * - Nothing is sent to background, to remote servers, or to any other origin.
 * - DOM is not touched. Cookies and auth headers are not read.
 *
 * HOW THE EXTENSION READS THE LIST
 * On "Get transcript" click, a MAIN-world helper reads `window.__ytTimedtextUrls`,
 * optionally clicks the player's CC button to force a timedtext fetch when the list
 * is empty, and returns the most recent URL. The extension then re-fetches it (the
 * URL itself is the POT-signed, cookie-bound one the player just used).
 */
(function installYtTimedtextHook() {
  const host = location.hostname.replace(/^www\./, '');
  if (host !== 'youtube.com' && !host.endsWith('.youtube.com') && host !== 'youtu.be') return;

  const w = window as unknown as {
    __ytTimedtextUrls?: string[];
    __YT_TT_HOOK__?: boolean;
  };
  if (w.__YT_TT_HOOK__) return;
  w.__YT_TT_HOOK__ = true;
  const store = (w.__ytTimedtextUrls = w.__ytTimedtextUrls ?? []);

  const TT_RE = /^https?:\/\/[^/]*youtube\.com\/api\/timedtext/i;
  const MAX = 20;

  const remember = (url: string) => {
    if (!url || !TT_RE.test(url) || store.includes(url)) return;
    store.push(url);
    if (store.length > MAX) store.shift();
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    remember(url);
    return origFetch(input, init);
  };

  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    remember(String(url));
    return XO.call(this, method, url, async ?? true, username, password);
  };
})();

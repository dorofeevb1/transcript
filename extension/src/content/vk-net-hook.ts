/**
 * VK subtitle URL hook (runs in MAIN world).
 *
 * WHY MAIN WORLD IS REQUIRED
 * VK player issues its subtitle XHR/fetch requests from page-context JavaScript.
 * From an ISOLATED-world content script those page-level network calls are invisible —
 * each world has its own `window`, `fetch`, and `XMLHttpRequest`. To observe the URLs
 * before they are torn down we MUST monkey-patch the page's own copies.
 *
 * WHAT IS CAPTURED
 * Only URLs that match `/okcdn\.ru|subId=|subtitle|\.vtt|\.srt|type=13\b/i` are kept.
 * This is a tight whitelist: subtitle CDN hosts (okcdn), subtitle query params, and
 * standard subtitle file extensions. Non-matching requests pass through untouched.
 *
 * WHAT IS NOT DONE
 * - Captured URLs are stored ONLY in `window.__vkSubtitleUrls` on the same page.
 * - No network traffic is modified, redirected, blocked, or replayed.
 * - No request or response body is read, logged, or copied.
 * - Nothing is sent to background, to remote servers, or to any other origin.
 * - DOM is not touched. Cookies and auth headers are not read.
 *
 * HOW THE EXTENSION READS THE LIST
 * An ISOLATED-world content script (`video-page.ts`) reads `window.__vkSubtitleUrls`
 * when the user explicitly clicks "Get transcript" in the popup. Until then the
 * captured URLs sit unused in the page's own memory and die with the page.
 *
 * REVIEWER REFERENCES
 * - docs/SECURITY.md (threat model for this hook)
 * - docs/USER_GUIDE.md (how the user opts in to VK transcription)
 */
(function installVkSubtitleHook() {
  const w = window as unknown as {
    __vkSubtitleUrls?: string[];
    __VK_SUBS_HOOK__?: boolean;
  };
  if (w.__VK_SUBS_HOOK__) return;
  w.__VK_SUBS_HOOK__ = true;
  const store = (w.__vkSubtitleUrls = w.__vkSubtitleUrls ?? []);

  const remember = (url: string) => {
    if (
      !url ||
      !/okcdn\.ru|subId=|subtitle|\.vtt|\.srt|type=13\b/i.test(url) ||
      store.includes(url)
    ) {
      return;
    }
    store.push(url);
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

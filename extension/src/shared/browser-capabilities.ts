/** Возможности браузера (Chrome vs Firefox). */

export function isFirefox(): boolean {
  return typeof navigator !== 'undefined' && /Firefox/i.test(navigator.userAgent);
}

/** Захват вкладки + offscreen + Whisper — только Chromium. */
export function supportsLocalStt(): boolean {
  if (typeof __FIREFOX_BUILD__ !== 'undefined' && __FIREFOX_BUILD__) return false;
  return !isFirefox();
}

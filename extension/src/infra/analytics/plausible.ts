/**
 * Plausible analytics — self-hosted, opt-out.
 *
 * Three events only: `install`, `activate`, `convert`.
 *
 * Contract (per Phase C brief):
 *  - Endpoint URL is configured at build time via `import.meta.env.PLAUSIBLE_HOST`.
 *    Empty string (default) = no-op — every call returns without hitting the
 *    network, no matter the user setting.
 *  - User opt-out flag lives in `chrome.storage.sync` under
 *    `analytics.plausible.optOut`. Default: opt-in (flag absent/false).
 *  - No PII. Payload is the Plausible event format only — event name,
 *    extension URL as `u`, domain as `d`. No video IDs, no URLs of pages the
 *    user visited, no personal identifiers.
 *  - Network failures are swallowed; analytics never blocks a real user flow.
 *
 * The legacy `shared/monetization.ts` keeps its own opt-IN counter for the
 * pre-launch beta; Plausible is the v1.0 forward-looking layer that other
 * use cases call. They co-exist.
 */
import { logger } from '../../shared/logger';

/** Read at Vite build time via `import.meta.env`. Empty string = analytics disabled. */
const PLAUSIBLE_HOST: string =
  (import.meta.env?.VITE_PLAUSIBLE_HOST as string | undefined) || '';

const OPT_OUT_KEY = 'analytics.plausible.optOut';
const ACTIVATED_KEY = 'analytics.plausible.activated';

export type PlausibleEvent = 'install' | 'activate' | 'convert';

/** Default opt-in: the flag is only present when the user actively opts out. */
export async function isOptedOut(): Promise<boolean> {
  try {
    const got = await chrome.storage.sync.get(OPT_OUT_KEY);
    return Boolean(got?.[OPT_OUT_KEY]);
  } catch {
    return false;
  }
}

export async function setOptedOut(value: boolean): Promise<void> {
  try {
    await chrome.storage.sync.set({ [OPT_OUT_KEY]: value });
  } catch {
    /* ignore */
  }
}

function pseudoDomain(): string {
  // Plausible expects a `domain` so it can route events to a site. We use the
  // extension's manifest name as the site key so a single Plausible instance
  // can host both extensions without colliding.
  try {
    return chrome.runtime.id || 'youtube-transcript-extension';
  } catch {
    return 'youtube-transcript-extension';
  }
}

function eventUrl(name: PlausibleEvent): string {
  // Plausible's `u` field must be a URL. We synthesise one inside the
  // extension's own origin — never the user's tab URL — so we don't ship any
  // browsing data.
  try {
    return chrome.runtime.getURL(`/_p/${name}`);
  } catch {
    return `https://ext.local/_p/${name}`;
  }
}

/**
 * Send a Plausible event. No-op when:
 *  - PLAUSIBLE_HOST is empty (default for non-prod builds).
 *  - The user has opted out in options.
 *  - The browser is offline (fetch rejects; we swallow it).
 *
 * Returns true if a network request was actually issued.
 */
export async function track(event: PlausibleEvent): Promise<boolean> {
  if (!PLAUSIBLE_HOST) return false;
  if (await isOptedOut()) return false;

  try {
    const body = JSON.stringify({
      name: event,
      url: eventUrl(event),
      domain: pseudoDomain(),
    });
    await fetch(`${PLAUSIBLE_HOST.replace(/\/$/, '')}/api/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
    return true;
  } catch (e) {
    logger.warn?.('plausible track failed', e);
    return false;
  }
}

/**
 * Fire `activate` once per browser profile. Idempotent: a successful first
 * call sets a marker in `chrome.storage.sync` and every subsequent call is a
 * no-op even across reinstalls on the same profile.
 *
 * Use cases call this on first successful run (find-context completes /
 * transcript fetched).
 */
export async function trackActivateOnce(): Promise<void> {
  try {
    const got = await chrome.storage.sync.get(ACTIVATED_KEY);
    if (got?.[ACTIVATED_KEY]) return;
    await chrome.storage.sync.set({ [ACTIVATED_KEY]: Date.now() });
    await track('activate');
  } catch {
    /* ignore */
  }
}

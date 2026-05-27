/**
 * Lightweight monetization layer for youtube-transcript-extension.
 *
 * Three concerns live here, intentionally kept in one file so the build
 * pipeline does not need new entry points:
 *
 *  1. Donation footer state (dismissable, persisted in `chrome.storage.local`)
 *  2. "Pro waitlist" email capture (local storage + optional fire-and-forget POST)
 *  3. Opt-in privacy-preserving analytics (no PII, fully no-op until enabled)
 *
 * No external SDKs. All network calls fail silently — monetization must never
 * break a real user flow.
 */
import { logger } from './logger';
import { getUiLocale, t } from './i18n';

// ───────── Donation footer ─────────

/**
 * Replace with your CloudTips URL. The existing one for this project is
 * https://pay.cloudtips.ru/p/0290bc9b (kept in README); paste it here once
 * to also surface a link in the popup footer. We keep the placeholder shape
 * so the URL is easy to swap and the footer hides itself until real.
 *
 * TODO(maintainer): paste real CloudTips URL.
 */
export const DONATION_URL_RU = 'https://pay.cloudtips.ru/p/REPLACE_ME';

/**
 * Replace with your Ko-fi URL (https://ko-fi.com/...) for non-RU users.
 *
 * TODO(maintainer): paste real Ko-fi URL.
 */
export const DONATION_URL_DEFAULT = 'https://ko-fi.com/REPLACE_ME';

const DONATION_DISMISSED_KEY = 'donation.dismissed';

function isPlaceholder(url: string): boolean {
  return url.includes('REPLACE_ME');
}

async function isDonationDismissed(): Promise<boolean> {
  try {
    const got = await chrome.storage.local.get(DONATION_DISMISSED_KEY);
    return Boolean(got?.[DONATION_DISMISSED_KEY]);
  } catch {
    return false;
  }
}

async function setDonationDismissed(): Promise<void> {
  try {
    await chrome.storage.local.set({ [DONATION_DISMISSED_KEY]: true });
  } catch {
    /* ignore */
  }
}

function isRussianUi(): boolean {
  const loaded = getUiLocale();
  if (/^ru/i.test(loaded)) return true;
  try {
    return /^ru/i.test(chrome.i18n.getUILanguage());
  } catch {
    return false;
  }
}

function donationUrl(): string {
  return isRussianUi() ? DONATION_URL_RU : DONATION_URL_DEFAULT;
}

function localized(key: string, fallback: string): string {
  const v = t(key);
  return v && v !== key ? v : fallback;
}

/**
 * Inject a single-line donation footer into `host`. No-op if the user
 * dismissed it previously or if the URL is still a placeholder.
 */
export async function mountDonationFooter(host: HTMLElement): Promise<void> {
  const url = donationUrl();
  if (isPlaceholder(url)) return;
  if (await isDonationDismissed()) return;

  const wrap = document.createElement('div');
  wrap.className = 'donation-footer';

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'donation-link';
  link.textContent = localized(
    'donationPrompt',
    isRussianUi() ? 'Поддержать копилку' : 'Support on Ko-fi',
  );
  link.addEventListener('click', () => {
    void track('donate.click');
  });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'donation-dismiss';
  dismiss.setAttribute(
    'aria-label',
    localized('donationDismiss', isRussianUi() ? 'Скрыть' : 'Dismiss'),
  );
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', () => {
    void setDonationDismissed();
    wrap.remove();
  });

  wrap.append(link, dismiss);
  host.appendChild(wrap);
}

// ───────── Pro waitlist ─────────

const WAITLIST_EMAIL_KEY = 'pro.waitlist.email';
const WAITLIST_ENDPOINT_KEY = 'pro.waitlist.endpoint';

export async function getWaitlistEmail(): Promise<string> {
  try {
    const got = await chrome.storage.local.get(WAITLIST_EMAIL_KEY);
    const v = got?.[WAITLIST_EMAIL_KEY];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

export async function setWaitlistEmail(email: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [WAITLIST_EMAIL_KEY]: email });
  } catch {
    /* ignore */
  }
}

export async function getWaitlistEndpoint(): Promise<string> {
  try {
    const got = await chrome.storage.local.get(WAITLIST_ENDPOINT_KEY);
    const v = got?.[WAITLIST_ENDPOINT_KEY];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Save the email locally and best-effort POST it to the configured endpoint.
 * Returns `true` if the email was accepted (valid + stored). Network errors
 * are swallowed.
 */
export async function submitWaitlist(email: string): Promise<boolean> {
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) return false;
  await setWaitlistEmail(trimmed);
  const endpoint = await getWaitlistEndpoint();
  if (endpoint) {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'youtube-transcript-extension' }),
        keepalive: true,
      });
    } catch (e) {
      logger.warn('waitlist POST failed', e);
    }
  }
  void track('waitlist.signup');
  return true;
}

// ───────── Analytics (opt-in, no PII) ─────────

const ANALYTICS_ENABLED_KEY = 'analytics.enabled';
const ANALYTICS_ENDPOINT_KEY = 'analytics.endpoint';
const ANALYTICS_INSTALLED_KEY = 'analytics.installedAt';
const ANALYTICS_ACTIVATED_KEY = 'analytics.activated';

export type AnalyticsEvent =
  | 'install'
  | 'activate'
  | 'donate.click'
  | 'waitlist.signup';

export async function isAnalyticsEnabled(): Promise<boolean> {
  try {
    const got = await chrome.storage.local.get(ANALYTICS_ENABLED_KEY);
    return Boolean(got?.[ANALYTICS_ENABLED_KEY]);
  } catch {
    return false;
  }
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [ANALYTICS_ENABLED_KEY]: enabled });
  } catch {
    /* ignore */
  }
}

export async function getAnalyticsEndpoint(): Promise<string> {
  try {
    const got = await chrome.storage.local.get(ANALYTICS_ENDPOINT_KEY);
    const v = got?.[ANALYTICS_ENDPOINT_KEY];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

export async function setAnalyticsEndpoint(url: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [ANALYTICS_ENDPOINT_KEY]: url });
  } catch {
    /* ignore */
  }
}

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function browserLocale(): string {
  try {
    return chrome.i18n.getUILanguage();
  } catch {
    return 'unknown';
  }
}

/**
 * Fire a tracker event. Strictly no-op if analytics opt-in is off OR the
 * endpoint is empty. Payload contains only: event name, extension version,
 * browser locale. No URLs, no video IDs, no user identifiers.
 */
export async function track(event: AnalyticsEvent): Promise<void> {
  try {
    if (!(await isAnalyticsEnabled())) return;
    const endpoint = await getAnalyticsEndpoint();
    if (!endpoint) return;
    const body = JSON.stringify({
      event,
      version: extensionVersion(),
      locale: browserLocale(),
      ext: 'youtube-transcript-extension',
    });
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch (e) {
    logger.warn('analytics POST failed', e);
  }
}

/**
 * Fire `install` once per browser profile. Idempotent: stores a timestamp
 * the first time and never sends again.
 */
export async function trackInstallOnce(): Promise<void> {
  try {
    const got = await chrome.storage.local.get(ANALYTICS_INSTALLED_KEY);
    if (got?.[ANALYTICS_INSTALLED_KEY]) return;
    await chrome.storage.local.set({ [ANALYTICS_INSTALLED_KEY]: Date.now() });
    void track('install');
  } catch {
    /* ignore */
  }
}

/**
 * Fire `activate` exactly once — when the user first reaches the primary
 * success outcome (a transcript rendered). Subsequent calls no-op.
 */
export async function trackActivateOnce(): Promise<void> {
  try {
    const got = await chrome.storage.local.get(ANALYTICS_ACTIVATED_KEY);
    if (got?.[ANALYTICS_ACTIVATED_KEY]) return;
    await chrome.storage.local.set({ [ANALYTICS_ACTIVATED_KEY]: Date.now() });
    void track('activate');
  } catch {
    /* ignore */
  }
}

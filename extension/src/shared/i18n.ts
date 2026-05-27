/** UI strings: _locales JSON + optional override from extension settings. */

import { getOptions } from '../infra/chrome/storage';

type Substitutions = string | string[] | undefined;
type PlaceholderMap = Record<string, { content: string }>;
type LocaleEntry = { message: string; placeholders?: PlaceholderMap };

export const UI_LOCALES = ['ru', 'en', 'uk', 'de', 'es', 'fr'] as const;
export type UiLocale = (typeof UI_LOCALES)[number] | 'auto';

const FALLBACK_LOCALE: UiLocale = 'ru';

let messages: Record<string, LocaleEntry> | null = null;
let loadedLocale = '';

function subs(args?: Substitutions): string[] | undefined {
  if (args == null) return undefined;
  return Array.isArray(args) ? args : [args];
}

function normalizeLocale(code: string): UiLocale {
  const base = code.split('-')[0].toLowerCase();
  return (UI_LOCALES as readonly string[]).includes(base) ? (base as UiLocale) : FALLBACK_LOCALE;
}

/** Preferred UI locale: setting → OS/browser languages → Chrome UI → ru. */
export async function getEffectiveLocale(): Promise<UiLocale> {
  const opts = await getOptions();
  if (opts.uiLocale && opts.uiLocale !== 'auto') {
    return normalizeLocale(opts.uiLocale);
  }

  const fromNavigator = (navigator.languages?.length ? navigator.languages : [navigator.language])
    .map((l) => l.split('-')[0].toLowerCase())
    .find((l) => (UI_LOCALES as readonly string[]).includes(l));

  if (fromNavigator) return fromNavigator as UiLocale;

  const chromeUi = chrome.i18n.getUILanguage().split('-')[0].toLowerCase();
  if ((UI_LOCALES as readonly string[]).includes(chromeUi)) {
    return chromeUi as UiLocale;
  }

  return FALLBACK_LOCALE;
}

function formatMessage(entry: LocaleEntry, substitutions?: string[]): string {
  let text = entry.message;
  const values = substitutions ?? [];
  const ph = entry.placeholders;

  if (ph) {
    for (const [name, spec] of Object.entries(ph)) {
      const m = spec.content.match(/^\$(\d+)$/);
      const value = m ? (values[Number(m[1]) - 1] ?? '') : '';
      text = text.replace(new RegExp(`\\$${name}\\$`, 'gi'), value);
    }
  }

  values.forEach((value, i) => {
    text = text.replace(new RegExp(`\\$${i + 1}`, 'g'), value);
  });

  return text;
}

async function loadMessages(locale: UiLocale): Promise<void> {
  if (locale === loadedLocale && messages) return;

  const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
  const res = await fetch(url);
  if (!res.ok) {
    messages = null;
    loadedLocale = '';
    return;
  }

  messages = (await res.json()) as Record<string, LocaleEntry>;
  loadedLocale = locale;
}

/** Load strings for the active locale (call before t / applyI18n). */
export async function initI18n(): Promise<string> {
  const locale = await getEffectiveLocale();
  await loadMessages(locale);
  return locale;
}

export function t(key: string, substitutions?: Substitutions): string {
  const values = subs(substitutions);
  const entry = messages?.[key];
  if (entry) return formatMessage(entry, values);

  const chromeMsg = chrome.i18n.getMessage(key, values);
  return chromeMsg || key;
}

export function getUiLocale(): string {
  return loadedLocale || chrome.i18n.getUILanguage();
}

export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = t(key);
      if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', t(key));
    }
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && el instanceof HTMLInputElement) el.placeholder = t(key);
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });

  root.querySelectorAll<HTMLOptionElement>('option[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });

  const docTitleKey = document.documentElement.getAttribute('data-i18n-doc-title');
  if (docTitleKey) document.title = t(docTitleKey);

  document.documentElement.lang = getUiLocale().split('-')[0];
}

/** Map legacy / internal Russian error text to message keys. */
const ERROR_KEY_BY_TEXT: Record<string, string> = {
  'Откройте страницу с видео: YouTube, Rutube или VK Видео': 'errOpenVideoPage',
  'Прямые трансляции: используйте субтитры вручную, если доступны': 'errLiveCaptions',
  'Локальное распознавание не поддерживается для прямых трансляций': 'errLiveStt',
  'Отменено': 'errCancelled',
  'Локальный сервер недоступен. Запустите: cd whisper-server && python main.py':
    'errServerUnavailable',
  'Не удалось распознать аудио. Проверьте звук и воспроизведение.': 'errRecognizeFailed',
  'Видео на странице изменилось — обновите и попробуйте снова': 'errVideoChanged',
  'У этого видео нет субтитров': 'errNoCaptions',
  'Субтитры пустые': 'errEmptyCaptions',
  'У этого видео VK нет субтитров или не удалось их извлечь': 'errVkNoCaptions',
  'Нет активной вкладки с видео': 'errNoActiveTab',
  'Не удалось захватить звук': 'errCaptureAudio',
  'Модуль записи не отвечает. Обновите расширение (chrome://extensions → ↻).':
    'errRecordingModule',
};

export function localizeError(message: string): string {
  const exact = ERROR_KEY_BY_TEXT[message];
  if (exact) return t(exact);

  if (message.startsWith('Запись пустая.')) return t('errEmptyRecording');
  if (message.includes('Не удалось загрузить субтитры') || message.includes('→')) {
    return t('errFetchCaptionsDetail', [message]);
  }
  if (
    message.includes('rate limit') ||
    message.includes('google.com/sorry') ||
    message.includes('CORS')
  ) {
    return t('errTranslateGoogle');
  }
  if (
    message.includes('Перевод недоступен') ||
    message.includes('Translation unavailable')
  ) {
    return message.includes('Google') || message.includes('google')
      ? t('errTranslateGoogle')
      : t('errTranslateUnavailable');
  }
  if (message.includes('Failed to fetch') || message.includes('CORS')) {
    return t('errCorsBlocked');
  }

  return message;
}

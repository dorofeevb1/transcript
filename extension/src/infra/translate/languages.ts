import { t } from '../../shared/i18n';

/** Целевые языки перевода (коды Google Translate). */
export const TRANSLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: '' },
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Українська' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
];

export function getTranslateLanguages(): { code: string; label: string }[] {
  return TRANSLATE_LANGUAGES.map((l) =>
    l.code === '' ? { code: '', label: t('langOriginal') } : l,
  );
}

export function translateLanguageLabel(code: string): string {
  if (!code) return t('langOriginal');
  return TRANSLATE_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

import { applyI18n, initI18n } from '../shared/i18n';
import { getOptions, setOptions } from '../infra/chrome/storage';
import type { ExtensionOptions } from '../domain/types';
import { mountAnalyticsCard, mountWaitlistCard } from '../shared/monetization-ui';

type ThemeChoice = 'auto' | 'light' | 'dark';
const THEME_KEY = 'uiTheme';
const THEME_CYCLE: ThemeChoice[] = ['auto', 'light', 'dark'];

function pingSaved(name: string): void {
  const ind = document.querySelector<HTMLElement>(`.save-indicator[data-for="${name}"]`);
  if (!ind) return;
  ind.classList.add('show');
  window.setTimeout(() => ind.classList.remove('show'), 1500);
}

async function loadAndApplyTheme(): Promise<void> {
  try {
    const got = await chrome.storage.sync.get(THEME_KEY);
    const v = (got?.[THEME_KEY] as ThemeChoice | undefined) ?? 'auto';
    const valid: ThemeChoice = THEME_CYCLE.includes(v) ? v : 'auto';
    document.documentElement.setAttribute('data-theme', valid);
    const sel = document.getElementById('theme') as HTMLSelectElement | null;
    if (sel) sel.value = valid;
  } catch {
    /* ignore */
  }
}

async function saveTheme(value: ThemeChoice): Promise<void> {
  document.documentElement.setAttribute('data-theme', value);
  try {
    await chrome.storage.sync.set({ [THEME_KEY]: value });
  } catch {
    /* ignore */
  }
}

async function loadFormValues(): Promise<void> {
  const opts = await getOptions();
  (document.getElementById('uiLocale') as HTMLSelectElement).value = opts.uiLocale ?? 'auto';
  (document.getElementById('captionLanguage') as HTMLSelectElement).value = opts.captionLanguage;
  (document.getElementById('sttLanguage') as HTMLSelectElement).value = opts.sttLanguage;
  (document.getElementById('blockSizeSec') as HTMLSelectElement).value = String(opts.blockSizeSec);
  (document.getElementById('markSilentMinutes') as HTMLInputElement).checked = opts.markSilentMinutes;
  const maxSel = document.getElementById('sttMaxRecordSec') as HTMLSelectElement;
  const maxVal = String(opts.sttMaxRecordSec ?? 300);
  if (Array.from(maxSel.options).some((o) => o.value === maxVal)) {
    maxSel.value = maxVal;
  } else {
    maxSel.value = '300';
  }
}

async function persistField(id: string): Promise<void> {
  if (id === 'theme') {
    const sel = document.getElementById('theme') as HTMLSelectElement | null;
    const v = (sel?.value as ThemeChoice) ?? 'auto';
    await saveTheme(THEME_CYCLE.includes(v) ? v : 'auto');
    pingSaved(id);
    return;
  }

  const current = await getOptions();
  const next: ExtensionOptions = { ...current };

  switch (id) {
    case 'uiLocale': {
      const prev = current.uiLocale ?? 'auto';
      next.uiLocale = (document.getElementById('uiLocale') as HTMLSelectElement)
        .value as ExtensionOptions['uiLocale'];
      await setOptions(next);
      if (next.uiLocale !== prev) {
        await initI18n();
        applyI18n();
      }
      pingSaved(id);
      return;
    }
    case 'captionLanguage':
      next.captionLanguage = (document.getElementById('captionLanguage') as HTMLSelectElement)
        .value as ExtensionOptions['captionLanguage'];
      break;
    case 'sttLanguage':
      next.sttLanguage = (document.getElementById('sttLanguage') as HTMLSelectElement).value;
      break;
    case 'sttMaxRecordSec':
      next.sttMaxRecordSec = Number(
        (document.getElementById('sttMaxRecordSec') as HTMLSelectElement).value,
      );
      break;
    case 'blockSizeSec':
      next.blockSizeSec = Number(
        (document.getElementById('blockSizeSec') as HTMLSelectElement).value,
      ) as ExtensionOptions['blockSizeSec'];
      break;
    case 'markSilentMinutes':
      next.markSilentMinutes = (document.getElementById('markSilentMinutes') as HTMLInputElement).checked;
      break;
    default:
      return;
  }
  await setOptions(next);
  pingSaved(id);
}

function bindAutosave(): void {
  const ids = [
    'theme',
    'uiLocale',
    'captionLanguage',
    'sttLanguage',
    'sttMaxRecordSec',
    'blockSizeSec',
    'markSilentMinutes',
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('change', () => void persistField(id));
  }
}

async function boot(): Promise<void> {
  await loadAndApplyTheme();
  await initI18n();
  applyI18n();
  await loadFormValues();
  bindAutosave();
  const host = document.getElementById('monetization-host');
  if (host) {
    await mountWaitlistCard(host);
    await mountAnalyticsCard(host);
  }
}

void boot();

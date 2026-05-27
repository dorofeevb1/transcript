/**
 * Renderers for monetization UI: the Pro waitlist card and the analytics
 * opt-in row. Kept separate from the storage/logic module so a non-UI caller
 * (background, tests) can import the data layer without DOM dependencies.
 */
import { getUiLocale, t } from './i18n';
import {
  getAnalyticsEndpoint,
  getWaitlistEmail,
  isAnalyticsEnabled,
  setAnalyticsEnabled,
  setAnalyticsEndpoint,
  submitWaitlist,
  track,
} from './monetization';

interface WaitlistCopy {
  title: string;
  desc: string;
  features: string[];
  cta: string;
  thanks: string;
  emailLabel: string;
  emailPlaceholder: string;
  privacyTitle: string;
  privacyNote: string;
  endpointLabel: string;
  analyticsToggle: string;
}

const COPY_RU: WaitlistCopy = {
  title: 'Pro версия в работе',
  desc: 'Подписка на ранний доступ — без рассылок, одно письмо при запуске.',
  features: [
    'Облачный Whisper без локального сервера',
    'Пакетная обработка нескольких видео',
    'AI-резюме всей стенограммы',
  ],
  cta: 'Сообщить',
  thanks: 'Спасибо, добавили в список.',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  privacyTitle: 'Анонимная статистика',
  privacyNote:
    'Отправляются только: название события, версия расширения и язык интерфейса. Без URL, ID видео и каких-либо персональных данных.',
  endpointLabel: 'Endpoint',
  analyticsToggle: 'Включить отправку анонимных событий',
};

const COPY_EN: WaitlistCopy = {
  title: 'Pro version coming',
  desc: 'Join the early-access list — no spam, one email when we launch.',
  features: [
    'Cloud Whisper (no local server required)',
    'Batch process several videos at once',
    'AI summary of the full transcript',
  ],
  cta: 'Notify me',
  thanks: 'Thanks, you are on the list.',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  privacyTitle: 'Anonymous usage stats',
  privacyNote:
    'Only sends: event name, extension version and browser locale. No URLs, no video IDs, no personal data.',
  endpointLabel: 'Endpoint',
  analyticsToggle: 'Send anonymous usage events',
};

function copyForUi(): WaitlistCopy {
  const loaded = getUiLocale();
  if (/^ru/i.test(loaded)) return COPY_RU;
  try {
    if (/^ru/i.test(chrome.i18n.getUILanguage())) return COPY_RU;
  } catch {
    /* ignore */
  }
  return COPY_EN;
}

function localized(key: string, fallback: string): string {
  const v = t(key);
  return v && v !== key ? v : fallback;
}

/**
 * Append the "Pro waitlist" card to `host`. Idempotent — does nothing if the
 * card is already present (data attribute marker).
 */
export async function mountWaitlistCard(host: HTMLElement): Promise<void> {
  if (host.querySelector('[data-monetization="waitlist"]')) return;

  const copy = copyForUi();

  const card = document.createElement('section');
  card.className = 'card monetization-card';
  card.setAttribute('data-monetization', 'waitlist');

  const heading = document.createElement('h2');
  heading.className = 'card-title';
  heading.textContent = localized('proWaitlistTitle', copy.title);
  card.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'hint';
  desc.textContent = localized('proWaitlistDesc', copy.desc);
  card.appendChild(desc);

  const list = document.createElement('ul');
  list.className = 'monetization-feature-list';
  for (const feat of copy.features) {
    const li = document.createElement('li');
    li.textContent = feat;
    list.appendChild(li);
  }
  card.appendChild(list);

  const row = document.createElement('div');
  row.className = 'monetization-row';

  const label = document.createElement('label');
  label.className = 'field-label';
  label.setAttribute('for', 'waitlist-email');
  label.textContent = copy.emailLabel;

  const input = document.createElement('input');
  input.type = 'email';
  input.id = 'waitlist-email';
  input.name = 'waitlistEmail';
  input.autocomplete = 'email';
  input.placeholder = copy.emailPlaceholder;
  input.value = await getWaitlistEmail();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary btn-sm';
  btn.textContent = localized('proWaitlistCta', copy.cta);

  const status = document.createElement('p');
  status.className = 'monetization-status';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const ok = await submitWaitlist(input.value);
    btn.disabled = false;
    if (ok) {
      status.textContent = localized('proWaitlistThanks', copy.thanks);
    } else {
      status.textContent = copy.emailPlaceholder;
    }
  });

  row.append(label, input, btn);
  card.append(row, status);
  host.appendChild(card);
}

/**
 * Append the analytics opt-in card. Stores the toggle in `chrome.storage.local`
 * and lets the user configure an endpoint. With no endpoint configured the
 * tracker stays a no-op regardless of the toggle.
 */
export async function mountAnalyticsCard(host: HTMLElement): Promise<void> {
  if (host.querySelector('[data-monetization="analytics"]')) return;

  const copy = copyForUi();

  const card = document.createElement('section');
  card.className = 'card monetization-card';
  card.setAttribute('data-monetization', 'analytics');

  const heading = document.createElement('h2');
  heading.className = 'card-title';
  heading.textContent = localized('analyticsTitle', copy.privacyTitle);
  card.appendChild(heading);

  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = localized('analyticsPrivacyNote', copy.privacyNote);
  card.appendChild(note);

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'checkbox-field';
  toggleLabel.style.marginTop = 'var(--space-3)';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = await isAnalyticsEnabled();
  const toggleText = document.createElement('span');
  toggleText.textContent = localized('analyticsEnable', copy.analyticsToggle);
  toggleLabel.append(toggle, toggleText);
  card.appendChild(toggleLabel);

  const endpointField = document.createElement('div');
  endpointField.className = 'field';
  const endpointLabel = document.createElement('label');
  endpointLabel.className = 'field-label';
  endpointLabel.setAttribute('for', 'analytics-endpoint');
  endpointLabel.textContent = copy.endpointLabel;
  const endpointInput = document.createElement('input');
  endpointInput.type = 'url';
  endpointInput.id = 'analytics-endpoint';
  endpointInput.name = 'analyticsEndpoint';
  endpointInput.placeholder = 'https://...';
  endpointInput.value = await getAnalyticsEndpoint();
  endpointField.append(endpointLabel, endpointInput);
  card.appendChild(endpointField);

  toggle.addEventListener('change', () => {
    void (async () => {
      await setAnalyticsEnabled(toggle.checked);
      if (toggle.checked) void track('install');
    })();
  });

  let saveTimer: number | null = null;
  endpointInput.addEventListener('input', () => {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void setAnalyticsEndpoint(endpointInput.value.trim());
      saveTimer = null;
    }, 400);
  });
  endpointInput.addEventListener('blur', () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    void setAnalyticsEndpoint(endpointInput.value.trim());
  });

  host.appendChild(card);
}

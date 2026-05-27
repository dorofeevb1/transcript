import {
  downloadFile,
  formatResultMeta,
  formatTranscriptText,
  toSrt,
  type DisplayMode,
} from '../shared/export';
import { bindFetchButton } from '@stt/popup-fetch';
import { supportsLocalStt } from '../shared/browser-capabilities';
import { applyI18n, initI18n, localizeError, t } from '../shared/i18n';
import {
  clearAllHistory,
  formatHistoryLabel,
  getHistory,
  loadHistoryTranscript,
} from '../infra/storage/history.repo';
import { checkServerHealth } from '../infra/stt/local-stt';
import { sendRuntimeMessage, tryRuntimeMessage } from '../infra/chrome/runtime-message';
import { jobToProgress, loadJob } from '../infra/chrome/job-state';
import type { StoredJob } from '../domain/types';
import { getCachedTranslation, getCachedTranscript, getOptions } from '../infra/chrome/storage';
import { getTranslateLanguages } from '../infra/translate/languages';
import { isVideoPageUrl, parseVideoRef, platformLabel } from '../shared/url-parser';
import type { HistoryEntry } from '../infra/storage/history.repo';
import type { BackgroundResponse, TranscriptResult } from '../domain/types';
import { mountDonationFooter, trackActivateOnce, trackInstallOnce } from '../shared/monetization';
import { WHISPER_SERVER_DOWNLOAD_URL } from '../shared/whisper-download';

const $ = (id: string) => document.getElementById(id)!;

let currentResult: TranscriptResult | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let waitingForJob = false;

// ───────── Theme handling ─────────
type ThemeChoice = 'auto' | 'light' | 'dark';
const THEME_KEY = 'uiTheme';
const THEME_CYCLE: ThemeChoice[] = ['auto', 'light', 'dark'];

function applyTheme(t: ThemeChoice): void {
  document.documentElement.setAttribute('data-theme', t);
}

async function loadTheme(): Promise<ThemeChoice> {
  try {
    const got = await chrome.storage.sync.get(THEME_KEY);
    const v = (got?.[THEME_KEY] as ThemeChoice | undefined) ?? 'auto';
    return THEME_CYCLE.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

async function saveTheme(theme: ThemeChoice): Promise<void> {
  try {
    await chrome.storage.sync.set({ [THEME_KEY]: theme });
  } catch {
    /* ignore */
  }
}

async function cycleTheme(): Promise<void> {
  const cur = (document.documentElement.getAttribute('data-theme') as ThemeChoice) ?? 'auto';
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(cur) + 1) % THEME_CYCLE.length];
  applyTheme(next);
  await saveTheme(next);
}

// ───────── Toast ─────────
type ToastVariant = 'info' | 'error';

function showToast(message: string, variant: ToastVariant = 'info', durationMs = 3000): void {
  const host = document.getElementById('toast-host');
  if (!host || !message) return;
  const el = document.createElement('div');
  el.className = variant === 'error' ? 'toast toast-error' : 'toast';
  el.setAttribute('role', variant === 'error' ? 'alert' : 'status');

  const body = document.createElement('div');
  body.className = 'toast-body';
  body.textContent = message;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', t('toastClose') || 'Dismiss');
  close.textContent = '×';

  let timer: number | null = window.setTimeout(dismiss, durationMs);
  function dismiss(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    el.remove();
  }
  close.addEventListener('click', dismiss);

  el.append(body, close);
  host.appendChild(el);
}

function setExportButtonsEnabled(enabled: boolean): void {
  ['btn-copy', 'btn-txt', 'btn-srt', 'btn-json'].forEach((id) => {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = !enabled;
  });
}

function showSkeleton(show: boolean): void {
  const el = document.getElementById('skeleton');
  if (el) el.classList.toggle('hidden', !show);
}

function getViewMode(): DisplayMode {
  const el = document.querySelector<HTMLInputElement>('input[name="view-mode"]:checked');
  return (el?.value as DisplayMode) ?? 'minutes';
}

function getFetchMode(): 'captions' | 'local-stt' {
  const el = document.querySelector<HTMLInputElement>('input[name="fetch-mode"]:checked');
  return (el?.value as 'captions' | 'local-stt') ?? 'captions';
}

function showError(msg: string): void {
  showToast(localizeError(msg), 'error', 5000);
}

function hideError(): void {
  /* toasts auto-dismiss; no-op for compatibility */
}

function setLoading(loading: boolean): void {
  const btn = $('btn-fetch') as HTMLButtonElement;
  btn.disabled = loading;
  $('btn-cancel').classList.toggle('hidden', !loading);
  $('progress-wrap').classList.toggle('hidden', !loading);
  showSkeleton(loading && !currentResult);
}

function fillTranslateLanguages(): void {
  const select = $('translate-lang') as HTMLSelectElement;
  select.replaceChildren(
    ...getTranslateLanguages().map((l) => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.label;
      return opt;
    }),
  );
}

function renderResult(result: TranscriptResult): void {
  currentResult = result;
  void trackActivateOnce();
  const text = formatTranscriptText(result, getViewMode());
  $('output').textContent = text;
  $('result-section').classList.remove('hidden');
  $('translate-row').classList.remove('hidden');
  showSkeleton(false);
  setExportButtonsEnabled(true);

  const select = $('translate-lang') as HTMLSelectElement;
  select.value = result.translatedTo ?? '';

  $('result-meta').textContent = formatResultMeta(result);
  const titleEl = $('video-title');
  titleEl.textContent = result.title?.trim() || result.videoId;
  titleEl.classList.remove('muted');
  void renderHistoryList();
}

async function renderHistoryList(): Promise<void> {
  const list = $('history-list');
  const empty = $('history-empty');
  const entries = await getHistory();

  list.replaceChildren();
  if (!entries.length) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');

  for (const entry of entries) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = formatHistoryLabel(entry);
    if (
      currentResult?.platform === entry.platform &&
      currentResult?.videoId === entry.videoId
    ) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => void openHistoryEntry(entry));
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function openHistoryEntry(entry: HistoryEntry): Promise<void> {
  hideError();
  const result = await loadHistoryTranscript(entry.platform, entry.videoId);
  if (!result) {
    showError(t('errHistoryNotFound'));
    void renderHistoryList();
    return;
  }
  renderResult(result);
}

function hideResultPanel(): void {
  currentResult = null;
  $('result-section').classList.add('hidden');
  $('translate-row').classList.add('hidden');
  setExportButtonsEnabled(false);
}

function confirmInPopup(
  message: string,
  options?: { title?: string; okLabel?: string },
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = $('confirm-dialog');
    const okBtn = $('confirm-ok') as HTMLButtonElement;
    const cancelBtn = $('confirm-cancel') as HTMLButtonElement;

    $('confirm-title').textContent = options?.title ?? t('confirmTitle');
    $('confirm-message').textContent = message;
    okBtn.textContent = options?.okLabel ?? t('confirmDelete');

    const finish = (ok: boolean) => {
      dialog.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.querySelectorAll('[data-confirm-dismiss]').forEach((el) => {
        el.removeEventListener('click', onCancel);
      });
      resolve(ok);
    };

    const onOk = () => finish(true);
    const onCancel = () => finish(false);

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dialog.querySelectorAll('[data-confirm-dismiss]').forEach((el) => {
      el.addEventListener('click', onCancel);
    });

    dialog.classList.remove('hidden');
    cancelBtn.focus();
  });
}

async function clearHistory(): Promise<void> {
  const ok = await confirmInPopup(t('clearHistoryMessage'), {
    title: t('clearHistoryTitle'),
    okLabel: t('confirmDelete'),
  });
  if (!ok) {
    return;
  }
  await clearAllHistory();
  hideResultPanel();
  void renderHistoryList();
  void refreshTabInfo();
}

async function applyTranslation(): Promise<void> {
  if (!currentResult) return;
  const targetLang = ($('translate-lang') as HTMLSelectElement).value;
  hideError();
  setTranslateLoading(true);
  $('progress-wrap').classList.remove('hidden');
  ($('progress-fill') as HTMLElement).style.width = '0%';
  $('progress-text').textContent = targetLang ? t('progressTranslating') : t('progressRestoring');
  startProgressPolling();
  try {
    const segCount =
      currentResult.originalSegments?.length ?? currentResult.segments.length;
    const byMinutes = segCount > 200;
    const minuteCount = Math.max(1, Math.ceil(currentResult.durationSec / 60));
    const timeoutMs = byMinutes
      ? Math.min(minuteCount * 12_000, 3_600_000)
      : Math.min(Math.max(segCount * 400, 120_000), 900_000);

    const res = await sendRuntimeMessage<BackgroundResponse>(
      {
        type: 'TRANSLATE',
        result: currentResult,
        targetLang,
      },
      timeoutMs,
    );
    if (!res?.ok || !res.result) {
      showError(res?.error ?? t('errTranslateFailed'));
      return;
    }
    renderResult(res.result);
  } catch (e) {
    const res = await tryRuntimeMessage<BackgroundResponse>({ type: 'GET_PROGRESS' }, 3000);
    if (!res?.progress?.active) {
      showError(e instanceof Error ? e.message : String(e));
    }
  } finally {
    setTranslateLoading(false);
    const res = await tryRuntimeMessage<BackgroundResponse>({ type: 'GET_PROGRESS' }, 3000);
    if (!res?.progress?.active) {
      stopProgressPolling();
      $('progress-wrap').classList.add('hidden');
    }
  }
}

function setTranslateLoading(loading: boolean): void {
  const btn = $('btn-translate') as HTMLButtonElement;
  const select = $('translate-lang') as HTMLSelectElement;
  btn.disabled = loading;
  select.disabled = loading;
  if (loading && !targetLangSelected()) {
    $('status-line').textContent = '';
  } else if (loading) {
    $('status-line').textContent = t('translating');
  } else if (currentResult) {
    $('status-line').textContent = '';
  }
}

function targetLangSelected(): boolean {
  return Boolean(($('translate-lang') as HTMLSelectElement).value);
}

function setVideoTitle(text: string, muted = false): void {
  const el = $('video-title');
  el.textContent = text;
  el.classList.toggle('muted', muted);
}

async function refreshTabInfo(): Promise<{ platform: import('../domain/types').VideoPlatform; videoId: string } | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    setVideoTitle(t('errNoTab'), true);
    return null;
  }
  const ref = parseVideoRef(tab.url);
  if (!ref || !isVideoPageUrl(tab.url)) {
    setVideoTitle(t('errOpenVideo'), true);
    $('status-line').textContent = t('statusOpenVideo');
    return null;
  }

  setVideoTitle(`${platformLabel(ref.platform)} · ${ref.videoId}`, true);
  preferCaptionsModeForPlatform(ref.platform);
  await updateServerStatusLine();
  return ref;
}

async function updateServerStatusLine(): Promise<void> {
  if (currentResult) return;
  const sttMode = getFetchMode() === 'local-stt';
  const el = $('status-line');
  try {
    const opts = await getOptions();
    const h = await checkServerHealth(opts.serverUrl);
    if (sttMode) {
      el.textContent = t('statusWhisperReady', h.model ?? 'ok');
      return;
    }
    if (h.translate === 'argos') {
      el.textContent = t('statusArgos');
      return;
    }
    el.textContent = t('statusNoArgos');
  } catch {
    renderServerDownStatus(el, sttMode);
  }
}

/** When the local server is down, show a clickable download link instead of plain text. */
function renderServerDownStatus(el: HTMLElement, sttMode: boolean): void {
  const text = sttMode ? t('statusStartServer') : t('statusWhisperDown');
  el.textContent = '';
  const span = document.createElement('span');
  span.textContent = `${text} `;
  el.appendChild(span);
  const link = document.createElement('a');
  link.href = WHISPER_SERVER_DOWNLOAD_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = t('downloadLink');
  el.appendChild(link);
}

function applyProgressUI(p: { processedSec: number; totalSec: number; phase: string }): void {
  const pct = p.totalSec > 0 ? Math.min(100, (p.processedSec / p.totalSec) * 100) : 0;
  ($('progress-fill') as HTMLElement).style.width = `${pct}%`;
  $('progress-text').textContent = p.phase;
}

async function loadResultForJob(job?: StoredJob | null): Promise<void> {
  if (!job?.platform || !job.videoId) return;
  if (job.kind === 'translate' && job.targetLang) {
    const translated = await getCachedTranslation(job.platform, job.videoId, job.targetLang);
    if (translated) {
      renderResult(translated);
      return;
    }
  }
  const cached = await getCachedTranscript(job.platform, job.videoId);
  if (cached) renderResult(cached);
}

function startProgressPolling(): void {
  stopProgressPolling();
  waitingForJob = true;
  progressTimer = setInterval(async () => {
    const res = await tryRuntimeMessage<BackgroundResponse>({ type: 'GET_PROGRESS' }, 3000);
    const p = res?.progress;
    const job = res?.job;

    if (p?.active) {
      setLoading(true);
      $('progress-wrap').classList.remove('hidden');
      applyProgressUI(p);
      return;
    }

    if (!waitingForJob) return;
    waitingForJob = false;
    stopProgressPolling();
    setLoading(false);

    if (job?.error) {
      showError(job.error);
      return;
    }
    await loadResultForJob(job);
  }, 400);
}

function stopProgressPolling(): void {
  waitingForJob = false;
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

async function restoreSession(): Promise<void> {
  const res = await tryRuntimeMessage<BackgroundResponse>({ type: 'GET_PROGRESS' }, 3000);
  const job = res?.job ?? (await loadJob());
  const p = res?.progress ?? (job.active ? jobToProgress(job) : undefined);

  if (p?.active || job.active) {
    hideError();
    setLoading(true);
    $('progress-wrap').classList.remove('hidden');
    applyProgressUI(p ?? jobToProgress(job));
    startProgressPolling();
    return;
  }

  const ref = await refreshTabInfo();

  if (job.finishedAt && Date.now() - job.finishedAt < 10 * 60_000) {
    if (job.error) showError(job.error);
    else await loadResultForJob(job);
    return;
  }

  if (ref) {
    const cached = await getCachedTranscript(ref.platform, ref.videoId);
    if (cached) renderResult(cached);
  }
}

async function fetchTranscript(force = false, streamIdFromClick?: string): Promise<void> {
  hideError();
  const mode = getFetchMode();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ref = tab?.url ? parseVideoRef(tab.url) : null;
  if (!ref || !tab?.url || !isVideoPageUrl(tab.url)) {
    showError(t('errOpenVideoFirst'));
    return;
  }
  setVideoTitle(`${platformLabel(ref.platform)} · ${ref.videoId}`, true);

  const options = await getOptions();
  setLoading(true);
  $('progress-text').textContent =
    mode === 'local-stt' ? t('progressCapturing') : t('progressLoading');
  startProgressPolling();

  try {
    let streamId = streamIdFromClick;
    if (mode === 'local-stt' && !__FIREFOX_BUILD__) {
      if (!tab.id) throw new Error(t('errNoActiveTab'));
      if (!streamId) {
        const { acquireTabCaptureStreamId } = await import('@stt/tab-capture');
        streamId = await acquireTabCaptureStreamId(tab.id);
      }
    }

    const maxRecord = Math.min(Math.max(options.sttMaxRecordSec || 300, 30), 3600);
    const timeoutMs =
      mode === 'local-stt'
        ? (maxRecord + 600) * 1000
        : ref.platform === 'rutube'
          ? 90_000
          : 60_000;

    const res = await sendRuntimeMessage<BackgroundResponse>(
      {
        type: 'GET_TRANSCRIPT',
        platform: ref.platform,
        videoId: ref.videoId,
        force,
        mode,
        streamId,
      },
      timeoutMs,
    );

    if (!res) {
      showError(t('errNoResponse'));
      return;
    }
    if (!res.ok || !res.result) {
      showError(res.error ?? t('errUnknown'));
      return;
    }
    renderResult(res.result);
  } catch (e) {
    const res = await tryRuntimeMessage<BackgroundResponse>({ type: 'GET_PROGRESS' }, 3000);
    if (!res?.progress?.active) {
      showError(e instanceof Error ? e.message : String(e));
    }
  } finally {
    const res = await tryRuntimeMessage<BackgroundResponse>({ type: 'GET_PROGRESS' }, 3000);
    if (!res?.progress?.active) {
      setLoading(false);
      stopProgressPolling();
    }
  }
}

function applyBrowserUiLimits(): void {
  if (supportsLocalStt()) return;
  $('stt-mode-label').classList.add('hidden');
  $('stt-hint').classList.add('hidden');
  const cap = document.querySelector<HTMLInputElement>(
    'input[name="fetch-mode"][value="captions"]',
  );
  if (cap) cap.checked = true;
}

function updateSttHint(): void {
  const stt = getFetchMode() === 'local-stt';
  $('stt-hint').classList.toggle('hidden', !stt || !supportsLocalStt());
  $('captions-hint').classList.toggle('hidden', stt);
}

function preferCaptionsModeForPlatform(platform: import('../domain/types').VideoPlatform): void {
  if (platform === 'rutube' || platform === 'vk') {
    const cap = document.querySelector<HTMLInputElement>('input[name="fetch-mode"][value="captions"]');
    if (cap) cap.checked = true;
    updateSttHint();
  }
}

document.querySelectorAll('input[name="fetch-mode"]').forEach((el) => {
  el.addEventListener('change', () => {
    updateSttHint();
    void updateServerStatusLine();
  });
});
updateSttHint();

document.querySelectorAll('input[name="view-mode"]').forEach((el) => {
  el.addEventListener('change', () => {
    if (currentResult) renderResult(currentResult);
  });
});

bindFetchButton({
  $,
  getFetchMode,
  fetchTranscript,
  showError,
  hideError,
  setLoading,
  t,
});

$('btn-cancel').addEventListener('click', async () => {
  await tryRuntimeMessage({ type: 'CANCEL_STT' }, 5000);
  setLoading(false);
  stopProgressPolling();
});

$('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$('btn-copy').addEventListener('click', async () => {
  if (!currentResult) return;
  await navigator.clipboard.writeText(formatTranscriptText(currentResult, getViewMode()));
});

$('btn-txt').addEventListener('click', () => {
  if (!currentResult) return;
  const text = formatTranscriptText(currentResult, getViewMode());
  downloadFile(`${currentResult.videoId}.txt`, text, 'text/plain;charset=utf-8');
});

$('btn-srt').addEventListener('click', () => {
  if (!currentResult) return;
  downloadFile(`${currentResult.videoId}.srt`, toSrt(currentResult.segments), 'text/plain');
});

$('btn-json').addEventListener('click', () => {
  if (!currentResult) return;
  downloadFile(
    `${currentResult.videoId}.json`,
    JSON.stringify(currentResult, null, 2),
    'application/json',
  );
});

$('btn-translate').addEventListener('click', () => void applyTranslation());
$('translate-lang').addEventListener('change', () => void applyTranslation());
$('btn-clear-history').addEventListener('click', () => void clearHistory());

const themeBtn = document.getElementById('btn-theme');
if (themeBtn) themeBtn.addEventListener('click', () => void cycleTheme());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.uiJob) return;
  const job = changes.uiJob.newValue as StoredJob | undefined;
  if (!job) return;
  if (job.active) {
    hideError();
    setLoading(true);
    $('progress-wrap').classList.remove('hidden');
    applyProgressUI(job);
    if (!progressTimer) startProgressPolling();
    return;
  }
  if (waitingForJob) return;
  if (job.error) showError(job.error);
  else void loadResultForJob(job);
});

void (async () => {
  applyTheme(await loadTheme());
  await initI18n();
  applyI18n();
  applyBrowserUiLimits();
  fillTranslateLanguages();
  void renderHistoryList();
  void restoreSession();
  void trackInstallOnce();
  const donationHost = document.getElementById('donation-host');
  if (donationHost) void mountDonationFooter(donationHost);
})();

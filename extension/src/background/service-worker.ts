import { getTranscript } from '../app/use-cases/getTranscript';
import { translate } from '../app/use-cases/translate';
import { buildTranscriptResult } from '../shared/build-result';
import { initI18n, localizeError, t } from '../shared/i18n';
import { offsetSegments } from '../infra/stt/local-stt';
import { localWhisper } from '../infra/stt';
import {
  cacheTranslation,
  cacheTranscript,
  getCachedTranscript,
  getCachedTranslation,
  getOptions,
} from '../infra/chrome/storage';
import { startServiceWorkerKeepAlive } from '../infra/chrome/keepalive';
import {
  mergeBlobsIntoChunks,
  recordTabAudio,
  releaseTabCapture,
  stopTabRecording,
  waitForOffscreenReady,
} from '@stt/recording';
import { acquireTabCaptureStreamId } from '@stt/tab-capture';
import {
  ensureOffscreen,
  releaseOffscreenCapture,
} from '@stt/offscreen-doc';
import { resolveTranslateTabId } from '../infra/chrome/find-video-tab';
import { idleJob, jobToProgress, loadJob, persistJob } from '../infra/chrome/job-state';
import type { StoredJob } from '../domain/types';
import { parseVideoRef } from '../shared/url-parser';
import { fetchRemoteText } from '../infra/captions/fetch-remote-text';
import { getPageInfoFromTab as getPageInfoViaScript } from '../infra/chrome/tab-messaging';
import { upsertHistoryEntry } from '../infra/storage/history.repo';
import { logger } from '../shared/logger';
import { getLastServerTranslateEngine, resetServerTranslateEngine } from '../infra/translate/proxy';
import { track as plausibleTrack, trackActivateOnce as plausibleActivate } from '../infra/analytics/plausible';
import type {
  BackgroundResponse,
  MessageType,
  ProgressState,
  Segment,
  TranscriptResult,
  VideoPageInfo,
  VideoPlatform,
} from '../domain/types';

// Two separate AbortControllers: one for captions/translate jobs, one for STT.
// Captions and translate share `jobAbort` because they cannot run in parallel
// (the popup waits on the result). STT runs on its own controller because the
// existing cancel UX has a dedicated CANCEL_STT message tied to it.
let jobAbort: AbortController | null = null;
let sttAbort: AbortController | null = null;
let progress: ProgressState = idleJob();

function beginJob(): AbortController {
  jobAbort?.abort();
  jobAbort = new AbortController();
  return jobAbort;
}

async function updateJob(patch: Partial<StoredJob>): Promise<void> {
  const cur = await loadJob();
  const next: StoredJob = { ...cur, ...patch };
  progress = jobToProgress(next);
  await persistJob(next);
}

async function finishJob(error?: string): Promise<void> {
  const cur = await loadJob();
  await updateJob({
    active: false,
    kind: 'idle',
    phase: error ? t('phaseError') : t('phaseDone'),
    error,
    finishedAt: Date.now(),
    platform: cur.platform,
    videoId: cur.videoId,
    targetLang: cur.targetLang,
  });
}

async function queryActiveVideoTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !parseVideoRef(tab.url)) {
    throw new Error(t('errOpenVideoPage'));
  }
  return tab;
}


async function fetchCaptionsTranscript(
  platform: VideoPlatform,
  tabId: number,
  videoId: string,
  pageInfo: VideoPageInfo | null,
  force: boolean,
  signal: AbortSignal,
): Promise<TranscriptResult> {
  const options = await getOptions();

  // Cache check first so we don't flicker the "loading" phase on hits.
  if (!force) {
    const cached = await getCachedTranscript(platform, videoId);
    if (cached && cached.source === 'captions') {
      const fromCache = { ...cached, fromCache: true };
      await upsertHistoryEntry(fromCache);
      return fromCache;
    }
  }

  await updateJob({
    active: true,
    kind: 'transcript',
    platform,
    videoId,
    processedSec: 0,
    totalSec: 1,
    phase:
      platform === 'rutube'
        ? t('phaseLoadingRutube')
        : platform === 'vk'
          ? t('phaseLoadingVk')
          : t('phaseLoadingCaptions'),
    error: undefined,
    finishedAt: undefined,
  });

  const stopKeepAlive = startServiceWorkerKeepAlive();
  try {
    // Cache already checked above; tell the use case to skip it.
    return await getTranscript({
      platform,
      tabId,
      videoId,
      pageInfo,
      force: true,
      options,
      signal,
    });
  } catch (e) {
    if (platform === 'youtube' && pageInfo?.isLive) {
      throw new Error(t('errLiveCaptions'));
    }
    const raw = e instanceof Error ? e.message : String(e);
    if (raw === 'NO_CAPTIONS' || raw === 'LIVE_CAPTIONS_UNSUPPORTED') {
      throw new Error(t('errFetchCaptions'));
    }
    if (platform === 'youtube') {
      const hint = raw.includes('json') || raw.includes('JSON')
        ? t('errFetchCaptionsHint')
        : '';
      throw new Error(raw + hint);
    }
    throw e;
  } finally {
    stopKeepAlive();
  }
}

async function runLocalStt(
  pageInfo: VideoPageInfo,
  tabId: number,
  streamIdFromPopup?: string,
): Promise<TranscriptResult> {
  if (pageInfo.isLive) {
    throw new Error(t('errLiveStt'));
  }

  const options = await getOptions();
  sttAbort = new AbortController();
  const signal = sttAbort.signal;

  const maxRecord = Math.min(Math.max(options.sttMaxRecordSec || 300, 30), 3600);
  const videoDur =
    pageInfo.durationSec > 0 && Number.isFinite(pageInfo.durationSec)
      ? pageInfo.durationSec
      : maxRecord;
  const totalSec = Math.min(videoDur, maxRecord);

  const platform = pageInfo.platform ?? 'youtube';
  await updateJob({
    active: true,
    kind: 'stt',
    platform,
    videoId: pageInfo.videoId,
    processedSec: 0,
    totalSec,
    phase: t('phaseCheckingServer'),
    error: undefined,
    finishedAt: undefined,
  });

  const stopKeepAlive = startServiceWorkerKeepAlive();

  try {
    if (!(await localWhisper.available(options))) {
      throw new Error(t('errServerUnavailable'));
    }

    await ensureOffscreen();
    await waitForOffscreenReady();

    let streamId = streamIdFromPopup;
    if (!streamId) {
      await updateJob({ phase: t('phaseCapturing') });
      streamId = await acquireTabCaptureStreamId(tabId);
    }

    const chunkDurationSec = 75;
    const allSegments: Segment[] = [];

    if (signal.aborted) throw new Error(t('errCancelled'));

    const platformHint =
      pageInfo.platform === 'rutube' ? 'Rutube' : pageInfo.platform === 'vk' ? 'VK' : 'YouTube';
    const capped =
      videoDur > maxRecord
        ? t('phaseRecordingLimit', String(Math.ceil(maxRecord / 60)))
        : '';
    await updateJob({
      phase: t('phaseRecordingUntil', [
        formatProgress(totalSec, totalSec),
        capped,
        platformHint,
      ]),
    });
    const rawBlobs = await recordTabAudio({
      streamId,
      totalSec,
      signal,
      onProgress: ({ recordedSec }) => {
        const processedSec = Math.min(recordedSec, totalSec);
        void updateJob({
          processedSec,
          phase: t('phaseRecording', formatProgress(processedSec, totalSec)),
        });
      },
    });

    const blobs = mergeBlobsIntoChunks(rawBlobs, chunkDurationSec);
    if (blobs.length === 0) {
      throw new Error(t('errEmptyRecording'));
    }

    await updateJob({ phase: t('phaseRecognizing') });
    let chunkIndex = 0;
    for (const blob of blobs) {
      if (signal.aborted) throw new Error(t('errCancelled'));
      const offset = chunkIndex * chunkDurationSec;
      await updateJob({
        processedSec: offset,
        phase: t('phaseRecognizingProgress', formatProgress(offset, totalSec)),
      });

      const segs = await localWhisper.transcribe(blob, options, signal);
      allSegments.push(...offsetSegments(segs, offset));
      chunkIndex++;
    }

    if (allSegments.length === 0) {
      throw new Error(t('errRecognizeFailed'));
    }

    const result = buildTranscriptResult({
      platform: pageInfo.platform ?? 'youtube',
      videoId: pageInfo.videoId,
      title: pageInfo.title,
      durationSec: pageInfo.durationSec,
      source: 'local-stt',
      language: options.sttLanguage,
      segments: allSegments.sort((a, b) => a.start - b.start),
      options,
    });

    await cacheTranscript(result);
    return result;
  } finally {
    stopKeepAlive();
    await releaseTabCapture();
  }
}

function formatProgress(done: number, total: number): string {
  const d = Math.floor(done);
  const t = Math.floor(total);
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')} / ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * First-install lifecycle:
 *  - open the welcome page so the user lands somewhere that explains the
 *    extension and where to find the analytics opt-out.
 *  - fire the `install` Plausible event. No-op when PLAUSIBLE_HOST is unset
 *    or the user opted out.
 *
 * On update we keep the previous logger.info; we don't reopen welcome.html
 * for upgrades, only for fresh installs.
 */
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    void plausibleTrack('install');
  } else {
    logger.info('installed/updated — reload the active video tab');
  }
});

chrome.runtime.onMessage.addListener((message: MessageType & { target?: string }, _sender, sendResponse) => {
  (async () => {
    try {
      await initI18n();

      if (message.type === 'SW_PING' || message.type === 'GET_PROGRESS') {
        const job = await loadJob();
        if (job.active) progress = jobToProgress(job);
        sendResponse({ ok: true, progress, job } satisfies BackgroundResponse);
        return;
      }

      if (message.type === 'RELEASE_TAB_CAPTURE') {
        await releaseOffscreenCapture();
        sendResponse({ ok: true } satisfies BackgroundResponse);
        return;
      }

      if (message.type === 'FETCH_REMOTE_TEXT') {
        try {
          const text = await fetchRemoteText(message.url, message.referer);
          sendResponse({ ok: true, text } satisfies BackgroundResponse);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          sendResponse({
            ok: false,
            error: msg.includes('Failed to fetch') ? t('errCorsBlocked') : localizeError(msg),
          } satisfies BackgroundResponse);
        }
        return;
      }

      if (message.type === 'CANCEL_STT') {
        sttAbort?.abort();
        sttAbort = null;
        jobAbort?.abort();
        jobAbort = null;
        stopTabRecording();
        await releaseTabCapture();
        await finishJob(t('errCancelled'));
        sendResponse({ ok: true } satisfies BackgroundResponse);
        return;
      }

      if (message.type === 'TRANSLATE') {
        const options = await getOptions();
        const { result: input, targetLang } = message;
        const ctl = beginJob();

        if (!targetLang) {
          const restored = await translate({
            result: input,
            targetLang: '',
            options,
            signal: ctl.signal,
          });
          sendResponse({ ok: true, result: restored } satisfies BackgroundResponse);
          return;
        }

        const inputPlatform = input.platform ?? 'youtube';
        const cached = await getCachedTranslation(inputPlatform, input.videoId, targetLang);
        if (
          cached?.translatedTo === targetLang &&
          (cached.originalSegments?.length ?? cached.segments.length) ===
            (input.originalSegments?.length ?? input.segments.length)
        ) {
          sendResponse({ ok: true, result: { ...cached, fromCache: true } } satisfies BackgroundResponse);
          return;
        }

        const segCount = input.originalSegments?.length ?? input.segments.length;
        const byMinutes = segCount > 200;
        await updateJob({
          active: true,
          kind: 'translate',
          platform: inputPlatform,
          videoId: input.videoId,
          targetLang,
          processedSec: 0,
          totalSec: byMinutes ? Math.ceil(input.durationSec / 60) : segCount,
          phase: byMinutes ? t('phaseTranslateByMin') : t('phaseTranslate'),
          error: undefined,
          finishedAt: undefined,
        });

        resetServerTranslateEngine();

        const tabId = await resolveTranslateTabId(inputPlatform, input.videoId);

        let translateServerUrl: string | undefined = options.serverUrl;
        if (translateServerUrl) {
          if (!(await localWhisper.available(options))) {
            translateServerUrl = undefined;
          }
        }

        const stopKeepAlive = startServiceWorkerKeepAlive();
        try {
          const result = await translate({
            result: { ...input, platform: inputPlatform },
            targetLang,
            options,
            signal: ctl.signal,
            onProgress: (done, total) => {
              void updateJob({
                active: true,
                kind: 'translate',
                platform: inputPlatform,
                videoId: input.videoId,
                targetLang,
                processedSec: done,
                totalSec: total,
                phase: byMinutes
                  ? t('phaseMinutes', [String(done), String(total)])
                  : t('phaseTranslateProgress', [String(done), String(total)]),
              });
            },
            fetchOpts: { serverUrl: translateServerUrl, tabId },
          });

          const engine = getLastServerTranslateEngine();
          if (engine) {
            result.translateEngine = engine;
          }

          await cacheTranslation(result, targetLang);
          await finishJob();
          sendResponse({ ok: true, result } satisfies BackgroundResponse);
        } catch (e) {
          const err = localizeError(e instanceof Error ? e.message : String(e));
          await finishJob(err);
          throw e;
        } finally {
          stopKeepAlive();
        }
        return;
      }

      if (message.type === 'GET_TRANSCRIPT') {
        const tab = await queryActiveVideoTab();
        const ref = parseVideoRef(tab.url ?? '');
        if (
          !ref ||
          ref.platform !== message.platform ||
          ref.videoId !== message.videoId
        ) {
          throw new Error(t('errVideoChanged'));
        }

        const mode = message.mode ?? 'captions';
        await updateJob({
          active: true,
          kind: mode === 'local-stt' ? 'stt' : 'transcript',
          platform: message.platform,
          videoId: message.videoId,
          processedSec: 0,
          totalSec: 1,
          phase: mode === 'local-stt' ? t('phasePrepRecord') : t('progressLoading'),
          error: undefined,
          finishedAt: undefined,
        });

        let result: TranscriptResult;

        if (mode === 'local-stt') {
          const pageInfo = await getPageInfoViaScript(
            tab.id!,
            message.videoId,
            message.platform,
          );
          pageInfo.platform = message.platform;
          result = await runLocalStt(pageInfo, tab.id!, message.streamId);
        } else {
          let pageInfo: VideoPageInfo | null = null;
          try {
            pageInfo = await getPageInfoViaScript(
              tab.id!,
              message.videoId,
              message.platform,
            );
            if (pageInfo) pageInfo.platform = message.platform;
          } catch {
            pageInfo = null;
          }
          const ctl = beginJob();
          result = await fetchCaptionsTranscript(
            message.platform,
            tab.id!,
            message.videoId,
            pageInfo,
            Boolean(message.force),
            ctl.signal,
          );
        }

        await upsertHistoryEntry(result);
        await finishJob();
        // First successful transcript = activation. Idempotent across calls.
        void plausibleActivate();
        sendResponse({ ok: true, result } satisfies BackgroundResponse);
        return;
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const err = localizeError(raw);
      await finishJob(err);
      sendResponse({ ok: false, error: err } satisfies BackgroundResponse);
    }
  })();

  return true;
});

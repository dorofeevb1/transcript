import { t } from './i18n';
import { formatTime } from './segmenter';
import { platformLabel } from './url-parser';
import type { MinuteBlock, Segment, TranscriptResult } from '../domain/types';

export type DisplayMode = 'minutes' | 'phrases';

export function formatTranscriptText(
  result: TranscriptResult,
  mode: DisplayMode,
): string {
  if (mode === 'minutes') {
    return result.byMinute
      .map((b) => `[${formatTime(b.start)} – ${formatTime(b.end)}] ${b.text}`)
      .join('\n\n');
  }
  return result.segments
    .map((s) => `[${formatTime(s.start)}] ${s.text}`)
    .join('\n');
}

export function toSrt(segments: Segment[]): string {
  return segments
    .map((seg, i) => {
      const start = srtTime(seg.start);
      const end = srtTime(seg.end);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join('\n');
}

function srtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function toVtt(segments: Segment[]): string {
  const body = segments
    .map((seg) => `${vttTime(seg.start)} --> ${vttTime(seg.end)}\n${seg.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

function vttTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(3);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(6, '0')}`;
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function sourceLabel(result: Pick<TranscriptResult, 'source' | 'platform'>): string {
  const site = platformLabel(result.platform ?? 'youtube');
  if (result.source === 'local-stt') return t('metaStt', site);
  return t('metaCaptions', site);
}

export function formatResultMeta(result: TranscriptResult): string {
  const cacheNote = result.fromCache ? t('metaFromCache') : '';
  const src = sourceLabel(result);
  const lang = result.language ?? '—';
  const mins = Math.ceil(result.durationSec / 60);
  let line = `${src} · ${lang} · ${mins}${t('metaMin')}${cacheNote}`;
  if (result.translatedTo && result.originalLanguage) {
    line += t('metaTranslatedFrom', result.originalLanguage);
  }
  if (result.translatedByMinutes) {
    line += t('metaByMinutes');
  }
  if (result.translateEngine === 'argos') {
    line += t('metaArgos');
  }
  return line;
}

export type { MinuteBlock };

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface MinuteBlock {
  start: number;
  end: number;
  text: string;
}

export type VideoPlatform = 'youtube' | 'rutube' | 'vk';

export interface TranscriptResult {
  platform?: VideoPlatform;
  videoId: string;
  title?: string;
  durationSec: number;
  source: 'captions' | 'local-stt';
  language?: string;
  segments: Segment[];
  byMinute: MinuteBlock[];
  createdAt: string;
  fromCache?: boolean;
  /** Исходные сегменты до перевода */
  originalSegments?: Segment[];
  originalLanguage?: string;
  /** Код языка Google Translate, если показан перевод */
  translatedTo?: string;
  /** Длинное видео: фразы переведены через минутные блоки */
  translatedByMinutes?: boolean;
  /** Движок перевода на сервере */
  translateEngine?: string;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText?: string };
  kind?: string;
}

export interface VideoPageInfo {
  platform?: VideoPlatform;
  videoId: string;
  title?: string;
  durationSec: number;
  captionTracks: CaptionTrack[];
  isLive?: boolean;
}

export interface ExtensionOptions {
  serverUrl: string;
  /** Язык кнопок и подписей расширения; auto — из языка системы/браузера. */
  uiLocale?: 'auto' | 'ru' | 'en' | 'uk' | 'de' | 'es' | 'fr';
  captionLanguage: 'ru' | 'en' | 'auto';
  blockSizeSec: 30 | 60 | 120;
  markSilentMinutes: boolean;
  sttLanguage: string;
  /** Макс. секунд записи вкладки в режиме «Из аудио» (не дольше ролика). */
  sttMaxRecordSec: number;
}

export const DEFAULT_OPTIONS: ExtensionOptions = {
  serverUrl: 'http://127.0.0.1:8765',
  uiLocale: 'auto',
  captionLanguage: 'auto',
  blockSizeSec: 60,
  markSilentMinutes: false,
  sttLanguage: 'ru',
  sttMaxRecordSec: 300,
};

export type MessageType =
  | { type: 'GET_PAGE_INFO' }
  | {
      type: 'GET_TRANSCRIPT';
      platform: VideoPlatform;
      videoId: string;
      force?: boolean;
      mode?: 'captions' | 'local-stt';
      streamId?: string;
    }
  | { type: 'TRANSLATE'; result: TranscriptResult; targetLang: string }
  | { type: 'CANCEL_STT' }
  | { type: 'GET_PROGRESS' }
  | { type: 'SW_PING' }
  | { type: 'RELEASE_TAB_CAPTURE' }
  | { type: 'OFFSCREEN_RELEASE_CAPTURE' }
  | { type: 'FETCH_REMOTE_TEXT'; url: string; referer?: string };

export interface ProgressState {
  active: boolean;
  processedSec: number;
  totalSec: number;
  phase: string;
}

export type JobKind = 'idle' | 'transcript' | 'translate' | 'stt';

export interface StoredJob extends ProgressState {
  kind: JobKind;
  platform?: VideoPlatform;
  videoId?: string;
  targetLang?: string;
  error?: string;
  finishedAt?: number;
}

export interface BackgroundResponse {
  ok: boolean;
  error?: string;
  result?: TranscriptResult;
  progress?: ProgressState;
  job?: StoredJob;
  text?: string;
}

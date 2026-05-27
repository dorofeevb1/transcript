import { loadCaptions } from '../infra/captions/captions';
import { getVideoPageInfo } from '../infra/captions/youtube-helpers';
import type { CaptionTrack, ExtensionOptions, VideoPageInfo } from '../domain/types';

declare global {
  interface Window {
    __YT_TRANSCRIPT_INIT__?: boolean;
  }
}

function setup(): void {
  if (window.__YT_TRANSCRIPT_INIT__) return;
  window.__YT_TRANSCRIPT_INIT__ = true;

  chrome.runtime.onMessage.addListener(
    (
      message: {
        type: string;
        preferLang?: ExtensionOptions['captionLanguage'];
        captionTracks?: CaptionTrack[];
      },
      _sender,
      sendResponse,
    ) => {
      if (message.type === 'PING') {
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === 'GET_PAGE_INFO') {
        const info = getVideoPageInfo();
        if (!info) {
          sendResponse({ error: 'Не страница видео YouTube' });
          return true;
        }
        sendResponse(info satisfies VideoPageInfo);
        return true;
      }

      if (message.type === 'FETCH_CAPTIONS' && message.captionTracks?.length) {
        loadCaptions(message.captionTracks, message.preferLang ?? 'auto')
          .then((data) => sendResponse({ ok: true, ...data }))
          .catch((e) =>
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
        return true;
      }

      return false;
    },
  );
}

/** Точка входа @crxjs/vite-plugin */
export function onExecute(): void {
  setup();
}

setup();

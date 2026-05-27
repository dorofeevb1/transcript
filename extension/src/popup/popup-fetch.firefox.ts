import type { PopupFetchBindings } from './popup-fetch.chromium';

export type { PopupFetchBindings };

export function bindFetchButton(ctx: PopupFetchBindings): void {
  ctx.$('btn-fetch').addEventListener('click', () => {
    const mode = ctx.getFetchMode();
    if (mode === 'local-stt') {
      ctx.showError(ctx.t('errSttFirefoxOnly'));
      return;
    }
    void ctx.fetchTranscript(false);
  });
}

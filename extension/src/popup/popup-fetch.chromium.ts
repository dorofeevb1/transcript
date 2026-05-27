export interface PopupFetchBindings {
  $: (id: string) => HTMLElement;
  getFetchMode: () => string;
  fetchTranscript: (force?: boolean, streamIdFromClick?: string) => Promise<void>;
  showError: (msg: string) => void;
  hideError: () => void;
  setLoading: (on: boolean) => void;
  t: (key: string) => string;
}

export function bindFetchButton(ctx: PopupFetchBindings): void {
  ctx.$('btn-fetch').addEventListener('click', () => {
    const mode = ctx.getFetchMode();
    if (mode !== 'local-stt') {
      void ctx.fetchTranscript(false);
      return;
    }

    ctx.hideError();
    (ctx.$('progress-text') as HTMLElement).textContent = ctx.t('progressCapturing');
    ctx.$('progress-wrap').classList.remove('hidden');
    ctx.setLoading(true);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        ctx.showError(ctx.t('errNoActiveTab'));
        ctx.setLoading(false);
        return;
      }

      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        const err = chrome.runtime.lastError?.message;
        if (err || !id) {
          const hint = err?.includes('active stream') ? ctx.t('errCaptureRetry') : '';
          ctx.showError((err ?? ctx.t('errCaptureAudio')) + hint);
          ctx.setLoading(false);
          return;
        }
        void ctx.fetchTranscript(false, id);
      });
    });
  });
}

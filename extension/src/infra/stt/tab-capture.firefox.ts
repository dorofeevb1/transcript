/** Заглушки для Firefox-сборки (без tabCapture в бандле). */
export async function releaseTabCapture(): Promise<void> {}

export async function acquireTabCaptureStreamId(_targetTabId: number): Promise<string> {
  throw new Error('STT_UNAVAILABLE');
}

/** Периодический пинг, чтобы MV3 service worker не засыпал во время долгой записи/STT. */
export function startServiceWorkerKeepAlive(): () => void {
  const id = setInterval(() => {
    void chrome.runtime.getPlatformInfo().catch(() => {});
  }, 20_000);
  return () => clearInterval(id);
}

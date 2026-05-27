/**
 * Centralised logger for youtube-transcript-extension.
 *
 * Levels: `debug | info | warn | error`. In production builds (`import.meta.env.PROD`)
 * `debug` and `info` are no-ops; `warn`/`error` always reach DevTools.
 * Outside this module no call site should touch `console.*` directly.
 */

const PREFIX = '[yt-transcript]';

const isProd = (() => {
  try {
    const env = (import.meta as ImportMeta & { env?: { PROD?: boolean; DEV?: boolean; MODE?: string } })
      .env;
    if (!env) return true;
    if (typeof env.PROD === 'boolean') return env.PROD;
    if (typeof env.DEV === 'boolean') return !env.DEV;
    return env.MODE !== 'development';
  } catch {
    return true;
  }
})();

export const logger = {
  debug(...args: unknown[]): void {
    if (isProd) return;
    // eslint-disable-next-line no-console
    console.debug(PREFIX, ...args);
  },
  info(...args: unknown[]): void {
    if (isProd) return;
    // eslint-disable-next-line no-console
    console.info(PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(PREFIX, ...args);
  },
};
